"""IPO Application API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
import threading
import time
from typing import List, Dict

from app.database import get_db
from app.models.member import MeroshareCredential
from app.services.ipo_bot import IpoBot
from app.utils.encryption import decrypt_value

router = APIRouter(prefix="/api/ipo", tags=["IPO"])

# In-memory store for active IPO jobs (HIGH-03: bounded with TTL)
# Key: job_id, Value: {"status": "running|done|error", "message": "", "results": [], "created_at": float}
IPO_JOBS: Dict[str, dict] = {}
_IPO_JOBS_MAX_SIZE = 100
_IPO_JOBS_TTL_SECONDS = 3600  # 1 hour


def _cleanup_old_jobs():
    """Remove completed jobs older than TTL and enforce max size."""
    now = time.time()
    # Remove expired completed jobs
    expired = [
        jid for jid, job in IPO_JOBS.items()
        if job.get("status") in ("done", "error")
        and (now - job.get("created_at", 0)) > _IPO_JOBS_TTL_SECONDS
    ]
    for jid in expired:
        del IPO_JOBS[jid]

    # If still over max size, remove oldest completed jobs
    if len(IPO_JOBS) > _IPO_JOBS_MAX_SIZE:
        completed = sorted(
            [(jid, job.get("created_at", 0)) for jid, job in IPO_JOBS.items()
             if job.get("status") in ("done", "error")],
            key=lambda x: x[1]
        )
        while len(IPO_JOBS) > _IPO_JOBS_MAX_SIZE and completed:
            jid, _ = completed.pop(0)
            del IPO_JOBS[jid]


class IpoApplyRequest(BaseModel):
    member_ids: List[int]
    ipo_indices: List[int]
    apply_unit: int = 10


@router.get("/open")
def fetch_open_ipos(member_id: int, db: Session = Depends(get_db)):
    """Logs into MeroShare with the specific member to fetch open IPOs."""
    cred = db.query(MeroshareCredential).filter(
        MeroshareCredential.member_id == member_id).first()
    if not cred:
        raise HTTPException(
            status_code=400, detail=f"No MeroShare credentials found for member ID {member_id}")

    try:
        bot = IpoBot()
        success = bot.login(
            dp=cred.dp,
            username=cred.username,
            password=decrypt_value(cred.password_encrypted),
        )

        if not success:
            bot.quit()
            raise HTTPException(
                status_code=401, detail="Failed to login to MeroShare. Please check credentials.")

        issues = bot.fetch_open_issues()
        bot.quit()

        return {"open_issues": issues}

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch open IPOs: {str(e)}")


def run_ipo_job(job_id: str, member_ids: List[int], ipo_indices: List[int], override_unit: int):
    """Background task to apply IPO for multiple members."""
    IPO_JOBS[job_id]["status"] = "running"

    # We need a new db session for the thread
    from app.database import SessionLocal
    db = SessionLocal()

    try:
        results = []
        for member_id in member_ids:
            cred = db.query(MeroshareCredential).filter(
                MeroshareCredential.member_id == member_id).first()
            if not cred:
                results.append(
                    {"member_id": member_id, "status": "error", "message": "No credentials found"})
                continue

            bot = None
            try:
                bot = IpoBot()
                success = bot.login(
                    dp=cred.dp,
                    username=cred.username,
                    password=decrypt_value(cred.password_encrypted),
                )
                if not success:
                    results.append(
                        {"member_id": member_id, "status": "error", "message": "Login failed"})
                    continue

                apply_unit = override_unit if override_unit else cred.apply_unit

                member_results = []
                for index in ipo_indices:
                    res = bot.apply_for_issue(
                        index=index, crn=cred.crn, txn_pin=cred.txn_pin, units=apply_unit)
                    # Add IPO mapping index to result
                    res["index"] = index
                    member_results.append(res)

                results.append({
                    "member_id": member_id,
                    "status": "done",
                    "applications": member_results
                })

            except Exception as e:
                results.append(
                    {"member_id": member_id, "status": "error", "message": str(e)})
            finally:
                if bot:
                    bot.quit()

        IPO_JOBS[job_id]["status"] = "done"
        IPO_JOBS[job_id]["results"] = results
        IPO_JOBS[job_id]["message"] = "Completed successfully"

    except Exception as e:
        IPO_JOBS[job_id]["status"] = "error"
        IPO_JOBS[job_id]["message"] = str(e)
    finally:
        db.close()


@router.post("/apply")
def apply_ipos(request: IpoApplyRequest):
    """Starts a background job to apply for selected IPOs."""
    if not request.member_ids or not request.ipo_indices:
        raise HTTPException(
            status_code=400, detail="Missing member_ids or ipo_indices")

    # HIGH-03: Clean up old jobs before creating new ones
    _cleanup_old_jobs()

    job_id = str(uuid.uuid4())
    IPO_JOBS[job_id] = {
        "status": "pending",
        "message": "Job queued",
        "results": [],
        "created_at": time.time(),
    }

    # Start detached thread
    t = threading.Thread(
        target=run_ipo_job,
        args=(job_id, request.member_ids,
              request.ipo_indices, request.apply_unit),
        daemon=True
    )
    t.start()

    return {"job_id": job_id, "message": "IPO application job started"}


@router.get("/status/{job_id}")
def get_ipo_job_status(job_id: str):
    """Check the status of a running IPO job."""
    if job_id not in IPO_JOBS:
        raise HTTPException(status_code=404, detail="Job not found")

    return IPO_JOBS[job_id]
