import { Suspense } from "react";
import OkrsView from "./okrs-view";
import { OkrsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function Page() {
  return (
    <Suspense fallback={<OkrsRouteLoadingFallback />}>
      <OkrsView />
    </Suspense>
  );
}
