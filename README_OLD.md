# Agent Company Launcher on Celo

Create and launch an onchain AI company in one click.

A user describes a business idea (for example, "social media agency"), and the platform generates the required agent team, deploys the company, verifies the main operator identity, registers trust identity, and executes delegated stablecoin transactions on Celo.

## One-Line Pitch

Agent Company Launcher turns a plain-English company idea into a live autonomous team on Celo, with verifiable identity, delegated permissions, and real economic execution.

## Problem

People can spin up AI agents quickly, but they cannot easily:

1. Structure agents into a real operating company.
2. Trust agents with money and permissions.
3. Prove identity, accountability, and execution to users and judges.

## Solution

This project provides a prompt-to-company workflow:

1. User describes the company they want.
2. Platform generates a role-based agent blueprint.
3. User deploys the company in one click.
4. Main operator agent is trust-enabled with:
   - Self identity verification
   - ERC-8004 identity registration
   - Delegated execution policy
5. Main operator performs a real Celo stablecoin transaction.

## Why This Matters

Autonomous companies are only viable when agents have:

1. Verifiable identity
2. Bounded authority
3. Auditable onchain execution

This MVP proves all three in a single, simple flow.

## Core MVP Features

1. Prompt-to-blueprint company generation
2. Auto-generated multi-agent team for the business type
3. One-click company deployment
4. Main agent Self verification status
5. Main agent ERC-8004 identity registration proof
6. Delegated spending policy for main agent
7. One real Celo stablecoin transaction with tx hash
8. Activity dashboard with identity and transaction evidence
9. x402-enabled paid API access for every deployed agent

## Example User Flow

Input:

"I want to start a social media company"

Generated team:

1. Main Operator Agent
2. Social Strategy Agent
3. Content Creation Agent
4. Design Agent
5. Trend and Research Agent

Then:

1. User clicks Deploy Company
2. Team is created
3. Main agent identity and delegation are configured
4. Main agent executes first operational payment on Celo

## High-Level Architecture

1. Frontend App
   - Prompt input
   - Company blueprint preview
   - Deploy button
   - Evidence dashboard

2. Orchestration Layer
   - Paperclip-based multi-agent orchestration
   - Role assignment and inter-agent coordination
   - Shared company task flow

3. Trust and Permissions Layer
   - Self identity for main operator agent
   - ERC-8004 identity registration for main operator agent
   - Delegated transaction policy

4. Payments Layer
   - Celo stablecoin transfer execution
   - x402 paid API calls via thirdweb
   - Onchain tx hash capture and display

## Sponsor Mapping and Track Fit

### Primary Track: Celo (Best Agent on Celo)

Why this fits instantly:

1. Core product is agentic and deployed on Celo
2. Real stablecoin transaction is executed onchain
3. Strong real-world utility (business operations automation)

Evidence we will show:

1. Celo transaction hash
2. Agent-driven payment action
3. Live deployed company and team

### Cross-Track Fit: Protocol Labs style trust stack (ERC-8004)

Why this fits:

1. Main operator agent has onchain trust identity
2. Agent execution is tied to identity and accountability

Evidence we will show:

1. ERC-8004 identity registration record
2. Identity-linked operator activity in dashboard

### Cross-Track Fit: Self Protocol

Why this fits:

1. Main operator is verified before sensitive actions
2. Verification status gates spending permissions

Evidence we will show:

1. Verified status in UI
2. Spending action blocked until verified

### Cross-Track Fit: MetaMask Delegations

Why this fits:

1. Agent executes with bounded delegated authority
2. Policy includes constraints such as token and spend limit

Evidence we will show:

1. Delegation policy details in UI
2. Delegated transaction execution proof

### Open Track Fit

Why this fits:

1. End-to-end autonomous company creation product
2. Strong technical and product narrative
3. Real execution, not mock-only flow

## Judge-Friendly Proof Checklist

1. Prompt entered and company blueprint generated
2. Agent company deployed in one click
3. Main agent Self-verified
4. Main agent ERC-8004 registered
5. Delegation policy created
6. Delegated Celo stablecoin payment executed
7. Transaction hash visible
8. Activity log ties action to trusted main operator

## Final 2-Minute Demo Narration (Word-for-Word)

"Today I will show Agent Company Launcher on Celo.

Right now, creating AI agents is easy, but creating a trustworthy AI company is still hard. Most systems do not give agents identity, bounded permissions, or auditable execution.

Our product solves that in one flow.

I start by describing the business I want: social media company.

The platform generates a full agent team for this company: a main operator, social strategy, content, design, and research.

Now I click Deploy Company.

In one step, the company and agents are created and can coordinate work.

Next, we trust-enable the main operator.

First, Self verification is required. You can see the verified status is active.

Second, we register ERC-8004 identity for the main operator, so this agent has an onchain trust anchor.

Third, we apply delegated permissions so the main operator can execute payments safely within a strict policy.

Now I trigger an operational payment. This action is executed by the main operator through delegation on Celo in stablecoins.

Here is the transaction hash and activity log.

So in less than two minutes, we went from plain-English company idea to a deployed, trust-enabled, transacting AI company on Celo.

That is Agent Company Launcher: prompt to company, identity to trust, delegation to safety, and onchain execution to proof."

## What Is Real in This MVP

1. Prompt to agent-company blueprint
2. One-click team deployment
3. Main operator identity verification
4. Main operator ERC-8004 registration
5. Delegated onchain payment on Celo
6. x402-enabled external API payments for deployed agents
7. Tx and activity proof in dashboard

## 24-Hour Scope Discipline

Done now:

1. Single business flow
2. Single trust-enabled main operator
3. Single delegated payment path
4. Single dashboard for proof

Deferred:

1. Full marketplace of templates
2. Multi-company management
3. Complex treasury automation
4. Multi-chain expansion

## Submission Assets

1. Repository URL: TODO
2. Demo video URL: TODO
3. Live app URL: TODO
4. Transaction hash(es): TODO
5. ERC-8004 identity proof link: TODO
6. Self verification proof screenshot/link: TODO

## Team

1. Builder: TODO
2. Contact: TODO

## License

MIT
