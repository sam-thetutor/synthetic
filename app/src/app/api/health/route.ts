import { NextResponse } from "next/server";
import { getEnvConfig } from "@/lib/env";
import { getOperatorAddress, getCeloBalance, getCusdBalance, getBlockNumber } from "@/lib/celo";

export async function GET() {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // Check env vars
  try {
    getEnvConfig();
    checks.env = { status: "ok" };
  } catch (e) {
    checks.env = { status: "fail", detail: (e as Error).message };
  }

  // Check Celo RPC connection
  try {
    const blockNumber = await getBlockNumber();
    checks.celo_rpc = { status: "ok", detail: `block ${blockNumber.toString()}` };
  } catch (e) {
    checks.celo_rpc = { status: "fail", detail: (e as Error).message };
  }

  // Check wallet balance
  try {
    const address = getOperatorAddress();
    const celoBalance = await getCeloBalance(address);
    const cusdBalance = await getCusdBalance(address);
    checks.wallet = {
      status: "ok",
      detail: `${address} | CELO: ${celoBalance} | cUSD: ${cusdBalance}`,
    };
  } catch (e) {
    checks.wallet = { status: "fail", detail: (e as Error).message };
  }

  // Check Paperclip connection
  try {
    const config = getEnvConfig();
    const res = await fetch(`${config.paperclipApiUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      checks.paperclip = { status: "ok" };
    } else {
      checks.paperclip = { status: "fail", detail: `HTTP ${res.status}` };
    }
  } catch (e) {
    checks.paperclip = { status: "unreachable", detail: (e as Error).message };
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok");
  return NextResponse.json({ status: allOk ? "healthy" : "degraded", checks });
}
