import { Suspense } from "react";
import SpecPlanPage from "@/components/spec-plan/spec-plan-page";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SpecPlanPage />
    </Suspense>
  );
}
