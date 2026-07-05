# BSC Token Diagnostic Toolkit

A browser-based diagnostic app for closed-source BSC tokens. It starts from a single required input, the target token contract address, then discovers token metadata, common PancakeSwap infrastructure, likely pairs, reserves, selectors, readable config, and a safe test plan.

The app defaults to dry-run/read-only behavior. Live transactions, sell tests, pair transfers, custom pair behavior, approvals, contract executor tests, and deployment-style tests are individually gated.

## Setup

```bash
npm install
npm run dev
```

Optional RPC configuration:

```bash
VITE_BSC_RPC_URL=https://your-bsc-rpc.example npm run dev
```

If `VITE_BSC_RPC_URL` is not set, the app uses a public BSC RPC endpoint. For serious testing, use your own RPC provider.

## Usage

1. Enter the target token contract address.
2. Click validate/discover.
3. Review metadata, router/factory discovery, pairs, reserves, and confidence labels.
4. Save the generated testing wallet encrypted before funding if you want to reuse the same address later.
5. Fund the generated testing wallet with a tiny amount if live tests are needed. The default funding target and spend cap are `0.004 BNB`.
6. Keep dry-run enabled unless you intentionally enable live transactions.
7. Click **Start Test Run**.
8. Review progress, insights, and the JSON log.
9. Copy or download the JSON evidence file.

The generated testing wallet private key is never printed in the UI, logs, console output, or exported JSON. To reuse a funded address across refreshes or future app launches, save the wallet from the Funding Wallet panel. The app stores only encrypted wallet JSON in browser local storage and keeps the wallet locked until you enter the wallet password again. A locked saved wallet can still be used for balance checks, read-only tests, and simulations; live transactions require unlocking.

## Safety Defaults

- Dry-run is enabled by default.
- Live transactions require explicit opt-in.
- Sell tests require a separate opt-in.
- Transfer-to-pair, custom pair, approval, contract executor, and deployment tests each require separate toggles.
- Every transaction-style test attempts simulation first.
- The runner tracks estimated live BNB spend and refuses to exceed the configured cap.
- Failed and skipped tests are logged with reasons.

## JSON Output

The exported log contains:

- run metadata and network details
- token/router/factory/pair discovery
- generated actors and address decisions
- baseline balances, allowances, reserves, block, and timestamp
- the test plan
- every read, simulation, transaction, revert, event, and balance delta
- inferred restriction insights with supporting test IDs
- a final strategy matrix and open questions

Use the `testId` references in insights to trace each conclusion back to the underlying call or transaction.
