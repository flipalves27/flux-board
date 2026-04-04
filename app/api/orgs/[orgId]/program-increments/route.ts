import { NextResponse } from "next/server";

export const runtime = "nodejs";

function gone() {
  return NextResponse.json(
    { error: "Program Increments foi descontinuado." },
    { status: 410 }
  );
}

export async function GET() { return gone(); }
export async function POST() { return gone(); }
