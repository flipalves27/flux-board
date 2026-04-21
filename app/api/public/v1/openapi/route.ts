import { NextResponse } from "next/server";
import { PUBLIC_API_V1_OPENAPI } from "@/lib/public-api-openapi";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(PUBLIC_API_V1_OPENAPI);
}

