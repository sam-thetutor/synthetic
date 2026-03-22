// File-persisted trust state store
// Survives server restarts and hot-reloads

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const STORE_PATH = join(process.cwd(), ".trust-state.json");

export interface TrustState {
  treasuryAddress: string | null;
  treasuryEncryptedPrivateKey: string | null;
  treasuryStatus: "unfunded" | "funded" | "active" | null;
  treasuryCreatedAt: string | null;
  companySpendPolicy: CompanySpendPolicy | null;
  companySpentToday: string;
  companySpentWeek: string;
  companySpendUpdatedAt: string | null;
  agentSpendPolicies: Record<string, AgentSpendPolicy>;
  policyAuditEvents: PolicyAuditEvent[];
  selfVerified: boolean;
  selfVerifiedAt: string | null;
  selfAgentAddress: string | null;
  erc8004Registered: boolean;
  erc8004AgentId: string | null;
  erc8004TxHash: string | null;
  erc8004RegisteredAt: string | null;
  delegationActive: boolean;
  delegationPolicy: DelegationPolicy | null;
  lastPaymentTxHash: string | null;
  lastPaymentAt: string | null;
  lastPaymentAmount: string | null;
}

export interface DelegationPolicy {
  token: string;
  maxAmountPerTx: string;
  recipientAddress: string;
}

export interface CompanySpendPolicy {
  token: string;
  maxAmountPerTx: string;
  maxAmountPerDay: string;
  allowedRecipients: string[];
}

export interface AgentSpendPolicy {
  agentId: string;
  enabled: boolean;
  maxAmountPerTx: string;
  maxAmountPerDay: string;
  maxAmountPerWeek: string;
  spentToday: string;
  spentWeek: string;
  updatedAt: string;
}

export interface PolicyAuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: "company_policy_updated" | "agent_policy_updated";
  companyId: string;
  agentId?: string;
  changes: Record<string, unknown>;
}

function defaultState(): TrustState {
  return {
    treasuryAddress: null,
    treasuryEncryptedPrivateKey: null,
    treasuryStatus: null,
    treasuryCreatedAt: null,
    companySpendPolicy: null,
    companySpentToday: "0",
    companySpentWeek: "0",
    companySpendUpdatedAt: null,
    agentSpendPolicies: {},
    policyAuditEvents: [],
    selfVerified: false,
    selfVerifiedAt: null,
    selfAgentAddress: null,
    erc8004Registered: false,
    erc8004AgentId: null,
    erc8004TxHash: null,
    erc8004RegisteredAt: null,
    delegationActive: false,
    delegationPolicy: null,
    lastPaymentTxHash: null,
    lastPaymentAt: null,
    lastPaymentAmount: null,
  };
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function getUtcWeekKey(date: Date): string {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${date.getUTCFullYear()}-${week}`;
}

function toFloat(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value || "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCompanySpendWindows(state: TrustState): {
  spentToday: number;
  spentWeek: number;
} {
  const now = new Date();
  if (!state.companySpendUpdatedAt) {
    return { spentToday: 0, spentWeek: 0 };
  }

  const last = new Date(state.companySpendUpdatedAt);
  if (Number.isNaN(last.getTime())) {
    return { spentToday: 0, spentWeek: 0 };
  }

  const spentToday = isSameUtcDay(now, last) ? toFloat(state.companySpentToday) : 0;
  const spentWeek =
    getUtcWeekKey(now) === getUtcWeekKey(last) ? toFloat(state.companySpentWeek) : 0;

  return { spentToday, spentWeek };
}

function normalizeAgentSpendWindows(policy: AgentSpendPolicy): {
  spentToday: number;
  spentWeek: number;
} {
  const now = new Date();
  const last = new Date(policy.updatedAt);
  if (Number.isNaN(last.getTime())) {
    return { spentToday: 0, spentWeek: 0 };
  }

  const spentToday = isSameUtcDay(now, last) ? toFloat(policy.spentToday) : 0;
  const spentWeek =
    getUtcWeekKey(now) === getUtcWeekKey(last) ? toFloat(policy.spentWeek) : 0;

  return { spentToday, spentWeek };
}

function loadStore(): Record<string, TrustState> {
  try {
    if (existsSync(STORE_PATH)) {
      return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
    }
  } catch {
    // Corrupted file, start fresh
  }
  return {};
}

function saveStore(store: Record<string, TrustState>) {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function getTrustState(companyId: string): TrustState {
  const store = loadStore();
  return { ...defaultState(), ...(store[companyId] || {}) };
}

export function updateTrustState(
  companyId: string,
  updates: Partial<TrustState>
): TrustState {
  const store = loadStore();
  const current = store[companyId] || defaultState();
  const updated = { ...current, ...updates };
  store[companyId] = updated;
  saveStore(store);
  return updated;
}

export function isPaymentAllowed(companyId: string): {
  allowed: boolean;
  reason?: string;
} {
  const state = getTrustState(companyId);
  if (!state.treasuryAddress || !state.treasuryEncryptedPrivateKey) {
    return { allowed: false, reason: "Company treasury is not initialized" };
  }
  if (state.treasuryStatus === "unfunded") {
    return { allowed: false, reason: "Company treasury is not funded" };
  }
  if (!state.selfVerified) {
    return { allowed: false, reason: "Self verification required" };
  }
  if (!state.erc8004Registered) {
    return { allowed: false, reason: "ERC-8004 identity registration required" };
  }
  if (!state.delegationActive) {
    return { allowed: false, reason: "Delegation policy not active" };
  }
  return { allowed: true };
}

export function evaluateSpendLimits(
  companyId: string,
  amount: number,
  agentId?: string,
  options?: { privilegedAgent?: boolean }
): { allowed: boolean; reason?: string } {
  const state = getTrustState(companyId);
  const privilegedAgent = options?.privilegedAgent === true;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { allowed: false, reason: "Invalid payment amount" };
  }

  const companyPolicy = state.companySpendPolicy;
  if (!companyPolicy) {
    return { allowed: false, reason: "Company spend policy is not configured" };
  }

  const companyMaxPerTx = toFloat(companyPolicy.maxAmountPerTx);
  const companyMaxPerDay = toFloat(companyPolicy.maxAmountPerDay);
  if (amount > companyMaxPerTx) {
    return {
      allowed: false,
      reason: `Amount exceeds company max per transaction (${companyPolicy.maxAmountPerTx} ${companyPolicy.token})`,
    };
  }

  if (!privilegedAgent) {
    const companySpend = normalizeCompanySpendWindows(state);
    if (companySpend.spentToday + amount > companyMaxPerDay) {
      return {
        allowed: false,
        reason: `Amount exceeds company daily budget (${companyPolicy.maxAmountPerDay} ${companyPolicy.token})`,
      };
    }
  }

  if (agentId && !privilegedAgent) {
    const policy = state.agentSpendPolicies[agentId];
    if (!policy) {
      return { allowed: false, reason: `Agent spend policy is not configured for ${agentId}` };
    }

    if (!policy.enabled) {
      return { allowed: false, reason: "Agent spend policy is disabled" };
    }

    const maxTx = toFloat(policy.maxAmountPerTx);
    const maxDay = toFloat(policy.maxAmountPerDay);
    const maxWeek = toFloat(policy.maxAmountPerWeek);
    const spent = normalizeAgentSpendWindows(policy);

    if (amount > maxTx) {
      return {
        allowed: false,
        reason: `Amount exceeds agent max per transaction (${policy.maxAmountPerTx})`,
      };
    }
    if (spent.spentToday + amount > maxDay) {
      return {
        allowed: false,
        reason: `Amount exceeds agent daily limit (${policy.maxAmountPerDay})`,
      };
    }
    if (spent.spentWeek + amount > maxWeek) {
      return {
        allowed: false,
        reason: `Amount exceeds agent weekly limit (${policy.maxAmountPerWeek})`,
      };
    }
  }

  return { allowed: true };
}

export function consumeSpendLimits(companyId: string, amount: number, agentId?: string): TrustState {
  const state = getTrustState(companyId);
  const now = new Date().toISOString();

  const companySpend = normalizeCompanySpendWindows(state);
  const updates: Partial<TrustState> = {
    companySpentToday: (companySpend.spentToday + amount).toString(),
    companySpentWeek: (companySpend.spentWeek + amount).toString(),
    companySpendUpdatedAt: now,
  };

  if (agentId) {
    const policy = state.agentSpendPolicies[agentId];
    if (policy) {
      const spent = normalizeAgentSpendWindows(policy);
      updates.agentSpendPolicies = {
        ...state.agentSpendPolicies,
        [agentId]: {
          ...policy,
          spentToday: (spent.spentToday + amount).toString(),
          spentWeek: (spent.spentWeek + amount).toString(),
          updatedAt: now,
        },
      };
    }
  }

  return updateTrustState(companyId, updates);
}

export function appendPolicyAuditEvent(
  companyId: string,
  event: Omit<PolicyAuditEvent, "id" | "timestamp" | "companyId">
): TrustState {
  const state = getTrustState(companyId);
  const nextEvent: PolicyAuditEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    companyId,
    ...event,
  };

  const nextEvents = [nextEvent, ...(state.policyAuditEvents || [])].slice(0, 100);
  return updateTrustState(companyId, { policyAuditEvents: nextEvents });
}
