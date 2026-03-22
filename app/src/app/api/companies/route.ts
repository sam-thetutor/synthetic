import { NextRequest, NextResponse } from "next/server";
import { listCompanies, listAgents } from "@/lib/paperclip";

function extractDeployer(description: string | null): string | null {
  if (!description) return null;
  const match = description.match(/\[deployer:(0x[a-fA-F0-9]+)\]/);
  return match ? match[1].toLowerCase() : null;
}

export async function GET(req: NextRequest) {
  const deployer = req.nextUrl.searchParams.get("deployer")?.toLowerCase();

  const companies = await listCompanies();

  // Filter by deployer if provided
  const filtered = deployer
    ? companies.filter(
        (c: { description: string | null }) =>
          extractDeployer(c.description) === deployer
      )
    : companies;

  // Enrich with agent count
  const enriched = await Promise.all(
    filtered.map(async (c: { id: string; name: string; description: string | null; status: string; createdAt: string }) => {
      const agents = await listAgents(c.id);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        agentCount: agents.length,
        deployer: extractDeployer(c.description),
        createdAt: c.createdAt,
      };
    })
  );

  return NextResponse.json(enriched);
}
