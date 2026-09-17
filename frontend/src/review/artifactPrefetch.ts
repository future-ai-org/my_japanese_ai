import { REVIEW_CONFIG } from "../config/review";

const WEBLLM_CONFIG_CACHE = REVIEW_CONFIG.storage.cacheNames.config;
const WEBLLM_WASM_CACHE = REVIEW_CONFIG.storage.cacheNames.wasm;
export const WEBLLM_MODEL_CACHE = REVIEW_CONFIG.storage.cacheNames.model;

export interface ArtifactProgress {
  progress: number;
  text: string;
}

export interface PrefetchRequest {
  modelUrl: string;
  wasmUrl: string;
  concurrency: number;
  onProgress?: (progress: ArtifactProgress) => void;
}

interface NdarrayRecord {
  dataPath: string;
  nbytes: number;
}

interface NdarrayCacheManifest {
  records?: NdarrayRecord[];
}

interface MlChatConfig {
  tokenizer_files?: string[];
}

const DB_VERSION = REVIEW_CONFIG.storage.indexedDbVersion;
const STORE = REVIEW_CONFIG.storage.indexedDbStore;

export function modelArtifactBaseUrl(modelUrl: string): string {
  let url = modelUrl.endsWith("/") ? modelUrl : `${modelUrl}/`;
  const revision = REVIEW_CONFIG.artifacts.huggingfaceRevision;
  const revisionPattern = /\/resolve\/[^/]+\//;
  if (!revisionPattern.test(url)) url += `resolve/${revision}/`;
  return new URL(url).href;
}

export function clampDownloadConcurrency(value: number): number {
  const fallback = REVIEW_CONFIG.storage.downloadConcurrency;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(
    REVIEW_CONFIG.storage.downloadConcurrencyMax,
    Math.max(1, Math.floor(value)),
  );
}

function openArtifactDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "url" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error(`Failed to open ${name}`));
  });
}

async function hasUrl(db: IDBDatabase, url: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(url);
    request.onsuccess = () => resolve(request.result !== undefined);
    request.onerror = () => reject(request.error);
  });
}

async function putUrl(db: IDBDatabase, url: string, data: unknown): Promise<void> {
  if (await hasUrl(db, url)) return;
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE, "readwrite")
      .objectStore(STORE)
      .add({ url, data });
    request.onsuccess = () => resolve();
    request.onerror = () => {
      const error = request.error;
      if (error?.name === "ConstraintError") {
        resolve();
        return;
      }
      reject(error);
    };
  });
}

async function getUrl<T>(db: IDBDatabase, url: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(url);
    request.onsuccess = () => {
      const row = request.result as { data?: T } | undefined;
      resolve(row?.data);
    };
    request.onerror = () => reject(request.error);
  });
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Network response was not ok (${response.status}) for ${url}`);
  }
  return response;
}

async function storeJson(db: IDBDatabase, url: string): Promise<unknown> {
  const cached = await getUrl<unknown>(db, url);
  if (cached !== undefined) return cached;
  const data = await (await fetchOk(url)).json();
  await putUrl(db, url, data);
  return data;
}

async function storeBuffer(db: IDBDatabase, url: string): Promise<void> {
  if (await hasUrl(db, url)) return;
  const data = await (await fetchOk(url)).arrayBuffer();
  await putUrl(db, url, data);
}

async function runPool(
  urls: string[],
  concurrency: number,
  worker: (url: string) => Promise<void>,
  onItem: () => void,
): Promise<void> {
  if (urls.length === 0) return;
  const pending = [...urls];
  const runners = Array.from(
    { length: Math.min(concurrency, pending.length) },
    async () => {
      while (pending.length > 0) {
        const url = pending.shift();
        if (!url) return;
        await worker(url);
        onItem();
      }
    },
  );
  await Promise.all(runners);
}

export async function prefetchWebllmArtifacts(
  request: PrefetchRequest,
): Promise<"cached" | "fetched"> {
  const baseUrl = modelArtifactBaseUrl(request.modelUrl);
  const concurrency = clampDownloadConcurrency(request.concurrency);
  const configUrl = new URL(
    REVIEW_CONFIG.artifacts.configFilename,
    baseUrl,
  ).href;
  const ndarrayUrl = new URL(
    REVIEW_CONFIG.artifacts.ndarrayCacheFilename,
    baseUrl,
  ).href;
  const wasmUrl = request.wasmUrl;

  request.onProgress?.({
    progress: 0,
    text: "Prefetching model artifacts…",
  });

  const [configDb, wasmDb, modelDb] = await Promise.all([
    openArtifactDb(WEBLLM_CONFIG_CACHE),
    openArtifactDb(WEBLLM_WASM_CACHE),
    openArtifactDb(WEBLLM_MODEL_CACHE),
  ]);

  try {
    const config = (await storeJson(configDb, configUrl)) as MlChatConfig;
    const allowedTokenizers = new Set(REVIEW_CONFIG.artifacts.tokenizerFiles);
    const tokenizerUrls = (config.tokenizer_files ?? [])
      .filter((name) => allowedTokenizers.has(name))
      .map((name) => new URL(name, baseUrl).href);
    const manifest = (await storeJson(
      modelDb,
      ndarrayUrl,
    )) as NdarrayCacheManifest;
    const records = manifest.records ?? [];
    const shardUrls = records.map(
      (record) => new URL(record.dataPath, baseUrl).href,
    );

    request.onProgress?.({
      progress: REVIEW_CONFIG.storage.prefetchProgressStart,
      text: "Fetching tokenizer and WebGPU library…",
    });
    await Promise.all([
      wasmUrl ? storeBuffer(wasmDb, wasmUrl) : Promise.resolve(),
      ...tokenizerUrls.map((url) => storeBuffer(modelDb, url)),
    ]);

    const missing: string[] = [];
    for (const url of shardUrls) {
      if (!(await hasUrl(modelDb, url))) missing.push(url);
    }
    const already = records.length - missing.length;

    if (missing.length === 0) {
      request.onProgress?.({
        progress: 1,
        text: "Loading weights from cache",
      });
      return "cached";
    }

    let downloaded = already;
    request.onProgress?.({
      progress: already / Math.max(records.length, 1),
      text: `Fetching param cache[${already}/${records.length}]: downloading ${missing.length} shards over ${concurrency} connections.`,
    });
    await runPool(
      missing,
      concurrency,
      (url) => storeBuffer(modelDb, url),
      () => {
        downloaded += 1;
        request.onProgress?.({
          progress: downloaded / Math.max(records.length, 1),
          text: `Fetching param cache[${downloaded}/${records.length}]: downloading model weights.`,
        });
      },
    );

    request.onProgress?.({
      progress: 1,
      text: "Model shards cached. Compiling WebGPU runtime…",
    });
    return "fetched";
  } finally {
    configDb.close();
    wasmDb.close();
    modelDb.close();
  }
}
