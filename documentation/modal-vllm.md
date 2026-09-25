# Modal (dedicated vLLM)

 Signed-in users can send reviews to our dedicated [Modal](https://modal.com/)-hosted [vLLM](https://docs.vllm.ai/) service.


- **Requires:** A signed-in account.
- **Data handling:** The review source leaves the browser and is sent to Modal for inference.
- **Cold starts:** The service scales to zero by default. The first request after a period of inactivity may take several minutes while the NVIDIA L4 container and vLLM finish loading.

See [Inference](./inference.md) for the shared comparison table, generation
parameters, and cloud rate limits.

> **💡** vLLM was introduced in 2023 as an open-source inference and serving engine designed to make large language models faster and more efficient at scale. Its key innovation, **PagedAttention**, manages the model's KV cache using a memory-paging approach, reducing wasted GPU memory and allowing vLLM to serve many requests concurrently with significantly higher throughput.


 ### GPU Service

 - **GPU:** NVIDIA L4 (default)
- **Runtime:** vLLM 0.11.x
- **Model:** `TinySwallow-1.5B-Instruct` — unquantized Instruct checkpoint; this is **not** the browser MLC artifact.
- **Context:** 4096 tokens