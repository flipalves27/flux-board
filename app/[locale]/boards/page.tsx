import { Suspense } from "react";
import BoardsPage from "../../(workspace)/boards/page";
import { BoardsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function Page() {
  return (
    <Suspense fallback={<BoardsRouteLoadingFallback />}>
      <BoardsPage />
    </Suspense>
  );
}
