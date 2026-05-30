"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronRight,
  CircleEllipsis,
  ExternalLink,
  Layers3,
  ShieldCheck,
  Sigma,
  X,
} from "lucide-react";

import {
  listCloudArticleProfiles,
  listCloudSicarPostingPreviews,
} from "@/lib/firebase/cloud-data";
import type { SicarPostingPreview } from "@/types/production";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";

const stageStyles: Record<
  SicarPostingPreview["workflowStage"],
  { label: string; badge: string; accent: string }
> = {
  PRODUCED: {
    label: "Producida",
    badge: "border-slate-300 bg-white text-slate-600",
    accent: "from-slate-400/15 to-slate-100",
  },
  COSTED: {
    label: "Costeada",
    badge: "border-cyan-200 bg-cyan-50 text-cyan-800",
    accent: "from-cyan-400/18 to-white",
  },
  READY_FOR_SICAR: {
    label: "Lista para SICAR",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    accent: "from-emerald-400/18 to-white",
  },
  POSTED_TO_SICAR: {
    label: "Publicada",
    badge: "border-violet-200 bg-violet-50 text-violet-800",
    accent: "from-violet-400/18 to-white",
  },
};

type SicarControlCenterProps = {
  previews: SicarPostingPreview[];
};

export function SicarControlCenter({ previews }: SicarControlCenterProps) {
  const [livePreviews, setLivePreviews] = useState<SicarPostingPreview[]>(previews);
  const [loading, setLoading] = useState(previews.length === 0);
  const [selectedId, setSelectedId] = useState<number | null>(previews[0]?.productionOrderId ?? null);
  const [openedId, setOpenedId] = useState<number | null>(null);
  const availablePreviews = livePreviews.length > 0 ? livePreviews : previews;

  useEffect(() => {
    let cancelled = false;

    async function loadCloudPreviews() {
      try {
        const articleProfiles = await listCloudArticleProfiles();
        const nextPreviews = await listCloudSicarPostingPreviews(articleProfiles);

        if (!cancelled) {
          setLivePreviews(nextPreviews);
          setSelectedId((current) => current ?? nextPreviews[0]?.productionOrderId ?? null);
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

  const selectedPreview = useMemo(
    () =>
      availablePreviews.find((preview) => preview.productionOrderId === selectedId) ??
      availablePreviews[0] ??
      null,
    [availablePreviews, selectedId],
  );

  const openedPreview = useMemo(
    () => availablePreviews.find((preview) => preview.productionOrderId === openedId) ?? null,
    [availablePreviews, openedId],
  );

  const dashboardTotals = useMemo(() => {
    return availablePreviews.reduce(
      (acc, preview) => {
        acc.orders += 1;
        acc.weight += preview.totalProducedWeight;
        acc.cost += preview.totalCost;
        acc.outputs += preview.outputCount;
        return acc;
      },
      { orders: 0, weight: 0, cost: 0, outputs: 0 },
    );
  }, [availablePreviews]);

  if (loading) {
    return <section className="module-card text-center text-sm text-slate-500">Cargando producciones...</section>;
  }

  if (availablePreviews.length === 0) {
    return (
      <section className="module-card text-center">
        <ShieldCheck className="mx-auto size-10 text-slate-300" />
        <h2 className="mt-4 font-display text-2xl text-slate-950">Sin producciones listas</h2>
        <p className="mt-2 text-sm text-slate-500">
          Primero guarda una produccion y luego costeala. Aqui apareceran las ordenes listas para
          preparar el ajuste en SICAR.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(135deg,rgba(14,116,144,0.08),rgba(255,255,255,0.96)_48%,rgba(15,23,42,0.04))] px-6 py-6 shadow-[0_32px_65px_-45px_rgba(15,23,42,0.35)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-80 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_58%)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="section-tag text-cyan-800">Centro de integracion SICAR</p>
            <h1 className="mt-2 font-display text-4xl text-slate-950">Posteo corporativo de ajustes y costos</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Esta bandeja agrupa las producciones costeadas que despues se publicaran en SICAR.
              Selecciona una produccion para revisar su simulacion y haz doble clic para abrir el
              popup operativo con detalle y acceso directo a edicion.
            </p>
          </div>

          <div className="grid w-full gap-3 md:grid-cols-[0.8fr_0.9fr_1.2fr] xl:max-w-[560px]">
            <ExecutiveMetric
              label="Producciones listas"
              value={String(dashboardTotals.orders).padStart(2, "0")}
              tone="slate"
            />
            <ExecutiveMetric
              label="Peso total"
              value={`${formatNumber(dashboardTotals.weight, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} lb`}
              tone="cyan"
            />
            <ExecutiveMetric label="Costo proyectado" value={formatCurrency(dashboardTotals.cost)} tone="amber" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="module-card border-slate-300/80 bg-[linear-gradient(180deg,#fdfefe_0%,#f6f9fc_100%)] p-0">
          <div className="border-b border-slate-200 px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-tag text-slate-500">Bandeja de produccion</p>
                <h2 className="mt-1 font-display text-2xl text-slate-950">Lista operativa</h2>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Doble clic abre detalle
              </div>
            </div>
          </div>

          <div className="max-h-[760px] space-y-2 overflow-y-auto px-3 py-3">
            {availablePreviews.map((preview, index) => {
              const isActive = preview.productionOrderId === selectedPreview?.productionOrderId;

              return (
                <motion.button
                  key={preview.productionOrderId}
                  type="button"
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.995 }}
                  onClick={() => setSelectedId(preview.productionOrderId)}
                  onDoubleClick={() => setOpenedId(preview.productionOrderId)}
                  className={cn(
                    "w-full rounded-[24px] border px-4 py-4 text-left transition-all duration-300",
                    isActive
                      ? "border-cyan-300 bg-[linear-gradient(135deg,rgba(224,247,250,0.96),rgba(255,255,255,0.98))] shadow-[0_22px_42px_-34px_rgba(8,145,178,0.55)]"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-[0_16px_34px_-28px_rgba(15,23,42,0.32)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-[1.65rem] leading-none text-slate-950">
                          {preview.folio}
                        </span>
                        <span className="rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-600">
                          #{String(index + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{preview.sourceProductLabel}</p>
                    </div>

                    <ChevronRight
                      className={cn(
                        "mt-1 size-4 shrink-0 transition-transform duration-300",
                        isActive ? "translate-x-0.5 text-cyan-700" : "text-slate-300",
                      )}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <StageBadge preview={preview} />
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">
                      {formatNumber(preview.totalProducedWeight, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      lb
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500">
                      {formatCurrency(preview.totalCost)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 rounded-[20px] border border-slate-200/80 bg-white/80 p-3">
                    <MiniDatum label="Productos" value={String(preview.outputCount)} />
                    <MiniDatum label="Actualizado" value={formatDateTime(preview.updatedAt)} />
                  </div>

                  <div className="mt-3 rounded-[18px] bg-[linear-gradient(135deg,rgba(15,23,42,0.03),transparent)] px-3 py-2 text-xs text-slate-500">
                    Accion esperada: ajuste negativo del producto base + ajuste positivo de salidas +
                    actualizacion de costo en SICAR.
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>

        <AnimatePresence mode="wait">
          {selectedPreview ? (
            <motion.section
              key={selectedPreview.productionOrderId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="module-card border-slate-300/70 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfe_100%)]"
            >
              <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-display text-4xl text-slate-950">{selectedPreview.folio}</p>
                    <StageBadge preview={selectedPreview} />
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800">
                      Escritura real bloqueada
                    </span>
                  </div>
                  <p className="mt-3 max-w-3xl text-sm text-slate-600">{selectedPreview.sourceProductLabel}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <ActionButton onClick={() => setOpenedId(selectedPreview.productionOrderId)}>
                    Ver detalle
                  </ActionButton>
                  <ActionLink href={`/costeo?id=${selectedPreview.productionOrderId}`} primary>
                    Editar costeo
                  </ActionLink>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                <SummaryTile
                  label="Peso base"
                  value={`${formatNumber(selectedPreview.sourceWeight, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} lb`}
                  detail="Consumo negativo esperado"
                  accent="cyan"
                />
                <SummaryTile
                  label="Peso producido"
                  value={`${formatNumber(selectedPreview.totalProducedWeight, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} lb`}
                  detail={`${selectedPreview.outputCount} productos listos`}
                  accent="slate"
                />
                <SummaryTile
                  label="Costo total"
                  value={formatCurrency(selectedPreview.totalCost)}
                  detail="Costo proyectado a publicar"
                  accent="amber"
                />
                <SummaryTile
                  label="Ultima edicion"
                  value={formatDateTime(selectedPreview.updatedAt)}
                  detail="Registro maestro"
                  accent="emerald"
                />
              </div>

              <div className="mt-6 grid gap-5 2xl:grid-cols-[0.9fr_1.1fr]">
                <DetailPanel
                  icon={<ArrowDownCircle className="size-4 text-rose-600" />}
                  title="Consumo a SICAR"
                  subtitle="Salida del producto base"
                >
                  {selectedPreview.sourceConsumption.map((line) => (
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
                  subtitle="Salidas finales por articulo"
                >
                  {selectedPreview.outputEntries.map((line) => (
                    <DetailLine
                      key={line.label}
                      title={line.label}
                      values={[
                        { label: "Cantidad", value: `${formatNumber(line.quantity)} ${line.unitName}` },
                        { label: "Costo asignado", value: formatCurrency(line.allocatedCost) },
                        { label: "Nuevo costo SICAR", value: formatCurrency(line.producedUnitCost) },
                      ]}
                    />
                  ))}
                </DetailPanel>
              </div>

              <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(238,246,255,0.92))] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <Sigma className="mt-0.5 size-4 text-slate-400" />
                  <p className="text-sm text-slate-600">
                    Simulacion activa. El siguiente paso real sera escribir <code>ajusteinventario</code>,
                    <code> ajusteinventarioarticulo</code>, actualizar <code>articulo.preCompraProm</code>{" "}
                    y registrar <code>historial</code> en SICAR.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <ActionButton onClick={() => setOpenedId(selectedPreview.productionOrderId)}>
                    Abrir popup
                  </ActionButton>
                  <button
                    type="button"
                    disabled
                    className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-400"
                  >
                    Subir a SICAR
                  </button>
                </div>
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {openedPreview ? <SicarDetailModal preview={openedPreview} onClose={() => setOpenedId(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}

function StageBadge({ preview }: { preview: SicarPostingPreview }) {
  const stage = stageStyles[preview.workflowStage];

  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", stage.badge)}>
      {stage.label}
    </span>
  );
}

function ExecutiveMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "cyan" | "amber";
}) {
  const tones = {
    slate: "border-slate-200 bg-white/90 text-slate-950",
    cyan: "border-cyan-200 bg-cyan-50/80 text-cyan-950",
    amber: "border-amber-200 bg-amber-50/80 text-amber-950",
  };

  return (
    <div
      className={cn(
        "min-w-0 rounded-[22px] border px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]",
        tones[tone],
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 font-display text-[1.95rem] leading-none tracking-tight">{value}</p>
    </div>
  );
}

function MiniDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: "cyan" | "slate" | "amber" | "emerald";
}) {
  const accentStyle = {
    cyan: "before:bg-cyan-500/90",
    slate: "before:bg-slate-700/85",
    amber: "before:bg-amber-500/90",
    emerald: "before:bg-emerald-500/90",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-[0_24px_46px_-40px_rgba(15,23,42,0.25)] before:absolute before:inset-y-4 before:left-0 before:w-1 before:rounded-full",
        accentStyle[accent],
      )}
    >
      <p className="pl-3 text-[11px] uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-3 pl-3 font-display text-3xl text-slate-950">{value}</p>
      <p className="mt-2 pl-3 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function DetailPanel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f4f8fc_100%)] p-4">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">{title}</p>
      </div>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
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
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)]">
      <p className="font-medium text-slate-900">{title}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {values.map((value) => (
          <div key={value.label} className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{value.label}</p>
            <p className="mt-2 text-sm font-medium text-slate-900">{value.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_16px_26px_-22px_rgba(15,23,42,0.4)]"
    >
      {children}
    </button>
  );
}

function ActionLink({
  children,
  href,
  primary = false,
}: {
  children: ReactNode;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all duration-200",
        primary
          ? "border border-cyan-700 bg-[linear-gradient(135deg,#0f4c81,#0a6c9f)] text-white shadow-[0_20px_32px_-24px_rgba(8,145,178,0.7)] hover:-translate-y-0.5"
          : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400",
      )}
    >
      {children}
    </Link>
  );
}

function SicarDetailModal({
  preview,
  onClose,
}: {
  preview: SicarPostingPreview;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className="relative max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[32px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9fd_100%)] shadow-[0_48px_120px_-54px_rgba(15,23,42,0.58)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="section-tag text-slate-500">Detalle de produccion</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-4xl text-slate-950">{preview.folio}</h2>
              <StageBadge preview={preview} />
            </div>
            <p className="mt-2 text-sm text-slate-500">{preview.sourceProductLabel}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition-all hover:border-slate-300 hover:text-slate-950"
            aria-label="Cerrar detalle"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-96px)] space-y-6 overflow-y-auto px-6 py-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryTile
              label="Peso base"
              value={`${formatNumber(preview.sourceWeight, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} lb`}
              detail="Producto consumido"
              accent="cyan"
            />
            <SummaryTile
              label="Peso producido"
              value={`${formatNumber(preview.totalProducedWeight, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} lb`}
              detail="Resultado final"
              accent="slate"
            />
            <SummaryTile
              label="Costo total"
              value={formatCurrency(preview.totalCost)}
              detail="Monto proyectado"
              accent="amber"
            />
            <SummaryTile
              label="Ultima edicion"
              value={formatDateTime(preview.updatedAt)}
              detail="Registro activo"
              accent="emerald"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <DetailPanel
              icon={<ArrowDownCircle className="size-4 text-rose-600" />}
              title="Consumo a SICAR"
              subtitle="Salida del producto base"
            >
              {preview.sourceConsumption.map((line) => (
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
              subtitle="Salidas finales por articulo"
            >
              {preview.outputEntries.map((line) => (
                <DetailLine
                  key={line.label}
                  title={line.label}
                  values={[
                    { label: "Cantidad", value: `${formatNumber(line.quantity)} ${line.unitName}` },
                    { label: "Costo asignado", value: formatCurrency(line.allocatedCost) },
                    { label: "Nuevo costo SICAR", value: formatCurrency(line.producedUnitCost) },
                  ]}
                />
              ))}
            </DetailPanel>
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,rgba(15,76,129,0.04),rgba(255,255,255,0.98))] p-5">
            <div className="flex items-start gap-3">
              <Layers3 className="mt-0.5 size-5 text-slate-500" />
              <div>
                <p className="text-sm font-medium text-slate-900">Edicion operativa</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Desde aqui revisas el detalle ejecutivo. Para editar pesos, costos o reparto VRN,
                  entra al modulo de costeo de esta misma produccion.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <CircleEllipsis className="size-4" />
            <span>Produccion lista para revision antes del ajuste real.</span>
          </div>

          <div className="flex flex-wrap gap-3">
            <ActionLink href={`/costeo?id=${preview.productionOrderId}`} primary>
              Editar costeo <ExternalLink className="size-4" />
            </ActionLink>
            <ActionButton onClick={onClose}>Cerrar</ActionButton>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
