import { Suspense } from "react";
import BoardSprintHistoryPage from "../../../board/[id]/sprint-history/page";
import { BoardRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function Page() {
  return (
    <Suspense fallback={<BoardRouteLoadingFallback />}>
      <BoardSprintHistoryPage />
    </Suspense>
  );
}
