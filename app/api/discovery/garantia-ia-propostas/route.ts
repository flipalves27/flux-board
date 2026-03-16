import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const filePath = path.join(process.cwd(), "content", "discovery-garantia-ia-propostas.html");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Conteúdo não encontrado" }, { status: 404 });
  }

  const html = fs.readFileSync(filePath, "utf-8");
  const styleStart = html.indexOf("<style>") + 7;
  const styleEnd = html.indexOf("</style>");
  const bodyStart = html.indexOf("<body>") + 6;
  const bodyEnd = html.indexOf("</body>");

  const css = styleStart > 6 && styleEnd > styleStart ? html.slice(styleStart, styleEnd) : "";
  const body = bodyStart > 5 && bodyEnd > bodyStart ? html.slice(bodyStart, bodyEnd) : html;

  return NextResponse.json({ css, body });
}
