"""
AI Service — Unified engine for interacting with AI models (Local, Cloud and Frontier).

"""
import json
import re
import time
import httpx
from typing import Dict, Any, Optional, List
from app.config import settings
from app.database import SessionLocal
from app.models.ai_log import AIUsageLog
from app.utils.logging import get_logger

logger = get_logger(__name__)


# Add entries here as you test new models.
# ---------------------------------------------------------------------------
_MODEL_OVERRIDES: Dict[str, Dict[str, Any]] = {
    # thinking_mode: false tells Qwen3 not to emit <think> tokens at all.
    # num_predict raised vs v2 to compensate for the freed token budget.
    # Allow qwen3 to use its thinking feature since prompt explicitly asks for it
    "qwen3":    {"num_predict": 3072, "num_ctx": 8192, "temperature": 0.3},
    "qwen2.5":  {"num_predict": 2048, "num_ctx": 6144, "temperature": 0.3},
    "gemma3":   {"num_predict": 1536, "num_ctx": 6144, "temperature": 0.35},
    "deepseek": {"num_predict": 2048, "num_ctx": 6144, "temperature": 0.3},
    "llama3":   {"num_predict": 1024, "num_ctx": 4096, "temperature": 0.3},
}

# Aliases for non-standard JSON field names some models emit
_VERDICT_ALIASES  = {"verdict", "conclusion", "recommendation", "action", "signal"}
_ANALYSIS_ALIASES = {"analysis", "reasoning", "explanation", "detail", "rationale", "summary"}


def _model_options(model: str) -> Dict[str, Any]:
    """Return generation options merged with per-model overrides (matched by prefix)."""
    base = {
        "temperature": 0.3,
        "num_predict": 1024,   # Safe default; enough for JSON + 2 paragraphs
        "num_ctx":     6144,   # Covers system prompt + large input_data payloads
        "top_p":       0.9,
    }
    model_lower = model.lower()
    for prefix, overrides in _MODEL_OVERRIDES.items():
        if model_lower.startswith(prefix):
            base.update(overrides)
            break
    return base


class AIService:
    @staticmethod
    def _build_value_portfolio_rules(portfolio_ctx: dict | None) -> tuple[str, str]:
        """Return allowed actions and guidance for held vs discovery mode."""
        if portfolio_ctx:
            allowed_actions = "ACCUMULATE, HOLD, REDUCE, or EXIT"
            rules = (
                f"- User holds {portfolio_ctx.get('current_qty')} shares at WACC Rs. {portfolio_ctx.get('wacc')} with total investment Rs. {portfolio_ctx.get('total_investment')}.\n"
                f"- Current holding result: Unrealized PnL {portfolio_ctx.get('pnl_pct')}% (Rs. {portfolio_ctx.get('unrealized_pnl')}), XIRR {portfolio_ctx.get('xirr')}%, dividend income Rs. {portfolio_ctx.get('dividend_income')}.\n"
                f"- Portfolio fit: concentration {portfolio_ctx.get('concentration_pct')}% of portfolio, so size and opportunity cost matter.\n"
                "- Your verdict MUST be a capital-allocation decision, not just a stock label.\n"
                "- ACCUMULATE only when business quality is strong, valuation remains favorable, and concentration is still manageable.\n"
                "- HOLD when fundamentals remain intact and forward expected return is still acceptable relative to portfolio opportunity cost.\n"
                "- REDUCE has two distinct cases: VALUATION-DRIVEN REDUCE when the asset is too expensive for its forward return, and OPPORTUNITY-COST-DRIVEN REDUCE when capital is better deployed elsewhere.\n"
                "- EXIT when the thesis is broken, valuation is clearly unattractive, or capital preservation should take priority.\n"
                "- Do not recommend REDUCE or EXIT only because the position is in profit. Do not recommend ACCUMULATE only because price is below cost.\n"
            )
        else:
            allowed_actions = "BUY, WATCHLIST, or AVOID"
            rules = (
                "- User currently does not hold this stock. Treat this as a fresh value-investing decision.\n"
                "- BUY only when valuation, business quality, dividend/compounding potential, and rough forward expected return are attractive versus waiting.\n"
                "- WATCHLIST when fundamentals are constructive but entry timing or valuation isn't compelling enough for immediate capital deployment.\n"
                "- AVOID when margin of safety is weak, balance-sheet quality is poor, or opportunity cost is too high.\n"
            )
        return allowed_actions, rules

    # ------------------------------------------------------------------
    # Model discovery
    # ------------------------------------------------------------------

    @staticmethod
    async def get_available_models() -> List[str]:
        """Fetches models installed in the local Ollama instance."""
        base_url = settings.OLLAMA_URL.rsplit("/api", 1)[0]
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{base_url}/api/tags", timeout=5.0)
                if response.status_code == 200:
                    data = response.json()
                    return [m["name"] for m in data.get("models", [])]
        except Exception as e:
            print(f"[AIService] Error fetching Ollama models: {e}")
        return settings.AVAILABLE_OLLAMA_MODELS

    # ------------------------------------------------------------------
    # Text cleaning
    # ------------------------------------------------------------------

    @staticmethod
    def _strip_thinking(text: str) -> str:
        """
        Removes all thinking/reasoning blocks from model output.
        Handles Qwen, DeepSeek, Gemma, and other patterns case-insensitively.

        We keep deep reasoning ENABLED in the model (it improves output quality)
        but strip thinking tags before JSON parsing.
        """
        clean = text

        # Phase 1: Remove well-formed paired thinking blocks
        paired_patterns = [
            r'<(think|thought|reasoning|scratchpad|brainstorm)>.*?</\1>',
            r'<\|think\|>.*?<\|/think\|>',
            r'\[thought\].*?\[/thought\]',
            r'<\|thought\|>.*?<\|end_thought\|>',
            r'<\|channel\|>thought.*?<\|/channel\|>',
        ]
        for pattern in paired_patterns:
            clean = re.sub(pattern, '', clean, flags=re.DOTALL | re.IGNORECASE)

        # Phase 2: Handle unclosed/truncated thinking tags
        # Build (open_tag, close_tag) pairs explicitly — avoids the
        # slice-and-rejoin bug that produced "<//think|>" for pipe-delimited tags.
        unclosed_pairs = [
            ('<think>',       '</think>'),
            ('<thought>',     '</thought>'),
            ('<reasoning>',   '</reasoning>'),
            ('<scratchpad>',  '</scratchpad>'),
            ('<|think|>',     '<|/think|>'),
        ]
        clean_lower = clean.lower()
        for open_tag, close_tag in unclosed_pairs:
            idx = clean_lower.find(open_tag.lower())
            if idx != -1 and close_tag.lower() not in clean_lower:
                # Truncate at the opening tag — everything after is reasoning noise
                clean = clean[:idx]
                clean_lower = clean.lower()  # keep in sync for next iteration

        # Phase 3: Strip residual markdown fences (```json ... ```)
        clean = re.sub(r'```(?:json)?\s*(.*?)\s*```', r'\1', clean, flags=re.DOTALL)

        return clean.strip()

    # ------------------------------------------------------------------
    # JSON extraction
    # ------------------------------------------------------------------

    # Sentence starters that signal the model is reasoning, not reporting.
    # Any paragraph beginning with one of these is removed from analysis output.
    _THINKING_STARTERS = re.compile(
        r'^(let me|let\'s think|actually[,\s]|but wait[,\s]|however[,\s]note|'
        r'wait[,\s]|hmm[,\s]|on second thought|re-?reading|alternatively[,\s]|'
        r'i think|note that|but note|so we|so the|so i|given the (above|context)|'
        r'given (that|this)|but the problem|the problem says)',
        re.IGNORECASE,
    )

    # Fragments that indicate an incomplete/cut-off sentence
    _TRAILING_FRAGMENT = re.compile(r'[a-z,]\s*$', re.IGNORECASE)

    @classmethod
    def _clean_analysis(cls, text: str) -> str:
        """
        Post-process the extracted analysis string to remove inline thinking
        artifacts that Qwen3 (and other small models) write into the analysis
        field itself rather than inside <think> tags.

        Strategy:
        1. Split into paragraphs.
        2. Drop any paragraph whose first sentence starts with a known
           reasoning phrase ("Let me think", "But wait", "Actually," …).
        3. Drop any paragraph that ends mid-sentence (model was cut off
           mid-reasoning).
        4. Collapse runs of blank lines.
        """
        if not text:
            return text

        paragraphs = re.split(r'\n{2,}', text.strip())
        clean_paras = []

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            # Get the first real sentence of the paragraph for classification
            first_line = para.split('\n')[0].strip()
            # Strip leading markdown list/numbering chars for matching
            first_clean = re.sub(r'^[\s\*\-\d\.\#]+', '', first_line).strip()

            if cls._THINKING_STARTERS.match(first_clean):
                continue  # entire paragraph is reasoning noise

            # Drop paragraphs that end abruptly mid-sentence (cut-off thinking)
            last_sentence = para.rstrip()
            if cls._TRAILING_FRAGMENT.search(last_sentence) and not last_sentence.endswith(('.', '!', '?', ':', ')')):
                # Likely truncated — drop only if paragraph is also short (< 3 lines)
                if len(para.split('\n')) < 3:
                    continue

            clean_paras.append(para)

        return '\n\n'.join(clean_paras)

    @staticmethod
    def _parse_robust_json(text: str) -> Optional[Dict[str, Any]]:
        """
        Hyper-robust JSON extraction. Tries multiple strategies in order.
        """
        text = text.strip()
        if not text:
            return None

        # Strategy 1: Direct parse
        try:
            res = json.loads(text)
            if isinstance(res, dict):
                return res
        except json.JSONDecodeError:
            pass

        # Strategy 2: Find all {...} candidates; try largest-first
        candidates: List[str] = []
        for start_idx, char in enumerate(text):
            if char != '{':
                continue
            depth = 0
            for i in range(start_idx, len(text)):
                if text[i] == '{':
                    depth += 1
                elif text[i] == '}':
                    depth -= 1
                    if depth == 0:
                        candidates.append(text[start_idx:i + 1])
                        break

        for cand in sorted(candidates, key=len, reverse=True):
            # 2a: direct parse of candidate
            try:
                res = json.loads(cand)
                if isinstance(res, dict):
                    return res
            except json.JSONDecodeError:
                pass

            # 2b: fix common JSON mistakes then retry
            try:
                fixed = re.sub(r',\s*([\]}])', r'\1', cand)          # trailing commas
                fixed = re.sub(r'[\x00-\x1f]', ' ', fixed)            # control chars
                res = json.loads(fixed)
                if isinstance(res, dict):
                    return res
            except json.JSONDecodeError:
                pass

        # Strategy 3: Regex key extraction (hard fallback)
        def _extract(key: str) -> Optional[str]:
            m = re.search(
                r'"' + re.escape(key) + r'"\s*:\s*"((?:[^"\\]|\\.)*)"',
                text, re.IGNORECASE | re.DOTALL,
            )
            return re.sub(r'\\"', '"', m.group(1)).strip() if m else None

        verdict = _extract("verdict") or _extract("conclusion") or _extract("recommendation")
        if verdict:
            return {
                "verdict":  verdict,
                "analysis": _extract("analysis") or _extract("reasoning") or "Analysis extraction failed.",
            }

        return None

    # ------------------------------------------------------------------
    # Value normalisation
    # ------------------------------------------------------------------

    @staticmethod
    def _flatten_value(val: Any) -> str:
        """Ensure a value is a plain string for frontend rendering."""
        if val is None:
            return "Not provided."
        if isinstance(val, dict):
            return ". ".join(f"{k}: {v}" for k, v in val.items())
        if isinstance(val, list):
            return ", ".join(str(x) for x in val)
        return str(val)

    @classmethod
    def _normalize_parsed(cls, parsed: Dict[str, Any], model: str) -> Dict[str, Any]:
        """
        Extract verdict/analysis from a parsed dict, tolerating aliased key names.
        """
        def _find(aliases: set) -> Optional[str]:
            for k in parsed:
                if k.lower() in aliases:
                    return cls._flatten_value(parsed[k])
            return None

        return {
            "status":     "success",
            "model_used": model,
            "verdict":    _find(_VERDICT_ALIASES)  or "NEUTRAL",
            "analysis":   cls._clean_analysis(_find(_ANALYSIS_ALIASES) or "Analysis unavailable."),
        }

    # ------------------------------------------------------------------
    # Ollama call
    # ------------------------------------------------------------------

    @classmethod
    async def _call_ollama(
        cls,
        system_prompt: str,
        user_prompt: str,
        model: str,
    ) -> Dict[str, Any]:
        """
        Sends a prompt to Ollama and returns a normalised result dict.

        Uses /api/chat with a system message. If the model is known to
        ignore the system role (some Qwen3 quantisations), the caller can
        prepend the system content into the user message instead — see the
        _build_user_prompt_with_system() helper below.
        """
        base_url = settings.OLLAMA_URL.rsplit("/api", 1)[0]
        chat_url = f"{base_url}/api/chat"
        options  = _model_options(model)

        payload = {
            "model":    model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            "stream":  False,
            "options": options,
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    chat_url, json=payload, timeout=settings.OLLAMA_TIMEOUT,
                )

            if response.status_code != 200:
                return cls._error(f"Ollama HTTP {response.status_code}")

            result      = response.json()
            msg         = result.get("message", {})
            raw_content = msg.get("content", "").strip()
            thinking    = msg.get("thinking", "").strip()

            # Merge thinking field into content when content is empty.
            # Some Qwen3 builds route ALL output through the thinking field.
            if not raw_content and thinking:
                raw_content = thinking
                thinking    = ""

            if not raw_content:
                return cls._error(
                    "Empty AI response — model may have run out of tokens while thinking. "
                    "Try increasing OLLAMA_TIMEOUT or switching to a smaller/faster model."
                )

            # Strip thinking tags from content (thinking field already handled above)
            clean = cls._strip_thinking(raw_content)
            parsed = cls._parse_robust_json(clean)

            if parsed:
                return cls._normalize_parsed(parsed, model)

            # Last resort: scan raw text for a verdict keyword
            raw_upper = raw_content.upper()
            verdict   = "NEUTRAL"
            for kw in ("STRONG BUY", "BUY", "ACCUMULATE", "HOLD", "REDUCE", "SELL"):
                if kw in raw_upper:
                    verdict = kw
                    break

            return {
                "status":     "success",
                "model_used": f"{model} (raw-text)",
                "verdict":    verdict,
                "analysis":   clean or raw_content,
            }

        except httpx.ReadTimeout:
            return cls._error(
                f"AI generation timed out after {settings.OLLAMA_TIMEOUT}s. "
                "Try a smaller model or increase OLLAMA_TIMEOUT in settings."
            )
        except Exception as e:
            return cls._error(f"Local AI error: {e}")

    # ------------------------------------------------------------------
    # Error helper
    # ------------------------------------------------------------------

    @staticmethod
    def _error(message: str, verdict: str = "ERROR") -> Dict[str, Any]:
        return {"status": "error", "verdict": verdict, "analysis": message}

    # ------------------------------------------------------------------
    # Macro context injection (background enrichment for AI prompts)
    # ------------------------------------------------------------------

    @staticmethod
    def _get_macro_context() -> str:
        """Fetch macro context string for AI prompt enrichment. Returns empty string on failure."""
        try:
            from app.database import SessionLocal
            from app.services.economy_service import build_macro_context_string
            db = SessionLocal()
            try:
                return build_macro_context_string(db)
            finally:
                db.close()
        except Exception:
            return ""

    # ------------------------------------------------------------------
    # Telemetry
    # ------------------------------------------------------------------
    @staticmethod
    def _log_usage(
        provider: str,
        model: str,
        endpoint: str,
        duration: float,
        status: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        error_message: str = None
    ) -> None:
        """Record AI usage to database and structlog (H-3/M-5)."""
        logger.info(
            "ai.call_completed",
            provider=provider,
            model=model,
            endpoint=endpoint,
            duration=round(duration, 2),
            status=status,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            error=error_message
        )
        try:
            db = SessionLocal()
            log = AIUsageLog(
                provider=provider,
                model=model,
                endpoint=endpoint,
                duration_seconds=duration,
                status=status,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                error_message=error_message
            )
            db.add(log)
            db.commit()
            db.close()
        except Exception as e:
            logger.error("ai.log_usage_failed", error=str(e))

    # ------------------------------------------------------------------
    # Public API — Fallback Router (M-5)
    # ------------------------------------------------------------------

    @classmethod
    async def get_value_verdict(
        cls,
        input_data: Dict[str, Any],
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Value Investing AI session with fallback chain."""
        scoring_action = input_data.get("action_verdict") or input_data.get("scoring_action", "HOLD")
        scoring_score  = input_data.get("health_score", 50)
        portfolio_ctx  = input_data.get("portfolio_context")
        
        user_prompt = f"Stock data:\n{json.dumps(input_data, default=str)}"
        macro_ctx = cls._get_macro_context()
        if macro_ctx:
            user_prompt += f"\n\n{macro_ctx}"

        return await cls._execute_with_fallback(
            endpoint_name="value_verdict",
            build_local_system=lambda: cls._build_value_system_prompt(scoring_action, scoring_score, portfolio_ctx, True),
            build_cloud_system=lambda: cls._build_value_system_prompt(scoring_action, scoring_score, portfolio_ctx, False),
            user_prompt=user_prompt,
            requested_model=model_name
        )

    @classmethod
    async def get_trading_verdict(
        cls,
        input_data: Dict[str, Any],
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Pure Trading AI session with fallback chain."""
        active_setup = input_data.get("active_trade_setup")
        portfolio_ctx = input_data.get("portfolio_context")
        
        user_prompt = f"Technical data:\n{json.dumps(input_data, default=str)}"
        macro_ctx = cls._get_macro_context()
        if macro_ctx:
            user_prompt += f"\n\n{macro_ctx}"

        return await cls._execute_with_fallback(
            endpoint_name="trading_verdict",
            build_local_system=lambda: cls._build_trading_system_prompt(active_setup, portfolio_ctx, True),
            build_cloud_system=lambda: cls._build_trading_system_prompt(active_setup, portfolio_ctx, False),
            user_prompt=user_prompt,
            requested_model=model_name
        )

    @classmethod
    async def get_verdict(
        cls,
        input_data: Dict[str, Any],
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Legacy alias."""
        return await cls.get_value_verdict(input_data, model_name)

    @classmethod
    async def get_portfolio_verdict(
        cls,
        input_data: Dict[str, Any],
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Portfolio analysis with fallback chain."""
        user_prompt = f"Portfolio Metrics:\n{json.dumps(input_data, default=str)}"
        
        return await cls._execute_with_fallback(
            endpoint_name="portfolio",
            build_local_system=cls._portfolio_system_prompt,
            build_cloud_system=cls._portfolio_system_prompt,
            user_prompt=user_prompt,
            requested_model=model_name
        )

    @classmethod
    async def get_portfolio_verdict_cloud(
        cls,
        input_data: Dict[str, Any],
        provider: str = "groq",
    ) -> Dict[str, Any]:
        """Legacy alias."""
        return await cls.get_portfolio_verdict(input_data)

    @classmethod
    async def _execute_with_fallback(
        cls,
        endpoint_name: str,
        build_local_system: callable,
        build_cloud_system: callable,
        user_prompt: str,
        requested_model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Executes the AI call, trying providers in the defined fallback order (M-5)."""
        fallback_order = settings.AI_FALLBACK_ORDER
        last_error = None

        for provider in fallback_order:
            start_time = time.time()
            logger.info("ai.attempting_provider", provider=provider, endpoint=endpoint_name)
            
            try:
                if provider == "groq":
                    if not settings.GROQ_API_KEY:
                        logger.debug("ai.skip_groq", reason="no_api_key")
                        continue
                    res = await cls._call_cloud_api(
                        build_cloud_system(), user_prompt, 
                        is_nvidia=False, 
                        timeout=settings.AI_TIMEOUT_SECONDS
                    )
                elif provider == "nvidia":
                    if not settings.NVIDIA_API_KEY:
                        logger.debug("ai.skip_nvidia", reason="no_api_key")
                        continue
                    res = await cls._call_cloud_api(
                        build_cloud_system(), user_prompt, 
                        is_nvidia=True, 
                        timeout=settings.AI_TIMEOUT_SECONDS
                    )
                elif provider == "ollama":
                    model = requested_model or settings.DEFAULT_OLLAMA_MODEL
                    res = await cls._call_ollama(
                        build_local_system(), user_prompt, model
                    )
                else:
                    continue

                duration = time.time() - start_time
                
                if res.get("status") == "success":
                    cls._log_usage(
                        provider=provider,
                        model=res.get("model_used", "unknown"),
                        endpoint=endpoint_name,
                        duration=duration,
                        status="success",
                        prompt_tokens=res.get("prompt_tokens", 0),
                        completion_tokens=res.get("completion_tokens", 0)
                    )
                    return res
                else:
                    last_error = res.get("analysis", "Unknown error")
                    cls._log_usage(
                        provider=provider,
                        model="unknown",
                        endpoint=endpoint_name,
                        duration=duration,
                        status="failed",
                        error_message=last_error
                    )
                    logger.warning("ai.provider_failed", provider=provider, error=last_error)

            except Exception as e:
                duration = time.time() - start_time
                last_error = str(e)
                cls._log_usage(
                    provider=provider,
                    model="unknown",
                    endpoint=endpoint_name,
                    duration=duration,
                    status="failed",
                    error_message=last_error
                )
                logger.warning("ai.provider_exception", provider=provider, error=last_error)

        return cls._error(f"All AI providers failed. Last error: {last_error}")

    # ------------------------------------------------------------------
    # Cloud API (Groq / Nvidia)
    # ------------------------------------------------------------------

    @classmethod
    async def _call_cloud_api(
        cls,
        system_prompt: str,
        user_prompt: str,
        is_nvidia: bool = False,
        timeout: int = 30
    ) -> Dict[str, Any]:
        """
        Calls either Groq or Nvidia API depending on the is_nvidia flag.
        """
        api_key  = settings.NVIDIA_API_KEY if is_nvidia else settings.GROQ_API_KEY
        base_url = settings.NVIDIA_BASE_URL if is_nvidia else settings.GROQ_BASE_URL
        model    = settings.NVIDIA_MODEL if is_nvidia else settings.GROQ_MODEL
        provider = "Nvidia" if is_nvidia else "Groq"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        }
        
        payload = {
            "model":    model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            "temperature": 0.3,
        }

        if is_nvidia:
            payload["max_tokens"] = 4096
            payload["chat_template_kwargs"] = {"thinking": False}
        else:
            payload["response_format"] = {"type": "json_object"}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=float(timeout),
                )

            if response.status_code == 429:
                return cls._error(f"{provider} API rate limit reached.")

            if response.status_code != 200:
                return cls._error(f"{provider} API HTTP {response.status_code}: {response.text[:200]}")

            data    = response.json()
            usage   = data.get("usage", {})
            content = data["choices"][0]["message"]["content"]
            
            # Nvidia might return markdown blocks
            clean = cls._strip_thinking(content)
            parsed = cls._parse_robust_json(clean)

            if parsed:
                result = cls._normalize_parsed(parsed, f"{model} ({provider})")
                result["prompt_tokens"] = usage.get("prompt_tokens", 0)
                result["completion_tokens"] = usage.get("completion_tokens", 0)
                return result

            return cls._error(f"{provider} API returned unparseable response.")

        except httpx.ReadTimeout:
            return cls._error(f"{provider} API timed out after {timeout}s.")
        except Exception as e:
            return cls._error(f"{provider} API error: {e}")

    # ------------------------------------------------------------------
    # Cloud-specific system prompts (no <think> tags — frontier models
    # don't need them and they waste tokens on paid APIs)
    # ------------------------------------------------------------------

    @classmethod
    def _build_value_system_prompt(
        cls,
        scoring_action: str,
        scoring_score: int,
        portfolio_ctx: dict | None = None,
        is_local: bool = False,
    ) -> str:
        allowed_actions, portfolio_rules = cls._build_value_portfolio_rules(portfolio_ctx)

        format_block = (
            "OUTPUT FORMAT - respond with a JSON object only:\n"
            "{\n"
            '  "verdict": "One direct sentence stating your recommendation.",\n'
            '  "analysis": "Your entire text response written EXACTLY per the following structure."\n'
            "}\n\n"
        )
        if is_local:
            format_block = (
                "You MUST structure your thoughts inside <think>...</think> tags first.\n"
                "After the </think> tag, output a raw JSON object matching this exact format:\n"
                "{\n"
                '  "verdict": "One direct sentence stating your recommendation.",\n'
                '  "analysis": "Your entire text response written EXACTLY per the following structure."\n'
                "}\n\n"
            )

        # Replace lines 644–660 with:
        return (
            "You are a patient, fundamentals-first NEPSE value investor. Your only goal is to "
            "determine whether a business deserves long-term capital at the current price, and "
            "how much of it — nothing more. You do not care about this week's price action. "
            "You care about whether the underlying business is compounding wealth or quietly destroying it.\n\n"
            "You are writing for two audiences: an experienced investor who wants the hard realities fast, "
            "and a beginner who needs clear directives without jargon.\n\n"
            "=======================================\n"
            "NEPSE VALUE INVESTING — HARD CONSTRAINTS (never violate):\n"
            "- DO NOT hallucinate external news, upcoming dividends, rights issues, or regulatory changes. "
            "Base your entire analysis ONLY on the provided JSON data.\n"
            "- GRAHAM NUMBER IS IRRELEVANT IN NEPSE. Frequent rights shares and bonus-heavy capital requirements "
            "make book value a poor proxy for intrinsic value. Use P/E vs sector peers, earnings trend, "
            "and dividend cash yield instead.\n"
            "- RIGHT SHARES AND FPOs are value-destroying dilution events unless the new capital earns above "
            "the cost of equity. Always flag when historical patterns show repeated dilution without earnings growth.\n"
            "- BONUS SHARES ARE NOT INCOME. A company paying 30% bonus with 5% earnings growth is diluting "
            "shareholders, not rewarding them. Cash dividend yield is the only honest yield metric.\n"
            "- SECTOR-SPECIFIC QUALITY GATES (not optional, must be evaluated):\n"
            "  → Banks/Finance: NPL ratio, Cost of Funds, Capital Adequacy Ratio (CAR), CD ratio\n"
            "  → Insurance: Net Solvency Ratio, Combined Ratio, float quality\n"
            "  → Hydro: PPA rate and duration, debt coverage, seasonal cash flow profile\n"
            "  → Microfinance: Borrower quality, geographic concentration, PAR30\n"
            "- RISK-FREE RATE PROXY: 7–8% (bank fixed deposits). Any investment must clear this hurdle "
            "on a forward-looking basis to justify the illiquidity and volatility premium of NEPSE equities.\n"
            "- VALUE TRAP CHECK: A stock is not 'cheap' just because P/E is low. Check whether earnings "
            "are declining, book value is inflated by unrealized assets, or the company is a structural "
            "loser in its sector.\n"
            f"- The scoring engine rated this stock's health: {scoring_score}/100 and recommends: {scoring_action}. "
            "Treat this as a heuristic starting point — if raw data contradicts the score, the raw data wins.\n"
            f"{portfolio_rules}"
            "- MANDATORY DECISION HIERARCHY (strictly in this order):\n"
            "  1. Sector-specific quality gate (NPL, solvency, margins) — if FAIL, BUY/ACCUMULATE are forbidden\n"
            "  2. Dividend quality gate — cash yield vs. bonus dilution pattern\n"
            "  3. Forward expected return vs. 7–8% risk-free hurdle\n"
            "  4. Valuation (P/E, P/B relative to sector peers and earnings trend)\n"
            "  5. Technical entry timing — a minor overlay only, not a co-equal factor\n"
            "- If quality/survival fails, 'cheap' is irrelevant. Exit value traps.\n"
            "- Technical analysis appears ONLY as a brief TIMING NOTE disclaimer. It does not drive the verdict.\n"
            "=======================================\n\n"
            f"{format_block}"
            "STRICT ANALYSIS STRUCTURE (Use EXACTLY these headers):\n\n"
            "VERDICT\n"
            f"[One word: {allowed_actions}]\n"
            "[One sentence explaining the single most important capital-allocation reason for this signal.]\n"
            "[Margin of Safety: HIGH / MEDIUM / LOW - and one clause explaining why.]\n\n"
            "DECISION HIERARCHY\n"
            "[State the ranked hierarchy explicitly: quality first, then forward return, then valuation, then dividend quality, then timing.]\n"
            "Quality gate: [PASS / CAUTION / FAIL]\n"
            "Forward return gate: [STRONG / ACCEPTABLE / WEAK / NEGATIVE]\n\n"
            "FUNDAMENTAL STRENGTHS & RISKS\n"
            "[Identify the primary fundamental strength and primary risk strictly from the provided data (e.g., high NPL, strong dividend yield, negative profit trend, high debt-to-equity).]\n"
            "Primary Strength: [Metric/Factor based on data]\n"
            "Primary Risk: [Metric/Factor based on data]\n\n"
            "VALUATION & DIVIDEND REALITY\n"
            "[Evaluate P/E, P/B, and PEG. Explicitly address the historical dividend profile (Cash vs Bonus). Ignore Graham Number entirely.]\n"
            "P/E vs Sector: [value] -> [Cheap / Fair / Expensive]\n"
            "P/B Reality: [value] -> [Is the book value inflated or depressed?]\n"
            "Dividend Profile: [Explain if historical distributions lean heavy on bonus shares vs cash based on the provided dividend_history.]\n\n"
            "FINANCES & SECTOR\n"
            "[Evaluate sector-specific health like NPL/CAR for banks or solvency for insurance]\n"
            "- [Metric name]: [value] -> [what this means in plain English]\n"
            "- [Metric name]: [value] -> [what this means in plain English]\n\n"
            "DIVIDEND OUTLOOK\n"
            "[Evaluate payout quality, not just payout headline. Explicitly distinguish cash yield from bonus-heavy distribution if relevant.]\n"
            "Cash yield: [value]%\n"
            "Distribution profile: [cash-led / mixed / bonus-heavy / bonus-only]\n\n"
            "CAPITAL ALLOCATION FIT\n"
            "[If held: evaluate WACC, unrealized profit/loss, XIRR, dividend income, concentration, and opportunity cost before deciding whether to add, hold, reduce, or exit. If not held: explain whether it deserves capital now versus waiting.]\n"
            "Reduction type: [VALUATION-DRIVEN / OPPORTUNITY-COST-DRIVEN / N/A]\n"
            "- [Metric]: [value] -> [why it supports this action]\n\n"
            "FINAL RECONCILIATION\n"
            "[Resolve all conflicts here. If valuation looks cheap but quality gate fails, say that quality wins. If return looks positive but opportunity cost is better elsewhere, say that portfolio fit wins.]\n"
            "[One short paragraph explaining why the final verdict follows the decision hierarchy rather than isolated metrics.]\n\n"
            # Replace current TIMING NOTE section header with:
            "TIMING NOTE (minor overlay — this does NOT change the fundamental verdict)\n"
            "[One to two sentences only. State whether the current price is near a technical support or "
            "resistance zone based on the provided data, and whether waiting for a better entry is "
            "worth the opportunity cost for a long-term position. Do not perform full technical analysis here.]\n\n"
            "[Use the separate technical timing guidance as a disclaimer-style overlay: whether entry looks favorable now, whether to wait, or whether existing holders should watch for technical deterioration.]\n\n"
            "WHAT WOULD CHANGE IT\n"
            "[Two to three conditions (like earnings deterioration, a better opportunity elsewhere, or a price reset) that would flip this signal.]\n"
            "- If [condition] -> [result]\n\n"
            "BEGINNER CHECKLIST\n"
            "[] [Specific action or check relevant to this stock and signal]\n"
            "[] [Specific action or check relevant to this stock and signal]\n"
        )

    @classmethod
    def _cloud_value_system_prompt(cls, scoring_action: str, scoring_score: int, portfolio_ctx: dict | None = None) -> str:
        return cls._build_value_system_prompt(
            scoring_action=scoring_action,
            scoring_score=scoring_score,
            portfolio_ctx=portfolio_ctx,
            is_local=False,
        )
    @staticmethod
    def _build_trading_context_rules(
        active_trade_setup: Optional[Dict] = None,
        portfolio_context: Optional[Dict] = None,
    ) -> tuple[str, str]:
        """Return allowed signals and position-aware trading instructions."""
        has_holding = bool(portfolio_context and portfolio_context.get("current_qty", 0) > 0)
        has_active_setup = bool(active_trade_setup)

        if has_active_setup:
            qty = active_trade_setup.get("allocated_qty") or (portfolio_context or {}).get("current_qty", 0)
            rules = (
                "POSITION MODE: ACTIVE TRADE\n"
                "- The user already has a live trade in this stock. Manage the existing trade. Do not pitch a brand-new setup.\n"
                f"- Setup entry: Rs. {active_trade_setup.get('entry_price')}, target 1: Rs. {active_trade_setup.get('target_1') or active_trade_setup.get('target_price')}, target 2: Rs. {active_trade_setup.get('target_2')}, stop: Rs. {active_trade_setup.get('current_stop_loss') or active_trade_setup.get('stop_loss')}, trailing stop: Rs. {active_trade_setup.get('trailing_stop')}.\n"
                f"- Position size: {qty} shares. Setup quality: {active_trade_setup.get('setup_quality')}. Strategy type: {active_trade_setup.get('strategy_type')}. Thesis: {active_trade_setup.get('thesis') or active_trade_setup.get('strategy_note')}.\n"
            )
            if portfolio_context:
                rules += (
                    f"- Portfolio reality: WACC Rs. {portfolio_context.get('wacc')}, unrealized PnL {portfolio_context.get('pnl_pct')}% (Rs. {portfolio_context.get('unrealized_pnl')}), XIRR {portfolio_context.get('xirr')}%, concentration {portfolio_context.get('concentration_pct')}%.\n"
                )
            rules += (
                "- Your allowed verdicts are ONLY: EXIT, WAIT, or STOP_LOSS.\n"
                "- WAIT means hold unchanged. EXIT means take profit, de-risk, or close intentionally. STOP_LOSS means cut because the setup is invalidated or risk is unacceptable.\n"
                "- Use liquidity, volume confirmation, trend integrity, distance to stop/target, slippage-adjusted reward after costs, and freshness context before choosing a signal.\n"
            )
            return "EXIT, WAIT, or STOP_LOSS", rules

        if has_holding:
            rules = (
                "POSITION MODE: HELD WITHOUT ACTIVE TRADE PLAN\n"
                "- The user already holds this stock, but there is no active structured trade setup attached.\n"
                f"- Current holding: {(portfolio_context or {}).get('current_qty')} shares at WACC Rs. {(portfolio_context or {}).get('wacc')}.\n"
                f"- Portfolio reality: unrealized PnL {(portfolio_context or {}).get('pnl_pct')}% (Rs. {(portfolio_context or {}).get('unrealized_pnl')}), XIRR {(portfolio_context or {}).get('xirr')}%, concentration {(portfolio_context or {}).get('concentration_pct')}%, dividend income Rs. {(portfolio_context or {}).get('dividend_income')}.\n"
                "- Your allowed verdicts are ONLY: ADD, WAIT, TRIM, or EXIT.\n"
                "- ADD means tactically add only if liquidity, volume, and chart structure support it and portfolio concentration is still reasonable.\n"
                "- TRIM means reduce partially to manage risk or lock gains without fully closing.\n"
                "- EXIT means fully close. WAIT means do nothing now.\n"
                "- Do not invent a stop-loss plan unless the chart structure clearly gives one and your explanation makes that explicit.\n"
            )
            return "ADD, WAIT, TRIM, or EXIT", rules

        rules = (
            "POSITION MODE: NO POSITION\n"
            "- The user does not currently hold this stock as a trade.\n"
            "- Your allowed verdicts are ONLY: BUY, WAIT, or AVOID.\n"
            "- BUY requires a valid tactical setup with acceptable liquidity, volume confirmation, risk, and post-cost reward.\n"
            "- WAIT means interesting chart but no clean entry yet. AVOID means weak or low-quality setup.\n"
        )
        return "BUY, WAIT, or AVOID", rules

    @classmethod
    def _build_trading_system_prompt(
        cls,
        active_trade_setup: Optional[Dict] = None,
        portfolio_context: Optional[Dict] = None,
        is_local: bool = False,
    ) -> str:
        allowed_signals, context_str = cls._build_trading_context_rules(
            active_trade_setup=active_trade_setup,
            portfolio_context=portfolio_context,
        )

        format_str = (
            "OUTPUT FORMAT - respond with a JSON object only:\n"
            "{\n"
            '  "verdict": "One direct sentence stating the trade setup.",\n'
            '  "analysis": "Your entire text response written EXACTLY per the following structure."\n'
            "}\n\n"
        )
        if is_local:
            format_str = (
                "You MUST structure your thoughts inside <think>...</think> tags first.\n"
                "After the </think> tag, output a raw JSON object matching this exact format:\n"
                "{\n"
                '  "verdict": "One direct sentence stating the trade setup.",\n'
                '  "analysis": "Your entire text response written EXACTLY per the following structure."\n'
                "}\n\n"
            )

        return (
            "You are a professional NEPSE trading analyst writing a brief for two audiences "
            "simultaneously: an experienced trader who wants the numbers fast, and a beginner "
            "who needs to understand what to do and why.\n\n"
            "=======================================\n"
            "NEPSE RULES (hard constraints - never violate):\n"
            "- Long positions only. No short selling.\n"
            "- T+2 settlement. Plan exits before next session if intraday.\n"
            "- 10% daily circuit breaker. Stop loss must be realistic for NEPSE volatility and liquidity.\n"
            "- Minimum meaningful trade: consider turnover_120d and liquidity grade before recommending action.\n"
            "- If live price or technical data is stale, reduce confidence and avoid aggressive action unless the setup is obviously broken.\n"
            "- In NEPSE, liquidity and volume shifts matter more than oscillator alignment. Treat volume/OBV/liquidity as primary evidence, trend integrity as secondary confirmation, and RSI as a timing aid only.\n"
            "- Separate trend integrity from execution timing. Trend integrity answers whether the trade thesis is intact; execution timing answers whether today is an efficient moment to act.\n"
            "- If a liquidity-adjusted slippage buffer is provided, use it. Prefer slippage-adjusted reward/risk over theoretical reward/risk.\n"
            "- POSITION SIZING REGIME RULES:\n"
            "  * If market_regime_verdict is BEARISH: Reduce standard position size by 50%. Focus on quick exits.\n"
            "  * If sector_index_trend is BEARISH: Avoid new BUY/ADD entirely unless stock shows extreme relative strength.\n"
            "  * If market is BULLISH but sector is BEARISH: Keep sizes small (quarter position).\n"
            "- HARD GATING RULE: if liquidity gate fails, do not endorse bullish action. Weak liquidity blocks BUY and ADD, and usually pushes active trades toward WAIT unless invalidation is triggered.\n"
            "- HARD GATING RULE: if OBV/distribution is hostile, downgrade bullish setups even if EMA structure still looks good.\n"
            "- If the payload provides trading_decision_framework, use its gates as binding summaries rather than re-inventing softer interpretations.\n"
            "- SIGNAL MAPPING RULES: STOP_LOSS is for invalidation/risk failure, EXIT is for intentional close or de-risk before formal invalidation, WAIT is for intact thesis with poor timing or poor reward/risk.\n"
            "- SETUP INVALIDATION can happen before the stop is hit if trend integrity breaks and support failure or OBV distribution confirms the weakness.\n"
            "- NEPSE CIRCUIT BREAKER REALITY: The 15% daily circuit means stops below the circuit floor "
            "are unexecutable on the day of a gap-down. Place stops AT LEAST 2–3% above the likely circuit "
            "floor for low-liquidity stocks. Never recommend a stop that would require execution during a "
            "circuit-halt day for small stocks.\n"
            "- CGT COST IS A REAL TRADE KILLER: All gains realized within 365 days attract 7.5% CGT. "
            "For a trade targeting 12% upside with 5% downside, the net reward after 7.5% CGT and 0.8% "
            "commissions drops to approximately 10.3% — reducing a notional 2.4:1 R:R to roughly 2.1:1. "
            "Always show post-CGT, post-commission net reward in TRADE NUMBERS.\n"
            "- NEPSE LIQUIDITY REALITY FOR POSITION SIZING: Do not recommend a position size that exceeds "
            "5% of the stock's average 20-day turnover. If the data provides turnover_20d or turnover_120d, "
            "use it to sanity-check the position size. Flag when any recommended position would itself move "
            "the market on entry or exit.\n"
            "- MANIPULATION AWARENESS: In low-liquidity NEPSE stocks (turnover < Rs. 5M/day), price action "
            "near resistance is often artificially held. Treat breakouts in low-turnover stocks with extreme "
            "skepticism unless volume is at least 2x the 20-day average.\n"
            "- REALISTIC SWING TIMEFRAME FOR NEPSE: Most retail trades are 1–4 week swings. Intraday "
            "scalping is impractical for retail due to T+2 and bid-ask spreads in illiquid stocks. "
            "Default timeframe recommendations: short-term = 3–7 days, swing = 2–4 weeks.\n"
            "=======================================\n\n"
            f"{context_str}\n"
            f"{format_str}"
            "WRITE EXACTLY THE FOLLOWING SECTIONS IN ORDER:\n\n"
            "SIGNAL\n"
            f"[One word: {allowed_signals}]\n"
            "[One sentence explaining the single most important reason for this signal.]\n"
            "[Confidence: HIGH / MEDIUM / LOW - and one clause explaining why.]\n\n"
            "DECISION GATES\n"
            "[State the hard gates first. These gates control the signal and must be binding, not advisory.]\n"
            "Liquidity gate: [PASS / CAUTION / FAIL]\n"
            "OBV gate: [SUPPORTIVE / NEUTRAL / BLOCK_BULLISH]\n"
            "Trend integrity status: [INTACT / WEAKENING / BROKEN]\n"
            "Slippage R:R gate: [PASS / FAIL / N/A]\n\n"
            "MARKET CONTEXT CHECK\n"
            "Market Regime: [BEARISH / BULLISH / NEUTRAL] -> [Implication for size/holding period based on market_regime_verdict]\n"
            "Sector Trend:  [BEARISH / BULLISH / NEUTRAL / N/A] -> [Tailwind or Headwind? based on sector_index_trend]\n\n"
            "POSITION CONTEXT\n"
            "[Explain whether this is an active trade, held-without-plan position, or no-position watchlist case, and why that changes the action.]\n\n"
            "TREND INTEGRITY\n"
            "[Judge the higher-timeframe structure first using EMA structure, relative strength vs NEPSE, and whether trend is intact or damaged.]\n"
            "- [Trend factor]: [value] -> [plain English meaning]\n\n"
            "EXECUTION TIMING\n"
            "[Judge whether today is a good execution window using liquidity, volume, OBV, ATR, breakout strength, and immediate price behavior. RSI is secondary.]\n"
            "- [Timing factor]: [value] -> [plain English meaning]\n\n"
            "TRADE NUMBERS\n"
            "[If a setup exists or a BUY/ADD case is justified, evaluate entry, stop, target, net reward after costs, and slippage-adjusted reward after costs. If there is no valid setup, explicitly say so.]\n"
            "Entry zone:    Rs. [lower] - Rs. [upper]\n"
            "Target:        Rs. [price] (+[%])\n"
            "Stop loss:     Rs. [price] (-[%])\n\n"
            "RISK:REWARD CALCULATION RULES (MANDATORY):\n"
            "- Gross Profit = (Target - Entry)\n"
            "- Net Reward = Gross Profit - (7.5% CGT on Profit) - (0.8% Total Commissions on transaction value)\n"
            "- Slippage-Adjusted Net Reward = Net Reward - liquidity/slippage buffer drag\n"
            "- Risk = (Entry - Stop Loss)\n"
            "- Slippage-Adjusted Risk may be wider in low liquidity. Use the payload if available.\n"
            "- Primary R:R ratio = Risk : Slippage-Adjusted Net Reward (Expressed as 1 : [X])\n"
            "R:R ratio:     1 : [X]\n"
            "Timeframe:   [Short-term: 3-7 days / Swing: 2-4 weeks / Position: 1-3 months]\n"
            "Position size: [FULL / HALF / QUARTER]\n"
            "               Beginner tip: [one sentence on risk]\n\n"
            "INVALIDATION LOGIC\n"
            "[Explain what would invalidate the setup before the hard stop, using support failure, OBV distribution, volume fade, or trend break if applicable.]\n"
            "Invalidated now?: [YES / NO]\n"
            "- [Invalidation trigger]: [what it means]\n\n"
            "WHY THIS SIGNAL\n"
            "[Maximum 5 bullet points naming ONE indicator, liquidity measure, or position metric each and ending with a plain-English verdict. Volume/liquidity points should come before RSI if both matter.]\n"
            "- [Indicator]: [value] -> [plain English meaning]\n\n"
            "KEY LEVELS\n"
            "Resistance:  Rs. [price] ([source]) <- [target / ceiling]\n"
            "Support:     Rs. [price] ([source]) <- [stop / floor]\n"
            "Beginner note: [One sentence explaining support/resistance in this context]\n\n"
            "WHAT WOULD CHANGE IT\n"
            "[Two conditions that would flip this signal written as IF -> THEN statements.]\n\n"
            "BEGINNER CHECKLIST\n"
            "[] [Specific action or check relevant to this stock/signal]\n"
            "[] [Specific action or check relevant to this stock/signal]\n"
            "[] [Specific action or check relevant to this stock/signal]\n\n"
            "MANDATORY CHECKS:\n"
            "- DO NOT output R:R lower than 1.5 after taxes and slippage when you recommend BUY or ADD.\n"
            "- Ensure the percentage distance to Target is mathematically larger than the percentage distance to Stop Loss when you recommend BUY or ADD.\n"
            "- DO NOT hallucinate support or resistance levels outside data.\n"
            "- If data freshness is stale, say so explicitly in your confidence statement.\n"
            "- If there is no active setup, do not pretend one already exists.\n"
            "- Do not let RSI overrule weak liquidity or absent volume confirmation.\n"
            "- BUY or ADD is forbidden when liquidity gate = FAIL or OBV gate = BLOCK_BULLISH.\n"
            "- If slippage-adjusted R:R fails the threshold, default to WAIT unless invalidation requires EXIT or STOP_LOSS.\n"
            "- For active trades: STOP_LOSS if invalidated or stop is breached; EXIT if trend weakens and distribution/liquidity deterioration collapses remaining edge; WAIT if trend is still intact but timing is poor.\n"
            "- If setup_invalidated = true, WAIT is not allowed."
        )
    # ------------------------------------------------------------------
    # Cloud public API
    # ------------------------------------------------------------------

    @classmethod
    async def get_value_verdict_cloud(
        cls,
        input_data: Dict[str, Any],
        provider: str = "groq"
    ) -> Dict[str, Any]:
        """Value Investing analysis via Cloud API."""
        scoring_action = input_data.get("action_verdict") or input_data.get("scoring_action", "HOLD")
        scoring_score  = input_data.get("health_score", 50)
        portfolio_ctx  = input_data.get("portfolio_context")
        system_prompt  = cls._cloud_value_system_prompt(scoring_action, scoring_score, portfolio_ctx)
        user_prompt    = f"Stock data:\n{json.dumps(input_data, default=str)}"
        macro_ctx = cls._get_macro_context()
        if macro_ctx:
            user_prompt += f"\n\n{macro_ctx}"
        
        if provider == "nvidia":
            return await cls._call_nvidia_api(system_prompt, user_prompt)
        return await cls._call_cloud_api(system_prompt, user_prompt)

    @classmethod
    async def get_trading_verdict_cloud(
        cls,
        input_data: Dict[str, Any],
        provider: str = "groq"
    ) -> Dict[str, Any]:
        """Pure Trading analysis via Cloud API."""
        active_setup = input_data.get("active_trade_setup")
        portfolio_ctx = input_data.get("portfolio_context")
        system_prompt = cls._build_trading_system_prompt(
            active_trade_setup=active_setup,
            portfolio_context=portfolio_ctx,
            is_local=False,
        )
        user_prompt   = f"Technical data:\n{json.dumps(input_data, default=str)}"
        macro_ctx = cls._get_macro_context()
        if macro_ctx:
            user_prompt += f"\n\n{macro_ctx}"
        
        if provider == "nvidia":
            return await cls._call_nvidia_api(system_prompt, user_prompt)
        return await cls._call_cloud_api(system_prompt, user_prompt)

    # ------------------------------------------------------------------
    # Frontier Prompt Generator (copy/paste to ChatGPT, DeepSeek, etc.)
    # ------------------------------------------------------------------

    @classmethod
    def generate_frontier_prompt(cls, mode: str, input_data: Dict[str, Any]) -> str:
        """
        Returns a ready-to-paste prompt for frontier model web UIs.
        The user copies this into ChatGPT, DeepSeek, Gemini, or Claude.
        """
        if mode.lower() == "trading":
            active_setup = input_data.get("active_trade_setup")
            portfolio_ctx = input_data.get("portfolio_context")
            role = cls._build_trading_system_prompt(
                active_trade_setup=active_setup,
                portfolio_context=portfolio_ctx,
                is_local=False,
            )
            role = role.replace('  "verdict": "One direct sentence stating the trade setup.",\n', "")
        else:
            action = input_data.get("action_verdict") or input_data.get("scoring_action", "HOLD")
            score = input_data.get("health_score", 50)
            portfolio_ctx = input_data.get("portfolio_context")
            role = cls._cloud_value_system_prompt(action, score, portfolio_ctx)
            role = role.replace('  "verdict": "One direct sentence stating your recommendation.",\n', "")

        json_block_pattern = r"OUTPUT FORMAT\s*[-—]\s*respond with a JSON object only:.*?\}\n\n"
        role = re.sub(json_block_pattern, "", role, flags=re.DOTALL)
        role = role.replace(
            '  "analysis": "Your entire text response written EXACTLY per the following structure."',
            "Structure your response as follows:"
        )

        return (
            f"{role}\n\n"
            f"--- STOCK DATA ---\n"
            f"{json.dumps(input_data, indent=2, default=str)}\n"
            f"--- END DATA ---\n\n"
            "Respond in plain human-readable text using the requested headings.\n"
            "Do not return JSON, code fences, or key-value objects.\n"
            "Please provide your analysis based on the data above in the requested structure."
        )
    # ------------------------------------------------------------------
    # Trade Intel — Retrospective Investment Analysis
    # ------------------------------------------------------------------

    @classmethod
    def _trade_intel_system_prompt(cls) -> str:
        """System prompt for retrospective trade analysis / post-mortem."""

        return (
            "You are an experienced NEPSE investment mentor performing a retrospective post-mortem "
            "on a user's complete trade history for a specific stock. Your job is to evaluate their "
            "DECISION-MAKING PROCESS, not just their outcome. A good decision with a bad outcome is "
            "still a good decision. A lucky outcome from a reckless decision is still reckless.\n\n"
            "The most important lesson you can teach is: did the user follow a disciplined process, "
            "manage risk correctly, and respond rationally to new information — or did they rely on "
            "hope, average down into deteriorating fundamentals, or ignore their own stop levels?\n\n"
            "═══════════════════════════════════════\n"
            "NEPSE HARD CONTEXT (calibrate all judgments against this):\n"
            "- Cash-only market. No short selling. No derivatives. No hedging.\n"
            "- T+2 settlement. Liquidity can evaporate in a single session.\n"
            "- CGT: 7.5% on gains realized within 365 days, 5% on gains after 365 days. "
            "This 2.5% difference is meaningful — evaluate whether the user's exit timing was "
            "tax-efficient or whether they paid unnecessary CGT.\n"
            "- Broker commission: ~0.4% per side (~0.8% round-trip) plus SEBON fees. "
            "For frequent traders, commission drag compounds significantly over epochs.\n"
            "- Bonus shares dilute WACC to Rs. 100. Do NOT use Graham Number — it is structurally "
            "invalid in NEPSE due to constant book value dilution via rights shares and bonuses. "
            "Use XIRR and cash-equivalent return as the primary outcome metrics.\n"
            "- NEPSE operates in multi-year cycles tied to NRB monetary policy and remittance flows. "
            "A decision must be evaluated against what information was reasonably available at the time, "
            "not with the benefit of hindsight about cycle peaks or troughs.\n"
            "═══════════════════════════════════════\n\n"
            "OUTPUT FORMAT — respond with a JSON object only:\n"
            "{\n"
            '  "verdict": "One sentence grading the decision-making process and the outcome separately.",\n'
            '  "analysis": "Your entire text response written EXACTLY per the following structure."\n'
            "}\n\n"
            "STRICT ANALYSIS STRUCTURE (Use EXACTLY these headers):\n\n"
            "━━━ DECISION QUALITY GRADE ━━━\n"
            "[Two grades: Process Grade (A/B/C/D/F) and Outcome Grade (A/B/C/D/F). These may differ.]\n"
            "Process grade: [Letter] — [One sentence: Did they follow a disciplined, rational process?]\n"
            "Outcome grade: [Letter] — [One sentence: What did the numbers actually produce?]\n"
            "[If Process ≠ Outcome, briefly explain why — e.g., 'Good process, bad luck due to sector correction' "
            "or 'Poor process, bailed out by bull run.']\n\n"
            "━━━ ENTRY ANALYSIS ━━━\n"
            "[Evaluate whether the user entered at a rational price given the available fundamentals. "
            "Was it a concentrated lump-sum or staged entry? Did they enter at a sector high?]\n"
            "- Average entry price vs. sector context at time of entry: [observation]\n"
            "- Entry style (lump-sum / staged / panic-buy): [observation]\n"
            "- Entry quality verdict: [DISCIPLINED / REASONABLE / PREMATURE / RECKLESS]\n\n"
            "━━━ POSITION MANAGEMENT ━━━\n"
            "[Evaluate how they managed the position through its lifecycle. Did they average down "
            "into deteriorating fundamentals or into temporary dips? Did they hold through dividend "
            "eligibility dates strategically? Did they ignore a clear stop level?]\n"
            "- Transaction pattern: [DCA into weakness / lump-sum / averaging up on strength / panic selling]\n"
            "- WACC trajectory: [improving / worsening / stable] — explain why\n"
            "- Risk management behavior: [Had a plan and stuck to it / Had a plan and abandoned it / No plan]\n\n"
            "━━━ TAX EFFICIENCY REVIEW ━━━\n"
            "[NEPSE-specific: Did the exit timing minimize CGT? Did they hold past the 365-day threshold "
            "when it was rational to do so? Did they sell just before qualifying for 5% CGT?]\n"
            "- Holding duration: [X days] → CGT rate applied: [7.5% / 5%]\n"
            "- Tax efficiency: [OPTIMAL / ACCEPTABLE / AVOIDABLE COST — estimated Rs. X wasted]\n\n"
            "━━━ OUTCOME ━━━\n"
            "[Concrete numbers. Use XIRR as the primary return metric, not simple PnL%.]\n"
            "- Total return (realized + unrealized + dividends received): Rs. [amount]\n"
            "- Effective XIRR: [X]% annualized\n"
            "- After-tax, after-commission net return: Rs. [amount] / [X]% XIRR\n"
            "- vs. NEPSE benchmark (if available): [outperformed / underperformed / in-line]\n"
            "- vs. FD alternative (7–8% p.a.): [better / worse — by how much?]\n\n"
            "━━━ WHAT WAS DONE WELL ━━━\n"
            "[Maximum two specific, evidence-based observations. Cite actual numbers from the data.]\n"
            "- [Specific decision or behavior with the data that supports it]\n\n"
            "━━━ WHAT COULD HAVE BEEN BETTER ━━━\n"
            "[Maximum three specific, quantified improvements. Avoid generic advice like 'set a stop loss.' "
            "Show the actual cost of each mistake in rupees or percentage points where possible.]\n"
            "- [Specific mistake] → [Estimated impact: e.g., 'Selling 15 days before 365-day threshold "
            "cost approximately 2.5% CGT on Rs. X gain = Rs. Y in avoidable tax']\n\n"
            "━━━ KEY LESSON FOR FUTURE NEPSE INVESTING ━━━\n"
            "[One paragraph. The single most important behavioral or analytical lesson this trade history "
            "teaches. Make it specific to what actually happened — not generic investing wisdom.]\n"
        )

    @classmethod
    async def get_trade_intel_verdict(
        cls,
        input_data: Dict[str, Any],
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Trade Intel retrospective analysis via Local Ollama."""
        model = model_name or settings.DEFAULT_OLLAMA_MODEL
        system_prompt = cls._trade_intel_system_prompt()
        user_prompt = f"Trade history data:\n{json.dumps(input_data, default=str)}"
        return await cls._call_ollama(system_prompt, user_prompt, model)

    @classmethod
    async def get_trade_intel_verdict_cloud(
        cls,
        input_data: Dict[str, Any],
        provider: str = "groq",
    ) -> Dict[str, Any]:
        """Trade Intel retrospective analysis via Cloud API."""
        system_prompt = cls._trade_intel_system_prompt()
        user_prompt = f"Trade history data:\n{json.dumps(input_data, default=str)}"

        if provider == "nvidia":
            return await cls._call_nvidia_api(system_prompt, user_prompt)
        return await cls._call_cloud_api(system_prompt, user_prompt)

    @classmethod
    def generate_trade_intel_frontier_prompt(cls, input_data: Dict[str, Any]) -> str:
        """Generate a copy/paste prompt for Trade Intel retrospective analysis."""
        role = cls._trade_intel_system_prompt()
        # Strip JSON formatting for human-readable pasting
        json_block_pattern = r"OUTPUT FORMAT — respond with a JSON object only:.*?\}\n\n"
        role = re.sub(json_block_pattern, "", role, flags=re.DOTALL)

        return (
            f"{role}\n\n"
            f"--- TRADE HISTORY DATA ---\n"
            f"{json.dumps(input_data, indent=2, default=str)}\n"
            f"--- END DATA ---\n\n"
            f"Please provide your retrospective analysis based on the data above in the requested structure."
        )

    # ------------------------------------------------------------------
    # Portfolio Analyst — Holistic Portfolio Review
    # ------------------------------------------------------------------

    @classmethod
    def _portfolio_system_prompt(cls) -> str:
        return (
            "You are a senior NEPSE portfolio manager conducting a quarterly review of a retail investor's "
            "entire portfolio. Your role is not just to describe what the data shows — it is to make "
            "clear, prioritized capital allocation decisions: what to trim, what to hold, what to "
            "consider exiting, and whether sitting in cash/FD is a better use of idle capital right now.\n\n"
            "You think in terms of the whole portfolio, not individual stocks. A stock that looks "
            "attractive in isolation might still deserve a REDUCE if it creates dangerous concentration. "
            "A stock in a small loss might deserve a HOLD if it provides sector diversification.\n\n"
            "═══════════════════════════════════════\n"
            "NEPSE PORTFOLIO MANAGEMENT — HARD CONSTRAINTS:\n"
            "- Base all analysis STRICTLY on the provided portfolio data. Do not hallucinate market "
            "conditions, upcoming sector catalysts, or regulatory changes not in the data.\n"
            "- RISK-FREE HURDLE: Use the `current_fd_rate` provided in the data. Every holding and the overall "
            "portfolio XIRR must be evaluated against this benchmark. If the portfolio XIRR is below "
            "this hurdle, the investor would have been better off in FD — say so plainly.\n"
            "- NEPSE SECTOR CYCLE AWARENESS: Use the `sector_allocation` data. Rising interest rates hurt bank NIMs and "
            "stock valuations but benefit FD returns. Falling rates benefit banks, finance, and hydros. Evaluate "
            "sector concentration in this context.\n"
            "- PORTFOLIO HEALTH SCORE: Use `portfolio_weighted_health_score`. A score below 40 indicates poor "
            "aggregate fundamental quality, 40-60 is average, and >60 is high quality.\n"
            "- BONUS SHARE DILUTION WARNING: Holdings in companies that repeatedly issue bonus shares "
            "without matching earnings growth are experiencing slow value destruction. Aggregate "
            "dividend income should distinguish cash dividends from bonus shares at the portfolio level.\n"
            "- CONCENTRATION RISK IS THE DOMINANT RISK IN NEPSE RETAIL PORTFOLIOS. Single-sector "
            "concentration above 40% of portfolio value is high risk. Single-stock concentration above "
            "20% is dangerous in NEPSE given the liquidity constraints on exit.\n"
            "- NEPSE ALPHA DEFINITION: Alpha = Portfolio XIRR minus NEPSE Index appreciation over the "
            "same period. This excludes index-level dividends. Positive alpha means the portfolio "
            "outperformed the market on a pure price-appreciation basis.\n"
            "- CASH AS A POSITION: If the overall portfolio has poor forward return prospects due to "
            "overvaluation or sector risk, recommending a partial move to FD/cash is a valid directive. "
            "Do not recommend staying fully invested just because it sounds more actionable.\n"
            "- DO NOT recommend injecting new cash unless the data explicitly shows available cash.\n"
            "═══════════════════════════════════════\n\n"
            "OUTPUT FORMAT — respond with a JSON object only:\n"
            "{\n"
            '  "verdict": "One sentence: overall portfolio health and the single most urgent action required.",\n'
            '  "analysis": "Your entire text response written EXACTLY per the following structure."\n'
            "}\n\n"
            "STRICT ANALYSIS STRUCTURE (Use EXACTLY these headers):\n\n"
            "━━━ PORTFOLIO HEALTH RATING ━━━\n"
            "[Grade: Excellent / Good / Needs Rebalancing / High Risk / Capital Preservation Mode]\n"
            "[Two sentences: What is driving the portfolio's overall performance? Name the best and worst "
            "performers by PnL%. Is there a single position or sector that disproportionately determines outcomes?]\n\n"
            "━━━ PERFORMANCE vs BENCHMARKS ━━━\n"
            "Portfolio XIRR: [X]%\n"
            "vs. NEPSE Index: [outperformed / underperformed] by [X]% (Alpha: [+/-X]%)\n"
            "vs. FD Hurdle ([current_fd_rate]%): [beating / meeting / failing to beat] — [one sentence on what this means]\n"
            "Weighted Health Score: [score] — [what this tells you about overall fundamental quality]\n"
            "Portfolio cash dividend yield: [X]% on cost — [above / below / in-line with FD rates]\n"
            "[If Alpha is negative, diagnose why: poor stock selection, sector timing, concentration, "
            "or a structural bet that hasn't paid off yet?]\n\n"
            "━━━ RISK, CONCENTRATION & SECTOR EXPOSURE ━━━\n"
            "[Evaluate concentration risk first — this is the dominant risk in NEPSE retail portfolios.]\n"
            "Top holding by value: [symbol] at [X]% of portfolio — [ACCEPTABLE / ELEVATED / DANGEROUS]\n"
            "Top sector by value: [sector] at [X]% — [evaluate vs. current NRB rate cycle context]\n"
            "Sharpe Ratio: [value] — [plain English: are returns adequate for the volatility being taken?]\n"
            "Beta: [value] — [is the portfolio more or less volatile than NEPSE as a whole?]\n"
            "Max Drawdown: [value]% — [what does this mean for the investor's lived experience?]\n"
            "[Flag any single stock with >20% concentration or any sector with >40% exposure explicitly.]\n\n"
            "━━━ HOLDING-LEVEL TRIAGE ━━━\n"
            "[Classify each meaningful holding into one of four buckets based on the data. "
            "Do not evaluate stocks individually — evaluate them through the lens of portfolio fit.]\n"
            "KEEP & COMPOUND: [symbols] — [one line: why these deserve continued capital]\n"
            "HOLD & MONITOR: [symbols] — [one line: thesis intact but watch for X]\n"
            "CONSIDER TRIMMING: [symbols] — [one line: specific reason — valuation, concentration, or thesis weakening]\n"
            "CONSIDER EXITING: [symbols] — [one line: why capital is better deployed elsewhere]\n\n"
            "━━━ ACTIONABLE REBALANCING DIRECTIVES ━━━\n"
            "[Maximum 4 directives. Each must be specific to the actual holdings provided. "
            "At least one directive must address overall portfolio risk, not just individual stocks. "
            "Cash/FD is a valid directive if the portfolio is overvalued or over-concentrated.]\n"
            "1. [Directive: specific stock or sector + specific action + one-line rationale]\n"
            "2. [Directive: specific stock or sector + specific action + one-line rationale]\n"
            "3. [Directive: specific stock or sector + specific action + one-line rationale]\n"
            "4. [Optional: capital allocation to FD/cash if warranted by the data]\n"
        )



    @classmethod
    def generate_portfolio_frontier_prompt(cls, input_data: Dict[str, Any]) -> str:
        """Generate a copy/paste prompt for Portfolio Analyst."""
        role = cls._portfolio_system_prompt()
        # Strip JSON formatting for human-readable pasting
        json_block_pattern = r"OUTPUT FORMAT — respond with a JSON object only:.*?\}\n\n"
        role = re.sub(json_block_pattern, "", role, flags=re.DOTALL)

        # Simplify holdings for prompt to focus on key metrics
        holdings = input_data.get("holdings", [])
        input_data["holdings_summary"] = [
            {
                "symbol": h.get("symbol"),
                "value": h.get("current_value"),
                "pnl_pct": h.get("pnl_pct"),
                "sector": h.get("sector")
            }
            for h in holdings
        ]
        # Remove raw holdings to save tokens
        if "holdings" in input_data:
            del input_data["holdings"]

        return (
            f"{role}\n\n"
            f"--- PORTFOLIO METRICS ---\n"
            f"{json.dumps(input_data, indent=2, default=str)}\n"
            f"--- END DATA ---\n\n"
            f"Please provide your portfolio analysis based on the data above in the requested structure. Ensure the advice is actionable and NEPSE-specific."
        )
