export type BrowserLoadingPhase =
  | "storage"
  | "gpu"
  | "download"
  | "cache"
  | "weights"
  | "shaders"
  | "ready"
  | "other";

export function progressLogFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[\d+\s*\/\s*\d+\]/g, " ")
    .replace(/\d+(?:\.\d+)?\s*(?:mib|mb|kib|kb|b|%|secs?|seconds?)/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

export function isWebLlmProgressTick(text: string): boolean {
  return /\[\d+\s*\/\s*\d+\]/.test(text) || /\d+%\s*completed/i.test(text);
}

/** WebLLM often reports progress=0 while loading from cache; use [n/m] when present. */
export function webLlmProgressRatio(
  reported: number,
  text: string,
): number {
  const clamped = Math.max(0, Math.min(reported, 1));
  const match = text.match(/\[(\d+)\s*\/\s*(\d+)\]/);
  if (!match) return clamped;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) {
    return clamped;
  }
  return Math.max(clamped, Math.min(current / total, 1));
}

export function browserLoadingPhase(text: string): BrowserLoadingPhase {
  const value = text.toLowerCase();
  if (value.includes("storage")) return "storage";
  if (value.includes("adapter") || value.includes("software webgpu")) {
    return "gpu";
  }
  if (value.includes("shader") || value.includes("compiling webgpu")) {
    return "shaders";
  }
  if (value.includes("from cache") || value.includes("already cached")) {
    return "cache";
  }
  if (
    value.includes("download") ||
    value.includes("fetch") ||
    value.includes("prefetch")
  ) {
    return "download";
  }
  if (value.includes("cache")) return "cache";
  if (value.includes("param") || value.includes("weight")) return "weights";
  if (value.includes("finish") || value.includes("ready")) return "ready";
  return "other";
}
