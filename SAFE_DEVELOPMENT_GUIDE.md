# Safe Development & Experimentation Guide

This guide explains how to use **Git** to protect your codebase while adding new features or experimenting with changes (especially when working with an AI assistant).

---

## 1. The "Safety Net" Rule: Commit Before New Features
Before you ask the AI to implement a major change or a new feature, ensure your current working code is saved.

**Command:**
```bash
git add .
git commit -m "Savepoint: [Brief description of current state]"
```
*Why?* If the new changes break the app, you can return to this exact moment in seconds.

---

## 2. Using Branches for Implementation
Instead of working on `main` (your stable version), create a "Feature Branch." If things go wrong, your `main` branch stays perfect.

### Step-by-Step Workflow:
1. **Create and switch to a new branch:**
   ```bash
   git checkout -b feature/new-sip-logic
   ```
2. **Tell the AI to work:** "Implement the new SIP logic on this branch."
3. **If it works:** Merge it back to main.
   ```bash
   git checkout main
   git merge feature/new-sip-logic
   ```
4. **If it breaks:** Just switch back to main and delete the experiment.
   ```bash
   git checkout main
   git branch -D feature/new-sip-logic
   ```

---

## 3. Emergency Rollbacks (The "Retract" Button)
If the AI introduces a bug (like a white screen) and you need to undo it immediately:

### To undo the last commit:
```bash
git reset --hard HEAD~1
```

### To undo all unsaved changes in a specific file:
```bash
git checkout -- frontend/src/pages/Transactions.jsx
```

### To see what exactly changed (The "Diff"):
```bash
git diff
```

---

## 4. Tips for Working with Antigravity (AI)

*   **Checkpointing**: Use the phrase *"I'm about to do a Git commit, wait a moment"* before a big task.
*   **Additive vs Subtractive**: If you are worried about a stable file, tell me: *"Don't edit Transactions.jsx directly; create a copy called Transactions_New.jsx first."*
*   **Verification**: Always run `npm run build` or `npm run dev` after a change. If you see a white screen, check the **Console** (F12) immediately and paste the error here.

---

## Summary Cheat Sheet
| Goal | Command |
| :--- | :--- |
| **Save everything** | `git add .` && `git commit -m "message"` |
| **New Experiment** | `git checkout -b experiment-name` |
| **Undo everything** | `git reset --hard` |
| **Check status** | `git status` |
| **Go back to main** | `git checkout main` |
