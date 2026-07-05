import { describe, expect, it } from "vitest";
import { buildFinalMatrix, inferInsights } from "./insights";
import { buildTestPlan, DEFAULT_SAFETY_SETTINGS } from "./runner";
import type { DiscoveryState, TestLogEntry } from "./types";

const discovery: DiscoveryState = {
  token: {
    address: "0x0000000000000000000000000000000000000001",
    contractStatus: "contract",
    codeSize: 10,
    decimals: 18
  },
  routers: [{ label: "router", value: "0x0000000000000000000000000000000000000010", confidence: "high", source: "test" }],
  factories: [{ label: "factory", value: "0x0000000000000000000000000000000000000020", confidence: "high", source: "test" }],
  quoteTokens: [{ label: "WBNB", value: "0x0000000000000000000000000000000000000040", confidence: "high", source: "test" }],
  pairs: [
    {
      address: "0x0000000000000000000000000000000000000030",
      quoteToken: "0x0000000000000000000000000000000000000040",
      quoteSymbol: "WBNB",
      confidence: "high",
      source: "test"
    }
  ],
  readableConfig: {},
  functionSelectors: [],
  discoveryErrors: []
};

describe("runner", () => {
  it("uses simulation instead of live calls by default", () => {
    const plan = buildTestPlan(discovery, DEFAULT_SAFETY_SETTINGS);
    const buy = plan.find((item) => item.testId === "buy-001");
    const sell = plan.find((item) => item.testId === "sell-001");

    expect(buy?.callType).toBe("simulate");
    expect(buy?.status).toBe("pending");
    expect(sell?.status).toBe("skipped");
  });

  it("marks live transactions only when dry-run is off and live is enabled", () => {
    const plan = buildTestPlan(discovery, {
      ...DEFAULT_SAFETY_SETTINGS,
      dryRunOnly: false,
      allowLiveTransactions: true,
      allowApprovalTests: true
    });

    expect(plan.find((item) => item.testId === "approval-001")?.callType).toBe("transaction");
  });

  it("requires explicit pair-transfer enablement", () => {
    const plan = buildTestPlan(discovery, DEFAULT_SAFETY_SETTINGS);
    expect(plan.find((item) => item.testId === "transfer-002")?.skipReason).toMatch(/explicit/);
  });
});

describe("insights", () => {
  it("infers buy-allowed sell-restricted behavior", () => {
    const tests = [
      {
        testId: "buy-001",
        category: "Buy tests",
        status: "success",
        revert: { didRevert: false, reason: "", rawData: "", customErrorSelector: "" },
        resultInterpretation: ""
      },
      {
        testId: "sell-001",
        category: "Sell tests",
        status: "failed",
        revert: { didRevert: true, reason: "Transfer exceeds max sell limit", rawData: "0x", customErrorSelector: "" },
        resultInterpretation: ""
      }
    ] as TestLogEntry[];

    const insights = inferInsights(tests, []);
    expect(insights.some((insight) => insight.type === "buy allowed / sell restricted")).toBe(true);
    expect(buildFinalMatrix(tests)["B buys and holds"].possible).toBe("Yes");
  });
});
