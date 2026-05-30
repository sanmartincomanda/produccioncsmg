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
            <aside className="ink-card flex flex-col justify-between overflow-hidden">
              <div className="space-y-8">
                <div className="space-y-4">
                  <Link href="/" className="inline-flex items-center gap-3">
                    <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                      <DatabaseZap className="size-5" />
                    </span>
                    <div>
                      <p className="font-display text-xl tracking-wide text-slate-950">Transformación</p>
                      <p className="text-sm text-slate-500">Producción conectada a SICAR</p>
                    </div>
                  </Link>

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                      Catálogo SICAR
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                      VRN editable
                    </span>
                  </div>
                </div>

                <AppNav />
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-slate-700">
                <div className="flex items-center gap-2 text-emerald-700">
                  <ShieldCheck className="size-4" />
                  <span>Modo seguro</span>
                </div>
                <p className="mt-2 text-xs">Historial propio y controlado.</p>
              </div>
            </aside>

            <main className="min-w-0 rounded-[32px] border border-white/50 bg-white/70 p-4 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.2)] sm:p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
