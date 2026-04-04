import { Suspense } from "react";
import SprintCockpitPage from "../../../sprints/cockpit/page";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function Page() {
  return (
    <Suspense fallback={<ReportsRouteLoadingFallback />}>
      <SprintCockpitPage />
    </Suspense>
  );
}
