import { ForgeLiveCockpit } from "@/components/forge/forge-live-cockpit";

export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <ForgeLiveCockpit runId={runId} />;
}
