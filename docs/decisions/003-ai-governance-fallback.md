# ADR 003: AI Provider Governance and Fallback Chain

## Status
Accepted

## Context
The application relies heavily on Large Language Models (LLMs) to power its fundamental valuation, technical trade timing, and portfolio review engines. Initially, we hardcoded to use Groq's Llama 3 models or local Ollama.
However, free-tier cloud providers are subject to strict rate limits and intermittent latency spikes, causing the `ai_service` to fail unexpectedly. If Groq goes down, the investor loses the ability to generate trading verdicts entirely.
Furthermore, relying exclusively on a single cloud provider creates vendor lock-in and prevents users from leveraging high-quality open-weight models like DeepSeek-R1 available through alternative inference providers (e.g., Nvidia NIM).

## Decision
We implemented a dynamic, sequential fallback chain for AI provider execution (M-5) defined by the `AI_FALLBACK_ORDER` configuration variable.

The resolution sequence is:
1. **Primary**: Groq (`llama-3.3-70b-versatile`) — Fast, free-tier, JSON-native.
2. **Secondary**: Nvidia NIM (`deepseek-ai/deepseek-r1`) — High quality, supports massive reasoning contexts, used as the primary backup.
3. **Tertiary**: Ollama (`qwen2.5` or `llama3`) — Fully local fallback ensuring 100% uptime for offline execution.

To govern this system:
- **Telemetry**: We implemented the `AIUsageLog` model to track `provider`, `model`, `endpoint`, `duration`, and `token usage`.
- **Structured Audit**: Structlog is now used to emit `ai.call_completed` and `ai.provider_failed` JSON logs, making it trivial to build observability dashboards around AI latency and error rates.

## Consequences
- **Resilience**: The application can withstand complete outages of the primary AI provider without impacting user experience.
- **Cost & Rate Limiting**: The fallback chain seamlessly shifts traffic to alternative providers if rate limits (HTTP 429) are encountered.
- **Observability**: Clear visibility into which models are being used, how long inference takes, and where errors originate.
