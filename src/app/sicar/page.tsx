import { ArrowDownCircle, ArrowUpCircle, ShieldCheck, Sigma } from "lucide-react";

import { getSicarPostingPreviews } from "@/lib/production/orders";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default async function SicarPage() {
  const previews = await getSicarPostingPreviews();

  return (
    <div className="space-y-6">
      <section className="module-card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-tag">SICAR</p>
            <h1 className="font-display text-4xl text-slate-950">Posteo de ajustes y costos</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-500">
              Este módulo ya separa las producciones costeadas que después se enviarán a SICAR.
              Por seguridad sigue en modo simulación: muestra el consumo, las entradas y el costo
              nuevo que se aplicará al producto terminado.
            </p>
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Escritura real en SICAR bloqueada hasta autorización explícita.
          </div>
        </div>
      </section>

      {previews.length === 0 ? (
        <section className="module-card text-center">
          <ShieldCheck className="mx-auto size-10 text-slate-300" />
          <h2 className="mt-4 font-display text-2xl text-slate-950">Sin producciones listas</h2>
          <p className="mt-2 text-sm text-slate-500">
            Primero guarda una producción y luego costéala. Aquí aparecerán las órdenes listas para
            preparar el ajuste en SICAR.
          </p>
        </section>
      ) : null}

      <section className="space-y-4">
        {previews.map((preview) => (
          <div key={preview.productionOrderId} className="module-card space-y-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-display text-3xl text-slate-950">{preview.folio}</p>
                <p className="mt-2 text-sm text-slate-500">{preview.sourceProductLabel}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                    {preview.workflowStage}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                    {formatNumber(preview.totalProducedWeight, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    lb
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                    {formatCurrency(preview.totalCost)}
                  </span>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Ajuste negativo del producto base + ajuste positivo de productos terminados +
                actualización de costo en SICAR.
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="size-4 text-rose-600" />
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Consumo a SICAR
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  {preview.sourceConsumption.map((line) => (
                    <div key={line.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="font-medium text-slate-900">{line.label}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <InfoPill label="Cantidad" value={`${formatNumber(line.quantity)} ${line.unitName}`} />
                        <InfoPill label="Costo unitario" value={formatCurrency(line.unitCost)} />
                        <InfoPill label="Total" value={formatCurrency(line.totalCost)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="size-4 text-emerald-600" />
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Entradas y costo nuevo
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  {preview.outputEntries.map((line) => (
                    <div key={line.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="font-medium text-slate-900">{line.label}</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <InfoPill label="Cantidad" value={`${formatNumber(line.quantity)} ${line.unitName}`} />
                        <InfoPill label="Costo asignado" value={formatCurrency(line.allocatedCost)} />
                        <InfoPill label="Nuevo costo SICAR" value={formatCurrency(line.producedUnitCost)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <Sigma className="size-4 text-slate-400" />
                <span>
                  Simulación activa. El siguiente paso real será escribir `ajusteinventario`,
                  `ajusteinventarioarticulo`, actualizar `articulo.preCompraProm` y registrar
                  `historial` en SICAR.
                </span>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
