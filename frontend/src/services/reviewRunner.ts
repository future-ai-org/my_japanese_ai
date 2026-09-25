import { reviewCode, type ModelProgress } from "./review";
import { reviewCodeCloud } from "./reviewCloud";
import type {
  InferenceProvider,
  ReviewLogEntry,
  ReviewRunRequest,
  ReviewResult,
} from "../types/review";

export function runReview(
  provider: InferenceProvider,
  request: ReviewRunRequest,
  onProgress?: (progress: ModelProgress) => void,
  onLog?: (entry: ReviewLogEntry) => void,
  signal?: AbortSignal,
): Promise<ReviewResult> {
  if (provider === "browser") {
    return reviewCode(request, onProgress, onLog, signal);
  }
  return reviewCodeCloud({ ...request, provider }, onLog, signal);
}
