import { NextRequest, NextResponse } from "next/server";
import { getActivity } from "@/lib/paperclip";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId required" },
      { status: 400 }
    );
  }

  try {
    const activity = await getActivity(companyId);
    return NextResponse.json({ activity });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
