"""
AI Service — Unified engine for interacting with local Ollama models.
Handles NEPSE-specific personas, robust JSON parsing, and 'thinking' model compatibility.
"""
import json
import re
import httpx
from typing import Dict, Any, Optional, List
from app.config import settings


class AIService:
    @staticmethod
    async def get_available_models() -> List[str]:
        """
        Fetches the list of models currently installed in the local Ollama instance.
        """
        base_url = settings.OLLAMA_URL.rsplit("/api", 1)[0]
        tags_url = f"{base_url}/api/tags"
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(tags_url, timeout=5.0)
                if response.status_code == 200:
                    data = response.json()
                    return [m["name"] for m in data.get("models", [])]
        except Exception as e:
            print(f"[AIService] Error fetching Ollama models: {e}")
        
        # Fallback to configured models if Ollama is unreachable
        return settings.AVAILABLE_OLLAMA_MODELS

    @staticmethod
    def _strip_thinking(text: str) -> str:
        """
        Aggressively removes all thinking/reasoning blocks from model output.
        Handles Qwen, DeepSeek, Gemma, and other patterns case-insensitively.
        """
        # Phase 1: Remove well-formed thinking blocks (Case-Insensitive)
        patterns = [
            r'<(think|thought|reasoning|scratchpad|brainstorm)>.*?</\1>',
            r'<\|think\|>.*?<\|/think\|>',
            r'\[thought\].*?\[/thought\]',
            r'<\|thought\|>.*?<\|end_thought\|>',
            r'<\|channel>thought.*?<channel\|>',
        ]
        
        clean_text = text
        for pattern in patterns:
            clean_text = re.sub(pattern, '', clean_text, flags=re.DOTALL | re.IGNORECASE)
        
        # Phase 2: Handle unclosed tags (truncation safety)
        unclosed_tags = ['<think>', '<thought>', '<reasoning>', '<scratchpad>', '<|think|>']
        for tag in unclosed_tags:
            if tag.lower() in clean_text.lower() and f"</{tag[1:]}".lower() not in clean_text.lower():
                idx = clean_text.lower().find(tag.lower())
                clean_text = clean_text[:idx]
        
        # Phase 3: Strip markdown fences
        clean_text = re.sub(r'```(?:json)?\s*(.*?)\s*```', r'\1', clean_text, flags=re.DOTALL)
        
        return clean_text.strip()

    @staticmethod
    def _parse_robust_json(text: str) -> Optional[Dict[str, Any]]:
        """
        Hyper-robust JSON extraction. Tries multiple strategies to find valid JSON.
        """
        text = text.strip()
        if not text:
            return None
        
        # Strategy 1: Direct parse
        try:
            res = json.loads(text)
            if isinstance(res, dict): return res
        except: pass
        
        # Strategy 2: Find all likely { ... } candidates and try largest to smallest
        candidates = []
        start_indices = [i for i, char in enumerate(text) if char == '{']
        for start_idx in start_indices:
            depth = 0
            for i in range(start_idx, len(text)):
                if text[i] == '{': depth += 1
                elif text[i] == '}':
                    depth -= 1
                    if depth == 0:
                        candidates.append(text[start_idx:i+1])
                        break
        
        # Sort candidates by length (descending) to find the primary JSON object
        for cand in sorted(candidates, key=len, reverse=True):
            try:
                res = json.loads(cand)
                if isinstance(res, dict): return res
            except:
                # Strategy 3: Fix common "yapping" JSON errors (trailing commas, unescaped newlines in strings)
                try:
                    fixed = cand
                    fixed = re.sub(r',\s*([\]}])', r'\1', fixed) # trailing commas
                    # Replace actual newlines inside quotes with \n
                    fixed = re.sub(r'(?<=[:\s])"(.*?)"(?=[,\s}])', lambda m: m.group(0).replace('\n', '\\n'), fixed, flags=re.DOTALL)
                    res = json.loads(fixed)
                    if isinstance(res, dict): return res
                except: continue

        # Strategy 4: Final Regex Extraction (Hard Fallback)
        import re
        def extract(key):
            # Matches "key": "value" even with some noise or missing closing quotes
            pattern = r'\"' + key + r'\"\s*:\s*\"((?:[^\"\\]|\\.)*?)\"(?:[,\s\}]|$)'
            m = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
            if m: return re.sub(r'\\\"', '\"', m.group(1)).strip()
            return None

        verdict = extract("verdict")
        if verdict:
            return {
                "verdict": verdict,
                "logic": extract("logic") or "Logic extraction failed.",
                "foundation": extract("foundation") or "Foundation extraction failed.",
                "timing": extract("timing") or "Timing extraction failed."
            }
            
        return None

    @staticmethod
    def _flatten_value(val: Any) -> str:
        """Ensure a value is a plain string for frontend rendering."""
        if val is None:
            return "Not provided."
        if isinstance(val, dict):
            return ". ".join([f"{k}: {v}" for k, v in val.items()])
        if isinstance(val, list):
            return ", ".join([str(x) for x in val])
        return str(val)

    @classmethod
    async def get_verdict(cls, input_data: Dict[str, Any], model_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyzes stock data and returns a structured verdict.
        Optimized for reliability with Qwen/Gemma local models.
        """
        model = model_name or settings.DEFAULT_OLLAMA_MODEL
        base_url = settings.OLLAMA_URL.rsplit("/api", 1)[0]
        chat_url = f"{base_url}/api/chat"
        
        scoring_action = input_data.get("scoring_action", "HOLD")
        scoring_score = input_data.get("health_score", 50)
        
        # Extremely explicit system prompt for structure control
        system_prompt = (
            "You are a NEPSE stock analyst. TASK: Return ONLY a raw JSON object. NO CONVERSATION.\n"
            "VERDICT CONTEXT: Scoring engine rated this stock as " + str(scoring_action).upper() + 
            f" ({scoring_score}/100).\n\n"
            "JSON STRUCTURE (Strictly follow this):\n"
            "{\n"
            ' "verdict": "BUY|SELL|HOLD|ACCUMULATE",\n'
            ' "logic": "2-3 professional sentences",\n'
            ' "foundation": "Fundamental analysis points",\n'
            ' "timing": "Technical analysis/Entry point"\n'
            "}"
        )

        user_prompt = f"Data:\n{json.dumps(input_data, indent=None, default=str)}"

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.1,  # Slight temperature for linguistic flow, but low for structure
                "num_predict": 1024, # Enough for full JSON
                "num_ctx": 4096,     # Ensure large stock data fits
                "top_p": 0.9,
                "stop": ["\n\n\n"]   # Early stop if model starts rambling
            }
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(chat_url, json=payload, timeout=settings.OLLAMA_TIMEOUT)
                
                if response.status_code != 200:
                    return {"status": "error", "verdict": "ERROR", "logic": f"Ollama HTTP {response.status_code}", "foundation": "N/A", "timing": "N/A"}

                result = response.json()
                raw_response = result.get("message", {}).get("content", "")
                
                # SAFETY LOGGING: If parsing fails, we'll want to see this in uvicorn console
                if not raw_response:
                    return {"status": "error", "verdict": "ERROR", "logic": "Empty AI response.", "foundation": "N/A", "timing": "N/A"}
                
                clean_json_text = cls._strip_thinking(raw_response)
                parsed = cls._parse_robust_json(clean_json_text)
                
                if not parsed:
                    # Log snippet of the failure for terminal debugging
                    snippet = raw_response[:300].replace('\n', ' ')
                    print(f"[AIService] PARSE FAILED for {model}. Raw: {snippet}...")
                    return {
                        "status": "error", "verdict": "ERROR", 
                        "logic": "Failed to parse AI response into JSON format.",
                        "foundation": f"Raw snippet: {clean_json_text[:100]}", "timing": "N/A"
                    }

                # Normalize and ensure all keys exist
                required = ["verdict", "logic", "foundation", "timing"]
                normalized = {}
                for key in required:
                    actual_key = next((k for k in parsed.keys() if k.lower() == key), None)
                    normalized[key] = cls._flatten_value(parsed.get(actual_key)) if actual_key else "Analysis unavailable."

                # Final verdict validation
                valid = {"BUY", "SELL", "HOLD", "ACCUMULATE"}
                if normalized["verdict"].upper() not in valid:
                    normalized["verdict"] = scoring_action.upper()

                return {
                    "status": "success",
                    "model_used": model,
                    **normalized
                }

        except httpx.ReadTimeout:
            return {
                "status": "error",
                "verdict": "TIMEOUT",
                "logic": f"AI generation timed out after {settings.OLLAMA_TIMEOUT}s. Try a smaller model.",
                "foundation": "System might be low on RAM/VRAM.",
                "timing": "N/A"
            }
        except Exception as e:
            return {
                "status": "error",
                "verdict": "ERROR",
                "logic": f"Local AI Error: {str(e)}",
                "foundation": "N/A",
                "timing": "N/A"
            }
