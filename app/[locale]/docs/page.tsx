import { Suspense } from "react";
import DocsPage from "../../docs/page";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DocsPage />
    </Suspense>
  );
}
