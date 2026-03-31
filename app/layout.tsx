import type { Metadata } from "next";
import { Suspense } from "react";
import { DM_Sans, Outfit, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { themeBootstrapInlineScript } from "@/lib/theme-storage";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AuthProvider } from "@/context/auth-context";
import { OrgBrandingProvider } from "@/context/org-branding-context";
import { ThemeProvider } from "@/context/theme-context";
import { NavigationVariantProvider } from "@/context/navigation-variant-context";
import { RoutineTasksProvider } from "@/context/routine-tasks-context";
import { ToastProvider } from "@/context/toast-context";
import { FluxyPresenceProvider } from "@/context/fluxy-presence-context";
import { AppShell } from "@/components/app-shell";
import { FluxDiagnosticsRoot } from "@/components/flux-diagnostics/flux-diagnostics-root";
import { PwaRegister } from "@/components/pwa-register";
import { headers } from "next/headers";

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

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-fluxy",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Flux-Board — Commercial operations with clarity",
    template: "%s · Flux-Board",
  },
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
  const hdrs = await headers();
  const nonce = hdrs.get("x-nonce") ?? undefined;
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${dmSans.variable} ${outfit.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#6c5ce7" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* suppressHydrationWarning: browsers strip the nonce attr from the DOM after CSP, causing React 19 hydration mismatch */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeBootstrapInlineScript() }} />
      </head>
      <body className="antialiased font-body bg-[var(--flux-surface-dark)] text-[var(--flux-text)]">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Suspense fallback={null}>
            <FluxDiagnosticsRoot>
              <AuthProvider>
                <OrgBrandingProvider>
                  <ToastProvider>
                    <ThemeProvider>
                      <NavigationVariantProvider>
                        <FluxyPresenceProvider>
                          <RoutineTasksProvider>
                            <PwaRegister />
                            <AppShell>{children}</AppShell>
                          </RoutineTasksProvider>
                        </FluxyPresenceProvider>
                      </NavigationVariantProvider>
                    </ThemeProvider>
                  </ToastProvider>
                </OrgBrandingProvider>
              </AuthProvider>
            </FluxDiagnosticsRoot>
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
