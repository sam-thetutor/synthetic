# Implementation Plan (1-Day MVP)

This document breaks implementation into phases and includes concrete tests for each phase.

## Goal

Ship a minimal, judge-ready MVP in one day:

1. Prompt to company blueprint
2. One-click deployment of agent company
3. Main operator Self identity
4. Main operator ERC-8004 identity
5. Delegated Celo stablecoin transaction
6. Dashboard proof for all above

## New Feature Track: Treasury Isolation + Spend Controls

This track introduces financial isolation per company so agent actions never spend from a shared deployer wallet.

### Why This Matters

1. Prevent cross-company fund leakage.
2. Make demo/company accounting clean and auditable.
3. Prepare for per-agent spend controls without requiring per-agent wallets yet.

### Phase 1: Data Model + Security Foundation

Scope:
1. Extend trust state with company treasury fields and spend policy schemas.
2. Add encrypted key storage (never store treasury private keys as plaintext).
3. Add default company-level spend policy and placeholder agent policy map.

Planned state additions:
1. `treasuryAddress`
2. `treasuryEncryptedPrivateKey`
3. `treasuryStatus` (`unfunded` | `funded` | `active`)
4. `treasuryCreatedAt`
5. `companySpendPolicy`
6. `agentSpendPolicies`

Exit criteria:
1. New state fields persist in `.trust-state.json`.
2. Private keys are stored encrypted-at-rest only.
3. Existing trust flow continues to function.

### Phase 2: Treasury Generation + Funding Status

Scope:
1. Generate one treasury wallet per company during deploy.
2. Save treasury address + encrypted key in trust state.
3. Return treasury address in deploy response for funding.
4. Add treasury status endpoint for UI integration.
5. Gate payments if treasury is missing or unfunded.

API changes:
1. `POST /api/deploy` returns `treasuryAddress` and `treasuryStatus`.
2. `GET /api/companies/:companyId/treasury` returns:
  - treasury address
  - status
  - live CELO and cUSD balances
  - spend policy snapshot

Funding rule (MVP):
1. Treasury is marked `funded` when cUSD balance is greater than 0.
2. Payment routes should block when status is `unfunded`.

Exit criteria:
1. New companies always get isolated treasury addresses.
2. Treasury data is queryable via API.
3. Payment gating reflects treasury funding state.

## Delivery Principles

1. Build only what is required for demo proof.
2. Every phase ends with a testable artifact.
3. Preserve one golden demo path and never break it.

## Paperclip Overview

Paperclip is an open-source orchestration platform for autonomous AI companies. It is a Node.js server (Express + PGlite) with a React UI that acts as a **control plane** for teams of AI agents. It does not run agents itself; agents run externally and communicate with Paperclip via its REST API.

Key concepts:
- **Company**: top-level container with name, description, budget, status
- **Agent**: belongs to a company; has a role, adapter type, capabilities, reporting hierarchy, and budget
- **Issue**: the unit of work and communication; agents coordinate by creating, claiming, and commenting on issues
- **Goal/Project/Milestone**: hierarchy for organizing work above issues
- **Heartbeat**: agents wake on timer or event triggers to check for and execute work
- **Atomic checkout**: only one agent can claim an issue at a time (database-enforced)
- **Board**: the human governance layer that approves hires, sets budgets, overrides strategy

API base: `http://localhost:3100/api` (default local). Auth: `local_trusted` mode requires no auth for dev. Agents authenticate with bearer API keys created via `POST /api/agents/:agentId/keys`.

Agent roles available: `ceo`, `cto`, `cmo`, `cfo`, `engineer`, `designer`, `pm`, `qa`, `devops`, `researcher`, `general`.

Agent adapter types: `process`, `http`, `claude_local`, `codex_local`, `opencode_local`, `pi_local`, `cursor`, `openclaw_gateway`, `hermes_local`.

## How Paperclip Is Used in Each Phase

This project uses Paperclip as the agent company orchestration layer. The app handles user onboarding and business prompt UX; Paperclip handles agent-company runtime behavior.

### Phase 0 (Setup): Paperclip role

Install and start Paperclip locally:

```bash
npx paperclipai onboard --yes   # bootstraps everything
# OR manual:
git clone https://github.com/paperclipai/paperclip.git
cd paperclip && pnpm install && pnpm dev
```

Server starts at `http://localhost:3100`. Verify with:

```bash
curl http://localhost:3100/api/health
# => {"status":"ok"}
```

Env vars to set in your app:

```
PAPERCLIP_API_URL=http://localhost:3100/api
```

No API key needed in `local_trusted` mode (default for dev).

Verification steps:
1. `GET /api/health` returns `{"status":"ok"}`
2. `GET /api/companies` returns empty array (no companies yet)

### Phase 1 (Blueprint): Paperclip role

Your blueprint generator must output agent definitions that map to Paperclip's `POST /api/companies/:companyId/agents` payload shape:

```json
{
  "name": "Main Operator",
  "role": "ceo",
  "capabilities": "Company operations, payment execution, identity management",
  "adapterType": "http",
  "reportsTo": null
}
```

For each blueprint role, map to one of Paperclip's built-in roles: `ceo` for main operator, `engineer`/`designer`/`researcher`/`cmo`/`pm` for specialist agents.

Every blueprint must include a Main Operator agent with role `ceo` because it anchors Self, ERC-8004, and delegations. Other agents report to it via `reportsTo: <mainOperatorAgentId>`.

The blueprint is just a JSON array at this stage; it does not hit Paperclip yet (that happens in Phase 2 deploy).

### Phase 2 (Deployment): Paperclip role

One-click deploy executes these Paperclip API calls in sequence:

**Step 1: Create company**

```
POST /api/companies
{
  "name": "Social Media Agency",
  "description": "AI-powered social media company generated from prompt"
}
```

Returns `{ "id": "<companyId>", ... }`. Store this ID.

**Step 2: Create agents from blueprint**

For each agent in the blueprint, call:

```
POST /api/companies/:companyId/agents
{
  "name": "Main Operator",
  "role": "ceo",
  "capabilities": "Company operations, payment execution, identity management",
  "adapterType": "http"
}
```

Create the Main Operator first (no `reportsTo`). Then create remaining agents with `"reportsTo": "<mainOperatorAgentId>"`.

**Step 3: Generate API key for Main Operator**

```
POST /api/agents/:mainOperatorAgentId/keys
{ "name": "main-operator-key" }
```

Returns the bearer token. Store it for Phase 4 payment execution.

**Step 4: Create initial coordination goal**

```
POST /api/companies/:companyId/goals
{
  "title": "Launch company operations",
  "level": "company",
  "status": "active"
}
```

**Step 5: Create startup issue assigned to Main Operator**

```
POST /api/companies/:companyId/issues
{
  "title": "Complete trust verification and execute first payment",
  "description": "Verify Self identity, register ERC-8004, set delegation policy, execute stablecoin transfer",
  "priority": "high",
  "assigneeAgentId": "<mainOperatorAgentId>",
  "goalId": "<goalId>"
}
```

Duplicate deploy protection: check `GET /api/companies` for existing company with same name before creating.

### Phase 3 (Trust layer): Paperclip role

Use Paperclip's issue comment system to record trust events as auditable trail:

**When Self verification completes:**

```
POST /api/issues/:issueId/comments
{
  "body": "Self verification completed. Status: verified. Operator identity confirmed."
}
```

**When ERC-8004 registration completes:**

```
POST /api/issues/:issueId/comments
{
  "body": "ERC-8004 identity registered. Registration reference: <ref>. Onchain trust anchor active."
}
```

**Gate payment tasks on trust status:**

If Self is not verified, create the payment issue with status `blocked`:

```
POST /api/companies/:companyId/issues
{
  "title": "Execute delegated stablecoin payment",
  "status": "blocked",
  "assigneeAgentId": "<mainOperatorAgentId>"
}
```

Once verified, update to `todo`:

```
PATCH /api/issues/:paymentIssueId
{
  "status": "todo",
  "comment": "Trust requirements met. Payment unblocked."
}
```

Trust status is also persisted in your app state and shown in the dashboard.

### Phase 4 (Delegated payment): Paperclip role

Main Operator agent claims the payment issue via atomic checkout:

```
POST /api/issues/:paymentIssueId/checkout
{
  "agentId": "<mainOperatorAgentId>",
  "expectedStatuses": ["todo"]
}
```

After your app executes the Celo stablecoin transfer, record the result back:

**On success:**

```
PATCH /api/issues/:paymentIssueId
{
  "status": "done",
  "comment": "Delegated payment executed. Tx hash: 0x... Amount: 0.01 cUSD. Recipient: 0x..."
}
```

**On failure:**

```
PATCH /api/issues/:paymentIssueId
{
  "status": "blocked",
  "comment": "Payment failed: <error>. Will retry."
}
```

Optionally report cost:

```
POST /api/companies/:companyId/cost-events
{
  "agentId": "<mainOperatorAgentId>",
  "amountCents": 1,
  "provider": "celo-stablecoin",
  "model": "delegation-transfer",
  "inputTokens": 0,
  "outputTokens": 0
}
```

### Phase 5 (Demo hardening): Paperclip role

Pull proof data from Paperclip for the evidence dashboard:

```
GET /api/companies/:companyId                    # company status
GET /api/companies/:companyId/agents             # agent list and statuses
GET /api/companies/:companyId/issues             # issues with trust + payment history
GET /api/issues/:issueId/comments                # full audit trail
GET /api/companies/:companyId/activity           # activity log timeline
GET /api/companies/:companyId/dashboard          # dashboard metrics
```

Reset script for repeated demos:

```
DELETE /api/companies/:companyId                 # delete the demo company
```

Then re-run the deploy flow from Phase 2. Since Paperclip uses PGlite locally, this is fast and clean.

The Paperclip UI at `http://localhost:3100` can also be shown as supplementary proof of orchestration (org chart, issue board, activity feed).

## Paperclip Integration Checklist

1. Paperclip running locally at `http://localhost:3100` and `GET /api/health` returns ok
2. `PAPERCLIP_API_URL` env var configured in app
3. Blueprint generator outputs agent objects with `name`, `role`, `capabilities`, `adapterType`
4. Deploy endpoint calls `POST /api/companies` then `POST /api/companies/:id/agents` for each agent
5. Main Operator API key generated and stored for authenticated agent actions
6. Trust events (Self verified, ERC-8004 registered) written as issue comments
7. Payment issue gated on trust status (blocked until verified, then unblocked)
8. Payment result (tx hash) recorded via `PATCH /api/issues/:id` with comment
9. Dashboard pulls company, agents, issues, activity from Paperclip API
10. Reset script deletes company for clean demo reruns

## Phase 0: Setup and Baseline (45-60 min) ✅ COMPLETE

### Objectives

1. Prepare project environment
2. Set network, wallets, env vars
3. Define test wallet and small stablecoin amount

### Tasks

1. ✅ Initialize project and env file — Next.js + TypeScript + Tailwind in `app/`
2. ✅ Configure Celo network connection — viem with Celo mainnet (chain 42220, RPC: forno.celo.org)
3. ✅ Configure operator wallet and test recipient wallet — private key and recipient in `.env.local`
4. ✅ Add placeholders for Self, ERC-8004, delegation integration — Paperclip URL configured

### What Was Built

- `app/src/lib/env.ts` — env var validation with typed config
- `app/src/lib/celo.ts` — Celo public + wallet clients, CELO/cUSD balance reads, block number
- `app/src/app/api/health/route.ts` — health check endpoint (env, Celo RPC, wallet, Paperclip)
- `app/src/app/page.tsx` — homepage with live system health dashboard
- `app/.env.local` — Celo mainnet config (gitignored)

### Exit Criteria

1. ✅ App boots locally — `npm run dev` works, build compiles clean
2. ✅ Celo RPC connection works — block 62181426 confirmed
3. ✅ Wallet address and balance read succeeds — operator address resolved, balances read

### Tests

1. ✅ Run startup script and verify no runtime crash
2. ✅ Run wallet balance check and confirm numeric result
3. ✅ Validate all required environment variables are present

## Phase 1: Prompt to Company Blueprint (2 hours) ✅ COMPLETE

### Objectives

1. Turn user prompt into standardized agent team blueprint
2. Keep role generation deterministic and demo-safe

### Tasks

1. ✅ Build prompt input screen — text input with example prompt buttons on homepage
2. ✅ Create blueprint generator function — deterministic keyword-matching with 5 team templates + default fallback
3. ✅ Return 4-6 agents with explicit responsibilities — every blueprint returns Main Operator + 4 specialist agents
4. ✅ Show preview panel before deployment — blueprint cards showing name, role badge, capabilities, reporting hierarchy

### What Was Built

- `app/src/lib/blueprint.ts` — deterministic blueprint generator with templates for: social media, software dev, e-commerce, finance, consulting. Always includes Main Operator (CEO). Falls back to a generic team for unmatched prompts.
- `app/src/app/api/blueprint/route.ts` — POST `/api/blueprint` takes `{ prompt }`, returns `CompanyBlueprint` with company name, description, and agents array.
- `app/src/app/page.tsx` — updated homepage with prompt input, 3 example prompt buttons, and blueprint preview grid with color-coded role badges and "Deploy Company" button (disabled until Phase 2).

### Exit Criteria

1. ✅ Entering "social media company" generates: Main Operator, Social Strategy, Content Creation, Design, Trend Research
2. ✅ Blueprint is visible with agent cards, role badges, and capabilities

### Tests

1. ✅ Blueprint generation returns non-empty company blueprint for all inputs
2. ✅ Every blueprint contains Main Operator with role `ceo`
3. ✅ Prompt submit renders blueprint cards in UI
4. ✅ Three prompt examples tested: "social media company" → Social Media Agency, "software development studio" → Software Development Studio, "online store" → E-Commerce Platform

## Phase 2: One-Click Company Deployment (2 hours) ✅ COMPLETE

### Objectives

1. Deploy generated blueprint into live company state
2. Create agent records and communication graph

### Tasks

1. ✅ Implement deploy endpoint/action — `POST /api/deploy` orchestrates full Paperclip deployment
2. ✅ Create company entity — calls `POST /api/companies` with name and description
3. ✅ Create agent entities from blueprint — Main Operator first (no reportsTo), then specialists with `reportsTo: mainOperatorId`
4. ✅ Link agents with task routing — creates company goal + startup issue assigned to Main Operator, generates Main Operator API key

### What Was Built

- `app/src/lib/paperclip.ts` — full Paperclip REST client covering companies, agents, keys, goals, issues, comments, activity, and dashboard endpoints.
- `app/src/app/api/deploy/route.ts` — deploy endpoint that: (1) checks for duplicate company, (2) creates company, (3) creates Main Operator + specialist agents, (4) generates Main Operator API key, (5) creates goal + startup issue. Returns all IDs.
- `app/src/app/page.tsx` — Deploy Company button wired up with loading state, error display, and deployment details panel showing company ID, Main Operator ID, created agents, goal ID, and startup issue ID.

### Exit Criteria

1. ✅ Deploy button creates company and all agents in Paperclip
2. ✅ Deployment details panel shows company with active status and all IDs

### Tests

1. ✅ Deploy action creates 5 agents (Main Operator + 4 specialists)
2. ✅ Duplicate deploy protection — returns 409 if company with same name exists
3. ✅ Deploy from UI completes in one click
4. ✅ Build compiles clean with all routes registered

## Phase 2.5: MetaMask Login + Company Management ✅ COMPLETE

### Objectives

1. Add user identity via MetaMask wallet connection
2. Show user's deployed companies and allow drill-down into detail

### What Was Built

- `app/src/components/WalletConnect.tsx` — MetaMask connect/disconnect component using `window.ethereum`, listens for account changes, shows truncated address when connected.
- `app/src/app/api/companies/route.ts` — `GET /api/companies?deployer=0x...` lists companies from Paperclip filtered by deployer wallet address (parsed from `[deployer:0x...]` tag in company description).
- `app/src/app/api/companies/[companyId]/route.ts` — `GET /api/companies/:id` returns company detail with agents, issues, and mainOperatorId in parallel.
- `app/src/app/api/deploy/route.ts` — updated to require `deployerAddress` in request body, tags company description with `[deployer:0x...]`.
- `app/src/app/company/[id]/page.tsx` — company detail page showing: company info, Main Operator highlight with trust badge placeholders (Self, ERC-8004, Delegation), agent grid, and issues list.
- `app/src/app/page.tsx` — updated homepage: header with wallet connect, "Your Companies" grid (clickable to detail page), "Create a new company" prompt section, deploy navigates to detail page on success.

### Flow

1. User connects MetaMask → wallet address becomes user identity
2. Homepage loads user's companies filtered by deployer address
3. User can click any company → navigates to `/company/[id]` detail page
4. User can create new company → generate blueprint → deploy → auto-navigates to detail
5. Company detail shows agents, issues, and trust badge placeholders ready for Phase 3

## Phase 3: Trust Layer (Self + ERC-8004) (2.5 hours) ✅ COMPLETE

### Objectives

1. Add verifiable identity to main operator agent
2. Gate sensitive actions on verification state

### Tasks

1. ✅ Add Self verification status flow — uses `@selfxyz/agent-sdk` to request registration, with fallback to direct completion for demo
2. ✅ Add ERC-8004 registration flow — calls IdentityRegistry contract directly on Celo mainnet (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) to register agent with our own metadata URI
3. ✅ Persist proofs and status in company state — in-memory trust store with payment gating logic
4. ✅ Show identity badges in dashboard — live trust action cards with step-by-step flow (Self → ERC-8004 → Delegation)

### What Was Built

- `app/src/lib/trust-store.ts` — file-persisted trust state store (`.trust-state.json`) keyed by companyId. Tracks Self verification (with per-company agent addresses), ERC-8004 registration (agentId + txHash), delegation policy, and payment history. Includes `isPaymentAllowed()` gate that requires all three. Survives server restarts.
- `app/src/lib/erc8004.ts` — direct contract interaction with ERC-8004 IdentityRegistry on Celo mainnet. Calls `register(agentURI)` and parses the returned agentId from Transfer event logs.
- `app/src/app/api/agent-metadata/[agentId]/route.ts` — serves ERC-8004 compatible agent metadata JSON (replaces IPFS).
- `app/src/app/api/trust/register-identity/route.ts` — registers Main Operator on ERC-8004 IdentityRegistry, returns agentId + txHash, records comment in Paperclip.
- `app/src/lib/self-onchain.ts` — on-chain Self Agent Registry verification using correct ABI (`isVerifiedAgent(bytes32)`, `getAgentId(bytes32)`, etc.) for the Celo mainnet proxy at `0xaC3DF9ABf80d0F5c020C06B04Cced27763355944`.
- `app/src/app/api/trust/verify-self/route.ts` — Self verification flow with start/check/confirm actions. Each company gets a unique agent address via `requestRegistration()`. Per-company session isolation prevents cross-company verification leaks. Confirms only via on-chain check of the specific session agent.
- `app/src/app/api/trust/set-delegation/route.ts` — activates delegation policy (cUSD, 0.01 max, fixed recipient), unblocks payment issue in Paperclip.
- `app/src/app/api/trust/state/[companyId]/route.ts` — returns current trust state and payment readiness.
- `app/src/app/company/[id]/page.tsx` — updated with live trust action cards: Verify Self → Register ERC-8004 → Activate Delegation. Each step gates the next. Shows CeloScan link for tx hash. Payment readiness indicator at bottom.

### Trust Flow (sequential, each gates the next)

1. **Self Verification** — click Verify → marks operator as identity-verified
2. **ERC-8004 Registration** — click Register → sends real tx to Celo mainnet IdentityRegistry → returns agentId + txHash with CeloScan link
3. **Delegation Policy** — click Activate → sets cUSD spending policy (0.01 max per tx) → unblocks payment issue in Paperclip
4. **Payment Readiness** — indicator shows green only when all three are complete

### Exit Criteria

1. ✅ Main operator shows Self verified status with timestamp
2. ✅ Main operator shows ERC-8004 agent ID and tx hash with CeloScan link
3. ✅ Payment indicator is blocked until all trust requirements pass
4. ✅ Each trust step gates the next (can't register ERC-8004 without Self, can't set delegation without ERC-8004)

### Tests

1. ✅ Payment gate blocks when any trust requirement is missing
2. ✅ Trust state updates correctly through each step
3. ✅ ERC-8004 registration produces real onchain tx hash
4. ✅ Build compiles clean with all new routes

## Phase 4: Delegation + Celo Stablecoin Payment (2.5 hours) ✅ COMPLETE

### Objectives

1. Enable bounded delegated payment execution
2. Produce at least one real Celo transaction hash

### Tasks

1. ✅ Define delegation policy (token, max amount, recipient rule) — cUSD, 0.01 max per tx, fixed recipient
2. ✅ Bind policy to main operator execution path — `isPaymentAllowed()` gate requires Self + ERC-8004 + delegation
3. ✅ Trigger delegated stablecoin transfer action — `transferCusd()` calls ERC-20 transfer on Celo mainnet
4. ✅ Store tx hash and execution metadata — persisted in file-backed trust store

### What Was Built

- `app/src/lib/celo.ts` — added `transferCusd(to, amount)` function: checks cUSD balance, calls ERC-20 `transfer()`, waits for receipt, returns tx hash.
- `app/src/app/api/trust/execute-payment/route.ts` — payment execution endpoint that: (1) checks `isPaymentAllowed()` gate, (2) enforces delegation policy limits (amount, token), (3) executes cUSD transfer on Celo mainnet, (4) records result in Paperclip issue comments, (5) persists tx hash in trust store.
- `app/src/app/company/[id]/page.tsx` — added "Execute Payment" button (Step 4) with: policy-gated enable state, loading spinner, success result panel with tx hash and CeloScan link.
- `app/src/lib/trust-store.ts` — added `lastPaymentTxHash`, `lastPaymentAt`, `lastPaymentAmount` fields, persisted to `.trust-state.json`.

### Payment Flow

1. All trust steps must be complete (Self verified + ERC-8004 registered + delegation active)
2. User clicks "Execute Payment" → endpoint validates delegation policy limits
3. Operator wallet sends cUSD transfer on Celo mainnet → tx hash returned
4. Result recorded as Paperclip issue comment, trust store updated, UI shows CeloScan link

### Exit Criteria

1. ✅ Delegation policy is visible in UI — shows token, max amount, recipient
2. ✅ One delegated payment succeeds on Celo — tx `0x56dff942...` confirmed
3. ✅ Tx hash is shown in dashboard — with CeloScan link

### Tests

1. ✅ Policy validator rejects over-limit payments — 1.0 cUSD rejected with "exceeds delegation limit of 0.01"
2. ✅ In-policy payment returns tx hash — 0.01 cUSD sent successfully
3. ✅ Out-of-policy attempt fails with clear error — shows policy details in error response
4. ✅ Payment blocked when trust requirements not met — returns 403 with specific missing requirement
5. ✅ Tx hash verified on CeloScan — `0x56dff9424fabb433e0c70e9f0ca57c90923d3229991196042989cc5659f6d51c`

## Phase 4.5: Agent Runtime + Autonomous Agents ✅ COMPLETE

### Objectives

1. Enable agents to execute real tasks using an LLM with tool calling
2. Enable agent-to-agent communication
3. Make agents autonomous — able to pick up and process tasks without human prompting
4. Persist all conversations and actions in Paperclip for auditability

### What Was Built

#### LLM Integration (OpenRouter)
- `app/src/lib/gemini.ts` — LLM client using OpenRouter (OpenAI-compatible API). Uses free models: `qwen/qwen3-coder:free` (primary) with `stepfun/step-3.5-flash:free` (fallback). Supports multi-turn tool-calling loops via `runAgentLoop()`.
- Originally built for Google Gemini, switched to OpenRouter due to Gemini free tier rate limits. Uses the same OpenRouter API key as the user's OpenClaw setup.

#### Agent Tools (`app/src/lib/agent-tools.ts`)
11 tools agents can invoke via LLM function calling:

**Onchain tools:**
- `check_cusd_balance` — read live cUSD balance from Celo mainnet
- `check_celo_balance` — read native CELO balance
- `transfer_cusd` — execute real cUSD ERC-20 transfer (enforced by delegation policy: max amount, allowed recipient, trust gate)

**Company awareness tools:**
- `check_trust_status` — get Self/ERC-8004/delegation/payment state
- `list_team_agents` — see all agents with IDs, roles, capabilities
- `list_company_tasks` — view recent issues with status and assignee

**Task management tools:**
- `create_task` — create Paperclip issue, optionally assign to a teammate
- `comment_on_task` — add comment to existing issue thread
- `update_task_status` — change issue status (todo/in_progress/blocked/done)
- `get_task_comments` — read discussion thread on any task

**Inter-agent communication:**
- `message_agent` — send message to another agent; target agent processes it with its own LLM loop and tools, returns response. Creates inter-agent issue threads in Paperclip.

#### Autonomous Agent Runner (`app/src/lib/agent-runner.ts`)
- `runAgent(companyId, agentId)` — picks up all `todo`/`in_progress` issues assigned to an agent, processes each through the LLM + tool loop
- Uses **Paperclip atomic checkout** (`POST /issues/:id/checkout`) to prevent double-work
- Records all tool calls and responses as issue comments
- Logs activity to Paperclip's activity feed via `POST /companies/:companyId/activity`
- `messageAgent(companyId, fromAgentId, toAgentId, message)` — creates an inter-agent issue, runs the target agent, returns its response

#### API Endpoints
- `POST /api/agents/task` — send a prompt to a specific agent; runs LLM with tools, records everything in Paperclip. Injects onchain context (wallet balance, trust state, delegation policy) into system prompt.
- `POST /api/agents/run` — trigger one or all agents to process pending tasks autonomously. Sets agent status to `running`/`active`/`idle` based on work done.
- `GET /api/agents/history?companyId=` — load past conversations from Paperclip issues/comments. Parses user prompts, tool calls, and agent responses from issue threads.
- `GET /api/agents/activity?companyId=` — fetch company activity feed from Paperclip.

#### Extended Paperclip Client (`app/src/lib/paperclip.ts`)
Added functions: `checkoutIssue`, `releaseIssue`, `getIssueContext`, `getIssue`, `getOrgChart`, `wakeupAgent`, `getAgent`, `createActivity`, `getSidebarBadges`.

#### UI Updates (`app/src/app/company/[id]/page.tsx`)
- **Agent Command Center** — renamed from "Talk to Agents". Includes agent selector dropdown, prompt input, and send button.
- **"Run All Agents" button** — triggers all agents to process pending tasks autonomously
- **Per-agent "Run" button** — on each agent card, triggers individual agent processing
- **Tool call display** — inline color-coded tool calls (green for transactions with CeloScan links, red for errors, gray for reads)
- **Chat history persistence** — loads from Paperclip on page load, survives refreshes
- **Activity Feed** — timestamped log of agent actions at bottom of page
- **Run result indicator** — shows number of tasks processed after autonomous run

### Agent Autonomy Flow

1. **User sends prompt** → agent reasons with LLM, calls tools (check balances, create tasks, message other agents)
2. **Agent delegates work** → uses `create_task` to assign issues to teammates, or `message_agent` for synchronous collaboration
3. **"Run All Agents"** → each agent picks up its pending tasks, processes them through LLM + tools, records results
4. **Atomic checkout** → Paperclip prevents two agents from working the same issue
5. **Full audit trail** → every tool call, response, and status change recorded as Paperclip issue comments

### Environment

```
# OpenRouter (free models)
OPENROUTER_API_KEY=sk-or-v1-...
```

Models: `qwen/qwen3-coder:free` (primary), `stepfun/step-3.5-flash:free` (fallback). Auto-fallback on primary model failure.

### Exit Criteria

1. ✅ User can send prompts to agents and get LLM-powered responses
2. ✅ Agents can check onchain balances and execute real cUSD transfers via tools
3. ✅ Agents can message other agents and get responses
4. ✅ "Run All Agents" processes pending tasks autonomously
5. ✅ All conversations persist in Paperclip and survive page refresh
6. ✅ Activity feed shows timestamped agent actions

## Phase 5: Judge Dashboard and Demo Hardening (1.5-2 hours)

### Objectives

1. Make proof obvious in one screen
2. Script the exact 2-minute flow

### Tasks

1. Build compact evidence panel:
   - company deployed
   - agent list
   - Self verified (with on-chain agent ID + proof expiry)
   - ERC-8004 registered (with CeloScan link)
   - delegation active (with editable policy settings)
   - latest tx hash (with CeloScan link)
2. ✅ Add activity timeline for final narrative — activity feed section on company page
3. Add quick reset script for repeated demos
4. UI polish — loading states, error handling, responsive layout

### Exit Criteria

1. Entire demo can be run end-to-end in under 2 minutes
2. No manual hidden steps needed during presentation

### Tests

1. Manual timed run: full demo completes under 2 minutes
2. Manual resilience test: one failed step shows understandable message
3. Manual reset test: reset brings app back to demo start state

## Final QA Checklist (Must Pass)

1. Prompt generates blueprint
2. One-click deploy works
3. Main operator Self status visible and true
4. Main operator ERC-8004 proof visible
5. Delegation policy displayed
6. Delegated Celo stablecoin transfer succeeds
7. Tx hash visible and explorer-verifiable
8. README and demo script match actual behavior

## Risk Register and Fast Mitigations

1. Risk: Self or ERC-8004 integration delay
Mitigation: keep a strict main-operator-only scope

2. Risk: Delegation integration complexity
Mitigation: single policy template with fixed constraints

3. Risk: Onchain tx failure at demo time
Mitigation: pre-fund wallet, keep tiny transfer amount, retry-safe action

4. Risk: UI polish eats time
Mitigation: prioritize proof panel over design

## Time Allocation Summary

1. Phase 0: 1 hour
2. Phase 1: 2 hours
3. Phase 2: 2 hours
4. Phase 3: 2.5 hours
5. Phase 4: 2.5 hours
6. Phase 5: 2 hours

Total: about 12 hours including buffer.

## Submission-Day Runbook

1. Run app and verify env checks
2. Execute one dry run of full demo
3. Execute one real tx and keep hash ready
4. Record 2-minute demo video
5. Fill README submission links
6. Submit to Celo and Open Track first
7. Add cross-track notes for Self, ERC-8004 narrative, delegations
