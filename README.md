# 💜 my japanese AI
[![Lint](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/lint.yml/badge.svg)](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/lint.yml)
[![Backend Tests](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/test-backend.yml/badge.svg)](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/test-backend.yml)
[![Frontend Tests](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/test-frontend.yml/badge.svg)](https://github.com/storyteller-13/my_japanese_ai/actions/workflows/test-frontend.yml)


<br>

English → Japanese teachings utilizing distilled tiny LLM models. Soon I will be adding several tiny models.

Inference runs in the browser via [WebLLM](https://webllm.mlc.ai/), [WebGPU](https://www.w3.org/TR/webgpu/) (weights from Hugging Face). A React + FastAPI app with PostgreSQL for saved lessons; Docker/Vercel for deploy.

<br>

### Running

<br>

```bash
cp .env.example .env.local
vim .env.local
make setup   # packages, .env.local, Postgres, schema, hooks
make local   # http://localhost:8048
```

<br>

### Development

<br>

```bash
make lint
make test
```
