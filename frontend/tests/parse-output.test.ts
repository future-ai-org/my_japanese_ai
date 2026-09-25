import { describe, expect, it } from "vitest";
import { parseReviewJson, parseReviewOutput } from "../src/review/parseOutput";

const review = {
  score: 80,
  summary: "Solid",
  rationale: "Looks fine.",
  metrics: [
    {
      label: "Correctness",
      score: 80,
      description: "Behavior is sound.",
    },
  ],
  findings: [],
};

describe("parseReviewJson", () => {
  it("reads fenced JSON and surrounding prose", () => {
    expect(parseReviewJson(`\`\`\`json\n${JSON.stringify(review)}\n\`\`\``)).toEqual(
      review,
    );
    expect(
      parseReviewJson(`以下が結果です。\n${JSON.stringify(review)}\n以上。`),
    ).toEqual(review);
    expect(parseReviewJson(JSON.stringify({ review }))).toEqual(review);
  });

  it("recovers a truncated review object", () => {
    expect(
      parseReviewJson(
        '{"score": 72, "summary": "Mostly sound", "rationale": "One issue", "metrics": [], "findings": [',
      ),
    ).toEqual({
      score: 72,
      summary: "Mostly sound",
      rationale: "One issue",
      metrics: [],
      findings: [],
    });
    expect(parseReviewJson('{"score": 72,')).toEqual({
      score: 72,
      summary: "",
      rationale: "",
      metrics: [],
      findings: [],
    });
  });

  it("keeps a non-review object as a last-resort fallback", () => {
    expect(parseReviewJson('{"note": "ok"}')).toEqual({ note: "ok" });
    expect(parseReviewJson('prefix {"foo": 1}')).toEqual({ foo: 1 });
    expect(parseReviewJson('[{"skip": true}, {"foo": 1}]')).toEqual([
      { skip: true },
      { foo: 1 },
    ]);
  });

  it("finds a review nested in an array", () => {
    expect(parseReviewJson(JSON.stringify([{ skip: true }, review]))).toEqual(
      review,
    );
  });

  it("rejects text with no review object", () => {
    expect(() => parseReviewJson("{not json")).toThrow("invalid JSON");
    expect(() => parseReviewJson("definitely not a review")).toThrow(
      "invalid JSON",
    );
  });
});

describe("parseReviewOutput", () => {
  it("coerces string scores before validation", () => {
    expect(
      parseReviewOutput(
        '{"score": "88", "summary": "Solid", "rationale": "Ok", "metrics": [], "findings": []}',
      ),
    ).toMatchObject({
      score: 88,
      summary: "Solid",
      rationale: "Ok",
      metrics: [],
      findings: [],
    });
  });

  it("recovers every metric and its sentences from a metric map", () => {
    const mapped = parseReviewOutput(
      JSON.stringify({
        score: 80,
        summary: "Mixed",
        rationale: "See metrics.",
        metrics: {
          Correctness: {
            score: 85,
            description: "Happy path returns the parsed integer.",
          },
          Security: {
            score: 70,
            description: "The handler interpolates request.path into a shell.",
          },
          Maintainability: {
            score: 90,
            description: "Helpers are named clearly.",
          },
        },
        findings: [],
      }),
    );
    expect(mapped.metrics).toEqual([
      {
        label: "Correctness",
        score: 85,
        description: "Happy path returns the parsed integer.",
        snippet: undefined,
      },
      {
        label: "Security",
        score: 70,
        description: "The handler interpolates request.path into a shell.",
        snippet: undefined,
      },
      {
        label: "Maintainability",
        score: 90,
        description: "Helpers are named clearly.",
        snippet: undefined,
      },
    ]);
  });

  it("keeps finished metric sentences when later metrics are truncated", () => {
    const parsed = parseReviewOutput(
      '{"score": 80, "summary": "Mixed", "rationale": "See metrics.", "metrics": [' +
        '{"label": "Correctness", "score": 85, "description": "Happy path returns the parsed integer."}, ' +
        '{"label": "Security", "score": 70, "description": "The handler interpolates request.path',
    );
    expect(parsed.metrics).toEqual([
      {
        label: "Correctness",
        score: 85,
        description: "Happy path returns the parsed integer.",
        snippet: undefined,
      },
      {
        label: "Security",
        score: 70,
        description: "The handler interpolates request.path",
        snippet: undefined,
      },
    ]);
  });

  it("rejects a JSON object that is not a review", () => {
    expect(() => parseReviewOutput('prefix {"foo": 1}')).toThrow("invalid JSON");
  });

  it("recovers named string lists and inline markdown without scores", () => {
    const parsed = parseReviewOutput(`\`\`\`json
{
  "Correctness": [
    "The key function reads PAYMENTS_API_KEY from the environment.",
    "get_customer mutates CARD_CACHE through a shared static.",
    12
  ],
  "Security": [
    "The code does not validate the customer id before interpolating SQL."
  ],
  "Maintainability": [
    "Static cache and hardcoded DSN make the module harder to test."
  ],
  "Mystery": ["ignored unknown label"],
  "Reliability": []
}
\`\`\`

**Code Snippet:**

\`\`\`rust
fn key(&self) -> String {
    std::env::var("PAYMENTS_API_KEY").unwrap_or_else(|_| API_KEY.into())
}
\`\`\`

**Rationale:**

* ** :**
    * ignored empty label
* **Correctness:** Retrieves PAYMENTS_API_KEY from the environment.
* **Security:** There is no parameterized query for customer lookup.
* **Maintainability:** Static cache state is hard to test.
* **Mystery:** no numeric score here
`);
    expect(parsed.metrics).toEqual([
      {
        label: "Correctness",
        score: 50,
        description:
          "The key function reads PAYMENTS_API_KEY from the environment.\nget_customer mutates CARD_CACHE through a shared static.",
        snippet:
          "fn key(&self) -> String {\n    std::env::var(\"PAYMENTS_API_KEY\").unwrap_or_else(|_| API_KEY.into())\n}",
      },
      {
        label: "Security",
        score: 50,
        description:
          "The code does not validate the customer id before interpolating SQL.",
        snippet: undefined,
      },
      {
        label: "Maintainability",
        score: 50,
        description:
          "Static cache and hardcoded DSN make the module harder to test.",
        snippet: undefined,
      },
    ]);
    expect(parsed.score).toBe(50);
    expect(parsed.summary).toBe(
      "Correctness 50, Security 50, Maintainability 50.",
    );
    expect(String(parsed.rationale)).toContain("PAYMENTS_API_KEY");
  });

  it("attaches a security snippet and fills missing rationale from metrics", () => {
    const parsed = parseReviewOutput(
      '{"Correctness": 90, "Security": 40, "Maintainability": 80, "findings": 1}\n' +
        '{"label": "Correctness", "score": 90, "description": "bad \\z escape"}\n\n' +
        "```jsonc\n{\"skip\": true}\n```\n```python\n\n```\n```python\n# security issue: token = \"x\"\n```\n\n" +
        "* **Reliability:**\n\n* **Mystery:** unknown metric without a score.\n",
    );
    expect(parsed.score).toBe(70);
    expect(parsed.summary).toBe(
      "Correctness 90, Security 40, Maintainability 80.",
    );
    expect(String(parsed.rationale)).toContain("Correctness (90):");
    const metrics = parsed.metrics as Array<{
      label: string;
      snippet?: string;
    }>;
    expect(metrics.find((metric) => metric.label === "Security")?.snippet).toBe(
      '# security issue: token = "x"',
    );
  });

  it("keeps all three compact metrics from a short-budget JSON object", () => {
    const parsed = parseReviewOutput(
      '{"score":72,"metrics":[' +
        '{"label":"Correctness","score":85,"description":"process() returns the parsed integer.","snippet":"return int(text)"},' +
        '{"label":"Security","score":40,"description":"The handler interpolates request.path into a shell.","snippet":"os.system(cmd)"},' +
        '{"label":"Maintainability","score":70,"description":"Helpers are named clearly.","snippet":"def process(text):"}' +
        '],"summary":"Works on the happy path, with command injection.","rationale":"Security is pulled down by unsanitized shell interpolation.","findings":[]}',
    );
    expect(parsed.metrics).toEqual([
      {
        label: "Correctness",
        score: 85,
        description: "process() returns the parsed integer.",
        snippet: "return int(text)",
      },
      {
        label: "Security",
        score: 40,
        description: "The handler interpolates request.path into a shell.",
        snippet: "os.system(cmd)",
      },
      {
        label: "Maintainability",
        score: 70,
        description: "Helpers are named clearly.",
        snippet: "def process(text):",
      },
    ]);
  });

  it("keeps all three compact named metrics from the WebLLM grammar shape", () => {
    const parsed = parseReviewOutput(
      '{"score":72,"metrics":{' +
        '"Correctness":{"score":85,"description":"process() returns the parsed integer."},' +
        '"Security":{"score":40,"description":"The handler interpolates request.path into a shell."},' +
        '"Maintainability":{"score":70,"description":"Helpers are named clearly."}' +
        '},"summary":"Works on the happy path, with command injection.","rationale":"Security is pulled down by unsanitized shell interpolation.","findings":[]}',
    );
    expect(parsed.metrics).toEqual([
      {
        label: "Correctness",
        score: 85,
        description: "process() returns the parsed integer.",
      },
      {
        label: "Security",
        score: 40,
        description: "The handler interpolates request.path into a shell.",
      },
      {
        label: "Maintainability",
        score: 70,
        description: "Helpers are named clearly.",
      },
    ]);
  });

  it("keeps 3-4 explanation lines from markdown metric sections", () => {
    const parsed = parseReviewOutput(`{
  "Correctness": 85,
  "Security": 40,
  "Maintainability": 61
}

**Rationale:**

* **Correctness (85/100):**
    * process() returns the parsed integer on the happy path.
    * Empty input still raises ValueError before the caller can recover.
    * The remaining branches are untested, so the score is 85 rather than higher.
* **Security (40/100):**
    * The handler interpolates request.path into a shell command.
    * There is no sanitization or allowlist on that path value.
    * That is command injection, so the score is 40.
* **Maintainability (61/100):**
    * Helpers are named clearly and grouped by responsibility.
    * There are no tests around timeout or empty-input recovery.
    * A reader can follow the flow, but changes would be risky.
`);
    const metrics = parsed.metrics as Array<{ description: string }>;
    expect(metrics.map((metric) => metric.description.split("\n"))).toEqual([
      [
        "process() returns the parsed integer on the happy path.",
        "Empty input still raises ValueError before the caller can recover.",
        "The remaining branches are untested, so the score is 85 rather than higher.",
      ],
      [
        "The handler interpolates request.path into a shell command.",
        "There is no sanitization or allowlist on that path value.",
        "That is command injection, so the score is 40.",
      ],
      [
        "Helpers are named clearly and grouped by responsibility.",
        "There are no tests around timeout or empty-input recovery.",
        "A reader can follow the flow, but changes would be risky.",
      ],
    ]);
  });
});
