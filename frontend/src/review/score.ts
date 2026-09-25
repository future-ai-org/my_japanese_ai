import { APP_CONFIG } from "../config/app";

export type ScoreBand = "strong" | "good" | "fair" | "poor" | "critical";

export function scoreBand(score: number): ScoreBand {
  const { strong, good, fair, poor } = APP_CONFIG.score.bands;
  if (score >= strong) return "strong";
  if (score >= good) return "good";
  if (score >= fair) return "fair";
  if (score >= poor) return "poor";
  return "critical";
}
