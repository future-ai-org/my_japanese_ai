import { describe, expect, it } from "vitest";
import { REVIEW_CONFIG } from "../src/config/review";
import { EXAMPLES, LANGUAGE_LABELS } from "../src/data/examples";

describe("example snippets", () => {
  it("covers every supported language", () => {
    expect(Object.keys(LANGUAGE_LABELS)).toEqual([
      "python",
      "javascript",
      "typescript",
      "go",
      "rust",
      "cpp",
    ]);
    expect(Object.keys(EXAMPLES)).toEqual(Object.keys(LANGUAGE_LABELS));
  });

  it("provides labeled snippets with reviewable structure", () => {
    expect(LANGUAGE_LABELS.python).toBe("Python");
    expect(LANGUAGE_LABELS.go).toBe("Go");
    expect(LANGUAGE_LABELS.rust).toBe("Rust");
    expect(LANGUAGE_LABELS.cpp).toBe("C++");
    expect(EXAMPLES.python).toContain("class OrderFulfillment");
    expect(EXAMPLES.python).toContain("def fulfill_orders");
    expect(EXAMPLES.javascript).toContain("registerPaymentWebhook");
    expect(EXAMPLES.javascript).toContain("drainQueue");
    expect(EXAMPLES.typescript).toContain("class SessionStore");
    expect(EXAMPLES.typescript).toContain("proxyAdminAction");
    expect(EXAMPLES.go).toContain("func FulfillOrders");
    expect(EXAMPLES.go).toContain("func Charge");
    expect(EXAMPLES.rust).toContain("fn fulfill_orders");
    expect(EXAMPLES.rust).toContain("fn charge");
    expect(EXAMPLES.cpp).toContain("fulfill_orders");
    expect(EXAMPLES.cpp).toContain("charge(");
  });

  it("keeps each snippet inside the default review character budget", () => {
    const limit = REVIEW_CONFIG.limits.maxCodeCharacters;
    for (const [language, snippet] of Object.entries(EXAMPLES)) {
      expect(snippet.length, language).toBeGreaterThan(1_200);
      expect(snippet.length, language).toBeLessThanOrEqual(limit);
    }
  });
});
