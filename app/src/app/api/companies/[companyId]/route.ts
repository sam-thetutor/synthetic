import { NextRequest, NextResponse } from "next/server";
import { getCompany, listAgents, listIssues } from "@/lib/paperclip";
import { getTrustState } from "@/lib/trust-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;

  const [company, agents, issues] = await Promise.all([
    getCompany(companyId),
    listAgents(companyId),
    listIssues(companyId),
  ]);
  const trustState = getTrustState(companyId);

  // Find main operator
  const mainOperator = agents.find(
    (a: { role: string; reportsTo: string | null }) =>
      a.role === "ceo" && a.reportsTo === null
  );

  return NextResponse.json({
    company,
    agents,
    issues,
    mainOperatorId: mainOperator?.id || null,
    treasury: {
      address: trustState.treasuryAddress,
      status: trustState.treasuryStatus,
      createdAt: trustState.treasuryCreatedAt,
    },
  });
}
