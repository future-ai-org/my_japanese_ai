export class CloudReviewError extends Error {
  readonly status?: number;
  readonly kind: "startup" | "generic";

  constructor(
    message: string,
    options?: { status?: number; kind?: "startup" | "generic" },
  ) {
    super(message);
    this.name = "CloudReviewError";
    this.status = options?.status;
    this.kind = options?.kind ?? "generic";
  }
}

export function isCloudStartupError(error: unknown): boolean {
  if (error instanceof CloudReviewError) return error.kind === "startup";
  if (!(error instanceof Error)) return false;
  return isCloudStartupMessage(error.message);
}

export function isCloudStartupMessage(message: string): boolean {
  return (
    /starting up/i.test(message) ||
    /\bHTTP 503\b/.test(message) ||
    /retrying after retryable/i.test(message)
  );
}

export function startupKindForStatus(
  status: number,
  message: string,
): "startup" | "generic" {
  return status === 503 || isCloudStartupMessage(message)
    ? "startup"
    : "generic";
}
