"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, Factory, History, Settings2, UploadCloud } from "lucide-react";

import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Producir", icon: Factory },
  { href: "/costeo", label: "Costeo", icon: Calculator },
  { href: "/sicar", label: "SICAR", icon: UploadCloud },
  { href: "/historial", label: "Historial", icon: History },
  { href: "/configuracion", label: "Configuracion", icon: Settings2 },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {navigation.map((item, index) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group relative flex items-center gap-3 overflow-hidden rounded-[22px] border px-4 py-3.5 text-sm transition-all duration-300",
              isActive
                ? "border-cyan-300/35 bg-[linear-gradient(135deg,rgba(11,89,122,0.95),rgba(14,116,144,0.92))] text-white shadow-[0_24px_36px_-28px_rgba(8,145,178,0.85)]"
                : "border-white/10 bg-white/5 text-slate-200 hover:border-white/18 hover:bg-white/8",
            )}
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-white/18" />
            <span
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-xl border transition-all duration-300",
                isActive
                  ? "border-white/15 bg-white/12 text-white"
                  : "border-white/8 bg-white/6 text-slate-300 group-hover:text-white",
              )}
            >
              <Icon className="size-4" />
            </span>

            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block truncate font-medium">{item.label}</span>
                <span
                  className={cn(
                    "mt-1 block text-[10px] uppercase tracking-[0.22em]",
                    isActive ? "text-cyan-100/80" : "text-slate-400",
                  )}
                >
                  modulo {String(index + 1).padStart(2, "0")}
                </span>
              </div>

              <span
                className={cn(
                  "h-2 w-2 rounded-full transition-all duration-300",
                  isActive ? "bg-cyan-200 shadow-[0_0_0_5px_rgba(103,232,249,0.15)]" : "bg-white/20",
                )}
              />
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
