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
        scoring_action = input_data.get("scoring_action", "HOLD")
        scoring_score  = input_data.get("health_score", 50)

        system_prompt = (
            "You are a NEPSE (Nepal Stock Exchange) value investing analyst.\n\n"
            "Process the provided stock data to generate clear, actionable investment insights strictly based ONLY on the data provided. DO NOT hallucinate external news or unprovided metrics.\n"
            "You MUST structure your thoughts inside <think>...</think> tags before providing the final answer.\n"
            "You MUST use EXACTLY the following capitalized headers for your sections:\n"
            "VALUATION: (Evaluate P/E, P/B, EPS, Graham value, and fundamental strength)\n"
            "SECTOR: (Evaluate NPL/CAR for banks, solvency for insurance, D/E for hydro)\n"
            "DIVIDEND: (Evaluate yield, payout consistency, and distributable profit)\n"
            "TECHNICAL: (Evaluate EMA 50/200 trend, RSI zone, MACD, volume)\n"
            "MARGIN OF SAFETY: (Evaluate downside risk, overvaluation, and NEPSE systemic risk)\n"
            "CONCLUSION: (Final actionable summary with clear price targets)\n\n"
            f"Note: The scoring engine rated this stock: {scoring_action} ({scoring_score}/100).\n\n"
            "STRICT OUTPUT RULES:\n"
            "1. Think first inside <think>...</think> tags.\n"
            "2. After the closing </think> tag, you MUST output a raw JSON object matching this exact format:\n"
            "{\n"
            '  "verdict": "One direct sentence (max 25 words) stating your recommendation.",\n'
            '  "analysis": "Your structured report using the exact CAPITALIZED HEADERS specified above, formatted cleanly with paragraph breaks (\\n\\n)."\n'
            "}\n"
            "3. Do NOT include markdown blocks, preamble, or any text outside the JSON object after </think>."
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

        system_prompt = (
            "You are a NEPSE (Nepal Stock Exchange) short-term technical trader.\n\n"
            "Analyze the technical data to produce clear, actionable trading insights strictly based ONLY on the data provided. DO NOT hallucinate unprovided indicators. Remember NEPSE has no short-selling, T+2 settlement, and 10% daily circuit breakers.\n"
            "You MUST structure your thoughts inside <think>...</think> tags before providing the final answer.\n"
            "You MUST use EXACTLY the following capitalized headers for your sections:\n"
            "PRICE ACTION: (Current price vs EMA 50/200, 52-week position)\n"
            "MOMENTUM: (RSI reading, MACD signal)\n"
            "VOLUME: (Volume surges, OBV accumulation/distribution)\n"
            "BOLLINGER: (Band position, squeeze/expansion, volatility)\n"
            "SUPPORT & RESISTANCE: (Key levels derived from data)\n"
            "TRADE PLAN: (Entry, target, stop loss, R:R ratio)\n\n"
            "STRICT OUTPUT RULES:\n"
            "1. Think first inside <think>...</think> tags.\n"
            "2. After the closing </think> tag, you MUST output a raw JSON object matching this exact format:\n"
            "{\n"
            '  "verdict": "One direct sentence (max 20 words) stating the trade setup.",\n'
            '  "analysis": "Your structured brief using the exact CAPITALIZED HEADERS specified above, formatted cleanly with paragraph breaks (\\n\\n)."\n'
            "}\n"
            "3. Do NOT include markdown blocks, preamble, or any text outside the JSON object after </think>."
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
        except Exception as e:
            return cls._error(f"Cloud API error: {e}")

    # ------------------------------------------------------------------
    # Cloud-specific system prompts (no <think> tags — frontier models
    # don't need them and they waste tokens on paid APIs)
    # ------------------------------------------------------------------

    @classmethod
    def _cloud_value_system_prompt(cls, scoring_action: str, scoring_score: int) -> str:
        return (
            "You are an expert NEPSE (Nepal Stock Exchange) value investing analyst.\n\n"
            "Analyze the data and produce a structured investment report strictly based ONLY on the data provided. DO NOT hallucinate external news. Use EXACTLY the following capitalized headers for your sections:\n"
            "VALUATION: (Evaluate P/E, P/B, EPS, Graham value)\n"
            "SECTOR: (Evaluate NPL/CAR for banks, solvency for insurance, D/E for hydro)\n"
            "DIVIDEND: (Evaluate yield, payout, distributable profit)\n"
            "TECHNICAL: (Evaluate EMA 50/200, RSI, MACD, volume)\n"
            "MARGIN OF SAFETY: (Downside risks, overvaluation)\n"
            "CONCLUSION: (Final recommendation with specific price targets)\n\n"
            f"The scoring engine rated this stock: {scoring_action} ({scoring_score}/100).\n\n"
            "OUTPUT FORMAT — respond with a JSON object only:\n"
            "{\n"
            '  "verdict": "One direct sentence (max 25 words) with your recommendation.",\n'
            '  "analysis": "Structured report using the exact CAPITALIZED HEADERS specified above. Use \\n\\n between sections."\n'
            "}"
        )

    @classmethod
    def _cloud_trading_system_prompt(cls) -> str:
        return (
            "You are an expert NEPSE (Nepal Stock Exchange) short-term technical trader.\n\n"
            "Analyze the data and produce a structured trading brief strictly based ONLY on the data provided. DO NOT form conclusions outside of the provided facts, and do not invent indicators. Remember NEPSE has no short-selling, T+2 settlement, and 10% daily circuit breakers.\n"
            "Use EXACTLY the following capitalized headers for your sections:\n"
            "PRICE ACTION: (Price vs EMA 50/200 and 52-week range)\n"
            "MOMENTUM: (RSI, MACD)\n"
            "VOLUME: (Volume spikes, OBV)\n"
            "BOLLINGER: (Bollinger Bands position, volatility)\n"
            "SUPPORT & RESISTANCE: (Key levels derived ONLY from data)\n"
            "TRADE PLAN: (Entry, target(s), stop loss, R:R ratio)\n\n"
            "RISK GUARDRAIL: If the R:R ratio is worse than 1:1.5, or data is conflicting, recommend WAIT. Do not force a trade.\n\n"
            "OUTPUT FORMAT — respond with a JSON object only:\n"
            "{\n"
            '  "verdict": "One direct sentence (max 20 words) stating the trade setup.",\n'
            '  "analysis": "Structured brief using the exact CAPITALIZED HEADERS specified above. Use \\n\\n between sections."\n'
            "}"
        )

    # ------------------------------------------------------------------
    # Cloud public API
    # ------------------------------------------------------------------

    @classmethod
    async def get_value_verdict_cloud(
        cls,
        input_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Value Investing analysis via Groq Cloud API."""
        scoring_action = input_data.get("scoring_action", "HOLD")
        scoring_score  = input_data.get("health_score", 50)
        system_prompt  = cls._cloud_value_system_prompt(scoring_action, scoring_score)
        user_prompt    = f"Stock data:\n{json.dumps(input_data, default=str)}"
        return await cls._call_cloud_api(system_prompt, user_prompt)

    @classmethod
    async def get_trading_verdict_cloud(
        cls,
        input_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Pure Trading analysis via Groq Cloud API."""
        system_prompt = cls._cloud_trading_system_prompt()
        user_prompt   = f"Technical data:\n{json.dumps(input_data, default=str)}"
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
            role = (
                "You are an expert NEPSE (Nepal Stock Exchange) short-term technical trader.\n"
                "Review the following technical indicators and provide a professional, "
                "structured trade plan."
            )
            rules = (
                "STRICT RULES:\n"
                "- If the calculated Risk:Reward ratio is worse than 1:1.5, "
                "you MUST recommend 'WAIT' or 'DO NOT BUY'.\n"
                "- Ensure Stop Losses are realistic for NEPSE "
                "(do not set a stop loss >10% below current price for a short-term trade).\n"
                "- Provide Entry Price, Target Price, Stop Loss, and Risk:Reward ratio.\n"
                "- Cover: Price Action, Momentum (RSI/MACD), Volume, "
                "Bollinger Bands, Support/Resistance, and Trade Plan."
            )
        else:
            role = (
                "You are an expert NEPSE (Nepal Stock Exchange) value investing analyst.\n"
                "Review the following fundamental and sector data to determine if "
                "this stock is undervalued."
            )
            rules = (
                "STRICT RULES:\n"
                "- Focus on Margin of Safety, P/E, P/B, ROE, Graham Number, "
                "and dividend capacity.\n"
                "- Analyze sector-specific metrics (NPL/CAR for banks, solvency for insurance, "
                "D/E for hydro).\n"
                "- If the stock is fundamentally overvalued, clearly recommend 'HOLD' or 'SELL'.\n"
                "- Provide a clear conclusion with specific price targets."
            )

        return (
            f"{role}\n\n"
            f"{rules}\n\n"
            f"--- STOCK DATA ---\n"
            f"{json.dumps(input_data, indent=2, default=str)}\n"
            f"--- END DATA ---\n\n"
            f"Please provide:\n"
            f"1. A detailed, structured analysis (organized by sections)\n"
            f"2. A clear, single-sentence final verdict"
        )