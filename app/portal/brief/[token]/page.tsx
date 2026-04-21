import { redirect } from "next/navigation";
import { routing } from "@/i18n";

export default async function LegacyBriefPortalRedirect({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/${routing.defaultLocale}/portal/brief/${token}`);
}
