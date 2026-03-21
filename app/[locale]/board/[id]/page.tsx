import { Suspense } from "react";
import BoardPage from "../../../board/[id]/page";
import { BoardRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";

export default function Page() {
  return (
    <Suspense fallback={<BoardRouteLoadingFallback />}>
      <BoardPage />
    </Suspense>
  );
}
