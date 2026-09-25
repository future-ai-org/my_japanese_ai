# TinySwallow-1.5B

[SakanaAI/TinySwallow-1.5B](https://huggingface.co/collections/SakanaAI/tinyswallow) is
a 1.5-billion-parameter instruction model distilled from a 32-billion-parameter LLM. It used
[TAID](https://arxiv.org/pdf/2501.16937)
(Temporally Adaptive Interpolated Distillation), a method for
transferring knowledge from a much larger teacher into a small student that can
run on modest hardware.

The checkpoint follows the
[Qwen2 architecture](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) and is prompted to act as a senior
engineer and return a JSON structure in English. The default 512-token generation budget (or above) targets
for 3-4 evidence sentences per metric and leaves room for snippets. The short
256-token budget asks for one sentence per metric and omits snippets so all three
criteria still fit.

> **💡** Qwen2 was introduced in 2024 as the successor to the original Qwen architecture, with a redesigned Transformer backbone focused on stronger performance and efficiency. Its architecture incorporates Grouped Query Attention (GQA), Rotary Positional Embeddings (RoPE), and RMSNorm, allowing Qwen2 models to generate high-quality text while keeping attention and inference costs relatively efficient.



## Browser artifact

The browser path uses the official
[MLC](https://llm.mlc.ai/) artifact,
[TinySwallow-1.5B-Instruct-q4f32_1-MLC](https://huggingface.co/SakanaAI/TinySwallow-1.5B-Instruct-q4f32_1-MLC).

MLC (Machine Learning Compilation) converts Hugging Face models into quantized runtimes optimized for WebGPU, while WebLLM provides the browser-facing runtime for executing them.


`q4f32_1` means <abbr title="Learned parameters stored at 4-bit precision, which cuts download size and VRAM versus full-precision weights.">4-bit weights</abbr> and <abbr title="Intermediate values kept as float32 during inference so weight quantization loses less accuracy.">32-bit activations</abbr>. Selecting the local model
downloads about 870MB of model shards along with the corresponding Qwen2 WASM <abbr title="Compiled WebGPU binary that implements this model architecture, quantization, and context size.">library</abbr>. Subsequent visits reuse the [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
cache unless the browser evicts or site data is cleared.
The MLC <abbr title="MLC/WebLLM engine that loads the weights and drives the WASM library in the browser.">runtime</abbr>, weight manifest, and WASM library must come from the same generation.

Cloud inference uses the unquantized Instruct
checkpoint through [vLLM](https://docs.vllm.ai/) and does not use MLC.

> **💡** MLC (Machine Learning Compilation) is an open-source machine-learning compiler ecosystem that emerged from research at Apache TVM, with the MLC LLM project introduced in 2023. It makes it possible to compile and optimize LLMs for a wide range of hardware and runtimes — including WebGPU in the browser — bringing efficient, native-feeling AI inference to devices without requiring a traditional server-side GPU.


## Model artifact


- **Model id:** `TinySwallow-1.5B-Instruct-q4f32_1-MLC`
- **Weights:** `https://huggingface.co/SakanaAI/TinySwallow-1.5B-Instruct-q4f32_1-MLC`
- **Library:** WebLLM 0.2.48 Qwen2 WASM
  `Qwen2-1.5B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm` 
- **VRAM estimate:** 1889 MB
- **Context window:** 4096 tokens (must match `ctx4k` in the WASM name)
- **Prefill chunk:** 1024 tokens (must match `cs1k` in the WASM name)
- **Download estimate:** 870MB

## Review contract

The model is instructed to score three metrics — **Correctness**, **Security**,
and **Maintainability** — and to report concrete findings under those axes.

The review contract enforces the following constraints:

- Scores are clamped to 0–100.
- Line numbers are clamped to the submitted file.
- Severities must be critical, warning, or suggestion.

Input size is constrained so that both the instructions and generated output fit within the **4K-token context window**. Generation defaults to 512 tokens, with the following available budgets:

- **Short:** 256 tokens
- **Medium:** 384 tokens
- **Standard:** 512 tokens
- **Long:** 768 tokens
- **Extended:** 1,024 tokens

The default **temperature** is 0.2 and can be customized.
