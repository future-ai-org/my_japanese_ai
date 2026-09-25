import { REVIEW_CONFIG } from "../config/review";

export type BrowserReviewingPhase =
  | "submit"
  | "prefill"
  | "generate"
  | "validate";

export const BROWSER_PREFILL_PHASE_SECONDS =
  REVIEW_CONFIG.phases.browserPrefillSeconds;

const REVIEW_ACTIVITY_STAGES = new Set(["review", "generation", "runtime"]);

export function browserReviewingPhase(
  elapsedSeconds: number,
  progress?: { text?: string; streamedText?: string } | null,
): BrowserReviewingPhase {
  const text = progress?.text?.toLowerCase() ?? "";
  if (text.includes("validated")) return "validate";
  if (progress?.streamedText || text.includes("generating")) return "generate";
  if (
    elapsedSeconds >= BROWSER_PREFILL_PHASE_SECONDS ||
    text.includes("prefill")
  ) {
    return "prefill";
  }
  return "submit";
}

export function isBrowserReviewActivityLog(stage: string): boolean {
  return REVIEW_ACTIVITY_STAGES.has(stage);
}
