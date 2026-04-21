import { redirect } from "next/navigation";

export default async function LocalizedProgramIncrementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const normalizedLocale = locale === "en" ? "en" : "pt-BR";
  redirect(`/${normalizedLocale}/sprints`);
}
