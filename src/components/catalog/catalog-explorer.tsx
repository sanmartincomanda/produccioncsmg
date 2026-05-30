"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search, SlidersHorizontal } from "lucide-react";

import { listCloudCatalogPageData } from "@/lib/firebase/cloud-data";
import type { SicarCatalogItem, SicarCatalogResult } from "@/lib/sicar/catalog";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

type CatalogExplorerProps = {
  initialData: SicarCatalogResult;
};

type StatusFilter = "all" | "active" | "inactive";

export function CatalogExplorer({ initialData }: CatalogExplorerProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(initialData.page || 1);
  const [allRows, setAllRows] = useState(initialData.rows);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const pageLimit = initialData.limit || 24;

  useEffect(() => {
    let cancelled = false;

    async function loadCloudCatalog() {
      startTransition(() => {
        setLoading(true);
        setError(null);
      });

      try {
        const nextData = await listCloudCatalogPageData();

        if (!cancelled) {
          startTransition(() => {
            setAllRows(nextData.rows);
          });
        }
      } catch (fetchError) {
        if (!cancelled) {
          startTransition(() => {
            setError(
              fetchError instanceof Error
                ? fetchError.message
                : "No fue posible consultar el catálogo en la nube.",
            );
          });
        }
      } finally {
        if (!cancelled) {
          startTransition(() => {
            setLoading(false);
          });
        }
      }
    }

    void loadCloudCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return allRows.filter((item) => {
      const matchesStatus =
        status === "all" ? true : status === "active" ? item.status === 1 : item.status !== 1;

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [item.clave, item.descripcion, item.unidadVenta, item.caracteristicas]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [allRows, deferredSearch, status]);

  const totalPages = Math.max(Math.ceil(filteredRows.length / pageLimit), 1);

  useEffect(() => {
    if (page > totalPages) {
      setPage(1);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const startIndex = (page - 1) * pageLimit;

    startTransition(() => {
      setData({
        rows: filteredRows.slice(startIndex, startIndex + pageLimit),
        total: filteredRows.length,
        page,
        limit: pageLimit,
      });
    });
  }, [filteredRows, page, pageLimit]);

  return (
    <div className="space-y-6">
      <div className="surface-card flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-700">Busqueda viva</p>
          <h2 className="font-display text-2xl text-slate-950">Catalogo conectado a SICAR</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Esta vista lee `articulo` y `unidad` en tiempo real. Muestra clave, descripcion, unidad,
            existencia, costo de compra y costo promedio.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-700">
            {formatNumber(data.total)} articulos encontrados
          </div>
          <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-2 font-medium text-cyan-800">
            Catalogo en vivo
          </div>
        </div>
      </div>

      <div className="surface-card space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => {
                const nextSearch = event.target.value;
                startTransition(() => {
                  setSearch(nextSearch);
                  setPage(1);
                });
              }}
              placeholder="Buscar por clave, descripcion, unidad o caracteristicas"
              className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-500"
            />
          </label>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <SlidersHorizontal className="ml-3 size-4 text-slate-500" />
            {(["all", "active", "inactive"] as StatusFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  startTransition(() => {
                    setStatus(item);
                    setPage(1);
                  });
                }}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm transition",
                  status === item
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-white hover:text-slate-900",
                )}
              >
                {item === "all" ? "Todos" : item === "active" ? "Activos" : "Inactivos"}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.22em] text-slate-500">
                <th className="px-4 py-2">Clave</th>
                <th className="px-4 py-2">Descripcion</th>
                <th className="px-4 py-2">Unidad</th>
                <th className="px-4 py-2">Existencia</th>
                <th className="px-4 py-2">Costo compra</th>
                <th className="px-4 py-2">Costo promedio</th>
                <th className="px-4 py-2">Rol SICAR</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((item) => (
                <CatalogRow key={`${item.artId}-${item.clave}`} item={item} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            {loading ? <LoaderCircle className="size-4 animate-spin text-cyan-700" /> : null}
            <span>
              Pagina {formatNumber(data.page)} de {formatNumber(totalPages)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={data.page === 1 || loading}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition enabled:hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
              disabled={data.page >= totalPages || loading}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition enabled:hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CatalogRow({ item }: { item: SicarCatalogItem }) {
  const tags = [];

  if (item.insumo === 1) tags.push("Insumo");
  if (item.platillo === 1) tags.push("Platillo");
  if (item.receta === 1) tags.push("Receta");
  if (item.servicio === 1) tags.push("Servicio");
  if (tags.length === 0) tags.push("Articulo");

  return (
    <tr className="rounded-2xl bg-slate-50 text-slate-700 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.7)]">
      <td className="rounded-l-2xl px-4 py-4 font-semibold text-slate-900">{item.clave}</td>
      <td className="max-w-[32rem] px-4 py-4">
        <div className="space-y-1">
          <p className="font-medium text-slate-900">{item.descripcion}</p>
          {item.caracteristicas ? (
            <p className="line-clamp-2 text-xs text-slate-500">{item.caracteristicas}</p>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-4">{item.unidadVenta}</td>
      <td className={cn("px-4 py-4 font-medium", Number(item.existencia) < 0 ? "text-rose-700" : "text-slate-900")}>
        {formatNumber(item.existencia, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
      </td>
      <td className="px-4 py-4">{formatCurrency(item.precioCompra)}</td>
      <td className="px-4 py-4">{formatCurrency(item.preCompraProm)}</td>
      <td className="rounded-r-2xl px-4 py-4">
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600"
            >
              {tag}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}
