import { describe, expect, it, vi } from "vitest";
import { abortError, isAbortError, throwIfAborted, withAbort } from "../src/review/abort";

describe("abort helpers", () => {
  it("detects abort errors", () => {
    expect(isAbortError(abortError())).toBe(true);
    expect(isAbortError(new Error("nope"))).toBe(false);
    expect(isAbortError("nope")).toBe(false);
  });

  it("throws when the signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrowError(/cancelled/);
  });

  it("rejects an in-flight promise when aborted", async () => {
    const controller = new AbortController();
    const pending = withAbort(new Promise(() => {}), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("resolves when the wrapped promise wins", async () => {
    const controller = new AbortController();
    await expect(withAbort(Promise.resolve("ok"))).resolves.toBe("ok");
    await expect(
      withAbort(Promise.resolve("ok"), controller.signal),
    ).resolves.toBe("ok");
  });

  it("forwards rejections", async () => {
    const controller = new AbortController();
    const warn = vi.fn();
    await expect(
      withAbort(Promise.reject(new Error("failed")), controller.signal).catch(
        (error) => {
          warn();
          throw error;
        },
      ),
    ).rejects.toThrow("failed");
    expect(warn).toHaveBeenCalled();
  });
});
