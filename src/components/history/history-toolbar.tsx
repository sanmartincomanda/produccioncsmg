"use client";

import { Printer } from "lucide-react";

export function HistoryToolbar() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700"
    >
      <Printer className="size-4" />
      Imprimir reporte
    </button>
  );
}
