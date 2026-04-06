import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser, updateUser } from "@/lib/kv-users";
import { UserThemePreferenceSchema, zodErrorToMessage } from "@/lib/schemas";
import { publicApiErrorResponse } from "@/lib/public-api-error";

export async function PATCH(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    await ensureAdminUser();
    const body = await request.json();
    const parsed = UserThemePreferenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    const user = await updateUser(payload.id, payload.orgId, {
      themePreference: parsed.data.themePreference,
    });
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      themePreference: user.themePreference ?? parsed.data.themePreference,
    });
  } catch (err) {
    console.error("User theme preference API error:", err);
    return publicApiErrorResponse(err, { context: "api/users/me/theme/route.ts" });
  }
}
