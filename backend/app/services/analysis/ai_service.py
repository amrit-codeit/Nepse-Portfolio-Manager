"""
AI Service — Unified engine for interacting with local Ollama models.
Handles NEPSE-specific personas, robust JSON parsing, and 'thinking' model compatibility.
Supports two distinct analysis modes: Value Investing and Pure Trading.

Changelog vs previous version:
- Fixed qwen3:4b compatibility: bounded num_predict, enlarged num_ctx, /api/generate fallback
- Fixed _strip_thinking() Phase 2 close-tag bug for pipe-delimited tags (<|think|>)
- Added explicit /api/generate path for models that ignore system role in /api/chat
- Deduped thinking-field + content merging to avoid double-processing
- Tightened JSON extraction; added key-alias map for non-standard field names
- Minor: flattened nested try/except, removed dead code path

v3 changelog:
- Added _clean_analysis() to strip inline reasoning artifacts from analysis text
  (Qwen3:4b writes "Let me think / But wait / However note" directly into analysis)
- Rewrote both system prompts: explicit output schema, hard word cap, banned phrases list
- Added thinking_mode: false to Qwen3 model overrides to suppress think tokens entirely
- Qwen3 num_predict raised to 3072 to compensate for disabled thinking budget
"""
import json
import re
import httpx
from typing import Dict, Any, Optional, List
from app.config import settings


# ---------------------------------------------------------------------------
# Per-model generation overrides
# Qwen3 models think heavily; cap tokens and give more context.
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
            allowed_actions = "BUY or AVOID"
            rules = (
                "- User currently does not hold this stock. Treat this as a fresh value-investing decision.\n"
                "- BUY only when valuation, business quality, dividend/compounding potential, and rough forward expected return are attractive versus waiting.\n"
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
    # Public API
    # ------------------------------------------------------------------

    @classmethod
    async def get_value_verdict(
        cls,
        input_data: Dict[str, Any],
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Value Investing AI session.
        Combines fundamental analysis with technical timing for long-term value assessment.
        """
        model          = model_name or settings.DEFAULT_OLLAMA_MODEL
        scoring_action = input_data.get("action_verdict") or input_data.get("scoring_action", "HOLD")
        scoring_score  = input_data.get("health_score", 50)
        portfolio_ctx  = input_data.get("portfolio_context")
        system_prompt = cls._build_value_system_prompt(
            scoring_action=scoring_action,
            scoring_score=scoring_score,
            portfolio_ctx=portfolio_ctx,
            is_local=True,
        )
        user_prompt = f"Stock data:\n{json.dumps(input_data, default=str)}"
        return await cls._call_ollama(system_prompt, user_prompt, model)

    @classmethod
    async def get_trading_verdict(
        cls,
        input_data: Dict[str, Any],
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Pure Trading AI session.
        Focuses on price action, momentum, and short-term trading opportunities.
        """
        model = model_name or settings.DEFAULT_OLLAMA_MODEL

        active_setup = input_data.get("active_trade_setup")
        portfolio_ctx = input_data.get("portfolio_context")
        system_prompt = cls._build_trading_system_prompt(
            active_trade_setup=active_setup,
            portfolio_context=portfolio_ctx,
            is_local=True,
        )

        user_prompt = f"Technical data:\n{json.dumps(input_data, default=str)}"
        return await cls._call_ollama(system_prompt, user_prompt, model)

    @classmethod
    async def get_verdict(
        cls,
        input_data: Dict[str, Any],
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Legacy alias — delegates to get_value_verdict."""
        return await cls.get_value_verdict(input_data, model_name)

    # ------------------------------------------------------------------
    # Cloud API (Groq / OpenAI-compatible)
    # ------------------------------------------------------------------

    @classmethod
    async def _call_cloud_api(
        cls,
        system_prompt: str,
        user_prompt: str,
    ) -> Dict[str, Any]:
        """
        Calls a free-tier OpenAI-compatible REST API (default: Groq).
        Uses response_format to enforce JSON output at the API level.
        """
        api_key  = settings.GROQ_API_KEY
        base_url = settings.GROQ_BASE_URL
        model    = settings.GROQ_MODEL

        if not api_key:
            return cls._error(
                "Cloud API key not configured. "
                "Add GROQ_API_KEY to your .env file (get one free at https://console.groq.com)."
            )

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
            "temperature":     0.3,
            "response_format": {"type": "json_object"},
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=30.0,
                )

            if response.status_code == 429:
                return cls._error(
                    "Cloud API rate limit reached. Wait a minute and try again, "
                    "or use the 'Copy Prompt' mode to paste into ChatGPT/DeepSeek."
                )

            if response.status_code != 200:
                return cls._error(f"Cloud API HTTP {response.status_code}: {response.text[:200]}")

            data    = response.json()
            content = data["choices"][0]["message"]["content"]
            parsed  = cls._parse_robust_json(content)

            if parsed:
                return cls._normalize_parsed(parsed, f"{model} (Cloud)")

            return cls._error("Cloud API returned unparseable response.")

        except httpx.ReadTimeout:
            return cls._error("Cloud API timed out after 30s. Try again later.")
    @classmethod
    async def _call_nvidia_api(
        cls,
        system_prompt: str,
        user_prompt: str,
    ) -> Dict[str, Any]:
        """
        Calls Nvidia API for DeepSeek or other models.
        """
        api_key  = settings.NVIDIA_API_KEY
        base_url = settings.NVIDIA_BASE_URL
        model    = "deepseek-ai/deepseek-v4-pro"

        if not api_key:
            return cls._error(
                "Nvidia API key not configured. "
                "Add NVIDIA_API_KEY to your .env file."
            )

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
            "temperature":     0.3,
            "max_tokens": 4096,
            "chat_template_kwargs": {"thinking": False}, # Disable thinking tokens if applicable
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                    timeout=180.0,
                )

            if response.status_code != 200:
                return cls._error(f"Nvidia API HTTP {response.status_code}: {response.text[:200]}")

            data    = response.json()
            content = data["choices"][0]["message"]["content"]
            
            # Since Nvidia/Deepseek might return JSON embedded in markdown, strip thinking just in case
            clean = cls._strip_thinking(content)
            parsed  = cls._parse_robust_json(clean)

            if parsed:
                return cls._normalize_parsed(parsed, f"{model} (Nvidia)")

            return cls._error("Nvidia API returned unparseable response.")

        except httpx.ReadTimeout:
            return cls._error("Nvidia API timed out after 180s. Try again later.")
        except Exception as e:
            return cls._error(f"Nvidia API error: {e}")

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

        return (
            "You are a professional NEPSE (Nepal Stock Exchange) value investing analyst writing a brief for two audiences "
            "simultaneously: an experienced value investor who wants the numbers fast, and a beginner who needs to understand what to do and why.\n\n"
            "=======================================\n"
            "NEPSE RULES & REALITIES (hard constraints - never violate):\n"
            "- Cash market only. Investments take time.\n"
            "- Promoter vs Ordinary differences in liquidity.\n"
            "- Focus on compounding, dividend capacity, and intrinsic value.\n"
            "- Treat this as a capital-allocation decision, not a classification exercise.\n"
            "- The health score below is a fundamental-health score only. It does NOT measure technical entry timing.\n"
            f"- The scoring engine rated this stock's health: {scoring_score}/100 and recommends: {scoring_action}.\n"
            f"{portfolio_rules}"
            "- MANDATORY DECISION HIERARCHY: 1) business quality, survival, and cash generation, 2) forward expected return, 3) sector-anchored valuation, 4) cash dividend quality, 5) technical timing overlay only.\n"
            "- Treat the health score as a heuristic summary, not final truth. If the score conflicts with sector structure, normalized earnings, balance-sheet quality, dilution risk, or portfolio reality, say so clearly.\n"
            "- Graham Number is only a rough cross-check, not a decision rule. Never use Graham alone to justify ACCUMULATE, BUY, HOLD, REDUCE, or EXIT.\n"
            "- In NEPSE, Graham-style valuation is often low-confidence for banks, insurers, hydros, project-driven businesses, cyclicals, and firms with distorted book value or earnings due to bonus shares, rights issues, provisioning swings, revaluations, or irregular cash generation.\n"
            "- Estimate rough forward expected return using three components whenever the data allows: earnings growth, dilution-aware cash dividend yield, and valuation change potential.\n"
            "- Valuation change potential must follow sector anchors, not free-form storytelling: banks/finance -> ROE-to-P/B anchoring, microfinance -> P/B with provisioning-cycle caution, insurance -> solvency/ROE-to-P/B, hydro -> P/B band reversion, manufacturing/processing -> earnings-multiple cycle.\n"
            "- Treat cash dividend yield as the investable yield. Bonus shares are not cash yield; if bonus distribution is heavy, discuss dilution and capital-allocation implications explicitly.\n"
            "- PEG must not be ignored. Classify it in plain English as cheap growth, fair growth, or expensive growth when available.\n"
            "- For growth or cyclical names, PEG and sector valuation anchors outrank Graham in decision weight.\n"
            "- If the payload provides expected_return_framework or value_decision_framework, treat those gates and anchor summaries as binding synthesis aids, not optional commentary.\n"
            "- For long-term wealth building in NEPSE, prioritize business survival, dividend durability, distributable profit, reserve/book-value compounding, capital discipline, dilution risk, governance quality, and liquidity alongside valuation.\n"
            "- Use the separate technical timing data only as an entry/exit overlay. Do not let short-term chart movement override clearly superior or clearly weak fundamentals unless you explain why.\n"
            "- FINAL RECONCILIATION RULE: the verdict must follow quality gate + forward expected return + portfolio fit together. A cheap isolated metric cannot override weak business quality or poor forward return.\n"
            "- If quality/survival fails, BUY and ACCUMULATE are forbidden even when valuation looks cheap.\n"
            "- If forward expected return is weak or negative, HOLD/REDUCE/AVOID should dominate unless you explicitly explain a special portfolio reason.\n"
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
            "EXPECTED RETURN\n"
            "[Estimate rough 12-24 month forward return using growth, dilution-aware cash yield, and valuation change potential. State clearly that it is approximate, not a forecast.]\n"
            "Growth contribution: [value]%\n"
            "Cash yield contribution: [value]%\n"
            "Valuation change potential: [value]%\n"
            "Valuation anchor: [sector anchor / low-base-high range / assumption note]\n"
            "Rough forward return: [value]%\n\n"
            "VALUATION\n"
            "[Evaluate P/E, P/B, PEG, EPS, and Graham Number. Graham is secondary only. If Graham is weak or misleading for this sector, say so explicitly.]\n"
            "Intrinsic Value (Graham): Rs. [value] (Discount/Premium vs LTP, if meaningful)\n"
            "P/E Ratio: [value]\n"
            "P/B Ratio: [value]\n"
            "PEG: [value] -> [cheap growth / fair growth / expensive growth]\n\n"
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
            "TIMING NOTE\n"
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
            "- HARD GATING RULE: if liquidity gate fails, do not endorse bullish action. Weak liquidity blocks BUY and ADD, and usually pushes active trades toward WAIT unless invalidation is triggered.\n"
            "- HARD GATING RULE: if OBV/distribution is hostile, downgrade bullish setups even if EMA structure still looks good.\n"
            "- If the payload provides trading_decision_framework, use its gates as binding summaries rather than re-inventing softer interpretations.\n"
            "- SIGNAL MAPPING RULES: STOP_LOSS is for invalidation/risk failure, EXIT is for intentional close or de-risk before formal invalidation, WAIT is for intact thesis with poor timing or poor reward/risk.\n"
            "- SETUP INVALIDATION can happen before the stop is hit if trend integrity breaks and support failure or OBV distribution confirms the weakness.\n"
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
            "Timeframe:     [1-3 days / swing 3-7 days]\n"
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
            "You are a NEPSE investment mentor performing a retrospective analysis of a user's trading history for a specific stock. "
            "You are grading their decision-making, not recommending future actions.\n\n"
            "═══════════════════════════════════════\n"
            "NEPSE CONTEXT (hard constraints):\n"
            "- Cash-only market, no short selling, T+2 settlement.\n"
            "- 7.5% CGT on short-term gains (<365 days), 5% on long-term.\n"
            "- 0.4% broker commission + SEBON fees on each transaction.\n"
            "- Bonus shares are common — they dilute WACC to Rs. 100 per share.\n"
            "═══════════════════════════════════════\n\n"
            "OUTPUT FORMAT — respond with a JSON object only:\n"
            "{\n"
            '  "verdict": "One sentence grading the overall investment decision.",\n'
            '  "analysis": "Your entire text response written EXACTLY per the following structure."\n'
            "}\n\n"
            "STRICT ANALYSIS STRUCTURE (Use EXACTLY these headers):\n\n"
            "━━━ GRADE ━━━\n"
            "[One letter: A / B / C / D / F]\n"
            "[One sentence summarizing whether this was a good investment decision and why.]\n\n"
            "━━━ ENTRY TIMING ━━━\n"
            "[Evaluate whether the user bought at good prices relative to the stock's fundamentals at the time.]\n"
            "- Average buy price vs current Graham Number\n"
            "- Was the entry at a discount or premium?\n\n"
            "━━━ POSITION MANAGEMENT ━━━\n"
            "[Evaluate how they managed the position — did they average down sensibly? Hold too long? Sell too early?]\n"
            "- Number of transactions and pattern (DCA, lump sum, panic selling)\n"
            "- WACC trajectory through the epoch\n\n"
            "━━━ OUTCOME ━━━\n"
            "[Concrete numbers: realized PnL, unrealized PnL, holding duration, effective return rate.]\n"
            "- Total P&L (realized + unrealized): Rs. [amount]\n"
            "- Holding period: [days] days\n"
            "- Annualized return: [%]\n\n"
            "━━━ WHAT COULD HAVE BEEN BETTER ━━━\n"
            "[Two to three specific, actionable improvements — not generic advice.]\n"
            "- If [specific action] → [estimated better outcome]\n\n"
            "━━━ KEY TAKEAWAY ━━━\n"
            "[One paragraph the user should remember for future NEPSE investing.]\n"
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
        """System prompt for whole portfolio analysis."""
        return (
            "You are a NEPSE portfolio management expert. Your job is to analyze the overall health, "
            "efficiency, and risk exposure of a retail investor's stock portfolio based on core financial metrics.\n\n"
            "═══════════════════════════════════════\n"
            "NEPSE CONTEXT (hard constraints):\n"
            "- Risk-free rate proxy is around 7-8% (fixed deposits).\n"
            "- NEPSE is highly volatile and sentiment-driven.\n"
            "- Dividends (bonus shares/cash) are key for long-term compounding.\n"
            "═══════════════════════════════════════\n\n"
            "OUTPUT FORMAT — respond with a JSON object only:\n"
            "{\n"
            '  "verdict": "One sentence summarizing the overall portfolio health.",\n'
            '  "analysis": "Your entire text response written EXACTLY per the following structure."\n'
            "}\n\n"
            "STRICT ANALYSIS STRUCTURE (Use EXACTLY these headers):\n\n"
            "━━━ PORTFOLIO HEALTH ━━━\n"
            "[Grade: Excellent / Good / Needs Work / High Risk]\n"
            "[Two sentences explaining the primary driver of this portfolio's performance (e.g., strong XIRR, poor dividend yield, high concentration).]\n\n"
            "━━━ PERFORMANCE vs MARKET ━━━\n"
            "[Evaluate XIRR vs NEPSE XIRR and explain the Alpha.]\n"
            "- Is the portfolio beating the market? Explain why the Alpha is positive or negative.\n"
            "- Explain the Dividend Yield in the context of NEPSE expectations.\n\n"
            "━━━ RISK & VOLATILITY ━━━\n"
            "[Evaluate Sharpe Ratio, Beta, and Max Drawdown.]\n"
            "- Are they taking too much risk for the returns (Sharpe)?\n"
            "- Is the portfolio more or less volatile than NEPSE (Beta)?\n"
            "- How painful was the biggest drop (Max Drawdown)?\n\n"
            "━━━ ACTIONABLE ADVICE ━━━\n"
            "[Provide 3 bullet points with direct, Nepal-specific advice (e.g., 'Increase banking exposure for dividends', 'Cut losses on high-beta hydro').]\n"
            "- [Advice 1]\n"
            "- [Advice 2]\n"
            "- [Advice 3]\n"
        )

    @classmethod
    async def get_portfolio_verdict(
        cls,
        input_data: Dict[str, Any],
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Holistic portfolio analysis via Local Ollama."""
        model = model_name or settings.DEFAULT_OLLAMA_MODEL
        system_prompt = cls._portfolio_system_prompt()
        user_prompt = f"Portfolio Metrics:\n{json.dumps(input_data, default=str)}"
        return await cls._call_ollama(system_prompt, user_prompt, model)

    @classmethod
    async def get_portfolio_verdict_cloud(
        cls,
        input_data: Dict[str, Any],
        provider: str = "groq",
    ) -> Dict[str, Any]:
        """Holistic portfolio analysis via Cloud API."""
        system_prompt = cls._portfolio_system_prompt()
        user_prompt = f"Portfolio Metrics:\n{json.dumps(input_data, default=str)}"

        if provider == "nvidia":
            return await cls._call_nvidia_api(system_prompt, user_prompt)
        return await cls._call_cloud_api(system_prompt, user_prompt)

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
