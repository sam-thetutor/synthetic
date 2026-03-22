import { NextRequest, NextResponse } from "next/server";
import {
  appendPolicyAuditEvent,
  getTrustState,
  updateTrustState,
} from "@/lib/trust-store";
import { getCeloBalance, getCusdBalance } from "@/lib/celo";

function normalizeAmount(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return value.trim();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const state = getTrustState(companyId);

  if (!state.treasuryAddress) {
    return NextResponse.json(
      { error: "Company treasury is not initialized" },
      { status: 404 }
    );
  }

  let celoBalance = "0";
  let cusdBalance = "0";

  try {
    [celoBalance, cusdBalance] = await Promise.all([
      getCeloBalance(state.treasuryAddress as `0x${string}`),
      getCusdBalance(state.treasuryAddress as `0x${string}`),
    ]);
  } catch {
    // Keep default values if chain query fails.
  }

  const isFunded = parseFloat(cusdBalance) > 0;
  const nextStatus = isFunded ? "funded" : "unfunded";

  if (state.treasuryStatus !== nextStatus) {
    updateTrustState(companyId, { treasuryStatus: nextStatus });
  }

  return NextResponse.json({
    treasury: {
      address: state.treasuryAddress,
      status: nextStatus,
      createdAt: state.treasuryCreatedAt,
      balances: {
        celo: celoBalance,
        cusd: cusdBalance,
      },
    },
    companySpendPolicy: state.companySpendPolicy,
    agentSpendPolicies: state.agentSpendPolicies,
    policyAuditEvents: state.policyAuditEvents,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const state = getTrustState(companyId);

  if (!state.treasuryAddress) {
    return NextResponse.json(
      { error: "Company treasury is not initialized" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const actor =
    (typeof body.actor === "string" && body.actor.trim()) ||
    req.headers.get("x-actor-id") ||
    req.headers.get("x-user-id") ||
    "unknown";
  const updates: Parameters<typeof updateTrustState>[1] = {};

  if (body.companySpendPolicy) {
    const policy = body.companySpendPolicy as {
      token?: unknown;
      maxAmountPerTx?: unknown;
      maxAmountPerDay?: unknown;
      allowedRecipients?: unknown;
    };

    if (typeof policy.token !== "string" || policy.token.trim().length === 0) {
      return NextResponse.json(
        { error: "companySpendPolicy.token is required" },
        { status: 400 }
      );
    }

    let allowedRecipients: string[] = [];
    if (Array.isArray(policy.allowedRecipients)) {
      allowedRecipients = policy.allowedRecipients
        .filter((recipient): recipient is string => typeof recipient === "string")
        .map((recipient) => recipient.trim())
        .filter((recipient) => recipient.length > 0);
    }

    try {
      updates.companySpendPolicy = {
        token: policy.token.trim(),
        maxAmountPerTx: normalizeAmount(policy.maxAmountPerTx, "maxAmountPerTx"),
        maxAmountPerDay: normalizeAmount(policy.maxAmountPerDay, "maxAmountPerDay"),
        allowedRecipients,
      };
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 }
      );
    }
  }

  if (body.agentSpendPolicy) {
    const policy = body.agentSpendPolicy as {
      agentId?: unknown;
      enabled?: unknown;
      maxAmountPerTx?: unknown;
      maxAmountPerDay?: unknown;
      maxAmountPerWeek?: unknown;
    };

    if (typeof policy.agentId !== "string" || policy.agentId.trim().length === 0) {
      return NextResponse.json(
        { error: "agentSpendPolicy.agentId is required" },
        { status: 400 }
      );
    }

    try {
      updates.agentSpendPolicies = {
        ...state.agentSpendPolicies,
        [policy.agentId]: {
          agentId: policy.agentId,
          enabled: Boolean(policy.enabled),
          maxAmountPerTx: normalizeAmount(policy.maxAmountPerTx, "maxAmountPerTx"),
          maxAmountPerDay: normalizeAmount(policy.maxAmountPerDay, "maxAmountPerDay"),
          maxAmountPerWeek: normalizeAmount(policy.maxAmountPerWeek, "maxAmountPerWeek"),
          spentToday: state.agentSpendPolicies[policy.agentId]?.spentToday || "0",
          spentWeek: state.agentSpendPolicies[policy.agentId]?.spentWeek || "0",
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400 }
      );
    }
  }

  if (!updates.companySpendPolicy && !updates.agentSpendPolicies) {
    return NextResponse.json(
      { error: "No policy updates provided" },
      { status: 400 }
    );
  }

  const updated = updateTrustState(companyId, updates);

  if (updates.companySpendPolicy) {
    appendPolicyAuditEvent(companyId, {
      actor,
      action: "company_policy_updated",
      changes: {
        companySpendPolicy: updates.companySpendPolicy,
      },
    });
  }

  if (body.agentSpendPolicy && typeof body.agentSpendPolicy.agentId === "string") {
    appendPolicyAuditEvent(companyId, {
      actor,
      action: "agent_policy_updated",
      agentId: body.agentSpendPolicy.agentId,
      changes: {
        agentSpendPolicy: {
          agentId: body.agentSpendPolicy.agentId,
          enabled: body.agentSpendPolicy.enabled,
          maxAmountPerTx: body.agentSpendPolicy.maxAmountPerTx,
          maxAmountPerDay: body.agentSpendPolicy.maxAmountPerDay,
          maxAmountPerWeek: body.agentSpendPolicy.maxAmountPerWeek,
        },
      },
    });
  }

  const latest = getTrustState(companyId);

  return NextResponse.json({
    ok: true,
    companySpendPolicy: updated.companySpendPolicy,
    agentSpendPolicies: updated.agentSpendPolicies,
    policyAuditEvents: latest.policyAuditEvents,
  });
}
