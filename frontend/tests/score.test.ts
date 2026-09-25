import { describe, expect, it } from "vitest";
import { scoreBand } from "../src/review/score";

describe("scoreBand", () => {
  it("maps scores onto honest review headings", () => {
    expect(scoreBand(100)).toBe("strong");
    expect(scoreBand(90)).toBe("strong");
    expect(scoreBand(89)).toBe("good");
    expect(scoreBand(75)).toBe("good");
    expect(scoreBand(74)).toBe("fair");
    expect(scoreBand(50)).toBe("fair");
    expect(scoreBand(49)).toBe("poor");
    expect(scoreBand(25)).toBe("poor");
    expect(scoreBand(24)).toBe("critical");
    expect(scoreBand(0)).toBe("critical");
  });
});
