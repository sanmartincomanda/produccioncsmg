"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronDown, Clock3, PackageSearch } from "lucide-react";

import { HistoryToolbar } from "@/components/history/history-toolbar";
import { listCloudProductionHistory } from "@/lib/firebase/cloud-data";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";
import type { ProductionHistoryRow } from "@/types/production";

type HistoryWorkbenchProps = {
  initialRows?: ProductionHistoryRow[];
  initialFilters?: {
    dateFrom?: string;
    dateTo?: string;
    folio?: string;
  };
};

export function HistoryWorkbench({
  initialRows = [],
  initialFilters,
}: HistoryWorkbenchProps) {
  const [rows, setRows] = useState<ProductionHistoryRow[]>(initialRows);
  const [loading, setLoading] = useState(initialRows.length === 0);
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo ?? "");
  const [folioDraft, setFolioDraft] = useState(initialFilters?.folio ?? "");
  const [appliedFolio, setAppliedFolio] = useState(initialFilters?.folio ?? "");

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const nextRows = await listCloudProductionHistory();

        if (!cancelled) {
          setRows(nextRows);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const normalizedFolio = appliedFolio.trim().toLowerCase();
      const rowDate = row.completedAt ?? row.scheduledAt ?? "";
      const rowDateOnly = rowDate ? rowDate.slice(0, 10) : "";

      if (normalizedFolio && !row.folio.toLowerCase().includes(normalizedFolio)) {
        return false;
      }

      if (dateFrom && rowDateOnly && rowDateOnly < dateFrom) {
        return false;
      }

      if (dateTo && rowDateOnly && rowDateOnly > dateTo) {
        return false;
      }

      return true;
    });
  }, [appliedFolio, dateFrom, dateTo, rows]);

  return (
    <div className="space-y-6">
      <section className="module-card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-tag">Historial</p>
            <h1 className="font-display text-4xl text-slate-950">Historial de producción</h1>
          </div>

          <div className="no-print">
            <HistoryToolbar />
          </div>
        </div>
      </section>

      <section className="module-card no-print">
        <form
          className="grid gap-4 lg:grid-cols-[0.35fr_0.35fr_0.3fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedFolio(folioDraft);
          }}
        >
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 outline-none transition focus:border-slate-500"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 outline-none transition focus:border-slate-500"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Folio</span>
            <input
              value={folioDraft}
              onChange={(event) => setFolioDraft(event.target.value)}
              placeholder="PR-001"
              className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 outline-none transition focus:border-slate-500"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="h-14 w-full rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white"
            >
              Filtrar
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        {loading ? (
          <div className="module-card text-center text-sm text-slate-500">Cargando historial...</div>
        ) : null}

        {!loading && filteredRows.length === 0 ? (
          <div className="module-card text-center">
            <PackageSearch className="mx-auto size-10 text-slate-300" />
            <h2 className="mt-4 font-display text-2xl text-slate-950">Sin producciones registradas</h2>
            <p className="mt-2 text-sm text-slate-500">
              Aquí solo aparecerán órdenes creadas por la app.
            </p>
          </div>
        ) : null}

        {filteredRows.map((row) => (
          <div key={row.productionOrderId} className="module-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-display text-3xl text-slate-950">{row.folio}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                    {row.status}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1",
                      row.workflowStage === "POSTED_TO_SICAR"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : row.workflowStage === "SICAR_EXCLUDED"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-slate-50 text-slate-600",
                    )}
                  >
                    {row.sicarStatusLabel}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                    {row.outputLines} productos
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                    {row.inputLines} insumos
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                    {row.movementLines} movimientos
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <InfoCard
                  icon={<CalendarRange className="size-4" />}
                  label="Programado"
                  value={row.scheduledAt ? formatDateTime(row.scheduledAt) : "N/D"}
                />
                <InfoCard
                  icon={<Clock3 className="size-4" />}
                  label="Cierre"
                  value={row.completedAt ? formatDateTime(row.completedAt) : "N/D"}
                />
                <InfoCard
                  icon={<PackageSearch className="size-4" />}
                  label="Costo"
                  value={formatCurrency(row.estimatedTotalCost)}
                />
              </div>
            </div>

            {row.workflowStage === "SICAR_EXCLUDED" && row.excludedReason ? (
              <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                NO INCLUIDO EN SICAR. RAZON: {row.excludedReason}
              </div>
            ) : null}

            {row.workflowStage === "POSTED_TO_SICAR" ? (
              <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                SICAR {row.sicarAinId ? `AIN ${row.sicarAinId}` : ""} {row.sicarComment ? `· ${row.sicarComment}` : ""}
              </div>
            ) : null}

            {row.notes ? (
              <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                {row.notes}
              </div>
            ) : null}

            <details className="mt-5 rounded-3xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Detalle del costeo</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {row.sourceLabel} · {formatNumber(row.sourceWeight, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lb
                    {" -> "}
                    {formatNumber(row.producedWeight, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lb
                  </p>
                </div>
                <ChevronDown className="size-4 text-slate-400" />
              </summary>

              <div className="space-y-4 border-t border-slate-200 px-5 py-5">
                <DetailSection title="Consumo">
                  {row.sourceConsumption.map((line) => (
                    <DetailRow
                      key={`${row.productionOrderId}-${line.label}-source`}
                      label={line.label}
                      values={[
                        `${formatNumber(line.quantity, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${line.unitName}`,
                        formatCurrency(line.unitCost),
                        formatCurrency(line.totalCost),
                      ]}
                    />
                  ))}
                </DetailSection>

                <DetailSection title="Salidas">
                  {row.outputEntries.map((line) => (
                    <DetailRow
                      key={`${row.productionOrderId}-${line.label}-output`}
                      label={line.label}
                      values={[
                        `${formatNumber(line.quantity, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${line.unitName}`,
                        formatCurrency(line.producedUnitCost),
                        formatCurrency(line.allocatedCost),
                      ]}
                    />
                  ))}
                </DetailSection>

                {row.manualCostEntries.length > 0 ? (
                  <DetailSection title="Costos adicionales">
                    {row.manualCostEntries.map((line) => (
                      <DetailRow
                        key={`${row.productionOrderId}-${line.label}-manual`}
                        label={line.label}
                        values={[
                          formatNumber(line.multiplier, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                          formatCurrency(line.cost),
                          formatCurrency(line.totalCost),
                        ]}
                      />
                    ))}
                  </DetailSection>
                ) : null}
              </div>
            </details>
          </div>
        ))}
      </section>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-slate-400">{icon}</div>
      <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function DetailRow({
  label,
  values,
}: {
  label: string;
  values: [string, string, string];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="font-medium text-slate-900">{label}</p>
        <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
          <span>{values[0]}</span>
          <span>{values[1]}</span>
          <span className="font-medium text-slate-900">{values[2]}</span>
        </div>
      </div>
    </div>
  );
}
