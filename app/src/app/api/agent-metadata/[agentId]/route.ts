import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  // ERC-8004 compatible registration file
  const metadata = {
    type: "agent",
    name: "Main Operator Agent",
    description:
      "Primary operator agent for an AI company deployed on Celo via Agent Company Launcher. Handles identity, delegation, and payment execution.",
    image: "",
    services: [
      {
        type: "MCP",
        endpoint: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/agent/${agentId}`,
      },
    ],
    supportedTrust: ["reputation"],
    registrations: [
      {
        chain: "celo",
        chainId: 42220,
        agentId,
      },
    ],
    active: true,
  };

  return NextResponse.json(metadata);
}
