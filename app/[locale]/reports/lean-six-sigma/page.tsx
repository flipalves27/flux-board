import { Suspense } from "react";
import LssReportsPage from "../../../reports/lean-six-sigma/page";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function Page() {
  return (
    <Suspense fallback={<ReportsRouteLoadingFallback />}>
      <LssReportsPage />
    </Suspense>
  );
}
