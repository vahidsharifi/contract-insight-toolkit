Below is a **comprehensive testing strategy and logging checklist** for a closed-source BSC token where you want to determine:

* whether it uses whitelist, blacklist, max sell limit, max buy limit, max wallet, pair recognition, router checks, caller checks, `tx.origin`, contract blocking, or other restrictions
* whether B, C, D, E can buy, transfer, LP, route through a pool, or get economic exposure
* whether wallet A’s permission can be used directly or indirectly
* what evidence to log now so you can reason from it later

This is only a testing and logging plan. No code.

The bytecode you attached should be treated as the source of truth for the contract behavior, but because it is closed source, the strategy should rely on **observable behavior, state changes, revert reasons, events, and controlled transaction paths**. 

---

# 0. Safety and scope

Only test this on:

```text id="xbd3zz"
1. A private BSC fork
2. A test environment
3. Tiny live amounts only after fork testing
4. Wallets and contracts you control
```

Do **not** assume a test passed just because one transaction succeeded. Many tokens have time-based, amount-based, cumulative, block-based, pair-based, router-based, or owner-controlled restrictions.

---

# 1. Core idea

For every transfer, buy, sell, and LP action, log the four most important addresses:

```text id="ub7t9o"
tx.origin
msg.sender
from
to
```

Most misunderstandings come from mixing these up.

For token transfers, the contract normally cares about:

```text id="hlbnjb"
from = address whose token balance decreases
to = address whose token balance increases
msg.sender = direct caller of the token contract
tx.origin = original EOA that started the transaction
```

For a DEX buy:

```text id="j6pwy7"
from = liquidity pair
to = buyer or recipient
```

For a DEX sell:

```text id="o6c6oq"
from = seller or spending contract
to = liquidity pair
```

For a new liquidity pool buy:

```text id="31aid1"
from = new pair
to = buyer
```

For adding liquidity:

```text id="f4flk6"
from = LP provider or funding contract
to = pair
```

Your main question becomes:

```text id="y1xwf3"
Which of these addresses does the token restrict?
```

---

# 2. Testing actors

Create a fixed set of test addresses and never reuse roles casually.

| Label | Role                        | Purpose                                      |
| ----- | --------------------------- | -------------------------------------------- |
| A     | Whitelisted wallet          | Known or suspected allowed seller            |
| B     | Normal EOA                  | Ordinary buyer                               |
| C     | Normal EOA                  | Ordinary buyer                               |
| D     | Normal EOA                  | Ordinary buyer                               |
| E     | Normal EOA                  | Ordinary buyer                               |
| O     | Owner/deployer if known     | Check owner-only behavior                    |
| R     | Pancake router              | Usually `0x10ED...` on BSC                   |
| P0    | Official liquidity pair     | Existing token/WBNB or token/USDT pair       |
| P1    | New custom pair             | New pool you create for testing              |
| X     | Simple contract wallet/pool | Contract-controlled actor                    |
| Y     | Proxy/executor contract     | Used to test `msg.sender` versus `tx.origin` |
| Z     | Fresh EOA                   | Clean address with no history                |

For each actor, log:

```text id="zc2aje"
address
EOA or contract
initial BNB balance
initial token balance
known whitelist status
known blacklist status
known exemption status
whether it has ever bought before
whether it has ever sold before
whether it has ever received token before
```

---

# 3. Global log format

Every single test should produce one log entry with this structure.

```text id="g4a1ff"
Test ID:
Date/time:
Block number:
Chain or fork:
Token address:
Router address:
Pair address:
Actor initiating transaction:
tx.origin:
Direct caller:
Token from:
Token to:
Amount in:
Amount out:
Path:
Recipient:
Function called:
Success or fail:
Revert reason:
Gas used:
Events emitted:
Token balance before:
Token balance after:
BNB/WBNB/USDT balance before:
BNB/WBNB/USDT balance after:
Allowance before:
Allowance after:
Pair reserves before:
Pair reserves after:
Limit counters before if readable:
Limit counters after if readable:
Blacklist/whitelist/exempt status if readable:
Notes:
Hypothesis confirmed/rejected:
```

Do not skip failed transactions. Failed transactions are often the most valuable evidence.

---

# 4. Function discovery checklist

Because the contract is closed source, you need to inventory every callable selector.

From the attached bytecode, at minimum there are standard BEP-20/ERC-20 style selectors plus many custom selectors. Treat every unknown selector as potentially important. 

## 4.1 Standard functions to check

| Function                         | Purpose               | What to log                                    |
| -------------------------------- | --------------------- | ---------------------------------------------- |
| `name()`                         | Token name            | Return value                                   |
| `symbol()`                       | Token symbol          | Return value                                   |
| `decimals()`                     | Decimal precision     | Return value                                   |
| `totalSupply()`                  | Supply                | Return value                                   |
| `balanceOf(address)`             | Balances              | For A, B, C, D, E, pair, router, pool          |
| `allowance(owner, spender)`      | Approvals             | Before and after approve                       |
| `approve(spender, amount)`       | Spending permission   | Whether normal wallets can approve             |
| `transfer(to, amount)`           | Direct token movement | Whether transfers are blocked                  |
| `transferFrom(from, to, amount)` | Delegated movement    | Whether A or contracts can move tokens         |
| `owner()`                        | Owner                 | Whether owner exists                           |
| `transferOwnership(address)`     | Owner change          | Only check whether it exists, do not call live |
| `renounceOwnership()`            | Owner removal         | Only check whether it exists, do not call live |

## 4.2 Custom function selector inventory

The bytecode dispatch contains many selectors. Build a table like this for each one:

```text id="so61t3"
selector
guessed signature if known
input types
output type
view or state-changing
owner-only or public
revert reason if unauthorized
storage slots touched
event emitted
behavior summary
```

Selectors visible in the bytecode include at least:

```text id="rbplhv"
0x06fdde03
0x07131087
0x095ea7b3
0x0c545855
0x1178df00
0x1375ed74
0x153b0d1e
0x18160ddd
0x1fb17b79
0x23b872dd
0x313ce567
0x39a32520
0x3abc97e5
0x3af32abf
0x44337ea1
0x52f1edcc
0x537df3b6
0x53d6fd59
0x70a08231
0x715018a6
0x735de9f7
0x8401f8d1
0x8ab1d681
0x8da5cb5b
0x9473d48e
0x95d89b41
0x9a7a23d6
0x9b19251a
0x9d58c972
0xa3b3b808
0xa58da0be
0xa8568769
0xa9059cbb
0xb3406307
0xb62496f5
0xc816841b
0xcd3b691c
0xd5aed6bf
0xdd62ed3e
0xe036aa4b
0xe37ff45c
0xe43252d7
0xf2fde38b
0xf9f92be4
0xfe575a87
```

For each selector, classify it as one of:

```text id="6exu5r"
standard ERC-20
read-only config getter
single-address status getter
mapping getter
limit setter
batch setter
owner-only admin function
router/pair setter
oracle setter
blacklist setter
whitelist/exempt setter
AMM-pair setter
unknown dangerous function
```

---

# 5. Storage and status checklist

For each important address, try to determine whether it belongs to each category.

| Status type            | Address to check              | Why it matters                             |
| ---------------------- | ----------------------------- | ------------------------------------------ |
| Blacklisted sender     | A, B, C, D, E, P0, P1, X      | Sender may be blocked                      |
| Blacklisted recipient  | A, B, C, D, E, P0, P1, X      | Recipient may be blocked                   |
| Whitelisted seller     | A, B, C, D, E, P0, P1, X      | May bypass sell restriction                |
| Exempt from limits     | A, B, C, D, E, P0, P1, X      | May bypass max sell/max transfer           |
| AMM pair recognized    | P0, P1                        | Pair may bypass special logic              |
| Router allowed         | Pancake router, custom router | Router may be blocked or required          |
| Max wallet exempt      | A, P0, P1, X                  | Needed if one address receives many tokens |
| Fee exempt             | A, P0, P1, X                  | Affects transfer and LP economics          |
| Trading enabled exempt | A, P0, P1, X                  | Some tokens block until enabled            |
| Contract exempt        | X, P1                         | Some tokens block contract addresses       |

For each category, log:

```text id="9mew5o"
Can status be read directly?
Can status be changed?
Who can change it?
Does changing it emit event?
Does status affect transfer?
Does status affect buy?
Does status affect sell?
Does status affect LP?
```

---

# 6. Baseline read tests

Before moving tokens, record baseline state.

## 6.1 Token metadata

Log:

```text id="yhsxkx"
name
symbol
decimals
totalSupply
owner
router address if readable
main pair address if readable
oracle address if readable
max sell limit if readable
max buy limit if readable
max wallet if readable
cooldown if readable
trading enabled flag if readable
fee settings if readable
blacklist mapping if readable
whitelist/exempt mapping if readable
AMM pair mapping if readable
```

## 6.2 Balances

Log balances for:

```text id="og0j6z"
A
B
C
D
E
owner
router
official pair
new pair if already created
pool contract
dead address
zero address not as a call target, only for events
```

## 6.3 Pair reserves

For each known pair:

```text id="lovx25"
token reserve
WBNB/USDT reserve
price estimate
LP total supply
LP holders if available
```

---

# 7. Direct transfer tests

These determine whether the token blocks normal movement.

Use very small token amounts.

## 7.1 Transfer matrix

Test:

| From | To | Purpose                                      |
| ---- | -- | -------------------------------------------- |
| A    | B  | Can whitelisted wallet transfer out?         |
| A    | P0 | Can A sell/direct-send to official pair?     |
| A    | P1 | Can A add liquidity to new pair?             |
| B    | A  | Can non-whitelisted wallet move tokens to A? |
| B    | C  | Can normal peer transfer work?               |
| B    | P0 | Can B sell or direct-send to official pair?  |
| B    | P1 | Can B add liquidity to custom pair?          |
| P1   | B  | Can new pair distribute tokens?              |
| X    | A  | Can contract transfer tokens?                |
| X    | P0 | Can contract sell tokens?                    |

For each test, log:

```text id="gfddou"
success/fail
revert reason
whether sender was restricted
whether recipient was restricted
whether amount mattered
whether cumulative limit changed
```

## 7.2 Amount sweep

For each important transfer path, test multiple amount sizes:

```text id="hwo4v5"
0 tokens
1 smallest unit
tiny amount
normal amount
just below suspected limit
exact suspected limit
just above suspected limit
full balance
```

This helps distinguish:

```text id="6dyjqd"
hard blacklist
max transfer limit
max sell limit
max wallet limit
minimum amount restriction
fee-on-transfer behavior
rounding or oracle-based value limit
```

---

# 8. Approval and transferFrom tests

Approval alone does not transfer tokens, but it can reveal whether spending is possible.

## 8.1 Approve tests

Test approvals from:

```text id="hjsq0h"
B approves A
B approves router
B approves pool contract
A approves router
A approves pool contract
P1 cannot approve because pair contract normally has no such action
X approves router if X holds tokens
```

Log:

```text id="cisihc"
approve success/fail
allowance before
allowance after
events emitted
whether approval is restricted
```

## 8.2 transferFrom matrix

Test:

| Token owner | Spender | Recipient | Purpose                         |
| ----------- | ------- | --------- | ------------------------------- |
| B           | A       | A         | Can A pull B’s tokens?          |
| B           | A       | P0        | Can A sell B’s tokens directly? |
| B           | Router  | P0        | Can router sell B’s tokens?     |
| B           | X       | A         | Can pool pull B’s tokens?       |
| B           | X       | P0        | Can pool sell B’s tokens?       |
| A           | Router  | P0        | Normal A sell                   |
| X           | Router  | P0        | Contract-held sell              |

Key log:

```text id="9aj1tf"
Does restriction use token owner/from?
Does restriction use spender/msg.sender?
Does restriction use recipient/to?
Does restriction use tx.origin?
```

Interpretation:

```text id="zu3f5a"
If B -> A via transferFrom fails, B cannot move tokens even through A.
If B -> P0 via A fails but A -> P0 succeeds, restriction is likely from-based.
If B -> P0 via A succeeds, restriction may be spender/caller-based.
```

---

# 9. Buy tests

You need to test buys with different funders and different recipients.

## 9.1 Official pair buy matrix

For each buyer B, C, D, E:

| Funder | Recipient | Purpose                    |
| ------ | --------- | -------------------------- |
| B      | B         | Normal buy                 |
| B      | A         | Buy to whitelisted wallet  |
| B      | X         | Buy to contract pool       |
| B      | P1        | Buy directly into new pair |
| A      | A         | A’s own buy                |
| A      | B         | A funds buy to B           |
| X      | A         | Contract funds buy to A    |
| X      | X         | Contract buys to itself    |

Log:

```text id="7psqpb"
who paid BNB/USDT
who received token
whether buy succeeded
recipient balance before/after
pair reserve changes
whether buy limit is per recipient
whether buy limit is per funder
whether buy limit is per tx.origin
whether buy limit is per router caller
whether contract recipient is blocked
```

## 9.2 Buy amount sweep

For each successful buy route, test:

```text id="y3tnq9"
tiny buy
medium buy
large buy
repeat buys
buy after limit reached
buy from another wallet to same recipient
buy from same wallet to another recipient
```

This determines if the limit is:

```text id="idpslb"
per transaction
per wallet cumulative
per recipient balance
per tx.origin
global per block
global per day
oracle-value based
max wallet based
```

## 9.3 Buy timing tests

Repeat buys across:

```text id="3yjeia"
same block if possible
next block
after 1 minute
after 5 minutes
after 1 hour on fork/time travel
after oracle delay period if applicable
```

This checks for:

```text id="xk3m40"
cooldown
anti-bot windows
launch block restrictions
stale oracle checks
daily limit reset
block-based flags
```

---

# 10. Sell tests

Sell behavior is the most important part.

## 10.1 Official pair sell matrix

| Seller holding token | Caller              | Recipient of BNB | Purpose                           |
| -------------------- | ------------------- | ---------------- | --------------------------------- |
| A                    | A                   | A                | Confirm A can sell                |
| A                    | A                   | B                | Can proceeds go to B?             |
| B                    | B                   | B                | Can normal wallet sell?           |
| B                    | A through allowance | A                | Can A sell B’s tokens?            |
| B                    | A through allowance | B                | Can A sell on B’s behalf?         |
| X                    | X                   | X                | Can contract sell?                |
| X                    | A                   | A                | Can A trigger contract-held sell? |
| P1                   | buyer interaction   | P1/P0            | Can new pair move token out?      |

Log:

```text id="99otvi"
token holder before sell
actual token from
router caller
recipient of output asset
success/fail
revert reason
sell limit counter before/after
whether recipient of BNB matters
whether msg.sender matters
whether tx.origin matters
```

## 10.2 Sell amount sweep

For each route:

```text id="nw4kpa"
tiny sell
medium sell
max allowed suspected sell
just above suspected limit
multiple sells until fail
sell after time delay
sell after receiving more token
```

This identifies:

```text id="d1kxq4"
max sell per transaction
max sell cumulative
oracle-value based sell cap
wallet lifetime sell cap
time-window sell cap
balance percentage cap
```

---

# 11. Transfer restriction classification

After tests, classify the token into one or more of these models.

## 11.1 From-based restriction

Symptoms:

```text id="7nk22s"
A can sell
B cannot sell
A cannot sell B’s tokens with transferFrom
B cannot transfer to A
new pair cannot distribute tokens unless pair is exempt
```

Meaning:

```text id="b3w0u1"
Restriction checks from.
Only the actual token holder/sender matters.
A’s whitelist cannot be lent to B.
```

## 11.2 Caller-based restriction

Symptoms:

```text id="tb8jsl"
B cannot sell directly
A can call transferFrom(B, pair) successfully
pool can move tokens if called by A
```

Meaning:

```text id="qg81g3"
Restriction checks msg.sender.
A may be usable as executor.
```

## 11.3 tx.origin-based restriction

Symptoms:

```text id="u6sgbn"
A can trigger contract to sell
same contract sell triggered by B fails
direct caller is contract in both cases
```

Meaning:

```text id="22net8"
Restriction checks tx.origin.
A may be usable as top-level transaction initiator.
```

## 11.4 Recipient-based restriction

Symptoms:

```text id="kxbeeb"
Buying to A succeeds
Buying to B fails
Transfer to A succeeds
Transfer to B fails
```

Meaning:

```text id="mbin37"
Restriction checks to.
Receiving is permissioned.
```

## 11.5 Pair-based restriction

Symptoms:

```text id="9sgmpw"
Official pair can send tokens out
New pair cannot send tokens out
Sells to official pair behave differently from transfers to EOAs
```

Meaning:

```text id="n1e4qs"
Contract recognizes specific AMM pairs.
New pools need pair status or exemption.
```

## 11.6 Router-based restriction

Symptoms:

```text id="3xx1yw"
Pancake router works
Custom router fails
Direct pair interaction fails
Same from/to path differs by router
```

Meaning:

```text id="jhxtu7"
Contract checks router or direct caller.
```

## 11.7 Max-wallet or buy-limit restriction

Symptoms:

```text id="4onsac"
Buying to A works until A balance reaches threshold
Other funders buying to A fail after threshold
Buying to B works separately
```

Meaning:

```text id="wh6ya1"
Limit likely applies to recipient balance or recipient cumulative buys.
```

## 11.8 Cumulative sell-limit restriction

Symptoms:

```text id="7l42hg"
First sell succeeds
Repeated sells fail after total threshold
Time delay may or may not reset
```

Meaning:

```text id="imq3tv"
Limit counter is accumulated per address.
```

---

# 12. Liquidity pool tests

This directly addresses your custom BNB/token pool idea.

## 12.1 New pair creation checklist

Log:

```text id="s0wkh8"
factory used
token0
token1
pair address
pair created by whom
whether token contract recognizes pair
whether owner must mark pair as AMM
whether pair is blacklisted
whether pair is exempt
```

## 12.2 Add liquidity tests

Test these paths:

| Token source       | BNB source | LP recipient | Purpose                                |
| ------------------ | ---------- | ------------ | -------------------------------------- |
| A                  | A          | A            | Can A create pool?                     |
| A                  | B          | B            | Can B fund BNB while A supplies token? |
| B                  | B          | B            | Can B create pool from held tokens?    |
| X                  | X          | X            | Can contract pool create liquidity?    |
| Buy directly to P1 | B          | B            | Can B avoid holding token?             |

Log:

```text id="lplxsz"
token transfer into pair success/fail
BNB/WBNB transfer into pair success/fail
mint LP success/fail
LP recipient
reserves after mint
whether pair can later transfer token out
```

## 12.3 Buying from new pair

Once P1 has liquidity, test:

| Buyer | Pair | Recipient | Purpose                        |
| ----- | ---- | --------- | ------------------------------ |
| Z     | P1   | Z         | Normal user buys from new pool |
| B     | P1   | B         | B buys from own pool           |
| A     | P1   | A         | A buys from new pool           |
| X     | P1   | X         | Contract recipient             |

Critical log:

```text id="h5sxu2"
Does token move from P1 to buyer?
Does P1 hit sell/transfer limit?
Is P1 treated as AMM?
Does buyer receive full amount?
Does buy from P1 fail while buy from P0 succeeds?
```

Interpretation:

```text id="f512jq"
If P1 cannot send token out, custom pool is unusable.
If P1 can send token out only up to a limit, pool has limited usefulness.
If P1 is unrestricted, custom pool may work.
```

## 12.4 Selling into new pair

Test:

| Seller | Pair | Purpose                                  |
| ------ | ---- | ---------------------------------------- |
| A      | P1   | Can A sell into custom pool?             |
| B      | P1   | Can B sell into custom pool?             |
| X      | P1   | Can pool/contract sell into custom pool? |

Log:

```text id="8dfhwo"
seller token balance before/after
pair token reserve before/after
output BNB
revert reason
whether sell into P1 differs from P0
```

## 12.5 Removing liquidity

Test carefully.

| LP holder | Pair | Purpose                        |
| --------- | ---- | ------------------------------ |
| A         | P1   | Can A remove liquidity?        |
| B         | P1   | Can B remove liquidity?        |
| X         | P1   | Can contract remove liquidity? |

Log:

```text id="lq7fd1"
LP burned
BNB received
TOKEN received
whether token transfer from pair to LP holder succeeds
whether received token becomes trapped
whether removal fails because recipient is not allowed
```

Important: even if B can earn LP value, removing liquidity may give B both BNB and token. If B cannot transfer the token, B may get stuck with token exposure.

---

# 13. Pool and synthetic exposure tests

If B/C/D/E should not hold the token, test a synthetic accounting structure conceptually.

## 13.1 BNB-only pool model

Test manually:

```text id="9eqmkk"
B deposits BNB/USDT into accounting pool
A buys token to A
A sells token from A
proceeds are accounted back to B
```

Log:

```text id="fbn266"
who holds token
who holds BNB
who has claim
can A sell full amount
does A hit max wallet
does A hit buy limit
does A hit cumulative sell limit
```

## 13.2 Contract-held token model

Test:

```text id="9mffn4"
pool contract buys token to itself
pool contract tries to sell
A triggers pool sell
B triggers pool sell
```

Log:

```text id="fbhwl1"
does pool receive token
does pool sell
does A triggering matter
does tx.origin matter
does msg.sender matter
does from address matter
```

Interpretation:

```text id="i4ri2l"
If A-triggered pool sell succeeds but B-triggered fails, tx.origin may matter.
If pool sell fails regardless of trigger, from-based restriction likely blocks the pool.
If pool sell succeeds regardless of trigger, pool may be exempt or unrestricted.
```

---

# 14. Contract versus EOA tests

Many tokens block contracts.

## 14.1 Receiving test

| Recipient  | Buy to recipient | Direct transfer to recipient |
| ---------- | ---------------- | ---------------------------- |
| EOA B      | yes/no           | yes/no                       |
| Contract X | yes/no           | yes/no                       |
| Pair P1    | yes/no           | yes/no                       |

Log:

```text id="bupn9z"
does recipient code size matter?
does buying to a contract fail?
does transferring to a contract fail?
does pair contract get special treatment?
```

## 14.2 Sending test

| Sender     | Transfer out | Sell   |
| ---------- | ------------ | ------ |
| EOA A      | yes/no       | yes/no |
| EOA B      | yes/no       | yes/no |
| Contract X | yes/no       | yes/no |
| Pair P1    | yes/no       | yes/no |

Log:

```text id="yvinh3"
does sender code size matter?
does msg.sender being contract matter?
does from being contract matter?
```

---

# 15. Router and path tests

Test whether the token only works with a specific router or pair.

## 15.1 Router comparison

Use the same economic path through different callers if possible:

```text id="uww2m4"
Pancake router
direct pair swap
custom router
contract executor using Pancake router
```

Log:

```text id="b8pw2f"
router address
actual direct caller to token
success/fail
revert reason
output amount
```

## 15.2 Path comparison

Test:

```text id="ww1s8u"
BNB -> TOKEN
USDT -> TOKEN
BNB -> USDT -> TOKEN
TOKEN -> BNB
TOKEN -> USDT
TOKEN -> USDT -> BNB
```

Log:

```text id="mxsubh"
which pair sent token
which pair received token
whether multi-hop changes behavior
whether intermediate pair is blocked
```

---

# 16. Limit and counter tests

A token may not have a normal whitelist. It may have counters.

## 16.1 Max sell limit

For each address:

```text id="6tsumw"
A
B
C
D
E
P1
X
```

Log:

```text id="q6eegi"
starting counter if readable
sell amount
counter after sell
does counter count token amount or USD/BNB value?
does counter reset?
does failed sell change counter?
```

## 16.2 Max buy limit

Test whether limit is based on:

```text id="kzge0m"
recipient
funder
tx.origin
msg.sender
pair
block
wallet balance
cumulative buys
```

Evidence to collect:

```text id="f54p7q"
B buys to B
C buys to B
B buys to C
A buys to B
B buys to A
repeated buys to same recipient
repeated buys from same funder
```

## 16.3 Max wallet

Test:

```text id="g3rb2u"
buy to A until balance threshold
buy to B until balance threshold
transfer to A above threshold
transfer to P1 above threshold
buy directly to P1 above threshold
```

Log whether failure depends on:

```text id="7bp9kn"
recipient current balance
recipient cumulative buy amount
transaction amount only
```

## 16.4 Reset behavior

Repeat after:

```text id="oefybp"
next block
several blocks
1 minute
5 minutes
1 hour
24 hours on fork
owner/admin action if applicable
```

Log:

```text id="t7qyga"
does limit reset?
what variable appears time-dependent?
does oracle stale delay matter?
```

---

# 17. Blacklist tests

You may not be able to change blacklist status, but you can infer its effect.

## 17.1 Sender blacklist behavior

Symptoms:

```text id="6crpgk"
address cannot transfer out
address cannot sell
address can still receive
address can still approve
```

Test:

```text id="5a4g2c"
B transfers to A
B sells
B approves A
A pulls from B
```

## 17.2 Recipient blacklist behavior

Symptoms:

```text id="9i1ulu"
address cannot receive token
buy to address fails
transfer to address fails
sell proceeds may still work if output is BNB
```

Test:

```text id="vyazbn"
A transfers to B
buy to B
buy to P1
transfer to P1
```

## 17.3 Pair/router blacklist behavior

Symptoms:

```text id="wp5blp"
official router blocked
custom router blocked
new pair blocked
official pair allowed
```

Log:

```text id="7pqxly"
which contract address caused revert
whether revert says sender or recipient
```

---

# 18. Whitelist and exemption tests

Do not assume “whitelist” means one thing. It may mean any of:

```text id="766xp6"
can sell
can receive
can transfer
fee exempt
limit exempt
blacklist exempt
trading-start exempt
max-wallet exempt
oracle-limit exempt
contract-block exempt
```

## 18.1 A’s special permission profile

Test A for:

```text id="7v10kd"
buy to A
transfer A -> B
transfer B -> A
sell A -> official pair
sell A -> new pair
add liquidity A -> P1
remove liquidity to A
approve router
approve pool
A pulls from B
A sells B’s tokens
A triggers contract-held sell
```

For each, log whether A’s advantage applies to:

```text id="k5f1ca"
A as from
A as to
A as msg.sender
A as tx.origin
A as spender
A as output recipient
```

This is the most important identity test.

---

# 19. `msg.sender`, `tx.origin`, `from`, `to` identity tests

This section tells you exactly what the contract checks.

## 19.1 Identity matrix

| Scenario                            | tx.origin | msg.sender to token | from | to    |
| ----------------------------------- | --------- | ------------------- | ---- | ----- |
| A direct transfer to B              | A         | A                   | A    | B     |
| A sells via router                  | A         | Router/token path   | A    | Pair  |
| B sells via router                  | B         | Router/token path   | B    | Pair  |
| A transferFrom B to A               | A         | A or contract       | B    | A     |
| A triggers pool to sell pool tokens | A         | Pool/router         | Pool | Pair  |
| B triggers pool to sell pool tokens | B         | Pool/router         | Pool | Pair  |
| B buys token to A                   | B         | Pair/router path    | Pair | A     |
| B buys token to P1                  | B         | Pair/router path    | Pair | P1    |
| Buyer buys from P1                  | buyer     | P1/router path      | P1   | buyer |

For each test, log the result and ask:

```text id="d4b6rq"
Did changing tx.origin change outcome?
Did changing msg.sender change outcome?
Did changing from change outcome?
Did changing to change outcome?
```

Conclusion rules:

```text id="sptlld"
Only changing from changes outcome => from-based restriction
Only changing to changes outcome => recipient-based restriction
Only changing msg.sender changes outcome => caller-based restriction
Only changing tx.origin changes outcome => tx.origin-based restriction
Only changing pair changes outcome => pair-based restriction
```

---

# 20. Fee and tax tests

Some restrictions look like failures but are actually high fees.

## 20.1 Transfer fee test

For each successful transfer:

```text id="aypbav"
sender balance decrease
recipient balance increase
difference
fee recipient if any
burn amount if any
events emitted
```

## 20.2 Buy tax test

For each buy:

```text id="23onbb"
expected token output from reserves
actual token received
difference
pair reserve change
fee wallet balance change
burn address balance change
```

## 20.3 Sell tax test

For each sell:

```text id="03sv1n"
token sent
expected BNB output
actual BNB received
fee wallet movement
contract token balance movement
liquidity movement
```

Look for:

```text id="v0gp0h"
different tax for A versus B
different tax for buy versus sell
different tax for pair P0 versus P1
different tax for EOA versus contract
```

---

# 21. Oracle and price-dependent tests

The attached bytecode appears to include oracle-like logic and value calculations, so log price-related behavior carefully. 

Check whether sell limits are based on:

```text id="mrvpje"
raw token amount
BNB value
USD value
oracle price
pair reserve price
```

## 21.1 Price sensitivity tests

For the same token amount, compare:

```text id="go8c59"
sell when token price is low
sell when token price is high
transfer when token price is low
transfer when token price is high
```

Log:

```text id="ag2egy"
oracle latest answer
oracle updatedAt
current block timestamp
pair reserves
computed approximate USD value
whether revert threshold follows token amount or value
```

## 21.2 Stale oracle tests

Log:

```text id="xlcbce"
does transaction fail when oracle data is stale?
what is stale delay if readable?
does owner-set delay exist?
does buy fail or only sell/transfer?
```

---

# 22. Event log checklist

For every transaction, capture all events, not just `Transfer`.

Look for events indicating:

```text id="15eorh"
OwnershipTransferred
Approval
Transfer
BlacklistUpdated
WhitelistUpdated
ExemptUpdated
AMMPairUpdated
RouterUpdated
PairUpdated
MaxSellLimitUpdated
MaxBuyLimitUpdated
OracleUpdated
OracleDelayUpdated
FeesUpdated
TradingEnabled
LimitUsed
```

Even if event names are unknown, log:

```text id="4r0yov"
event topic0
indexed address fields
raw data
which transaction emitted it
which function emitted it
```

Unknown events can later reveal function purpose.

---

# 23. Admin function checklist

Do not call dangerous admin functions on live unless you own the token. But identify them.

For each state-changing custom function, check:

```text id="dx8v3x"
Does non-owner call revert?
Does owner call succeed on fork?
What storage changes?
What event emits?
Does it affect transfer behavior?
Does it affect sell behavior?
Does it affect buy behavior?
```

Potential admin functions to classify:

```text id="6xg5ux"
set router
set pair
set oracle
set oracle delay
set max sell limit
set buy limit
set max wallet
set blacklist
set whitelist
set exemption
set AMM pair
batch blacklist
batch whitelist
enable trading
disable trading
recover tokens
withdraw BNB
transfer ownership
renounce ownership
```

For each function, log:

```text id="n3mk96"
selector
caller used
arguments used
success/fail
revert reason
state before
state after
events
behavior difference after call
```

---

# 24. Revert reason checklist

Every revert reason should be saved exactly.

Classify it:

| Revert type                     | Meaning                         |
| ------------------------------- | ------------------------------- |
| Sender blacklisted              | Restriction on `from`           |
| Recipient blacklisted           | Restriction on `to`             |
| Cannot blacklist router         | Router has special status       |
| Cannot blacklist pair           | Pair has special status         |
| Transfer exceeds max sell limit | Transfer/sell value cap         |
| Total exceeds max sell limit    | Cumulative cap                  |
| Invalid oracle delay            | Oracle config exists            |
| Stale price                     | Oracle freshness matters        |
| No liquidity for pricing        | Pair reserve logic matters      |
| Owner-only custom error         | Admin function                  |
| ERC20 insufficient allowance    | Approval issue, not restriction |
| ERC20 insufficient balance      | Balance issue, not restriction  |

For unknown custom errors, log:

```text id="wf44fc"
4-byte error selector
raw revert data
function that caused it
arguments
```

---

# 25. Specific decision checklist for your custom LP idea

Your idea works only if every required step works.

## 25.1 Required conditions

Check these in order:

```text id="z8rv5m"
1. Can a new token/WBNB pair be created?
2. Can token be delivered into the new pair without B/C/D holding it?
3. Can B/C/D add WBNB/BNB side and receive LP tokens?
4. Can the new pair transfer token out to buyers?
5. Can buyers actually buy from the new pair?
6. Can B/C/D remove liquidity?
7. On removal, can B/C/D receive token?
8. If B/C/D receive token on removal, can they do anything with it?
9. Can LP value be extracted mostly as BNB without trapping token?
10. Does new pair hit sell/transfer limit?
11. Does new pair need to be marked as AMM/exempt?
12. Can only owner mark it?
```

## 25.2 Pass/fail interpretation

| Result                                           | Meaning                               |
| ------------------------------------------------ | ------------------------------------- |
| Buy directly to P1 succeeds                      | Token can be routed into new pair     |
| P1 -> buyer fails                                | Pool cannot function                  |
| P1 -> buyer works only small amount              | Pool limited by max sell/transfer cap |
| P1 -> buyer works repeatedly                     | New pair may be usable                |
| Remove liquidity to B fails                      | LP exit blocked                       |
| Remove liquidity to B succeeds but token trapped | B gets partial exit only              |
| A can remove/sell token side                     | A may be needed as LP custodian       |
| P1 works only after owner marks pair             | Owner permission required             |

---

# 26. Final possibility matrix

After testing, fill this table.

| Strategy                            | Possible? | Evidence               | Bottleneck                     |
| ----------------------------------- | --------: | ---------------------- | ------------------------------ |
| B buys and holds                    |    Yes/No | Buy test               | Sell/transfer restriction      |
| B buys then transfers to A          |    Yes/No | B -> A transfer        | From restriction               |
| B approves A, A pulls tokens        |    Yes/No | transferFrom test      | From/spender restriction       |
| A sells B’s tokens directly         |    Yes/No | transferFrom B -> pair | From/caller restriction        |
| B buys directly to A                |    Yes/No | Buy recipient test     | A max wallet/buy limit         |
| B buys directly to pool contract    |    Yes/No | Buy to X               | Contract recipient restriction |
| Pool contract sells when A triggers |    Yes/No | A-triggered pool sell  | from/msg.sender/tx.origin      |
| B buys directly to new pair P1      |    Yes/No | Buy to P1              | Recipient/pair restriction     |
| Buyers buy from P1                  |    Yes/No | P1 -> buyer            | Pair not exempt                |
| B removes LP from P1                |    Yes/No | Burn LP                | Token return restriction       |
| A holds token, users hold claims    |    Yes/No | A buy/sell tests       | A limit/custody trust          |
| Multiple seller wallets             |    Yes/No | Each wallet sell test  | Need whitelist                 |
| Owner marks P1 as AMM/exempt        |    Yes/No | Admin function test    | Owner control                  |

---

# 27. Minimum test order

To avoid wasting time, run tests in this order.

```text id="yzw4lf"
1. Baseline reads
2. Confirm A can sell
3. Confirm B can buy to B
4. Confirm B can transfer to A
5. Confirm A can transferFrom B to A
6. Confirm A can transferFrom B to pair
7. Confirm B can buy directly to A
8. Confirm A's buy/max-wallet limit
9. Confirm B can buy directly to P1
10. Confirm P1 can transfer token to buyer
11. Confirm P1 can support repeated buys
12. Confirm LP removal behavior
13. Confirm contract pool buy/sell behavior
14. Confirm whether A triggering a contract changes outcome
15. Confirm owner/admin-controlled status changes on fork
```

This order quickly tells you whether the restriction is:

```text id="si7or6"
from-based
to-based
caller-based
tx.origin-based
pair-based
limit-based
blacklist-based
owner-configurable
```

---

# 28. What to log for future insight

Create one master spreadsheet or document with these tabs:

```text id="r638eo"
1. Addresses
2. Function selectors
3. Storage/status guesses
4. Baseline balances
5. Direct transfers
6. Approvals
7. transferFrom tests
8. Buys
9. Sells
10. New pair tests
11. LP add/remove tests
12. Contract pool tests
13. Router/path tests
14. Limits and counters
15. Oracle observations
16. Revert reasons
17. Events
18. Admin functions
19. Final strategy matrix
20. Open questions
```

Each row should include:

```text id="2d1i2f"
test ID
transaction hash
block
actor
from
to
caller
origin
amount
path
recipient
success/fail
revert reason
balance delta
allowance delta
reserve delta
events
current hypothesis
confidence level
next test suggested
```

Confidence levels:

```text id="qaf7hq"
High = repeated tests confirm same rule
Medium = one clear success/fail
Low = inferred from bytecode only
Unknown = not tested
```

---

# 29. Most important conclusions to prove or disprove

These are the big questions your testing should answer.

```text id="wac3mb"
1. Is the sell restriction based on token holder/from?
2. Is A special as from, msg.sender, tx.origin, or recipient?
3. Can B/C/D/E ever move tokens after buying?
4. Can A move B/C/D/E tokens with approval?
5. Can users buy directly to A without hitting A's limit?
6. Is there a buy limit, and is it per recipient or per funder?
7. Is there a max wallet limit?
8. Is there a cumulative sell limit?
9. Does the limit reset over time?
10. Is the official pair exempt?
11. Can a new pair become exempt automatically?
12. Can a new pair send tokens to buyers?
13. Can a new pair receive tokens directly from the official pair?
14. Can LP providers remove liquidity safely?
15. Does a contract pool behave differently from an EOA?
16. Does A triggering a contract transaction matter?
17. Does router choice matter?
18. Does pair choice matter?
19. Does oracle price affect limits?
20. Can owner/admin settings change the outcome?
```

---

# 30. Practical interpretation guide

After the checklist is filled, the likely outcomes are:

## Outcome A: Restriction is from-based

```text id="otncmo"
Only the token holder/sender matters.
A cannot lend its permission.
B/C/D/E cannot escape if they hold tokens.
New pair must itself be exempt to function.
```

## Outcome B: Restriction is caller-based

```text id="e733vf"
A may be able to act as executor.
Approval or contract execution may help.
Need careful transferFrom tests.
```

## Outcome C: Restriction is tx.origin-based

```text id="iy8lyf"
A may be able to trigger contract actions.
This is rare and unsafe design, but possible.
A-triggered versus B-triggered contract tests reveal it.
```

## Outcome D: Restriction is pair-based

```text id="5ytil3"
Official pair works differently from new pair.
Custom LP only works if new pair is recognized/exempt.
```

## Outcome E: Restriction is limit-based, not true whitelist

```text id="50grvg"
Everyone may be able to transfer/sell up to a value cap.
The real question becomes counter size, reset period, and oracle pricing.
```

## Outcome F: Recipient/max-wallet based

```text id="0mb1du"
Buying all tokens to A hits A's cap.
Multiple buyers only help if tokens can later move or if each recipient can sell.
```

The key final line for your current theory:

```text id="ntg2m7"
A custom liquidity pool only works if the token can enter the pool and the pool can later send token out to buyers. Receiving tokens into the pool is not enough.
```
