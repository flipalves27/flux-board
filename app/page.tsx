import LandingPage from "@/components/landing/landing-page";
import { getPublicCommercialCatalog } from "@/lib/platform-commercial-settings";

export default async function RootHomePage() {
  const initialCatalog = await getPublicCommercialCatalog();
  return <LandingPage initialCatalog={initialCatalog} />;
}
