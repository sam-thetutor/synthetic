import { NextRequest, NextResponse } from "next/server";
import { registerAgent } from "@/lib/erc8004";
import { updateTrustState } from "@/lib/trust-store";
import { addIssueComment } from "@/lib/paperclip";

export async function POST(req: NextRequest) {
  const { companyId, mainOperatorId, issueId } = await req.json();

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  try {
    // Build agent metadata URI (our own endpoint instead of IPFS)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const agentURI = `${appUrl}/api/agent-metadata/${mainOperatorId || "main-operator"}`;

    // Register on ERC-8004 IdentityRegistry on Celo mainnet
    const { agentId, txHash } = await registerAgent(agentURI);

    // Update trust state
    const state = updateTrustState(companyId, {
      erc8004Registered: true,
      erc8004AgentId: agentId,
      erc8004TxHash: txHash,
      erc8004RegisteredAt: new Date().toISOString(),
    });

    // Record in Paperclip issue comments
    if (issueId) {
      await addIssueComment(
        issueId,
        `ERC-8004 identity registered. Agent ID: ${agentId}. Tx hash: ${txHash}. Onchain trust anchor active on Celo mainnet.`
      ).catch(() => {}); // Don't fail if Paperclip is unavailable
    }

    return NextResponse.json({
      success: true,
      agentId,
      txHash,
      state,
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
