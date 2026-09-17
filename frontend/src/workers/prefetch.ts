import {
  prefetchWebllmArtifacts,
  type ArtifactProgress,
} from "../review/artifactPrefetch";

interface PrefetchWorkerRequest {
  modelUrl: string;
  wasmUrl: string;
  concurrency: number;
}

self.onmessage = async (event: MessageEvent<PrefetchWorkerRequest>) => {
  try {
    const status = await prefetchWebllmArtifacts({
      ...event.data,
      onProgress: (progress: ArtifactProgress) => {
        self.postMessage({ type: "progress", ...progress });
      },
    });
    self.postMessage({ type: "done", status });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
