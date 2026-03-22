import { NextRequest, NextResponse } from "next/server";
import { generateBlueprint } from "@/lib/blueprint";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const prompt = body.prompt?.trim();

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const blueprint = generateBlueprint(prompt);
  return NextResponse.json(blueprint);
}
