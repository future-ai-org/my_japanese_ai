import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

console.info("[TinySwallow:worker] WebLLM worker started.");
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event);
};
