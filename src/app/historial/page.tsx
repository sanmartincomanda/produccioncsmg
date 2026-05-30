import { CalendarRange, Clock3, PackageSearch } from "lucide-react";

import { HistoryToolbar } from "@/components/history/history-toolbar";
import { getProductionHistory } from "@/lib/production/data";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type HistoryPageProps = {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    folio?: string;
  }>;
};

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const filters = await searchParams;
  const rows = await getProductionHistory(filters);

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
        <form className="grid gap-4 lg:grid-cols-[0.35fr_0.35fr_0.3fr_auto]">
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Desde</span>
            <input
              type="date"
              name="dateFrom"
              defaultValue={filters.dateFrom ?? ""}
              className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 outline-none transition focus:border-slate-500"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Hasta</span>
            <input
              type="date"
              name="dateTo"
              defaultValue={filters.dateTo ?? ""}
              className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 outline-none transition focus:border-slate-500"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Folio</span>
            <input
              name="folio"
              defaultValue={filters.folio ?? ""}
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
        {rows.length === 0 ? (
          <div className="module-card text-center">
            <PackageSearch className="mx-auto size-10 text-slate-300" />
            <h2 className="font-display mt-4 text-2xl text-slate-950">Sin producciones registradas</h2>
            <p className="mt-2 text-sm text-slate-500">
              Aquí solo aparecerán órdenes creadas por la app, no ajustes generales de SICAR.
            </p>
          </div>
        ) : null}

        {rows.map((row) => (
          <div key={row.productionOrderId} className="module-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-display text-3xl text-slate-950">{row.folio}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                    {row.status}
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
                  value={row.scheduledAt ?? "N/D"}
                />
                <InfoCard
                  icon={<Clock3 className="size-4" />}
                  label="Cierre"
                  value={row.completedAt ?? "N/D"}
                />
                <InfoCard
                  icon={<PackageSearch className="size-4" />}
                  label="Costo"
                  value={formatCurrency(row.estimatedTotalCost)}
                />
              </div>
            </div>

            {row.notes ? (
              <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                {row.notes}
              </div>
            ) : null}
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
  icon: React.ReactNode;
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
