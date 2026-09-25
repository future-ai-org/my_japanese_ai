# Inference

Code Review supports three ways to run inference:

- [Browser (WebLLM)](./browser-webllm.md) — The selected model runs in the current tab using WebGPU.
- [Modal (dedicated vLLM)](./modal-vllm.md) — Signed-in users run
  reviews in a dedicated [Modal](https://modal.com/) GPU container.
- [Hugging Face (Inference Provider)](./huggingface-inference.md) — Signed-in users run reviews
  through [Hugging Face](https://huggingface.co/docs/inference-providers)'s OpenAI-compatible router.


Generation parameters are stored per provider for the current tab. Switching
providers or models resets the current result and restores the selected provider's defaults.

## Comparison

| | Browser | Modal | Hugging Face |
| --- | --- | --- | --- |
| **Where it runs** | Your device | Dedicated L4 container | [Featherless](https://featherless.ai/) via [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers) |
| **Account** | None | HTTP-only session cookie | HTTP-only session cookie |
| **Privacy** | Source stays in the tab during generation | Source is included in the chat-completion prompt sent upstream | Source is included in the chat-completion prompt sent upstream |
| **First-load cost** | About 870 MB of MLC shards plus a WASM library, followed by shader compilation | Image build and model download at deploy time; the first request after idle can take several minutes | No container startup; billed per request |
| **Hardware** | WebGPU-capable browser with about 2 GB of GPU or shared memory | NVIDIA L4 in the default config | Provider GPU |
| **Structured output** | WebLLM `json_object` with a compact named-metrics schema, followed by application validation | OpenAI `response_format.json_schema` | Prompt-only JSON |
| **Rate limit** | None  | Per-user window | Per-user window  |

Saved history stores the normalized result, including an inference
trace containing prompts, generation settings, raw output, and logs.

## Parameters

### Temperature

Temperature controls the sampler's randomness.

- **Range:** 0-1, with a default to 0.2.
- **Effect:** Lower values produce more consistent reviews; higher values produce more varied
  findings.

### Output Tokens

Output tokens define the completion budget. They limit how much
JSON the model can generate, not the size of the submitted source.

- **Choices:** Short (256), medium (384), standard (512), long (768),
  extended (1024).
- **Browser default:** 512.
- **Cloud default:** 512.

Shorter budgets finish faster and leave more room in the 4K context for the prompt and source. The short (256) setting requests one-sentence metrics and omits snippets. Medium (384) and higher request 3–4 sentence writeups and leave room for snippets. Longer budgets primarily reduce the risk of truncating verbose JSON.

### Cloud-only Request limits

These limits do not apply to WebLLM.

- **Timeout:** 55 seconds.
- **Quota:** 100 reviews per 60 minutes (per signed-in user).
- **Startup retries:** HTTP 502 and 503 responses from the upstream service are retried until the
  deadline, with sleeps between 0.5-5 seconds, and a maximum of 8 attempts. Modal cold starts can frequently return 503 while vLLM is still loading.