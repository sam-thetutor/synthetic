import { NextRequest, NextResponse } from "next/server";
import { updateTrustState } from "@/lib/trust-store";
import { addIssueComment, updateIssue } from "@/lib/paperclip";
import { getEnvConfig } from "@/lib/env";

export async function POST(req: NextRequest) {
  const { companyId, issueId, paymentIssueId, token, maxAmountPerTx, recipientAddress } = await req.json();

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  try {
    const config = getEnvConfig();

    const policyToken = token || "cUSD";
    const policyMax = maxAmountPerTx || "0.01";
    const policyRecipient = recipientAddress || config.recipientAddress;

    // Validate
    if (parseFloat(policyMax) <= 0) {
      return NextResponse.json({ error: "Max amount must be greater than 0" }, { status: 400 });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(policyRecipient)) {
      return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 });
    }

    // Set delegation policy
    const state = updateTrustState(companyId, {
      delegationActive: true,
      delegationPolicy: {
        token: policyToken,
        maxAmountPerTx: policyMax,
        recipientAddress: policyRecipient,
      },
    });

    // Record in Paperclip
    if (issueId) {
      await addIssueComment(
        issueId,
        `Delegation policy activated. Token: ${policyToken}. Max per tx: ${policyMax}. Recipient: ${policyRecipient}.`
      ).catch(() => {});
    }

    // Unblock payment issue if it exists
    if (paymentIssueId) {
      await updateIssue(paymentIssueId, {
        status: "todo",
        comment: "Trust requirements met. Payment unblocked.",
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, state });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
