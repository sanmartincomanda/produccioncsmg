"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, PackagePlus, Plus, Save, Trash2 } from "lucide-react";

import { ArticlePicker } from "@/components/fields/article-picker";
import {
  createDraftInput,
  createDraftOutput,
  createEmptyProductionDraft,
  normalizeProductionDraft,
  PRODUCTION_DRAFT_STORAGE_KEY,
} from "@/lib/production/draft";
import { formatCurrency } from "@/lib/utils";
import type { CatalogOption, ManualCostItem, ProductionDraft } from "@/types/production";

type ProductionWorkbenchProps = {
  catalogOptions: CatalogOption[];
  manualCostItems: ManualCostItem[];
};

export function ProductionWorkbench({ catalogOptions, manualCostItems }: ProductionWorkbenchProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProductionDraft>(createEmptyProductionDraft());
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    tone: "neutral" | "success" | "error";
    message: string;
  }>({
    tone: "neutral",
    message: "Captura la producción y guárdala. El costeo se hace después desde su módulo.",
  });

  useEffect(() => {
    const rawDraft = window.localStorage.getItem(PRODUCTION_DRAFT_STORAGE_KEY);

    if (!rawDraft) {
      return;
    }

    try {
      const parsed = JSON.parse(rawDraft) as unknown;
      startTransition(() => {
        setDraft(normalizeProductionDraft(parsed));
      });
    } catch {
      window.localStorage.removeItem(PRODUCTION_DRAFT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PRODUCTION_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  async function handleSaveProduction() {
    if (!draft.sourceProduct) {
      setSaveFeedback({
        tone: "error",
        message: "Selecciona el producto base antes de guardar la producción.",
      });
      return;
    }

    if (!draft.outputs.some((item) => item.article)) {
      setSaveFeedback({
        tone: "error",
        message: "Agrega al menos un producto producido antes de guardar.",
      });
      return;
    }

    setIsSaving(true);
    setSaveFeedback({
      tone: "neutral",
      message: "Guardando producción...",
    });

    try {
      const response = await fetch("/api/producciones", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ draft }),
      });

      const result = (await response.json()) as {
        ok: boolean;
        folio?: string;
        productionOrderId?: number;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "No se pudo guardar la producción.");
      }

      const nextDraft = createEmptyProductionDraft();
      window.localStorage.setItem(PRODUCTION_DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
      setDraft(nextDraft);
      setSaveFeedback({
        tone: "success",
        message: `Producción ${result.folio ?? ""} guardada. Ya aparece en Costeo y en Historial.`,
      });
      router.refresh();
    } catch (error) {
      setSaveFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar la producción.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="module-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-tag">Producir</p>
            <h1 className="font-display text-4xl text-slate-950">Captura de produccion</h1>
            {draft.recipeName ? (
              <p className="mt-3 text-sm text-slate-500">
                Receta activa: <span className="font-medium text-slate-900">{draft.recipeName}</span>
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard label="Producto base" value={draft.sourceProduct ? "1" : "0"} />
            <MetricCard label="Productos" value={String(draft.outputs.length)} />
            <MetricCard label="Insumos" value={String(draft.inputs.length)} />
            <MetricCard label="Siguiente" value="Costeo" accent />
          </div>
        </div>
        <p
          className={
            saveFeedback.tone === "error"
              ? "mt-4 text-sm text-rose-600"
              : saveFeedback.tone === "success"
                ? "mt-4 text-sm text-emerald-700"
                : "mt-4 text-sm text-slate-500"
          }
        >
          {saveFeedback.message}
        </p>
      </section>

      <section className="module-card space-y-5">
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <ArticlePicker
            label="Producto a producir / trabajar"
            value={draft.sourceProduct}
            options={catalogOptions}
            onChange={(nextArticle) => {
              setDraft((current) => ({
                ...current,
                sourceProduct: nextArticle,
                sourceUnitCost: nextArticle ? String(nextArticle.preCompraProm) : "",
              }));
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Peso"
              value={draft.sourceWeight}
              onChange={(value) => setDraft((current) => ({ ...current, sourceWeight: value }))}
              placeholder="0.00"
            />
            <Field
              label="Costo base"
              value={draft.sourceUnitCost}
              onChange={(value) => setDraft((current) => ({ ...current, sourceUnitCost: value }))}
              placeholder="0.00"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {draft.outputs.map((output, outputIndex) => (
          <div key={output.id} className="module-card space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <Boxes className="size-5" />
                </span>
                <div>
                  <p className="section-tag">Producto {outputIndex + 1}</p>
                  <h2 className="font-display text-2xl text-slate-950">Producto producido</h2>
                </div>
              </div>

              {draft.outputs.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      outputs: current.outputs.filter((item) => item.id !== output.id),
                    }))
                  }
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700"
                >
                  <Trash2 className="size-4" />
                  Eliminar
                </button>
              ) : null}
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <ArticlePicker
                label="Del catalogo"
                value={output.article}
                options={catalogOptions}
                onChange={(nextArticle) => {
                  setDraft((current) => ({
                    ...current,
                    outputs: current.outputs.map((item) =>
                      item.id === output.id ? { ...item, article: nextArticle } : item,
                    ),
                  }));
                }}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Peso"
                  value={output.weight}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      outputs: current.outputs.map((item) =>
                        item.id === output.id ? { ...item, weight: value } : item,
                      ),
                    }))
                  }
                  placeholder="0.00"
                />
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Costo prom. SICAR</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {formatCurrency(output.article?.preCompraProm ?? 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="module-card space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-tag">Insumos generales</p>
            <h2 className="font-display text-2xl text-slate-950">
              Agrega los insumos usados en toda la produccion
            </h2>
          </div>
          <button
            type="button"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                inputs: [...current.inputs, createDraftInput()],
              }))
            }
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
          >
            <Plus className="size-4" />
            Agregar insumo
          </button>
        </div>

        <div className="space-y-4">
          {draft.inputs.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              No hay insumos agregados. Usa el boton para cargar solo los que realmente aplican.
            </div>
          ) : null}

                {draft.inputs.map((input) => (
                  <div key={input.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr_auto]">
                      <label className="space-y-2">
                        <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                          Insumo configurado
                        </span>
                        <select
                          value={input.manualCostItemId ?? ""}
                          onChange={(event) => {
                            const nextItem = manualCostItems.find(
                              (item) => item.manualCostItemId === Number(event.target.value),
                            );

                            setDraft((current) => ({
                              ...current,
                              inputs: current.inputs.map((row) =>
                                row.id === input.id
                                  ? {
                                      ...row,
                                      manualCostItemId: nextItem?.manualCostItemId ?? null,
                                      label: nextItem ? `${nextItem.code} - ${nextItem.name}` : "",
                                      unitName: nextItem?.unitName ?? "",
                                      unitCost: nextItem ? String(nextItem.currentCost) : row.unitCost,
                                    }
                                  : row,
                              ),
                            }));
                          }}
                          className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 outline-none transition focus:border-slate-500"
                        >
                          <option value="">Seleccionar insumo</option>
                          {manualCostItems.map((item) => (
                            <option key={item.manualCostItemId} value={item.manualCostItemId}>
                              {item.code} - {item.name}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500">
                          {input.unitName || "Sin unidad"} {input.label ? `· ${input.label}` : ""}
                        </p>
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label={input.unitName ? `Cantidad (${input.unitName})` : "Cantidad"}
                          value={input.weight}
                          onChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              inputs: current.inputs.map((row) =>
                                row.id === input.id ? { ...row, weight: value } : row,
                              ),
                            }))
                          }
                          placeholder="0.00"
                        />
                        <Field
                          label="Costo"
                          value={input.unitCost}
                          onChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              inputs: current.inputs.map((row) =>
                                row.id === input.id ? { ...row, unitCost: value } : row,
                              ),
                            }))
                          }
                          placeholder="0.00"
                        />
                      </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        inputs: current.inputs.filter((row) => row.id !== input.id),
                      }))
                    }
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 px-4 text-slate-500"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              outputs: [...current.outputs, createDraftOutput()],
            }))
          }
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white"
        >
          <PackagePlus className="size-4" />
          Agregar mas producto
        </button>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleSaveProduction}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="size-4" />
            {isSaving ? "Guardando..." : "Guardar produccion"}
          </button>

          <button
            type="button"
            onClick={() => {
              const nextDraft = createEmptyProductionDraft();
              window.localStorage.setItem(PRODUCTION_DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
              setDraft(nextDraft);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm text-slate-700"
          >
            <Trash2 className="size-4" />
            Limpiar
          </button>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={accent ? "metric-card metric-card-accent" : "metric-card"}>
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 font-display text-2xl text-slate-950">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 outline-none transition focus:border-slate-500"
      />
    </label>
  );
}
