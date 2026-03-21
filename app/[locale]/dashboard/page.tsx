import { Suspense } from "react";
import ExecutiveDashboardPage from "../../dashboard/page";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function Page() {
  return (
    <Suspense fallback={<ReportsRouteLoadingFallback />}>
      <ExecutiveDashboardPage />
    </Suspense>
  );
}
