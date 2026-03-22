# Synthetic

**The operating system for onchain companies.**

Starting a company is broken. It takes weeks of paperwork, thousands in legal fees, and hiring people you can't yet afford. Most ideas die before they ever launch — not because they're bad, but because the barrier to starting is too high.

Synthetic changes that. Describe your business in one sentence, and we deploy a fully operational company in under a minute — staffed by autonomous AI agents, verified onchain, and ready to transact.

No lawyers. No payroll. No waiting. Just launch.

---

## The Problem

Starting a business today means:

- **Hiring is expensive.** Even a small team costs $10K–$50K/month before you've earned a dollar.
- **Setup takes weeks.** Legal registration, bank accounts, identity verification — all before you can do real work.
- **You can't experiment.** There's no way to "try out" running a company without committing serious capital upfront.
- **AI agents exist, but they can't operate as a business.** They have no identity, no spending limits, and no accountability. You can't trust them with money.

The result: most founders never start, and those who do burn through runway before finding product-market fit.

## The Solution

Synthetic lets anyone bootstrap and run a company in minutes.

1. **Describe your idea** — "I want to start a social media agency" or "DeFi lending protocol"
2. **We generate the team** — A full org chart of AI agents with defined roles, capabilities, and reporting structure
3. **Deploy in one click** — Your company is live with a treasury, verified identity, and spending policies
4. **Agents start working** — They can execute tasks, manage budgets, swap tokens, and transact with real money on Celo

Think of it as a flight simulator for entrepreneurship. You get to experience running a company — with real onchain execution — before committing your life savings to it.

---

## How It Works

### 1. Describe

Type a one-sentence business idea. Synthetic generates a role-based agent blueprint tailored to your industry — social media, DeFi, e-commerce, consulting, or any custom idea.

### 2. Deploy

One click creates your company: agents are hired, a treasury wallet is generated, and the org structure is live. Every company includes a Main Operator (CEO) and a DeFi Operator for financial operations.

### 3. Trust

Before agents can touch money, they go through a trust pipeline:

- **Self Protocol verification** — The main operator proves its identity via Self Protocol, ensuring no anonymous actors
- **ERC-8004 registration** — The agent gets an onchain identity anchor, creating a permanent, auditable record
- **Delegation policies** — Spending is bounded: per-transaction limits, daily caps, and approved recipient lists

### 4. Transact

Agents execute real operations on Celo:

- **cUSD payments** — Stablecoin transfers with full audit trail
- **Token swaps** — Uniswap V3 integration for swapping between CELO, cUSD, USDC, and USDT
- **Budget management** — Per-agent spend limits with real-time tracking
- **x402 payments** — Agents pay for external API services using the x402 protocol

Every transaction is onchain, verifiable, and tied to a trusted identity.

---

## Key Features

| Feature | Description |
| --- | --- |
| Prompt-to-Company | Describe a business, get a deployed agent team in seconds |
| Multi-Agent Teams | Auto-generated org charts with CEO, DeFi operator, and domain specialists |
| Self Protocol Identity | Main operator verified before any sensitive operations |
| ERC-8004 Onchain ID | Permanent identity anchor on Celo for accountability |
| Treasury & Budgets | Company wallet with per-agent spend limits and audit trail |
| DeFi Operations | Token swaps via Uniswap V3 on Celo (CELO, cUSD, USDC, USDT) |
| Delegation Policies | Bounded spending: max per tx, per day, per week, approved recipients |
| Agent Command Center | Chat with agents, assign tasks, run autonomous workflows |
| x402 Payments | Agents pay for external APIs using the x402 payment protocol |
| Activity Feed | Full timeline of agent actions, tool calls, and transactions |

---

## Architecture

```text
User (Wallet + Prompt)
        |
   [Next.js Frontend]
        |
   [Paperclip Orchestration]
     /     |      \
  Agents  Tasks  Governance
     |
   [Trust Layer]
   - Self Protocol (identity verification)
   - ERC-8004 (onchain identity registration)
   - Delegation (bounded spending policies)
     |
   [Payments Layer]
   - Celo stablecoin transfers (cUSD)
   - Uniswap V3 swaps (CELO/cUSD/USDC/USDT)
   - x402 paid API calls
   - Treasury with per-agent budgets
```

---

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Blockchain**: Celo Mainnet, Viem
- **Agent Orchestration**: Paperclip
- **Identity**: Self Protocol, ERC-8004
- **DeFi**: Uniswap V3 (SwapRouter02, QuoterV2)
- **Payments**: cUSD stablecoin, x402 protocol
- **Wallet**: MetaMask (Celo network)

---

## Hackathon Track Fit

### Celo — Best Agent on Celo

- Agents execute real cUSD transactions on Celo mainnet
- DeFi agent swaps tokens via Uniswap V3 on Celo
- Full treasury management with onchain audit trail

### Self Protocol

- Main operator identity verified via Self before any spending
- Verification status gates all sensitive operations
- QR-based verification flow integrated in the UI

### ERC-8004 Onchain Identity

- Every company's main operator gets a registered onchain identity
- Identity is tied to all agent actions and transactions
- Permanent accountability record on Celo

### Open Track

- End-to-end product: from idea to running company in under a minute
- Real economic execution, not a mock demo
- Solves a real problem: making entrepreneurship accessible to everyone

---

## Getting Started

```bash
# Clone the repo
git clone <repo-url>
cd synthetic/app

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Fill in: CELO_RPC_URL, OPERATOR_PRIVATE_KEY, CUSD_CONTRACT_ADDRESS,
#          PAPERCLIP_API_KEY, SELF_APP_ID, OPENAI_API_KEY

# Run the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), connect your MetaMask wallet (Celo network), and deploy your first company.

---

## Demo

> Video: _coming soon_

---

## Team

Built at the Celo hackathon.

## License

MIT
