import { describe, expect, it } from "vitest";
import { createDiagnosticLog, createTestEntry, finishTest, redactSecrets, safeJson } from "./logger";
import type { DiscoveryState } from "./types";

const discovery: DiscoveryState = {
  token: {
    address: "0x0000000000000000000000000000000000000001",
    contractStatus: "contract",
    codeSize: 10
  },
  routers: [
    {
      label: "router",
      value: "0x0000000000000000000000000000000000000010",
      confidence: "high",
      source: "test"
    }
  ],
  factories: [
    {
      label: "factory",
      value: "0x0000000000000000000000000000000000000020",
      confidence: "high",
      source: "test"
    }
  ],
  quoteTokens: [],
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

describe("logger", () => {
  it("creates the required top-level JSON structure", () => {
    const log = createDiagnosticLog({
      mode: "dry-run",
      network: "bnb",
      chainId: "56",
      rpcUrlLabel: "test",
      targetTokenAddress: "0x0000000000000000000000000000000000000001",
      maxBnbSpend: "0.004",
      testWalletAddress: "0x0000000000000000000000000000000000000002",
      discovery
    });

    expect(Object.keys(log)).toEqual([
      "metadata",
      "discovery",
      "addresses",
      "baseline",
      "testPlan",
      "tests",
      "events",
      "revertReasons",
      "insights",
      "finalMatrix",
      "openQuestions"
    ]);
    expect(log.addresses.detectedOfficialPair).toBe("0x0000000000000000000000000000000000000030");
  });

  it("creates complete test entries", () => {
    const entry = finishTest(
      createTestEntry({
        testId: "approval-001",
        category: "Approval tests",
        name: "Approve router",
        description: "Approve router",
        callType: "simulate",
        args: { spender: "0x0000000000000000000000000000000000000010" }
      }),
      "success"
    );

    expect(entry.revert.didRevert).toBe(false);
    expect(entry.events).toEqual([]);
    expect(entry.status).toBe("success");
    expect(entry.endedAt).not.toBe("");
  });

  it("redacts private-key shaped values from logs", () => {
    const redacted = redactSecrets({
      privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      notes: "secret=abc"
    });

    expect(redacted).toEqual({ privateKey: "[redacted]", notes: "[redacted]" });
  });

  it("safeJson never emits private-key shaped values", () => {
    const log = createDiagnosticLog({
      mode: "dry-run",
      network: "bnb",
      chainId: "56",
      rpcUrlLabel: "test",
      targetTokenAddress: "0x0000000000000000000000000000000000000001",
      maxBnbSpend: "0.004",
      testWalletAddress: "0x0000000000000000000000000000000000000002",
      discovery
    });
    log.openQuestions.push("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

    expect(safeJson(log)).not.toContain("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });
});
