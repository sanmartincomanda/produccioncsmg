"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, ShieldCheck } from "lucide-react";

import {
  listCloudArticleProfiles,
  listCloudSicarPostingPreviews,
  requestCloudSicarPosting,
} from "@/lib/firebase/cloud-data";
import type { SicarPostingPreview } from "@/types/production";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";

type SicarControlCenterProps = {
  previews: SicarPostingPreview[];
};

type FeedbackState = {
  tone: "neutral" | "success" | "error";
  message: string;
};

export function SicarControlCenter({ previews }: SicarControlCenterProps) {
  const [livePreviews, setLivePreviews] = useState<SicarPostingPreview[]>(previews);
  const [loading, setLoading] = useState(previews.length === 0);
  const [selectedId, setSelectedId] = useState<number | null>(previews[0]?.productionOrderId ?? null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>({
    tone: "neutral",
    message: "Doble clic para abrir detalle.",
  });

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

  const availablePreviews = livePreviews.length > 0 ? livePreviews : previews;

  const costedInProgress = useMemo(
    () =>
      availablePreviews.filter(
        (preview) => preview.status === "IN_PROGRESS" && preview.workflowStage === "COSTED",
      ),
    [availablePreviews],
  );

  const filteredPreviews = useMemo(() => {
    return costedInProgress.filter((preview) => {
      const recordDate = String(preview.updatedAt ?? preview.createdAt ?? "").slice(0, 10);

      if (fromDate && recordDate < fromDate) {
        return false;
      }

      if (toDate && recordDate > toDate) {
        return false;
      }

      return true;
    });
  }, [costedInProgress, fromDate, toDate]);

  const effectiveSelectedId =
    selectedId && filteredPreviews.some((preview) => preview.productionOrderId === selectedId)
      ? selectedId
      : filteredPreviews[0]?.productionOrderId ?? null;

  const effectiveDetailId =
    detailId && filteredPreviews.some((preview) => preview.productionOrderId === detailId)
      ? detailId
      : null;

  const detailPreview = useMemo(
    () => filteredPreviews.find((preview) => preview.productionOrderId === effectiveDetailId) ?? null,
    [filteredPreviews, effectiveDetailId],
  );

  const allFilteredIds = useMemo(
    () => filteredPreviews.map((preview) => preview.productionOrderId),
    [filteredPreviews],
  );

  const allSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((productionOrderId) => selectedIds.includes(productionOrderId));

  async function refreshPreviews() {
    const articleProfiles = await listCloudArticleProfiles();
    const nextPreviews = await listCloudSicarPostingPreviews(articleProfiles);
    setLivePreviews(nextPreviews);
  }

  async function submitPosting(ids: number[]) {
    if (ids.length === 0) {
      setFeedback({
        tone: "error",
        message: "Selecciona al menos una producción.",
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback({
      tone: "neutral",
      message: "Enviando al integrador...",
    });

    try {
      const result = await requestCloudSicarPosting(ids);
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setDetailId(null);
      await refreshPreviews();
      setFeedback({
        tone: "success",
        message: `${result.count} producción(es) enviadas a SICAR.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo enviar a SICAR.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

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

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="module-card min-h-[720px] overflow-hidden p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Lista</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl text-slate-950">IN_PROGRESS · COSTED</h2>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                {String(filteredPreviews.length).padStart(2, "0")}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
              />
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    setSelectedIds((current) =>
                      allSelected
                        ? current.filter((id) => !allFilteredIds.includes(id))
                        : [...new Set([...current, ...allFilteredIds])],
                    );
                  }}
                  className="size-4 rounded border-slate-300"
                />
                Seleccionar todos
              </label>

              <button
                type="button"
                onClick={() => void submitPosting(selectedIds)}
                disabled={selectedIds.length === 0 || isSubmitting}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Subir a SICAR
              </button>
            </div>
          </div>

          <div className="max-h-[640px] space-y-2 overflow-y-auto px-3 py-3">
            {filteredPreviews.map((preview) => {
              const isSelected = preview.productionOrderId === effectiveSelectedId;
              const isOpened = preview.productionOrderId === effectiveDetailId;
              const isChecked = selectedIds.includes(preview.productionOrderId);

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
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedIds((current) =>
                            current.includes(preview.productionOrderId)
                              ? current.filter((id) => id !== preview.productionOrderId)
                              : [...current, preview.productionOrderId],
                          );
                        }}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-1 size-4 rounded border-slate-300"
                      />

                      <div className="min-w-0">
                        <p className="font-display text-[1.7rem] leading-none text-slate-950">{preview.folio}</p>
                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">{preview.sourceProductLabel}</p>
                      </div>
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

            {filteredPreviews.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                Sin producciones en ese rango.
              </div>
            ) : null}
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
                    onClick={() => void submitPosting([detailPreview.productionOrderId])}
                    disabled={isSubmitting}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Subir a SICAR
                  </button>
                </div>
              </div>

              <FeedbackBanner feedback={feedback} />

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
              <div className="w-full max-w-xl space-y-4 px-6">
                <h2 className="font-display text-3xl text-slate-950">Detalle</h2>
                <p className="text-sm text-slate-500">Doble clic en una producción para abrirla.</p>
                <button
                  type="button"
                  onClick={() => void submitPosting(selectedIds)}
                  disabled={selectedIds.length === 0 || isSubmitting}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-5 text-sm font-medium text-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Subir a SICAR
                </button>
                <FeedbackBanner feedback={feedback} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function FeedbackBanner({ feedback }: { feedback: FeedbackState }) {
  return (
    <div
      className={cn(
        "rounded-[18px] border px-4 py-3 text-sm",
        feedback.tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : feedback.tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {feedback.message}
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
