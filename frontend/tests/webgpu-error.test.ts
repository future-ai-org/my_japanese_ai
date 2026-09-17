import { describe, expect, it } from "vitest";
import {
  WEBGPU_ADAPTER_MESSAGE,
  WEBGPU_UNAVAILABLE_MESSAGE,
  isWebGpuUnavailableError,
  isWebGpuUnavailableMessage,
} from "../src/review/webgpuError";

describe("WebGPU unavailable errors", () => {
  it("matches missing-API and missing-adapter copy", () => {
    expect(isWebGpuUnavailableMessage(WEBGPU_UNAVAILABLE_MESSAGE)).toBe(true);
    expect(isWebGpuUnavailableMessage(WEBGPU_ADAPTER_MESSAGE)).toBe(true);
    expect(isWebGpuUnavailableMessage("Could not run the lesson.")).toBe(false);
    expect(isWebGpuUnavailableError(new Error(WEBGPU_UNAVAILABLE_MESSAGE))).toBe(
      true,
    );
    expect(isWebGpuUnavailableError(new Error(WEBGPU_ADAPTER_MESSAGE))).toBe(
      true,
    );
    expect(isWebGpuUnavailableError("WebGPU is unavailable")).toBe(false);
  });

  it("tells the user how to enable WebGPU", () => {
    expect(WEBGPU_UNAVAILABLE_MESSAGE).toMatch(/Chrome, Edge, Firefox, or Safari/);
    expect(WEBGPU_UNAVAILABLE_MESSAGE).toMatch(/HTTPS or localhost/);
    expect(WEBGPU_UNAVAILABLE_MESSAGE).toContain("https://webgpureport.org/");
    expect(WEBGPU_ADAPTER_MESSAGE).toContain("https://webgpureport.org/");
  });
});
