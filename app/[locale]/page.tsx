import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LandingPage from "@/components/landing/landing-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.meta");
  const title = t("title");
  const description = t("description");
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description },
  };
}

export default async function LocaleHomePage() {
  const t = await getTranslations("landing.meta");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: t("productName"),
    description: t("jsonLdDescription"),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "BRL",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LandingPage />
    </>
  );
}
