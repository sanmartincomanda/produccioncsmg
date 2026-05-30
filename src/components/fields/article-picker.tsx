"use client";

import { startTransition, useDeferredValue, useState } from "react";
import { Search, X } from "lucide-react";

import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { CatalogOption } from "@/types/production";

type ArticlePickerProps = {
  label: string;
  value: CatalogOption | null;
  options: CatalogOption[];
  onChange: (value: CatalogOption | null) => void;
  placeholder?: string;
};

export function ArticlePicker({
  label,
  value,
  options,
  onChange,
  placeholder = "Buscar producto del catalogo",
}: ArticlePickerProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const filteredOptions = options
    .filter((item) => {
      if (!deferredQuery.trim()) {
        return true;
      }

      const normalized = `${item.clave} ${item.descripcion} ${item.unidadVenta}`.toLowerCase();
      return normalized.includes(deferredQuery.toLowerCase());
    })
    .slice(0, 8);

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            startTransition(() => {
              setIsOpen((current) => !current);
              setQuery("");
            });
          }}
          className={cn(
            "flex min-h-14 w-full items-center justify-between rounded-2xl border bg-white px-4 text-left transition",
            value ? "border-slate-300" : "border-dashed border-slate-300 text-slate-400",
          )}
        >
          <div className="min-w-0">
            {value ? (
              <>
                <p className="truncate font-medium text-slate-900">
                  {value.clave} - {value.descripcion}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {value.unidadVenta} · existencia {formatNumber(value.existencia, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} · costo prom. {formatCurrency(value.preCompraProm)}
                </p>
              </>
            ) : (
              <p>{placeholder}</p>
            )}
          </div>
          <div className="ml-3 flex items-center gap-2">
            {value ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(null);
                }}
                className="inline-flex size-8 items-center justify-center rounded-full border border-slate-200 text-slate-500"
              >
                <X className="size-4" />
              </button>
            ) : null}
            <Search className="size-4 text-slate-400" />
          </div>
        </button>

        {isOpen ? (
          <div className="absolute z-30 mt-2 w-full rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.5)]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Clave, descripcion o unidad"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
            />

            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {filteredOptions.map((item) => (
                <button
                  key={item.artId}
                  type="button"
                  onClick={() => {
                    onChange(item);
                    startTransition(() => {
                      setIsOpen(false);
                      setQuery("");
                    });
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100"
                >
                  <p className="font-medium text-slate-900">
                    {item.clave} - {item.descripcion}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.unidadVenta} · prom. {formatCurrency(item.preCompraProm)} · existencia{" "}
                    {formatNumber(item.existencia, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </p>
                </button>
              ))}

              {filteredOptions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                  No se encontraron coincidencias.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
