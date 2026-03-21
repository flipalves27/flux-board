import { Suspense } from "react";
import ReportsPage from "../../reports/page";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function Page() {
  return (
    <Suspense fallback={<ReportsRouteLoadingFallback />}>
      <ReportsPage />
    </Suspense>
  );
}
