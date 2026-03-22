import { NextRequest, NextResponse } from "next/server";
import {
  consumeSpendLimits,
  evaluateSpendLimits,
  getTrustState,
  isPaymentAllowed,
  updateTrustState,
} from "@/lib/trust-store";
import { transferCusdFromPrivateKey } from "@/lib/celo";
import { addIssueComment, listAgents, updateIssue } from "@/lib/paperclip";
import { decryptPrivateKey } from "@/lib/treasury";

export async function POST(req: NextRequest) {
  const { companyId, issueId, amount, agentId } = await req.json();

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  if (!agentId || typeof agentId !== "string") {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  // 1. Check payment gate
  const paymentCheck = isPaymentAllowed(companyId);
  if (!paymentCheck.allowed) {
    return NextResponse.json(
      { error: `Payment blocked: ${paymentCheck.reason}` },
      { status: 403 }
    );
  }

  const state = getTrustState(companyId);
  const agents = await listAgents(companyId);
  const isMainOperator = agents.some(
    (agent: { id: string; role: string; reportsTo: string | null }) =>
      agent.id === agentId && agent.role === "ceo" && agent.reportsTo === null
  );
  const policy = state.delegationPolicy;
  if (!policy) {
    return NextResponse.json(
      { error: "No delegation policy set" },
      { status: 403 }
    );
  }

  if (!state.treasuryEncryptedPrivateKey) {
    return NextResponse.json(
      { error: "Company treasury signing key is missing" },
      { status: 403 }
    );
  }

  if (policy.token !== "cUSD") {
    return NextResponse.json(
      { error: `Unsupported delegation token: ${policy.token}` },
      { status: 400 }
    );
  }

  if (state.companySpendPolicy?.token && state.companySpendPolicy.token !== "cUSD") {
    return NextResponse.json(
      {
        error: `Company spend policy token must be cUSD for this payment flow (currently ${state.companySpendPolicy.token})`,
      },
      { status: 400 }
    );
  }

  // 2. Enforce delegation policy
  const requestedAmount = parseFloat(amount || "0.01");
  const maxAmount = parseFloat(policy.maxAmountPerTx);

  if (requestedAmount <= 0) {
    return NextResponse.json(
      { error: "Amount must be greater than 0" },
      { status: 400 }
    );
  }

  if (requestedAmount > maxAmount) {
    return NextResponse.json(
      {
        error: `Amount ${requestedAmount} exceeds delegation limit of ${maxAmount} ${policy.token} per transaction`,
        policy,
      },
      { status: 403 }
    );
  }

  if (!isMainOperator && state.companySpendPolicy?.allowedRecipients?.length) {
    const allowed = state.companySpendPolicy.allowedRecipients.map((recipient) =>
      recipient.toLowerCase()
    );
    if (!allowed.includes(policy.recipientAddress.toLowerCase())) {
      return NextResponse.json(
        {
          error: "Recipient is not included in company allowed recipients",
        },
        { status: 403 }
      );
    }
  }

  const spendCheck = evaluateSpendLimits(companyId, requestedAmount, agentId, {
    privilegedAgent: isMainOperator,
  });
  if (!spendCheck.allowed) {
    return NextResponse.json(
      { error: `Payment blocked: ${spendCheck.reason}` },
      { status: 403 }
    );
  }

  // 3. Execute the transfer
  try {
    const treasuryPrivateKey = decryptPrivateKey(state.treasuryEncryptedPrivateKey);

    // Update issue to in_progress
    if (issueId) {
      await updateIssue(issueId, {
        status: "in_progress",
        comment: `Executing delegated payment: ${requestedAmount} ${policy.token} to ${policy.recipientAddress}`,
      }).catch(() => {});
    }

    const result = await transferCusdFromPrivateKey(
      treasuryPrivateKey,
      policy.recipientAddress as `0x${string}`,
      requestedAmount.toString()
    );

    // 4. Record success
    if (issueId) {
      await updateIssue(issueId, {
        status: "done",
        comment: `Delegated payment executed. Tx hash: ${result.txHash}. Amount: ${requestedAmount} ${policy.token}. From: ${result.from}. To: ${result.to}.`,
      }).catch(() => {});
    }

    // Store last payment info in trust state
    updateTrustState(companyId, {
      lastPaymentTxHash: result.txHash,
      lastPaymentAt: new Date().toISOString(),
      lastPaymentAmount: requestedAmount.toString(),
      treasuryStatus: "active",
    });

    consumeSpendLimits(companyId, requestedAmount, agentId);

    return NextResponse.json({
      success: true,
      txHash: result.txHash,
      amount: requestedAmount.toString(),
      token: policy.token,
      from: result.from,
      to: result.to,
      celoscanUrl: `https://celoscan.io/tx/${result.txHash}`,
    });
  } catch (e) {
    // Record failure
    if (issueId) {
      await addIssueComment(
        issueId,
        `Payment failed: ${(e as Error).message}`
      ).catch(() => {});
    }

    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
