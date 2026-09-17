import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampDownloadConcurrency,
  modelArtifactBaseUrl,
  prefetchWebllmArtifacts,
  WEBLLM_MODEL_CACHE,
} from "../src/review/artifactPrefetch";

interface StoredRow {
  url: string;
  data: unknown;
}

function installMemoryIndexedDB() {
  const databases = new Map<string, Map<string, StoredRow>>();

  class MemoryRequest<T> {
    result: T | undefined;
    error: DOMException | null = null;
    onsuccess: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onupgradeneeded: ((event: Event) => void) | null = null;

    succeed(result?: T) {
      this.result = result;
      queueMicrotask(() => this.onsuccess?.(new Event("success")));
    }

    fail(error: DOMException) {
      this.error = error;
      queueMicrotask(() => this.onerror?.(new Event("error")));
    }
  }

  class MemoryStore {
    constructor(private readonly rows: Map<string, StoredRow>) {}

    get(url: string) {
      const request = new MemoryRequest<StoredRow | undefined>();
      request.succeed(this.rows.get(url));
      return request;
    }

    add(row: StoredRow) {
      const request = new MemoryRequest<string>();
      if (this.rows.has(row.url)) {
        request.fail(new DOMException("Key exists", "ConstraintError"));
        return request;
      }
      this.rows.set(row.url, row);
      request.succeed(row.url);
      return request;
    }
  }

  class MemoryTransaction {
    constructor(private readonly rows: Map<string, StoredRow>) {}
    objectStore() {
      return new MemoryStore(this.rows);
    }
  }

  class MemoryDatabase {
    private readonly storeNames = new Set<string>();
    objectStoreNames = {
      contains: (name: string) => this.storeNames.has(name),
    };
    constructor(private readonly rows: Map<string, StoredRow>) {}
    createObjectStore(name: string) {
      this.storeNames.add(name);
    }
    transaction() {
      return new MemoryTransaction(this.rows);
    }
    close() {}
  }

  vi.stubGlobal("indexedDB", {
    open(name: string) {
      const request = new MemoryRequest<MemoryDatabase>();
      if (!databases.has(name)) databases.set(name, new Map());
      const db = new MemoryDatabase(databases.get(name)!);
      request.result = db;
      queueMicrotask(() => {
        request.onupgradeneeded?.(new Event("upgradeneeded"));
        request.onsuccess?.(new Event("success"));
      });
      return request;
    },
  });

  return databases;
}

describe("artifact prefetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes Hub URLs onto the resolve/main artifact prefix", () => {
    expect(
      modelArtifactBaseUrl(
        "https://huggingface.co/SakanaAI/TinySwallow-1.5B-Instruct-q4f32_1-MLC",
      ),
    ).toBe(
      "https://huggingface.co/SakanaAI/TinySwallow-1.5B-Instruct-q4f32_1-MLC/resolve/main/",
    );
    expect(clampDownloadConcurrency(32)).toBe(16);
    expect(clampDownloadConcurrency(0)).toBe(1);
  });

  it("downloads missing shards in parallel and skips files already cached", async () => {
    const databases = installMemoryIndexedDB();
    const fetched: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        fetched.push(url);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        if (url.endsWith("mlc-chat-config.json")) {
          return new Response(
            JSON.stringify({ tokenizer_files: ["tokenizer.json"] }),
            { status: 200 },
          );
        }
        if (url.endsWith("ndarray-cache.json")) {
          return new Response(
            JSON.stringify({
              records: [
                { dataPath: "params_shard_0.bin", nbytes: 4 },
                { dataPath: "params_shard_1.bin", nbytes: 4 },
                { dataPath: "params_shard_2.bin", nbytes: 4 },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
      }),
    );

    const modelUrl =
      "https://huggingface.co/SakanaAI/TinySwallow-1.5B-Instruct-q4f32_1-MLC";
    const wasmUrl = "https://example.test/lib.wasm";
    const first = await prefetchWebllmArtifacts({
      modelUrl,
      wasmUrl,
      concurrency: 3,
    });
    expect(first).toBe("fetched");
    expect(maxInFlight).toBeGreaterThan(1);
    expect(fetched.some((url) => url.endsWith("params_shard_0.bin"))).toBe(
      true,
    );

    fetched.length = 0;
    const second = await prefetchWebllmArtifacts({
      modelUrl,
      wasmUrl,
      concurrency: 3,
    });
    expect(second).toBe("cached");
    expect(fetched).toEqual([]);
    expect(databases.get(WEBLLM_MODEL_CACHE)?.size).toBeGreaterThan(0);
  });

  it("rejects when IndexedDB fails to open", async () => {
    vi.stubGlobal("indexedDB", {
      open() {
        const request: {
          error: DOMException;
          onsuccess: ((event: Event) => void) | null;
          onerror: ((event: Event) => void) | null;
          onupgradeneeded: ((event: Event) => void) | null;
        } = {
          error: new DOMException("blocked", "UnknownError"),
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        queueMicrotask(() => request.onerror?.(new Event("error")));
        return request;
      },
    });

    await expect(
      prefetchWebllmArtifacts({
        modelUrl: "https://example.test/model",
        wasmUrl: "https://example.test/lib.wasm",
        concurrency: 2,
      }),
    ).rejects.toThrow("blocked");
  });

  it("treats a concurrent insert as cached and surfaces other write failures", async () => {
    const rows = new Map<string, StoredRow>();
    class MemoryRequest<T> {
      result: T | undefined;
      error: DOMException | null = null;
      onsuccess: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      succeed(result?: T) {
        this.result = result;
        queueMicrotask(() => this.onsuccess?.(new Event("success")));
      }
      fail(error: DOMException) {
        this.error = error;
        queueMicrotask(() => this.onerror?.(new Event("error")));
      }
    }
    let addCalls = 0;
    vi.stubGlobal("indexedDB", {
      open() {
        const request: {
          result: {
            objectStoreNames: { contains: () => boolean };
            createObjectStore: () => void;
            transaction: () => {
              objectStore: () => {
                get: (url: string) => MemoryRequest<StoredRow | undefined>;
                add: (row: StoredRow) => MemoryRequest<string>;
              };
            };
            close: () => void;
          };
          onsuccess: ((event: Event) => void) | null;
          onerror: ((event: Event) => void) | null;
          onupgradeneeded: ((event: Event) => void) | null;
        } = {
          result: {
            objectStoreNames: { contains: () => true },
            createObjectStore() {},
            transaction() {
              return {
                objectStore() {
                  return {
                    get(url: string) {
                      const getRequest = new MemoryRequest<
                        StoredRow | undefined
                      >();
                      getRequest.succeed(rows.get(url));
                      return getRequest;
                    },
                    add() {
                      addCalls += 1;
                      const addRequest = new MemoryRequest<string>();
                      if (addCalls === 1) {
                        addRequest.fail(
                          new DOMException("Key exists", "ConstraintError"),
                        );
                        return addRequest;
                      }
                      addRequest.fail(
                        new DOMException("quota", "QuotaExceededError"),
                      );
                      return addRequest;
                    },
                  };
                },
              };
            },
            close() {},
          },
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        queueMicrotask(() => request.onsuccess?.(new Event("success")));
        return request;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );

    await expect(
      prefetchWebllmArtifacts({
        modelUrl: "https://example.test/model",
        wasmUrl: "",
        concurrency: Number.NaN,
      }),
    ).rejects.toThrow("quota");
    expect(addCalls).toBeGreaterThan(1);
  });

  it("fails when a Hub artifact responds with an HTTP error", async () => {
    installMemoryIndexedDB();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );

    await expect(
      prefetchWebllmArtifacts({
        modelUrl: "https://example.test/model",
        wasmUrl: "https://example.test/lib.wasm",
        concurrency: 1,
      }),
    ).rejects.toThrow(/Network response was not ok \(404\)/);
  });
});
