import { describe, expect, it } from "vitest";
import {
  CLOUD_WAIT_PHASE_SECONDS,
  cloudActivityStage,
  cloudConnectingPhase,
  isCloudActivityLog,
} from "../src/review/cloudConnecting";

describe("cloud connecting phases", () => {
  it("moves from connect to wait after the idle-worker threshold", () => {
    expect(cloudConnectingPhase(0, false)).toBe("connect");
    expect(cloudConnectingPhase(CLOUD_WAIT_PHASE_SECONDS - 0.1, false)).toBe(
      "connect",
    );
    expect(cloudConnectingPhase(CLOUD_WAIT_PHASE_SECONDS, false)).toBe("wait");
    expect(cloudConnectingPhase(30, false)).toBe("wait");
  });

  it("treats a detected GPU boot as the boot phase", () => {
    expect(cloudConnectingPhase(0.5, true)).toBe("boot");
    expect(cloudConnectingPhase(40, true)).toBe("boot");
  });

  it("shortens cloud log stages for the activity list", () => {
    expect(isCloudActivityLog("cloud-request")).toBe(true);
    expect(isCloudActivityLog("cloud-http")).toBe(true);
    expect(isCloudActivityLog("review")).toBe(false);
    expect(cloudActivityStage("cloud-request")).toBe("request");
    expect(cloudActivityStage("cloud-generation")).toBe("generation");
    expect(cloudActivityStage("review")).toBe("review");
  });
});
