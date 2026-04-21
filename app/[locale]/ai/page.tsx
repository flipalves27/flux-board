import { Suspense } from "react";
import FluxAiHubPage from "../../ai/page";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function Page() {
  return (
    <Suspense fallback={<ReportsRouteLoadingFallback />}>
      <FluxAiHubPage />
    </Suspense>
  );
}
