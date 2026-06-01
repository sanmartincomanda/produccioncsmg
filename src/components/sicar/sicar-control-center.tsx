"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, ShieldCheck } from "lucide-react";

import {
  listCloudArticleProfiles,
  listCloudSicarPostingPreviews,
} from "@/lib/firebase/cloud-data";
import type { SicarPostingPreview } from "@/types/production";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";

type SicarControlCenterProps = {
  previews: SicarPostingPreview[];
};

export function SicarControlCenter({ previews }: SicarControlCenterProps) {
  const [livePreviews, setLivePreviews] = useState<SicarPostingPreview[]>(previews);
  const [loading, setLoading] = useState(previews.length === 0);
  const [selectedId, setSelectedId] = useState<number | null>(previews[0]?.productionOrderId ?? null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const availablePreviews = livePreviews.length > 0 ? livePreviews : previews;

  useEffect(() => {
    let cancelled = false;

    async function loadCloudPreviews() {
      try {
        const articleProfiles = await listCloudArticleProfiles();
        const nextPreviews = await listCloudSicarPostingPreviews(articleProfiles);

        if (!cancelled) {
          setLivePreviews(nextPreviews);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCloudPreviews();

    return () => {
      cancelled = true;
    };
  }, []);

  const costedInProgress = useMemo(
    () =>
      availablePreviews.filter(
        (preview) => preview.status === "IN_PROGRESS" && preview.workflowStage === "COSTED",
      ),
    [availablePreviews],
  );

  const effectiveSelectedId =
    selectedId && costedInProgress.some((preview) => preview.productionOrderId === selectedId)
      ? selectedId
      : costedInProgress[0]?.productionOrderId ?? null;

  const effectiveDetailId =
    detailId && costedInProgress.some((preview) => preview.productionOrderId === detailId)
      ? detailId
      : null;

  const detailPreview = useMemo(
    () => costedInProgress.find((preview) => preview.productionOrderId === effectiveDetailId) ?? null,
    [costedInProgress, effectiveDetailId],
  );

  if (loading) {
    return <section className="module-card text-center text-sm text-slate-500">Cargando...</section>;
  }

  if (costedInProgress.length === 0) {
    return (
      <section className="module-card text-center">
        <ShieldCheck className="mx-auto size-10 text-slate-300" />
        <h2 className="mt-4 font-display text-2xl text-slate-950">Integracion SICAR</h2>
        <p className="mt-2 text-sm text-slate-500">Sin producciones IN_PROGRESS · COSTED.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="module-card py-5">
        <h1 className="font-display text-3xl text-slate-950">Integracion SICAR</h1>
      </section>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="module-card min-h-[720px] overflow-hidden p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Lista</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl text-slate-950">IN_PROGRESS · COSTED</h2>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                {String(costedInProgress.length).padStart(2, "0")}
              </span>
            </div>
          </div>

          <div className="max-h-[640px] space-y-2 overflow-y-auto px-3 py-3">
            {costedInProgress.map((preview) => {
              const isSelected = preview.productionOrderId === effectiveSelectedId;
              const isOpened = preview.productionOrderId === effectiveDetailId;

              return (
                <button
                  key={preview.productionOrderId}
                  type="button"
                  onClick={() => setSelectedId(preview.productionOrderId)}
                  onDoubleClick={() => {
                    setSelectedId(preview.productionOrderId);
                    setDetailId(preview.productionOrderId);
                  }}
                  className={cn(
                    "w-full rounded-[22px] border px-4 py-4 text-left transition-all",
                    isOpened
                      ? "border-cyan-300 bg-cyan-50 shadow-[0_18px_36px_-28px_rgba(8,145,178,0.45)]"
                      : isSelected
                        ? "border-slate-300 bg-slate-50"
                        : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-[1.7rem] leading-none text-slate-950">{preview.folio}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{preview.sourceProductLabel}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500">
                      {preview.outputCount}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-slate-600">
                      {formatNumber(preview.totalProducedWeight, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      lb
                    </div>
                    <div className="rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-slate-600">
                      {formatCurrency(preview.totalCost)}
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-slate-500">{formatDateTime(preview.updatedAt)}</p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="module-card min-h-[720px]">
          {detailPreview ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="font-display text-4xl text-slate-950">{detailPreview.folio}</h2>
                  <p className="mt-2 text-sm text-slate-600">{detailPreview.sourceProductLabel}</p>
                  <p className="mt-2 text-xs text-slate-500">{formatDateTime(detailPreview.updatedAt)}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/costeo?id=${detailPreview.productionOrderId}`}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f4c81,#0a6c9f)] px-4 text-sm font-medium text-white shadow-[0_18px_30px_-24px_rgba(8,145,178,0.6)]"
                  >
                    Editar costeo
                  </Link>
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 px-4 text-sm font-medium text-slate-400"
                  >
                    Subir a SICAR
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard
                  label="Sale"
                  value={`${formatNumber(detailPreview.sourceWeight, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} lb`}
                />
                <MetricCard
                  label="Producido"
                  value={`${formatNumber(detailPreview.totalProducedWeight, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} lb`}
                />
                <MetricCard label="Costo total" value={formatCurrency(detailPreview.totalCost)} accent />
              </div>

              <div className="grid gap-5 2xl:grid-cols-[0.95fr_1.05fr]">
                <DetailPanel
                  icon={<ArrowDownCircle className="size-4 text-rose-600" />}
                  title="Consumo a SICAR"
                >
                  {detailPreview.sourceConsumption.map((line) => (
                    <DetailLine
                      key={line.label}
                      title={line.label}
                      values={[
                        { label: "Cantidad", value: `${formatNumber(line.quantity)} ${line.unitName}` },
                        { label: "Costo unitario", value: formatCurrency(line.unitCost) },
                        { label: "Total", value: formatCurrency(line.totalCost) },
                      ]}
                    />
                  ))}
                </DetailPanel>

                <DetailPanel
                  icon={<ArrowUpCircle className="size-4 text-emerald-600" />}
                  title="Entradas y costo nuevo"
                >
                  {detailPreview.outputEntries.map((line) => (
                    <DetailLine
                      key={line.label}
                      title={line.label}
                      values={[
                        { label: "Cantidad", value: `${formatNumber(line.quantity)} ${line.unitName}` },
                        { label: "Costo asignado", value: formatCurrency(line.allocatedCost) },
                        { label: "Nuevo costo", value: formatCurrency(line.producedUnitCost) },
                      ]}
                    />
                  ))}
                </DetailPanel>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[640px] items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 text-center">
              <div>
                <h2 className="font-display text-3xl text-slate-950">Detalle</h2>
                <p className="mt-2 text-sm text-slate-500">Doble clic en una producción para abrirla.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border px-4 py-4",
        accent ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white",
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-3 font-display text-3xl text-slate-950">{value}</p>
    </div>
  );
}

function DetailPanel({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">{title}</p>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function DetailLine({
  title,
  values,
}: {
  title: string;
  values: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4">
      <p className="font-medium text-slate-900">{title}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {values.map((value) => (
          <div key={value.label} className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{value.label}</p>
            <p className="mt-2 text-sm font-medium text-slate-900">{value.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
