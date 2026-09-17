import { reviewCode, type ModelProgress } from "./review";
import type { ReviewLogEntry, ReviewRunRequest, ReviewResult } from "../types/review";

export function runReview(
  request: ReviewRunRequest,
  onProgress?: (progress: ModelProgress) => void,
  onLog?: (entry: ReviewLogEntry) => void,
  signal?: AbortSignal,
): Promise<ReviewResult> {
  return reviewCode(request, onProgress, onLog, signal);
}
