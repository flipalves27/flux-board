import { ForgeRunDetail } from "@/components/forge/forge-run-detail";

export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <ForgeRunDetail runId={runId} />;
}
