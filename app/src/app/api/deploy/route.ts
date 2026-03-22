import { NextRequest, NextResponse } from "next/server";
import {
  listCompanies,
  createCompany,
  createAgent,
  createAgentKey,
  createGoal,
  createIssue,
} from "@/lib/paperclip";
import type { CompanyBlueprint } from "@/lib/blueprint";
import { createCompanyTreasuryWallet } from "@/lib/treasury";
import { updateTrustState } from "@/lib/trust-store";

interface DeployRequest {
  blueprint: CompanyBlueprint;
  deployerAddress: string;
}

export async function POST(req: NextRequest) {
  const { blueprint, deployerAddress }: DeployRequest = await req.json();

  if (!blueprint?.companyName || !blueprint?.agents?.length) {
    return NextResponse.json(
      { error: "Invalid blueprint" },
      { status: 400 }
    );
  }

  if (!deployerAddress) {
    return NextResponse.json(
      { error: "deployerAddress is required (connect wallet first)" },
      { status: 400 }
    );
  }

  let treasuryAddress: `0x${string}`;
  let treasuryEncryptedPrivateKey: string;
  try {
    const treasury = createCompanyTreasuryWallet();
    treasuryAddress = treasury.address;
    treasuryEncryptedPrivateKey = treasury.encryptedPrivateKey;
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }

  // Duplicate protection: check if company with same name exists
  const existing = await listCompanies();
  const duplicate = existing.find?.(
    (c: { name: string }) =>
      c.name.toLowerCase() === blueprint.companyName.toLowerCase()
  );
  if (duplicate) {
    return NextResponse.json(
      { error: `Company "${blueprint.companyName}" already exists`, companyId: duplicate.id },
      { status: 409 }
    );
  }

  // Step 1: Create company (tag with deployer address)
  const description = `${blueprint.companyDescription} [deployer:${deployerAddress}]`;
  const company = await createCompany(
    blueprint.companyName,
    description
  );
  const companyId = company.id;

  updateTrustState(companyId, {
    treasuryAddress,
    treasuryEncryptedPrivateKey,
    treasuryStatus: "unfunded",
    treasuryCreatedAt: new Date().toISOString(),
    companySpendPolicy: {
      token: "cUSD",
      maxAmountPerTx: "0.01",
      maxAmountPerDay: "1.00",
      allowedRecipients: [],
    },
    agentSpendPolicies: {},
  });

  // Step 2: Create agents — Main Operator first
  const mainOperatorDef = blueprint.agents.find((a) => a.reportsTo === null);
  const otherAgents = blueprint.agents.filter((a) => a.reportsTo !== null);

  let mainOperatorId: string | null = null;
  let mainOperatorApiKey: string | null = null;
  const createdAgents: Array<{ id: string; name: string; role: string }> = [];

  if (mainOperatorDef) {
    const mainOp = await createAgent(companyId, {
      name: mainOperatorDef.name,
      role: mainOperatorDef.role,
      capabilities: mainOperatorDef.capabilities,
      adapterType: mainOperatorDef.adapterType,
    });
    mainOperatorId = mainOp.id;
    createdAgents.push({ id: mainOp.id, name: mainOp.name, role: mainOp.role });

    // Step 3: Generate API key for Main Operator
    const keyResult = await createAgentKey(mainOp.id, "main-operator-key");
    mainOperatorApiKey = keyResult.key || keyResult.token || null;
  }

  // Create remaining agents reporting to Main Operator
  for (const agentDef of otherAgents) {
    const agent = await createAgent(companyId, {
      name: agentDef.name,
      role: agentDef.role,
      capabilities: agentDef.capabilities,
      adapterType: agentDef.adapterType,
      ...(mainOperatorId ? { reportsTo: mainOperatorId } : {}),
    });
    createdAgents.push({ id: agent.id, name: agent.name, role: agent.role });
  }

  // Step 4: Create initial company goal
  const goal = await createGoal(companyId, {
    title: "Launch company operations",
    level: "company",
    status: "active",
  });

  // Step 5: Create startup issue assigned to Main Operator
  let startupIssue = null;
  if (mainOperatorId) {
    startupIssue = await createIssue(companyId, {
      title: "Complete trust verification and execute first payment",
      description:
        "Verify Self identity, register ERC-8004, set delegation policy, execute stablecoin transfer",
      priority: "high",
      assigneeAgentId: mainOperatorId,
      goalId: goal.id,
    });
  }

  return NextResponse.json({
    companyId,
    companyName: blueprint.companyName,
    treasuryAddress,
    treasuryStatus: "unfunded",
    mainOperatorId,
    mainOperatorApiKey,
    agents: createdAgents,
    goalId: goal.id,
    startupIssueId: startupIssue?.id || null,
  });
}
