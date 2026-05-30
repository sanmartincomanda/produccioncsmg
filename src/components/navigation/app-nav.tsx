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
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-all duration-300",
              isActive
                ? "border-cyan-200 bg-cyan-50 text-slate-950 shadow-[0_18px_42px_-28px_rgba(15,23,42,0.45)]"
                : "border-slate-800/10 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950",
            )}
          >
            <Icon className={cn("size-4", isActive ? "text-cyan-700" : "text-slate-400")} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
