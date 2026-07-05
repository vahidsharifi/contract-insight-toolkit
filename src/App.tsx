import {
  AlertTriangle,
  Clipboard,
  Copy,
  Download,
  Play,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Wallet
} from "lucide-react";
import { useMemo, useState } from "react";
import { ethers } from "ethers";
import { createProvider, discoverToken, getRpcUrlLabel, validateAddress } from "./discovery";
import { safeJson } from "./logger";
import { DEFAULT_SAFETY_SETTINGS, buildTestPlan, runDiagnostics } from "./runner";
import type { DiagnosticLog, DiscoveryState, SafetySettings, TestLogEntry } from "./types";
import {
  createTestingWallet,
  forgetPersistedWallet,
  getNativeBalance,
  isValidAddress,
  loadPersistedWallet,
  saveTestingWallet,
  unlockPersistedWallet,
  type TestingWallet
} from "./wallet";

const provider = createProvider();

export function App() {
  const [targetAddress, setTargetAddress] = useState("");
  const [addressError, setAddressError] = useState("");
  const [discovery, setDiscovery] = useState<DiscoveryState>({
    routers: [],
    factories: [],
    quoteTokens: [],
    pairs: [],
    readableConfig: {},
    functionSelectors: [],
    discoveryErrors: []
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({});
  const [testingWallet, setTestingWallet] = useState<TestingWallet>(() => loadPersistedWallet() ?? createTestingWallet());
  const [walletPassword, setWalletPassword] = useState("");
  const [walletStatus, setWalletStatus] = useState("");
  const [copiedAddress, setCopiedAddress] = useState("");
  const [bnbBalance, setBnbBalance] = useState("");
  const [tokenBalance, setTokenBalance] = useState("");
  const [safety, setSafety] = useState<SafetySettings>(DEFAULT_SAFETY_SETTINGS);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<TestLogEntry | undefined>();
  const [log, setLog] = useState<DiagnosticLog | undefined>();

  const checksumTarget = useMemo(() => validateAddress(targetAddress).checksum ?? "", [targetAddress]);
  const effectiveDiscovery = useMemo(() => applyManualOverrides(discovery, manualOverrides), [discovery, manualOverrides]);
  const manualOverrideIssues = useMemo(() => getManualOverrideIssues(manualOverrides), [manualOverrides]);
  const plan = useMemo(() => buildTestPlan(effectiveDiscovery, safety), [effectiveDiscovery, safety]);
  const jsonPreview = log
    ? safeJson(log)
    : safeJson({
        metadata: {
          appVersion: "",
          startedAt: "",
          endedAt: "",
          mode: safety.dryRunOnly ? "dry-run" : "live",
          network: "bsc",
          chainId: "56",
          rpcUrlLabel: getRpcUrlLabel(),
          targetTokenAddress: checksumTarget,
          defaultFundingBnb: "0.004",
          maxBnbSpend: safety.maxBnbSpend,
          testWalletAddress: testingWallet.address
        },
        discovery: {
          token: effectiveDiscovery.token ?? {},
          routers: effectiveDiscovery.routers,
          factories: effectiveDiscovery.factories,
          quoteTokens: effectiveDiscovery.quoteTokens,
          pairs: effectiveDiscovery.pairs,
          readableConfig: effectiveDiscovery.readableConfig,
          functionSelectors: effectiveDiscovery.functionSelectors,
          discoveryErrors: effectiveDiscovery.discoveryErrors
        },
        addresses: {
          testWallet: testingWallet.address,
          generatedActors: testingWallet.alternateActors,
          detectedRouter: effectiveDiscovery.routers[0]?.value ?? "",
          detectedFactory: effectiveDiscovery.factories[0]?.value ?? "",
          detectedOfficialPair: effectiveDiscovery.pairs[0]?.address ?? "",
          detectedPairs: effectiveDiscovery.pairs.map((pair) => pair.address),
          manualOverrides
        },
        baseline: { balances: {}, allowances: {}, pairReserves: {}, blockNumber: "", timestamp: "" },
        testPlan: plan,
        tests: [],
        events: [],
        revertReasons: [],
        insights: [],
        finalMatrix: {},
        openQuestions: []
      } as DiagnosticLog);

  const validateAndDiscover = async () => {
    const validation = validateAddress(targetAddress);
    if (!validation.ok || !validation.checksum) {
      setAddressError(validation.error ?? "Invalid address");
      return;
    }

    setAddressError("");
    setIsDiscovering(true);
    try {
      const discovered = await discoverToken(validation.checksum, provider);
      setDiscovery(discovered);
      await refreshBalances(validation.checksum);
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDiscovering(false);
    }
  };

  const refreshBalances = async (tokenAddress = checksumTarget) => {
    const bnb = await getNativeBalance(provider, testingWallet.address);
    setBnbBalance(bnb);

    if (tokenAddress) {
      try {
        const token = new ethers.Contract(tokenAddress, ["function balanceOf(address) view returns (uint256)"], provider);
        setTokenBalance((await token.balanceOf(testingWallet.address)).toString());
      } catch {
        setTokenBalance("");
      }
    }
  };

  const startRun = async () => {
    const validation = validateAddress(targetAddress);
    if (!validation.ok || !validation.checksum) {
      setAddressError(validation.error ?? "Invalid address");
      return;
    }

    setIsRunning(true);
    setCurrentTest(undefined);
    try {
      const finalLog = await runDiagnostics({
        provider,
        wallet: testingWallet.wallet,
        testWalletAddress: testingWallet.address,
        alternateActors: testingWallet.alternateActors,
        targetTokenAddress: validation.checksum,
        discovery: effectiveDiscovery,
        safety,
        rpcUrlLabel: getRpcUrlLabel(),
        manualOverrides,
        onProgress: (nextLog, test) => {
          setLog({ ...nextLog });
          setCurrentTest(test);
        },
        confirmLiveTx: async (message) => window.confirm(message)
      });
      setLog(finalLog);
      await refreshBalances(validation.checksum);
    } finally {
      setIsRunning(false);
    }
  };

  const copyJson = async () => copyText(jsonPreview);

  const copyAddress = async (address: string) => {
    await copyText(address);
    setCopiedAddress(address);
    window.setTimeout(() => setCopiedAddress((current) => (current === address ? "" : current)), 1600);
  };

  const downloadJson = () => {
    const blob = new Blob([jsonPreview], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bsc-token-diagnostic-${checksumTarget || "run"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetRun = () => {
    setLog(undefined);
    setCurrentTest(undefined);
  };

  const saveWallet = async () => {
    setWalletStatus("");
    try {
      const saved = await saveTestingWallet(testingWallet, walletPassword);
      setTestingWallet(saved);
      setWalletPassword("");
      setWalletStatus("Wallet saved encrypted in this browser.");
    } catch (error) {
      setWalletStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const unlockWallet = async () => {
    setWalletStatus("");
    try {
      const unlocked = await unlockPersistedWallet(walletPassword);
      setTestingWallet(unlocked);
      setWalletPassword("");
      setWalletStatus("Wallet unlocked for this session.");
    } catch (error) {
      setWalletStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const generateNewWallet = () => {
    if (testingWallet.persisted && !window.confirm("This will stop using the saved funding wallet in this browser. Continue?")) return;
    setTestingWallet(createTestingWallet());
    setBnbBalance("");
    setTokenBalance("");
    setWalletPassword("");
    setWalletStatus("New unsaved wallet generated.");
  };

  const forgetWallet = () => {
    if (!window.confirm("Forget the saved encrypted wallet from this browser? Funds remain on-chain, but this app cannot sign with that address unless you saved the wallet elsewhere.")) {
      return;
    }
    forgetPersistedWallet();
    setTestingWallet(createTestingWallet());
    setBnbBalance("");
    setTokenBalance("");
    setWalletPassword("");
    setWalletStatus("Saved wallet forgotten. New unsaved wallet generated.");
  };

  const updateSafety = <K extends keyof SafetySettings>(key: K, value: SafetySettings[K]) => {
    setSafety((current) => {
      const next = { ...current, [key]: value };
      if (key === "dryRunOnly" && value === true) next.allowLiveTransactions = false;
      if (key === "allowLiveTransactions" && value === true) next.dryRunOnly = false;
      return next;
    });
  };

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>BSC Token Diagnostic Toolkit</h1>
          <p>Closed-source token behavior testing with dry-run defaults and JSON evidence.</p>
        </div>
        <div className="network-pill">BSC · {getRpcUrlLabel()}</div>
      </header>

      <Section title="Target Token">
        <div className="target-row">
          <label className="field wide">
            <span>Token contract address</span>
            <input value={targetAddress} onChange={(event) => setTargetAddress(event.target.value)} placeholder="0x..." />
          </label>
          <button className="primary" onClick={validateAndDiscover} disabled={isDiscovering}>
            <Search size={18} />
            {isDiscovering ? "Discovering" : "Validate"}
          </button>
        </div>
        {addressError && <div className="warning">{addressError}</div>}
        <div className="data-grid">
          <Data label="Name" value={discovery.token?.name} />
          <Data label="Symbol" value={discovery.token?.symbol} />
          <Data label="Decimals" value={discovery.token?.decimals?.toString()} />
          <Data label="Total supply" value={discovery.token?.totalSupply} />
          <Data label="Owner" value={discovery.token?.owner} />
          <Data label="Contract status" value={discovery.token?.contractStatus} />
        </div>
      </Section>

      <Section title="Auto-Discovery">
        <div className="data-grid">
          <Data label="Router" value={effectiveDiscovery.routers[0]?.value} confidence={effectiveDiscovery.routers[0]?.confidence} />
          <Data label="Factory" value={effectiveDiscovery.factories[0]?.value} confidence={effectiveDiscovery.factories[0]?.confidence} />
          <Data label="WBNB" value={effectiveDiscovery.quoteTokens.find((token) => token.label === "WBNB")?.value} />
          <Data label="Official pair" value={effectiveDiscovery.pairs[0]?.address} confidence={effectiveDiscovery.pairs[0]?.confidence} />
          <Data label="Token/WBNB pair" value={effectiveDiscovery.pairs.find((pair) => pair.quoteSymbol === "WBNB")?.address} />
          <Data label="Token/USDT pair" value={effectiveDiscovery.pairs.find((pair) => pair.quoteSymbol === "USDT")?.address} />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pair</th>
                <th>Quote</th>
                <th>Token reserve</th>
                <th>Quote reserve</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {effectiveDiscovery.pairs.map((pair) => (
                <tr key={pair.address}>
                  <td>{shorten(pair.address)}</td>
                  <td>{pair.quoteSymbol}</td>
                  <td>{pair.tokenReserve ?? "unknown"}</td>
                  <td>{pair.quoteReserve ?? "unknown"}</td>
                  <td>{pair.confidence}</td>
                </tr>
              ))}
              {!effectiveDiscovery.pairs.length && (
                <tr>
                  <td colSpan={5}>No pairs discovered yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
          <summary>Advanced settings</summary>
          <div className="override-grid">
            {["router", "factory", "officialPair", "wbnb", "usdt"].map((key) => (
              <label className="field" key={key}>
                <span>{key}</span>
                <input
                  value={manualOverrides[key] ?? ""}
                  onChange={(event) => setManualOverrides((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder="Optional override"
                />
              </label>
            ))}
          </div>
          {manualOverrideIssues.length > 0 && <div className="warning">{manualOverrideIssues.join(" ")}</div>}
        </details>
      </Section>

      <Section title="Funding Wallet">
        <div className="wallet-line">
          <Wallet size={20} />
          <code>{testingWallet.address}</code>
          <AddressValidity address={testingWallet.address} />
          <button title="Copy funding address" onClick={() => copyAddress(testingWallet.address)}>
            <Copy size={17} />
            Copy address
          </button>
          <button
            title="Generate new wallet"
            onClick={generateNewWallet}
          >
            <RefreshCcw size={17} />
          </button>
        </div>
        <p className="muted">
          Save this wallet encrypted before funding if you want to reuse the same address after refreshes or future app launches. Fund only
          this address on BNB Smart Chain.
        </p>
        {copiedAddress === testingWallet.address && <div className="notice">Funding address copied exactly.</div>}
        <div className="data-grid">
          <Data label="BNB balance" value={bnbBalance || "not checked"} />
          <Data label="Token balance" value={tokenBalance || "not checked"} />
          <Data label="Required funding" value="0.004 BNB" />
          <Data label="Wallet status" value={testingWallet.persisted ? (testingWallet.locked ? "saved, locked" : "saved, unlocked") : "unsaved"} />
        </div>
        <div className="wallet-vault">
          <label className="field">
            <span>Wallet password</span>
            <input
              type="password"
              value={walletPassword}
              onChange={(event) => setWalletPassword(event.target.value)}
              placeholder="Required to save or unlock"
              autoComplete="current-password"
            />
          </label>
          <div className="button-row">
            <button onClick={saveWallet} disabled={!testingWallet.wallet || walletPassword.length < 12}>
              Save encrypted wallet
            </button>
            <button onClick={unlockWallet} disabled={!testingWallet.locked || !walletPassword}>
              Unlock saved wallet
            </button>
            <button onClick={forgetWallet} disabled={!testingWallet.persisted}>
              Forget saved wallet
            </button>
          </div>
          {walletStatus && <div className="notice">{walletStatus}</div>}
        </div>
        <div className="address-list" aria-label="Generated actor addresses">
          <span>Generated actors</span>
          {testingWallet.alternateActors.map((address, index) => (
            <div className="address-row" key={address}>
              <strong>Actor {index + 1}</strong>
              <code>{address}</code>
              <AddressValidity address={address} />
              <button title={`Copy actor ${index + 1} address`} onClick={() => copyAddress(address)}>
                <Copy size={17} />
              </button>
            </div>
          ))}
          <p className="muted">Generated actors are test recipients. Do not fund them unless a test explicitly requires it.</p>
        </div>
        <div className="button-row">
          <button onClick={() => refreshBalances()}>
            <RefreshCcw size={17} />
            Refresh balance
          </button>
          <span className="notice">
            <AlertTriangle size={16} />
            Tiny test amounts only.
          </span>
        </div>
      </Section>

      <Section title="Safety Settings">
        <div className="toggle-grid">
          <Toggle label="Dry run only" checked={safety.dryRunOnly} onChange={(checked) => updateSafety("dryRunOnly", checked)} />
          <Toggle
            label="Allow live transactions"
            checked={safety.allowLiveTransactions}
            onChange={(checked) => updateSafety("allowLiveTransactions", checked)}
          />
          <Toggle label="Allow buy tests" checked={safety.allowBuyTests} onChange={(checked) => updateSafety("allowBuyTests", checked)} />
          <Toggle label="Allow sell tests" checked={safety.allowSellTests} onChange={(checked) => updateSafety("allowSellTests", checked)} />
          <Toggle
            label="Allow direct transfer tests"
            checked={safety.allowDirectTransferTests}
            onChange={(checked) => updateSafety("allowDirectTransferTests", checked)}
          />
          <Toggle
            label="Allow transfer to pair tests"
            checked={safety.allowTransferToPairTests}
            onChange={(checked) => updateSafety("allowTransferToPairTests", checked)}
          />
          <Toggle
            label="Allow custom pair tests"
            checked={safety.allowCustomPairTests}
            onChange={(checked) => updateSafety("allowCustomPairTests", checked)}
          />
          <Toggle
            label="Allow approval tests"
            checked={safety.allowApprovalTests}
            onChange={(checked) => updateSafety("allowApprovalTests", checked)}
          />
          <Toggle
            label="Allow contract executor tests"
            checked={safety.allowContractExecutorTests}
            onChange={(checked) => updateSafety("allowContractExecutorTests", checked)}
          />
          <Toggle
            label="Allow contract deployment"
            checked={safety.allowContractDeployment}
            onChange={(checked) => updateSafety("allowContractDeployment", checked)}
          />
          <Toggle
            label="Stop on first failure"
            checked={safety.stopOnFirstFailure}
            onChange={(checked) => updateSafety("stopOnFirstFailure", checked)}
          />
          <Toggle
            label="Continue after failed simulation"
            checked={safety.continueAfterFailedSimulation}
            onChange={(checked) => updateSafety("continueAfterFailedSimulation", checked)}
          />
          <Toggle
            label="Confirm each live tx"
            checked={safety.requireConfirmationBeforeEachLiveTx}
            onChange={(checked) => updateSafety("requireConfirmationBeforeEachLiveTx", checked)}
          />
        </div>
        <div className="override-grid">
          <label className="field">
            <span>Maximum BNB spend</span>
            <input value={safety.maxBnbSpend} onChange={(event) => updateSafety("maxBnbSpend", event.target.value)} />
          </label>
          <label className="field">
            <span>Maximum token amount per test</span>
            <input
              value={safety.maxTokenAmountPerTest}
              onChange={(event) => updateSafety("maxTokenAmountPerTest", event.target.value)}
            />
          </label>
        </div>
      </Section>

      <Section title="Test Plan">
        <div className="plan-list">
          {plan.map((item) => (
            <div className="plan-item" key={item.testId}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.category}</span>
              </div>
              <div className={`status ${item.status}`}>{item.status === "pending" ? item.callType : item.status}</div>
              <p>{item.skipReason || `${item.requiresLive ? "Live-gated" : "Read/simulation"} · est. ${item.estimatedBnbSpend} BNB`}</p>
            </div>
          ))}
        </div>
        <button className="primary run" onClick={startRun} disabled={isRunning || !checksumTarget}>
          <Play size={18} />
          {isRunning ? "Running" : "Start Test Run"}
        </button>
      </Section>

      <Section title="Live Progress">
        <div className="data-grid">
          <Data label="Current test" value={currentTest?.name ?? "idle"} />
          <Data label="Status" value={currentTest?.status ?? "idle"} />
          <Data label="Transaction hash" value={currentTest?.txHash} />
          <Data label="Revert reason" value={currentTest?.revert.reason} />
          <Data label="Balance changes" value={Object.keys(currentTest?.balancesAfter ?? {}).length.toString()} />
          <Data label="Event summary" value={`${currentTest?.events.length ?? 0} event(s)`} />
        </div>
      </Section>

      <Section title="Insights">
        <div className="insight-list">
          {(log?.insights ?? []).map((insight) => (
            <div className="insight" key={`${insight.type}-${insight.supportingTestIds.join("-")}`}>
              <div>
                <ShieldCheck size={18} />
                <strong>{insight.type}</strong>
                <span>{insight.confidence}</span>
              </div>
              <p>{insight.explanation}</p>
              <code>{insight.supportingTestIds.join(", ") || "no supporting tests yet"}</code>
            </div>
          ))}
          {!log?.insights.length && <p className="muted">Insights appear after a run completes.</p>}
        </div>
      </Section>

      <Section title="JSON Log">
        <div className="button-row">
          <button onClick={copyJson}>
            <Clipboard size={17} />
            Copy JSON
          </button>
          <button onClick={downloadJson}>
            <Download size={17} />
            Download JSON
          </button>
          <button onClick={resetRun}>
            <RotateCcw size={17} />
            Reset run
          </button>
        </div>
        <pre>{jsonPreview}</pre>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="section-inner">
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Data({ label, value, confidence }: { label: string; value?: string; confidence?: string }) {
  return (
    <div className="datum">
      <span>{label}</span>
      <strong title={value}>{value || "unknown"}</strong>
      {confidence && <em>{confidence}</em>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function AddressValidity({ address }: { address: string }) {
  const valid = isValidAddress(address);
  return <span className={`validity ${valid ? "valid" : "invalid"}`}>{valid ? "valid" : "invalid"}</span>;
}

function shorten(value?: string) {
  if (!value) return "unknown";
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function getManualOverrideIssues(overrides: Record<string, string>): string[] {
  return Object.entries(overrides)
    .filter(([, value]) => value.trim() && !isValidAddress(value.trim()))
    .map(([key]) => `${key} override is not a valid EVM address.`);
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

function applyManualOverrides(discovery: DiscoveryState, overrides: Record<string, string>): DiscoveryState {
  const normalize = (value?: string) => {
    if (!value) return "";
    const validation = validateAddress(value);
    return validation.checksum ?? "";
  };

  const router = normalize(overrides.router);
  const factory = normalize(overrides.factory);
  const officialPair = normalize(overrides.officialPair);
  const wbnb = normalize(overrides.wbnb);
  const usdt = normalize(overrides.usdt);

  const routers = router
    ? [{ label: "Manual router override", value: router, confidence: "medium" as const, source: "manual override" }, ...discovery.routers]
    : discovery.routers;
  const factories = factory
    ? [{ label: "Manual factory override", value: factory, confidence: "medium" as const, source: "manual override" }, ...discovery.factories]
    : discovery.factories;
  const quoteTokens = discovery.quoteTokens.map((item) => {
    if (item.label === "WBNB" && wbnb) return { ...item, value: wbnb, confidence: "medium" as const, source: "manual override" };
    if (item.label === "USDT" && usdt) return { ...item, value: usdt, confidence: "medium" as const, source: "manual override" };
    return item;
  });
  const hasOfficialPair = officialPair && discovery.pairs.some((pair) => pair.address.toLowerCase() === officialPair.toLowerCase());
  const pairs =
    officialPair && !hasOfficialPair
      ? [
          {
            address: officialPair,
            quoteToken: wbnb || discovery.quoteTokens.find((token) => token.label === "WBNB")?.value || "",
            quoteSymbol: "WBNB",
            confidence: "medium" as const,
            source: "manual override"
          },
          ...discovery.pairs
        ]
      : discovery.pairs;

  return { ...discovery, routers, factories, quoteTokens, pairs };
}
