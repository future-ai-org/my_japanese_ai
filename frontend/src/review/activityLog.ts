import type { ReviewLogEntry } from "../types/review";
import {
  isWebLlmProgressTick,
  progressLogFingerprint,
} from "./loadingPhase";

function isSameActivityLog(
  left: ReviewLogEntry | undefined,
  right: ReviewLogEntry,
): boolean {
  if (!left || left.stage !== right.stage) return false;
  if (left.message === right.message) return true;
  return (
    left.stage === "model-load" &&
    progressLogFingerprint(left.message) ===
      progressLogFingerprint(right.message)
  );
}

export function appendReviewLog(
  current: ReviewLogEntry[],
  entry: ReviewLogEntry,
  limit: number,
): ReviewLogEntry[] {
  if (isWebLlmProgressTick(entry.message)) return current;
  if (isSameActivityLog(current[current.length - 1], entry)) return current;
  return [...current, entry].slice(-limit);
}

export function recentActivityLogs(
  logs: ReviewLogEntry[],
  isActivity: (stage: string) => boolean,
  limit: number,
): ReviewLogEntry[] {
  const activity: ReviewLogEntry[] = [];
  for (const entry of logs) {
    if (!isActivity(entry.stage)) continue;
    if (isWebLlmProgressTick(entry.message)) continue;
    if (isSameActivityLog(activity[activity.length - 1], entry)) continue;
    activity.push(entry);
  }
  return activity.slice(-limit);
}
