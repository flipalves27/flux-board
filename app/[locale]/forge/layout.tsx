import { ForgeStudioShell } from "@/components/forge/forge-studio-shell";

export default function ForgeLayout({ children }: { children: React.ReactNode }) {
  return <ForgeStudioShell>{children}</ForgeStudioShell>;
}
