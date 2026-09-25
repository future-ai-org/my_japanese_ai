import { REVIEW_CONFIG } from "../config/review";

export type CloudConnectingPhase = "connect" | "wait" | "boot";

export const CLOUD_WAIT_PHASE_SECONDS = REVIEW_CONFIG.phases.cloudWaitSeconds;

export function cloudConnectingPhase(
  elapsedSeconds: number,
  starting: boolean,
): CloudConnectingPhase {
  if (starting) return "boot";
  if (elapsedSeconds >= CLOUD_WAIT_PHASE_SECONDS) return "wait";
  return "connect";
}

export function cloudActivityStage(stage: string): string {
  return stage.startsWith("cloud-") ? stage.slice("cloud-".length) : stage;
}

export function isCloudActivityLog(stage: string): boolean {
  return stage.startsWith("cloud-");
}
