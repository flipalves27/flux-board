import { Suspense } from "react";
import ExecutiveDashboardPage from "../../portfolio/page";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function Page() {
  return (
    <Suspense fallback={<ReportsRouteLoadingFallback />}>
      <ExecutiveDashboardPage />
    </Suspense>
  );
}
