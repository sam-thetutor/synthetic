import { NextRequest, NextResponse } from "next/server";
import { getTrustState, isPaymentAllowed, updateTrustState } from "@/lib/trust-store";
import { getCusdBalance } from "@/lib/celo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  let state = getTrustState(companyId);

  if (state.treasuryAddress) {
    try {
      const cusdBalance = await getCusdBalance(state.treasuryAddress as `0x${string}`);
      const nextStatus = parseFloat(cusdBalance) > 0 ? "funded" : "unfunded";
      if (state.treasuryStatus !== nextStatus) {
        state = updateTrustState(companyId, { treasuryStatus: nextStatus });
      }
    } catch {
      // Non-critical; keep existing state if balance check fails.
    }
  }

  const paymentCheck = isPaymentAllowed(companyId);

  return NextResponse.json({ state, paymentCheck });
}
