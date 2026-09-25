# Overview

**AI Code Review** analyzes code that you paste, upload, or load from an
example and returns a **score** based on three metrics: **Correctness**,
**Security**, and **Maintainability**.

The currently supported model is
[TinySwallow-1.5B](./tinyswallow.md), which was distilled from
[Qwen2.5-32B](https://huggingface.co/Qwen/Qwen2.5-32B-Instruct) with
[TAID](./taid.md). See the [Models](./models.md) for more information.

Reviews can be run **locally in your browser** (recommended) or through **cloud
providers**. See the [Inference](./inference.md) section for details.

More information about the methods is available in the [Research](./research.md) section.
