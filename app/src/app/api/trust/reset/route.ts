import { NextRequest, NextResponse } from "next/server";
import { updateTrustState } from "@/lib/trust-store";

export async function POST(req: NextRequest) {
  const { companyId } = await req.json();

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const state = updateTrustState(companyId, {
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
  });

  return NextResponse.json({ success: true, state });
}
