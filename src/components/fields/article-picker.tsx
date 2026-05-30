"use client";

import { startTransition, useDeferredValue, useMemo, useState } from "react";
import { Search, Star, X } from "lucide-react";

import {
  ALL_FILTER,
  FAVORITES_FILTER,
  MOST_USED_FILTER,
  filterCatalogOptions,
  getCatalogDepartmentFilters,
  getCatalogUsageCount,
  isCatalogFavorite,
  readCatalogBrowserPreferences,
  registerCatalogUsage,
  toggleCatalogFavorite,
} from "@/lib/catalog/browser-preferences";
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
  const [activeFilter, setActiveFilter] = useState(ALL_FILTER);
  const [preferences, setPreferences] = useState(() => readCatalogBrowserPreferences());
  const deferredQuery = useDeferredValue(query);

  const departmentFilters = useMemo(() => getCatalogDepartmentFilters(options), [options]);
  const filteredOptions = useMemo(
    () => filterCatalogOptions(options, deferredQuery, activeFilter, preferences).slice(0, 18),
    [activeFilter, deferredQuery, options, preferences],
  );

  function handleSelect(item: CatalogOption) {
    setPreferences((current) => registerCatalogUsage(item.artId, current));
    onChange(item);
    startTransition(() => {
      setIsOpen(false);
      setQuery("");
    });
  }

  function handleToggleFavorite(artId: number) {
    setPreferences((current) => toggleCatalogFavorite(artId, current));
  }

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
                  {(value.departmentName || "OTROS").toUpperCase()} · {value.unidadVenta} · existencia{" "}
                  {formatNumber(value.existencia, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} · costo prom.{" "}
                  {formatCurrency(value.preCompraProm)}
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

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <FilterChip active={activeFilter === ALL_FILTER} onClick={() => setActiveFilter(ALL_FILTER)}>
                Todos
              </FilterChip>
              <FilterChip
                active={activeFilter === FAVORITES_FILTER}
                onClick={() => setActiveFilter(FAVORITES_FILTER)}
              >
                Favoritos
              </FilterChip>
              <FilterChip
                active={activeFilter === MOST_USED_FILTER}
                onClick={() => setActiveFilter(MOST_USED_FILTER)}
              >
                Más usados
              </FilterChip>
              {departmentFilters.map((department) => (
                <FilterChip
                  key={department}
                  active={activeFilter === department}
                  onClick={() => setActiveFilter(department)}
                >
                  {department}
                </FilterChip>
              ))}
            </div>

            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {filteredOptions.map((item) => {
                const favorite = isCatalogFavorite(item.artId, preferences);
                const usageCount = getCatalogUsageCount(item.artId, preferences);

                return (
                  <button
                    key={item.artId}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {item.clave} - {item.descripcion}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {(item.departmentName || "OTROS").toUpperCase()}
                          {item.categoryName ? ` · ${item.categoryName}` : ""} · {item.unidadVenta} · prom.{" "}
                          {formatCurrency(item.preCompraProm)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleFavorite(item.artId);
                        }}
                        className={cn(
                          "inline-flex size-9 shrink-0 items-center justify-center rounded-full border transition",
                          favorite
                            ? "border-amber-200 bg-amber-50 text-amber-600"
                            : "border-slate-200 bg-white text-slate-400",
                        )}
                      >
                        <Star className={cn("size-4", favorite ? "fill-current" : "")} />
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
                        existencia{" "}
                        {formatNumber(item.existencia, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </span>
                      {usageCount > 0 ? (
                        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700">
                          {usageCount} usos
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}

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

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition",
        active
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white",
      )}
    >
      {children}
    </button>
  );
}
