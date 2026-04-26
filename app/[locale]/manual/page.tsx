import { redirect } from "next/navigation";

type Props = { params: Promise<{ locale: string }> };

export default async function ManualIndexPage({ params }: Props) {
  const { locale } = await params;
  const loc = locale === "en" || locale === "pt-BR" ? locale : "pt-BR";
  redirect(`/${loc}/manual/intro`);
}
