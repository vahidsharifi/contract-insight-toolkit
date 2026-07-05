import { APP_VERSION, DEFAULT_FUNDING_BNB } from "./constants";
import type {
  CallType,
  DiagnosticLog,
  DiscoveryState,
  Insight,
  RunMode,
  TestLogEntry,
  TestPlanItem
} from "./types";

const SECRET_PATTERNS = [
  /0x[a-fA-F0-9]{64}/g,
  /\b(privateKey|mnemonic|seedPhrase|secret)\b\s*[:=]\s*["']?[^"',}\s]+/gi
];

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, "[redacted]"), value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        /private|mnemonic|seed|secret/i.test(key) ? "[redacted]" : redactSecrets(item)
      ])
    );
  }

  return value;
}

export function createDiagnosticLog(input: {
  mode: RunMode;
  network: string;
  chainId: string;
  rpcUrlLabel: string;
  targetTokenAddress: string;
  maxBnbSpend: string;
  testWalletAddress: string;
  discovery: DiscoveryState;
  manualOverrides?: Record<string, string>;
}): DiagnosticLog {
  const detectedRouter = input.discovery.routers[0]?.value ?? "";
  const detectedFactory = input.discovery.factories[0]?.value ?? "";
  const detectedPairs = input.discovery.pairs.map((pair) => pair.address);
  const detectedOfficialPair =
    input.discovery.pairs.find((pair) => pair.quoteSymbol === "WBNB")?.address ?? input.discovery.pairs[0]?.address ?? "";

  return {
    metadata: {
      appVersion: APP_VERSION,
      startedAt: new Date().toISOString(),
      endedAt: "",
      mode: input.mode,
      network: input.network,
      chainId: input.chainId,
      rpcUrlLabel: input.rpcUrlLabel,
      targetTokenAddress: input.targetTokenAddress,
      defaultFundingBnb: DEFAULT_FUNDING_BNB,
      maxBnbSpend: input.maxBnbSpend,
      testWalletAddress: input.testWalletAddress
    },
    discovery: {
      token: input.discovery.token ? { ...input.discovery.token } : {},
      routers: input.discovery.routers,
      factories: input.discovery.factories,
      quoteTokens: input.discovery.quoteTokens,
      pairs: input.discovery.pairs,
      readableConfig: input.discovery.readableConfig,
      functionSelectors: input.discovery.functionSelectors,
      discoveryErrors: input.discovery.discoveryErrors
    },
    addresses: {
      testWallet: input.testWalletAddress,
      generatedActors: [],
      detectedRouter,
      detectedFactory,
      detectedOfficialPair,
      detectedPairs,
      manualOverrides: input.manualOverrides ?? {}
    },
    baseline: {
      balances: {},
      allowances: {},
      pairReserves: {},
      blockNumber: "",
      timestamp: ""
    },
    testPlan: [],
    tests: [],
    events: [],
    revertReasons: [],
    insights: [],
    finalMatrix: {},
    openQuestions: []
  };
}

export function createTestEntry(input: {
  testId: string;
  category: string;
  name: string;
  description: string;
  callType: CallType;
  actor?: string;
  txOrigin?: string;
  msgSender?: string;
  tokenFrom?: string;
  tokenTo?: string;
  spender?: string;
  recipient?: string;
  amountIn?: string;
  amountOut?: string;
  path?: string[];
  functionCalled?: string;
  functionSelector?: string;
  args?: Record<string, unknown>;
  hypothesis?: string;
}): TestLogEntry {
  const startedAt = new Date().toISOString();
  return {
    testId: input.testId,
    category: input.category,
    name: input.name,
    description: input.description,
    status: "running",
    skipReason: "",
    startedAt,
    endedAt: "",
    blockBefore: "",
    blockAfter: "",
    txHash: "",
    callType: input.callType,
    actor: input.actor ?? "",
    txOrigin: input.txOrigin ?? "",
    msgSender: input.msgSender ?? "",
    tokenFrom: input.tokenFrom ?? "",
    tokenTo: input.tokenTo ?? "",
    spender: input.spender ?? "",
    recipient: input.recipient ?? "",
    amountIn: input.amountIn ?? "",
    amountOut: input.amountOut ?? "",
    path: input.path ?? [],
    functionCalled: input.functionCalled ?? "",
    functionSelector: input.functionSelector ?? "",
    arguments: redactSecrets(input.args ?? {}) as Record<string, unknown>,
    balancesBefore: {},
    balancesAfter: {},
    allowancesBefore: {},
    allowancesAfter: {},
    pairReservesBefore: {},
    pairReservesAfter: {},
    events: [],
    revert: {
      didRevert: false,
      reason: "",
      rawData: "",
      customErrorSelector: ""
    },
    gas: {
      estimated: "",
      used: ""
    },
    hypothesis: input.hypothesis ?? "",
    resultInterpretation: "",
    confidence: "unknown",
    notes: ""
  };
}

export function finishTest(
  entry: TestLogEntry,
  status: TestLogEntry["status"],
  updates: Partial<TestLogEntry> = {}
): TestLogEntry {
  return {
    ...entry,
    ...updates,
    status,
    endedAt: new Date().toISOString(),
    arguments: redactSecrets({ ...entry.arguments, ...(updates.arguments ?? {}) }) as Record<string, unknown>
  };
}

export function skipPlanItem(item: TestPlanItem, reason: string): TestPlanItem {
  return {
    ...item,
    status: "skipped",
    skipReason: reason
  };
}

export function finalizeLog(log: DiagnosticLog, insights: Insight[], finalMatrix: DiagnosticLog["finalMatrix"]): DiagnosticLog {
  const revertReasons = log.tests
    .filter((test) => test.revert.didRevert)
    .map((test) => ({
      testId: test.testId,
      reason: test.revert.reason,
      rawData: test.revert.rawData,
      customErrorSelector: test.revert.customErrorSelector
    }));

  return redactSecrets({
    ...log,
    metadata: {
      ...log.metadata,
      endedAt: new Date().toISOString()
    },
    events: log.tests.flatMap((test) => test.events),
    revertReasons,
    insights,
    finalMatrix
  }) as DiagnosticLog;
}

export function safeJson(log: DiagnosticLog): string {
  return JSON.stringify(redactSecrets(log), null, 2);
}
