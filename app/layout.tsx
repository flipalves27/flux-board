import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/auth-context";
import { ThemeProvider } from "@/context/theme-context";
import { RoutineTasksProvider } from "@/context/routine-tasks-context";
import { ToastProvider } from "@/context/toast-context";
import { AppShell } from "@/components/app-shell";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flux-Board — Organize the flow. Ship what matters.",
  description: "Plataforma de gestão de backlog e Kanban. Organize o fluxo, entregue o que importa.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${dmSans.variable} ${outfit.variable}`}>
      <body className="antialiased font-body bg-[var(--flux-surface-dark)] text-[var(--flux-text)]">
        <AuthProvider>
          <ToastProvider>
            <ThemeProvider>
              <RoutineTasksProvider>
                <AppShell>{children}</AppShell>
              </RoutineTasksProvider>
            </ThemeProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
