import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import "./globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AuthProvider } from "@/context/auth-context";
import { OrgBrandingProvider } from "@/context/org-branding-context";
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
  title: "Flux-Board — Commercial operations with clarity",
  description:
    "Professional Kanban, daily insights, context on cards, and portfolio visibility. Built for sales, operations, and leadership teams.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} className={`${dmSans.variable} ${outfit.variable}`}>
      <body className="antialiased font-body bg-[var(--flux-surface-dark)] text-[var(--flux-text)]">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <OrgBrandingProvider>
              <ToastProvider>
                <ThemeProvider>
                  <RoutineTasksProvider>
                    <AppShell>{children}</AppShell>
                  </RoutineTasksProvider>
                </ThemeProvider>
              </ToastProvider>
            </OrgBrandingProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
