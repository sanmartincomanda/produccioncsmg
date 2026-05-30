import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Sans_Condensed, Manrope } from "next/font/google";
import { DatabaseZap, ShieldCheck } from "lucide-react";

import { AppNav } from "@/components/navigation/app-nav";
import { FirebaseAnalyticsProvider } from "@/components/providers/firebase-analytics-provider";

import "@/app/globals.css";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

const displayFont = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Transformacion SICAR",
  description: "Base web para produccion, transformacion y costeo VRN conectada a SICAR por MySQL.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <FirebaseAnalyticsProvider />
        <div className="min-h-screen px-4 py-5 lg:px-6">
          <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-[1600px] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="ink-card relative flex flex-col justify-between overflow-hidden">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.24),transparent_72%)]" />

              <div className="relative space-y-8">
                <div className="space-y-4">
                  <Link href="/" className="inline-flex items-center gap-3">
                    <span className="inline-flex size-11 items-center justify-center rounded-2xl border border-cyan-300/35 bg-cyan-300/10 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                      <DatabaseZap className="size-5" />
                    </span>
                    <div>
                      <p className="font-display text-xl tracking-[0.04em] text-white">Transformacion</p>
                      <p className="text-sm text-slate-300">Produccion conectada a SICAR</p>
                    </div>
                  </Link>

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs text-slate-200">
                      Catalogo SICAR
                    </span>
                    <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs text-slate-200">
                      VRN editable
                    </span>
                  </div>
                </div>

                <AppNav />
              </div>

              <div className="relative rounded-3xl border border-emerald-400/20 bg-emerald-400/8 p-4 text-sm text-slate-200">
                <div className="flex items-center gap-2 text-emerald-300">
                  <ShieldCheck className="size-4" />
                  <span>Modo seguro</span>
                </div>
                <p className="mt-2 text-xs text-slate-300">Historial propio y controlado.</p>
              </div>
            </aside>

            <main className="min-w-0 rounded-[34px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(246,250,253,0.98))] p-4 shadow-[0_44px_110px_-58px_rgba(15,23,42,0.28)] sm:p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
