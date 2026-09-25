# Hugging Face (Inference Provider)

TinySwallow-1.5B is available through [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers)
via [Featherless](https://featherless.ai/). It does not deploy any GPU containers.


- **Requires:** A signed-in account.
- **Data handling:** The review source leaves the browse.
- **No cold starts:** Usage is billed per request.
- **Response:** Structured output is limited to prompt-only JSON.

See [Inference](./inference.md) for the shared comparison table, generation
parameters, and cloud rate limits.

> **💡** Featherless AI launched in 2024 as a serverless inference platform built around open-weight models from Hugging Face. Instead of requiring developers to provision and manage GPU infrastructure, Featherless handles **model loading, GPU orchestration, and scaling behind a simple API**, making thousands of models available for inference with minimal deployment overhead.
