import type { DiagnosticLog, Insight, PairDiscovery, TestLogEntry } from "./types";

function hasSuccessful(tests: TestLogEntry[], predicate: (test: TestLogEntry) => boolean): string[] {
  return tests.filter((test) => test.status === "success" && predicate(test)).map((test) => test.testId);
}

function hasFailed(tests: TestLogEntry[], predicate: (test: TestLogEntry) => boolean): string[] {
  return tests.filter((test) => test.status === "failed" && predicate(test)).map((test) => test.testId);
}

export function inferInsights(tests: TestLogEntry[], pairs: PairDiscovery[]): Insight[] {
  const insights: Insight[] = [];
  const transferSuccess = hasSuccessful(tests, (test) => test.category === "Direct transfer tests");
  const transferFailed = hasFailed(tests, (test) => test.category === "Direct transfer tests");
  const sellFailed = hasFailed(tests, (test) => test.category === "Sell tests");
  const buySuccess = hasSuccessful(tests, (test) => test.category === "Buy tests");
  const pairReadSuccess = hasSuccessful(tests, (test) => test.category === "Pair behavior tests");
  const routerFailures = hasFailed(tests, (test) => /router|getAmounts|swap/i.test(test.functionCalled));
  const blacklistHints = tests
    .filter((test) => /blacklist|blocked|denied|not allowed/i.test(test.revert.reason))
    .map((test) => test.testId);
  const limitHints = tests
    .filter((test) => /limit|max|amount|wallet|cap/i.test(`${test.revert.reason} ${test.resultInterpretation}`))
    .map((test) => test.testId);

  if (blacklistHints.length) {
    insights.push({
      type: "blacklist-based restriction",
      explanation: "One or more failed tests produced wording consistent with blacklist or blocklist behavior.",
      supportingTestIds: blacklistHints,
      contradictingTestIds: [],
      confidence: blacklistHints.length > 1 ? "medium" : "low",
      nextTests: ["Compare the same action across fresh EOAs and the generated alternate actor."],
      warnings: ["Revert text can be misleading on closed-source tokens; treat this as a hypothesis."]
    });
  }

  if (limitHints.length) {
    insights.push({
      type: "max wallet / max buy / max sell / cumulative limit",
      explanation: "Failures or interpretations reference limits, max amounts, wallet caps, or amount-based checks.",
      supportingTestIds: limitHints,
      contradictingTestIds: [],
      confidence: limitHints.length > 1 ? "medium" : "low",
      nextTests: ["Repeat tiny buys/sells across blocks and compare recipient balance before each attempt."],
      warnings: ["Amount-based failures can also be caused by liquidity, allowance, or balance problems."]
    });
  }

  if (sellFailed.length && transferSuccess.length) {
    insights.push({
      type: "pair-based or sell-path restriction",
      explanation: "Peer transfer behavior differs from sell-path behavior, suggesting pair, router, or sell-specific checks.",
      supportingTestIds: sellFailed,
      contradictingTestIds: transferSuccess,
      confidence: "medium",
      nextTests: ["Compare direct transfer-to-pair simulation with router sell simulation."],
      warnings: ["A failed sell can also mean missing allowance or insufficient token balance."]
    });
  }

  if (buySuccess.length && sellFailed.length) {
    insights.push({
      type: "buy allowed / sell restricted",
      explanation: "The current evidence shows at least one buy path succeeding while a sell path failed.",
      supportingTestIds: [...buySuccess, ...sellFailed],
      contradictingTestIds: [],
      confidence: "medium",
      nextTests: ["Run a tiny sell after approval and compare failure reasons with direct transfer-to-pair."],
      warnings: ["Dry-run calls may fail due wallet funding even when token logic would otherwise pass."]
    });
  }

  if (routerFailures.length) {
    insights.push({
      type: "router-based restriction or routing failure",
      explanation: "Router quote or swap calls failed, so router recognition, path liquidity, or route compatibility needs checking.",
      supportingTestIds: routerFailures,
      contradictingTestIds: [],
      confidence: "low",
      nextTests: ["Compare WBNB and USDT paths, then retry with manual router override if discovery was low-confidence."],
      warnings: ["Quote failures are often simple no-liquidity cases rather than malicious restrictions."]
    });
  }

  if (pairs.length > 1 && pairReadSuccess.length) {
    insights.push({
      type: "pair-based comparison available",
      explanation: "Multiple detected pairs can be compared for reserves, routing, and transfer behavior.",
      supportingTestIds: pairReadSuccess,
      contradictingTestIds: [],
      confidence: "low",
      nextTests: ["Run the same tiny simulation against each detected pair and compare outcomes."],
      warnings: []
    });
  }

  if (!insights.length) {
    insights.push({
      type: "unknown or inconclusive",
      explanation: "The completed tests do not yet isolate a specific restriction model.",
      supportingTestIds: tests.map((test) => test.testId),
      contradictingTestIds: [],
      confidence: "unknown",
      nextTests: ["Enable a small number of gated simulations or live tests after funding the generated wallet."],
      warnings: ["Closed-source tokens can use time-based, owner-controlled, or cumulative restrictions."]
    });
  }

  return insights;
}

export function buildFinalMatrix(tests: TestLogEntry[]): DiagnosticLog["finalMatrix"] {
  const ids = (predicate: (test: TestLogEntry) => boolean) => tests.filter(predicate).map((test) => test.testId);
  const hasSuccess = (predicate: (test: TestLogEntry) => boolean) => ids((test) => test.status === "success" && predicate(test));
  const hasFailure = (predicate: (test: TestLogEntry) => boolean) => ids((test) => test.status === "failed" && predicate(test));

  const buyEvidence = hasSuccess((test) => test.category === "Buy tests");
  const sellFailures = hasFailure((test) => test.category === "Sell tests");
  const transferEvidence = hasSuccess((test) => test.category === "Direct transfer tests");
  const transferFailures = hasFailure((test) => test.category === "Direct transfer tests");
  const approvalEvidence = hasSuccess((test) => test.category === "Approval tests");

  return {
    "B buys and holds": {
      possible: buyEvidence.length ? "Yes" : "Unknown",
      evidence: buyEvidence,
      bottleneck: buyEvidence.length ? "" : "No successful buy test yet."
    },
    "B buys then transfers to A": {
      possible: transferEvidence.length ? "Yes" : transferFailures.length ? "No" : "Unknown",
      evidence: [...transferEvidence, ...transferFailures],
      bottleneck: transferFailures.length ? "Direct transfer failed or reverted." : "Not enough transfer evidence."
    },
    "B approves A, A pulls tokens": {
      possible: approvalEvidence.length ? "Unknown" : "Unknown",
      evidence: approvalEvidence,
      bottleneck: "Approval evidence alone does not prove transferFrom behavior."
    },
    "A sells B's tokens directly": {
      possible: "Unknown",
      evidence: sellFailures,
      bottleneck: "Requires explicit transferFrom sell path with a funded token holder."
    },
    "B buys directly to new pair P1": {
      possible: "Unknown",
      evidence: ids((test) => test.category === "Pair behavior tests"),
      bottleneck: "Custom pair creation and liquidity are disabled by default."
    },
    "Pool contract sells when A triggers": {
      possible: "Unknown",
      evidence: ids((test) => test.category === "Contract versus EOA tests"),
      bottleneck: "Executor contract testing requires explicit enablement."
    }
  };
}
