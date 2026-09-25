import { describe, expect, it } from "vitest";
import {
  CloudReviewError,
  isCloudStartupError,
  isCloudStartupMessage,
  startupKindForStatus,
} from "../src/review/cloudError";

describe("cloud startup errors", () => {
  it("classifies 503 and starting-up copy", () => {
    expect(isCloudStartupMessage("HTTP 503 Service Unavailable")).toBe(true);
    expect(isCloudStartupMessage("The provider is starting up.")).toBe(true);
    expect(isCloudStartupMessage("Retrying after retryable upstream status.")).toBe(
      true,
    );
    expect(isCloudStartupMessage("Invalid request")).toBe(false);
    expect(startupKindForStatus(503, "down")).toBe("startup");
    expect(startupKindForStatus(500, "starting up")).toBe("startup");
    expect(startupKindForStatus(400, "bad")).toBe("generic");
  });

  it("reads the typed error kind", () => {
    const startup = new CloudReviewError("warming", { status: 503, kind: "startup" });
    expect(isCloudStartupError(startup)).toBe(true);
    expect(isCloudStartupError(new CloudReviewError("nope"))).toBe(false);
    expect(isCloudStartupError(new Error("HTTP 503"))).toBe(true);
    expect(isCloudStartupError("nope")).toBe(false);
  });
});
