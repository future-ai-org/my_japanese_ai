# Browser (WebLLM)

The selected model runs locally in a [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
on the user's device using [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API). 

Selecting a local model begins downloading its shards from Hugging Face into IndexedDB (about [870 MB](./tinyswallow.md) on first visit for TinySwallow-1.5B). A prefetch worker can populate this cache ahead of time, allowing downloads and shader compilation to overlap with editing. On subsequent visits, the cached model files are reused unless the site data is cleared.

 The files downloaded by WebLLM are **MLC (Machine Learning Compilation) artifacts**. MLC quantizes the model and compiles a WebGPU-compatible runtime; WebLLM provides the browser-side engine that runs this compiled package.

>**💡** WebGPU was first released in 2023 as the modern successor to WebGL, providing web applications with a low-level, high-performance interface to the GPU. Unlike traditional browser graphics APIs, WebGPU is designed not only for graphics but also for **general-purpose GPU computation**, making it possible to run machine-learning models directly in the browser using technologies such as **MLC and WebLLM** — without sending the model's computation to a remote server.


### More Details

 - Submitted source code remains in the browser during generation.
- Requires a browser with WebGPU support and approximately 2 GB of GPU or shared memory.
- Generation speed depends on the device’s GPU and browser/driver configuration.
- Software adapters such as [SwiftShader](https://github.com/google/swiftshader) are supported, but inference may be significantly slower.
- No inference API key is required, and there are no cloud GPU costs.

>**💡** SwiftShader is an open-source, high-performance CPU-based implementation of graphics APIs such as Vulkan and OpenGL ES, originally developed by TransGaming and later acquired by Google. It provides a software fallback when a device lacks suitable GPU support, making it particularly useful for applications such as WebGPU, where GPU workloads can fall back to CPU execution when hardware acceleration is unavailable

 ## Hardware Resources and GPU Troubleshooting

Dedicated GPUs generally provide substantially better performance than integrated graphics, while available system and GPU memory can also affect model loading and generation speed.

 If inference is unexpectedly slow on a system with a dedicated NVIDIA GPU, you can check whether the GPU is being used by running `nvidia-smi` while a review is in progress. The command reports GPU utilization, memory usage, and active processes. If the NVIDIA GPU shows little or no activity while WebLLM is generating, the browser may be using the integrated GPU instead. 
 
 Our recommended browser is Firefox. In Firefox, open `about:support` and check the Graphics section for the active adapter; if WebGPU is missing, set `dom.webgpu.enabled` to `true` in `about:config` and restart. On dual-GPU Linux systems with NVIDIA, launch Firefox with `__NV_PRIME_RENDER_OFFLOAD=1` and `__GLX_VENDOR_LIBRARY_NAME=nvidia` so WebGPU uses the discrete GPU. In Chromium-based browsers, you can also inspect the browser’s GPU configuration at `chrome://gpu`.