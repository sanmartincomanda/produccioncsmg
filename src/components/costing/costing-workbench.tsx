"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Save, Trash2 } from "lucide-react";

import { ArticlePicker } from "@/components/fields/article-picker";
import {
  createDraftFromRecipeTemplate,
  createDraftInput,
  createDraftManualCost,
  createDraftOutput,
  createEmptyProductionDraft,
} from "@/lib/production/draft";
import { calculateProductionTotals, mergeManualCostItemIntoDraft } from "@/lib/production/costing";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type {
  ArticleProfileDefault,
  CatalogOption,
  ManualCostItem,
  ProductionDraft,
  ProductionOrderListItem,
  ProductionOrderRecord,
  ProductionRecipeTemplate,
} from "@/types/production";

type CostingWorkbenchProps = {
  articleProfiles: ArticleProfileDefault[];
  catalogOptions: CatalogOption[];
  manualCostItems: ManualCostItem[];
  orders: ProductionOrderListItem[];
  recipes: ProductionRecipeTemplate[];
  selectedOrder: ProductionOrderRecord | null;
};

type ApiResult = {
  ok: boolean;
  error?: string;
  recipeId?: number;
  recipeCode?: string;
  recipeName?: string;
};

export function CostingWorkbench({
  articleProfiles,
  catalogOptions,
  manualCostItems,
  orders,
  recipes,
  selectedOrder,
}: CostingWorkbenchProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProductionDraft>(createEmptyProductionDraft());
  const [isSavingCosting, setIsSavingCosting] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "neutral" | "success" | "error";
    message: string;
  }>({
    tone: "neutral",
    message: "Selecciona una producción guardada, ajusta el costeo y luego guárdalo.",
  });

  useEffect(() => {
    startTransition(() => {
      setDraft(selectedOrder?.draft ?? createEmptyProductionDraft());
    });
  }, [selectedOrder]);

  const totals = calculateProductionTotals(draft, articleProfiles);
  const todayLabel = new Intl.DateTimeFormat("es-NI", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const detailTitle = selectedOrder
    ? `${selectedOrder.folio}${draft.sourceProduct?.descripcion ? ` · ${draft.sourceProduct.descripcion.toUpperCase()}` : ""}`
    : "COSTEO VRN";
  const realCostPerPound = totals.producedWeight > 0 ? totals.totalCost / totals.producedWeight : 0;
  const selectedOrderMeta = useMemo(
    () => orders.find((item) => item.productionOrderId === selectedOrder?.productionOrderId) ?? null,
    [orders, selectedOrder],
  );

  function updateOutputArticle(outputId: string, nextArtId: string) {
    const nextArticle = catalogOptions.find((item) => item.artId === Number(nextArtId)) ?? null;

    setDraft((current) => ({
      ...current,
      outputs: current.outputs.map((row) => (row.id === outputId ? { ...row, article: nextArticle } : row)),
    }));
  }

  function updateInputArticle(inputId: string, nextArtId: string) {
    const nextItem = manualCostItems.find((item) => item.manualCostItemId === Number(nextArtId));

    setDraft((current) => ({
      ...current,
      inputs: current.inputs.map((row) =>
        row.id === inputId
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
  }

  async function handleSaveCosting() {
    if (!selectedOrder) {
      setFeedback({
        tone: "error",
        message: "Primero selecciona una producción guardada para costear.",
      });
      return;
    }

    setIsSavingCosting(true);
    setFeedback({
      tone: "neutral",
      message: "Guardando costeo de la producción...",
    });

    try {
      const response = await fetch(`/api/producciones/${selectedOrder.productionOrderId}/costeo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ draft }),
      });

      const result = (await response.json()) as ApiResult;

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "No se pudo guardar el costeo.");
      }

      setFeedback({
        tone: "success",
        message: `Costeo guardado en ${selectedOrder.folio}. Esta producción ya queda lista para el módulo SICAR.`,
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar el costeo.",
      });
    } finally {
      setIsSavingCosting(false);
    }
  }

  async function handleSaveRecipe() {
    if (!draft.sourceProduct) {
      setFeedback({
        tone: "error",
        message: "Selecciona el producto base antes de guardar la receta.",
      });
      return;
    }

    if (!draft.recipeName.trim()) {
      setFeedback({
        tone: "error",
        message: "Escribe un nombre para la receta.",
      });
      return;
    }

    setIsSavingRecipe(true);
    setFeedback({
      tone: "neutral",
      message: "Guardando receta...",
    });

    try {
      const response = await fetch("/api/recetas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipeId: draft.recipeId,
          name: draft.recipeName.trim(),
          draft,
        }),
      });

      const responseText = await response.text();
      let result: ApiResult = { ok: false };

      if (responseText) {
        try {
          result = JSON.parse(responseText) as ApiResult;
        } catch {
          result = {
            ok: false,
            error: "La API de recetas devolvió una respuesta inválida.",
          };
        }
      }

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "No se pudo guardar la receta.");
      }

      setDraft((current) => ({
        ...current,
        recipeId: result.recipeId ?? current.recipeId ?? null,
        recipeCode: result.recipeCode ?? current.recipeCode,
        recipeName: result.recipeName ?? current.recipeName,
      }));
      setFeedback({
        tone: "success",
        message: "Receta guardada. La producción sigue abierta para ajustar su costeo.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar la receta.",
      });
    } finally {
      setIsSavingRecipe(false);
    }
  }

  function handleLoadRecipe(recipeId: number) {
    const recipe = recipes.find((item) => item.recipeId === recipeId);

    if (!recipe) {
      return;
    }

    setDraft(createDraftFromRecipeTemplate(recipe));
    setFeedback({
      tone: "success",
      message: `Receta cargada: ${recipe.name}. Ahora puedes ajustarla para esta producción.`,
    });
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[34px] border border-[#d6c7a1] bg-[linear-gradient(180deg,#fffdf8_0%,#fff8eb_100%)] shadow-[0_40px_80px_-52px_rgba(103,52,25,0.35)]">
        <div className="border-b border-[#e7dcc0] px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <div>
                <p className="font-display text-4xl tracking-tight text-[#2d2118]">Detalle: {detailTitle}</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="h-px w-12 bg-[#b39245]" />
                  <span className="h-px w-8 bg-[#d8bf78]" />
                </div>
              </div>

              <p className="text-xl text-[#6d5846]">{todayLabel}</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleSaveCosting}
                disabled={!selectedOrder || isSavingCosting}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#2d2118] px-5 text-sm font-medium text-white transition hover:bg-[#432d1d] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="size-4" />
                {isSavingCosting ? "Guardando..." : "Guardar costeo"}
              </button>

              <Link
                href="/sicar"
                className="inline-flex h-14 items-center justify-center rounded-2xl border border-[#dac9a5] bg-white px-6 text-sm font-medium text-[#4f3b2c] transition hover:border-[#c8b182]"
              >
                Ir a SICAR
              </Link>
            </div>
          </div>
        </div>

        <div className="space-y-8 px-6 py-6 sm:px-8">
          <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr_0.45fr]">
            <label className="space-y-2">
              <span className="text-[11px] uppercase tracking-[0.35em] text-[#7b684f]">Producción guardada</span>
              <select
                value={selectedOrder?.productionOrderId ?? ""}
                onChange={(event) => {
                  const nextId = Number(event.target.value);
                  router.push(nextId ? `/costeo?id=${nextId}` : "/costeo");
                }}
                className="h-14 rounded-2xl border border-[#dcc9a2] bg-[#fffdf8] px-4 text-sm text-[#2d2118] outline-none transition focus:border-[#b78d39]"
              >
                <option value="">Seleccionar producción</option>
                {orders.map((order) => (
                  <option key={order.productionOrderId} value={order.productionOrderId}>
                    {order.folio} · {order.sourceLabel}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-2xl border border-[#dcc9a2] bg-white/90 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.35em] text-[#7b684f]">Estado</p>
              <p className="mt-2 text-sm font-medium text-[#2d2118]">
                {selectedOrderMeta
                  ? `${selectedOrderMeta.status} · etapa ${selectedOrderMeta.workflowStage}`
                  : "Sin producción seleccionada"}
              </p>
            </div>

            <div className="rounded-2xl border border-[#dcc9a2] bg-white/90 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.35em] text-[#7b684f]">Peso capturado</p>
              <p className="mt-2 text-sm font-medium text-[#2d2118]">
                {selectedOrderMeta ? `${formatDecimal(selectedOrderMeta.producedWeight)} lb` : "0.00 lb"}
              </p>
            </div>
          </div>

          {!selectedOrder ? (
            <div className="rounded-[28px] border border-dashed border-[#d6c7a1] bg-white/70 px-6 py-12 text-center text-[#6d5846]">
              No hay producción seleccionada. Primero guarda una producción en el módulo <span className="font-medium">Producir</span>.
            </div>
          ) : null}

          {selectedOrder ? (
            <>
              <div className="grid gap-4 xl:grid-cols-[1.3fr_0.55fr_0.55fr]">
                <ArticlePicker
                  label="Producto base"
                  value={draft.sourceProduct}
                  options={catalogOptions}
                  onChange={(nextArticle) =>
                    setDraft((current) => ({
                      ...current,
                      sourceProduct: nextArticle,
                      sourceUnitCost: nextArticle ? String(nextArticle.preCompraProm) : current.sourceUnitCost,
                    }))
                  }
                />

                <InlineEditor
                  label="Peso bruto"
                  value={draft.sourceWeight}
                  onChange={(value) => setDraft((current) => ({ ...current, sourceWeight: value }))}
                  suffix="lb"
                />

                <InlineEditor
                  label="Compra / lb"
                  value={draft.sourceUnitCost}
                  onChange={(value) => setDraft((current) => ({ ...current, sourceUnitCost: value }))}
                  prefix="C$"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1fr]">
                <MetricCard label="Peso bruto" value={`${formatDecimal(totals.sourceWeight)} lb`} />
                <MetricCard label="Peso aprovechado" value={`${formatDecimal(totals.producedWeight)} lb`} />
                <MetricCard
                  label="Merma total"
                  value={`${formatDecimal(totals.shrinkPercentage)} %`}
                  helper={`${formatDecimal(totals.shrinkWeight)} lb perdidas`}
                />
                <MetricCard label="Rendimiento" value={`${formatDecimal(totals.yieldPercentage)} %`} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr_2fr]">
                <MetricCard label="Compra / lb" value={formatCurrency(totals.sourceUnitCost)} />
                <MetricCard
                  label="Total pagado"
                  value={formatCurrency(totals.totalCost)}
                  helper={`${formatCurrency(totals.sourceTotal)} compra + ${formatCurrency(totals.inputTotal)} insumos + ${formatCurrency(totals.manualCostTotal)} extras`}
                />
                <MetricCard
                  label="Costo real por libra aprovechada"
                  value={`${formatCurrency(realCostPerPound)} /lb`}
                  emphasis
                />
              </div>

              <div className="rounded-[28px] border border-[#e1d5ba] bg-white/80 shadow-[0_20px_50px_-40px_rgba(103,52,25,0.3)]">
                <div className="flex flex-col gap-4 border-b border-[#efe3c8] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.35em] text-[#7b684f]">Receta editable</p>
                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                      <input
                        value={draft.recipeName}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            recipeName: event.target.value,
                          }))
                        }
                        placeholder="Nombre de receta"
                        className="h-12 rounded-2xl border border-[#dcc9a2] bg-[#fffdf8] px-4 text-sm text-[#2d2118] outline-none transition focus:border-[#b78d39]"
                      />

                      <select
                        value={draft.recipeId ?? ""}
                        onChange={(event) => {
                          const nextRecipeId = Number(event.target.value);

                          if (!nextRecipeId) {
                            setDraft((current) => ({
                              ...current,
                              recipeId: null,
                              recipeCode: "",
                            }));
                            return;
                          }

                          handleLoadRecipe(nextRecipeId);
                        }}
                        className="h-12 rounded-2xl border border-[#dcc9a2] bg-[#fffdf8] px-4 text-sm text-[#2d2118] outline-none transition focus:border-[#b78d39]"
                      >
                        <option value="">Recetas archivadas</option>
                        {recipes.map((recipe) => (
                          <option key={recipe.recipeId} value={recipe.recipeId}>
                            {recipe.name} {recipe.code ? `(${recipe.code})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-3 sm:items-end">
                    {draft.recipeCode ? (
                      <span className="rounded-full border border-[#e0d1b2] bg-[#fff7e8] px-3 py-1 text-xs font-medium text-[#7c6648]">
                        Codigo {draft.recipeCode}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleSaveRecipe}
                      disabled={isSavingRecipe}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#dac8a1] bg-[#fffaf0] px-4 text-sm font-medium text-[#5a4433] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Save className="size-4" />
                      {isSavingRecipe ? "Guardando receta..." : "Guardar receta"}
                    </button>
                  </div>
                </div>

                <div className="px-4 py-3">
                  <p
                    className={cn(
                      "text-sm",
                      feedback.tone === "error"
                        ? "text-rose-700"
                        : feedback.tone === "success"
                          ? "text-emerald-700"
                          : "text-[#73604c]",
                    )}
                  >
                    {feedback.message}
                  </p>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#e1d5ba] bg-white/88 shadow-[0_20px_50px_-40px_rgba(103,52,25,0.25)]">
                <div className="flex flex-col gap-4 border-b border-[#efe3c8] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.35em] text-[#7b684f]">Distribucion VRN</p>
                    <h2 className="mt-1 font-display text-3xl text-[#2d2118]">Productos secundarios</h2>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        outputs: [...current.outputs, createDraftOutput()],
                      }))
                    }
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#dac8a1] bg-[#fffaf0] px-4 text-sm font-medium text-[#5a4433] transition hover:border-[#c4ab7a]"
                  >
                    <Plus className="size-4" />
                    Agregar producto
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-full table-fixed">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.35em] text-[#7b684f]">
                        <th className="w-[29%] px-4 py-4 font-medium">Producto secundario</th>
                        <th className="px-3 py-4 font-medium">Peso</th>
                        <th className="px-3 py-4 font-medium">Valor %</th>
                        <th className="px-3 py-4 font-medium">VRN</th>
                        <th className="px-3 py-4 font-medium">% del corte</th>
                        <th className="px-3 py-4 font-medium">Costo asignado</th>
                        <th className="px-3 py-4 font-medium">C$ / lb</th>
                        <th className="w-[6%] px-3 py-4 font-medium no-print" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.outputs.map((output, index) => {
                        const calculated = totals.outputs.find((item) => item.id === output.id);

                        return (
                          <tr
                            key={output.id}
                            className="border-t border-[#efe3c8] align-top text-[#2d2118] first:border-t-0"
                          >
                            <td className="px-4 py-4">
                              <div className="space-y-2">
                                <select
                                  value={output.article?.artId ?? ""}
                                  onChange={(event) => updateOutputArticle(output.id, event.target.value)}
                                  className="h-11 w-full rounded-2xl border border-[#dcc9a2] bg-[#fffdf8] px-4 text-sm font-medium text-[#2d2118] outline-none transition focus:border-[#b78d39]"
                                >
                                  <option value="">Seleccionar producto</option>
                                  {catalogOptions.map((item) => (
                                    <option key={item.artId} value={item.artId}>
                                      {item.clave} - {item.descripcion}
                                    </option>
                                  ))}
                                </select>
                                <p className="text-xs text-[#7c6648]">
                                  {output.article?.unidadVenta || "Unidad"} · fila {index + 1}
                                </p>
                              </div>
                            </td>
                            <td className="px-3 py-4">
                              <NumericCell
                                value={output.weight}
                                onChange={(value) =>
                                  setDraft((current) => ({
                                    ...current,
                                    outputs: current.outputs.map((row) =>
                                      row.id === output.id ? { ...row, weight: value } : row,
                                    ),
                                  }))
                                }
                                suffix="lb"
                              />
                            </td>
                            <td className="px-3 py-4">
                              <NumericCell
                                value={output.percentage}
                                onChange={(value) =>
                                  setDraft((current) => ({
                                    ...current,
                                    outputs: current.outputs.map((row) =>
                                      row.id === output.id ? { ...row, percentage: value } : row,
                                    ),
                                  }))
                                }
                                suffix="%"
                              />
                            </td>
                            <td className="px-3 py-4 text-lg font-medium">{formatDecimal(calculated?.vrn ?? 0)}</td>
                            <td className="px-3 py-4 text-lg font-medium">
                              {formatDecimal(calculated?.cutPercentage ?? 0)} %
                            </td>
                            <td className="px-3 py-4 text-lg font-semibold">
                              {formatCurrency(calculated?.allocatedCost ?? 0)}
                            </td>
                            <td className="px-3 py-4 text-lg font-semibold text-[#8d6d22]">
                              {formatCurrency(calculated?.producedUnitCost ?? 0)}
                            </td>
                            <td className="px-3 py-4 no-print">
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft((current) => ({
                                    ...current,
                                    outputs:
                                      current.outputs.length > 1
                                        ? current.outputs.filter((row) => row.id !== output.id)
                                        : current.outputs,
                                  }))
                                }
                                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e2d5bf] text-[#6d5846] transition hover:border-[#cdb58e]"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[#d5bf88]">
                        <td className="px-4 py-5 text-[11px] font-medium uppercase tracking-[0.35em] text-[#7b684f]">
                          Total asignado
                        </td>
                        <td />
                        <td />
                        <td className="px-3 py-5 text-sm text-[#7c6648]">{formatDecimal(totals.totalVrn)}</td>
                        <td className="px-3 py-5 text-sm text-[#7c6648]">{formatDecimal(totals.percentageSum)} %</td>
                        <td className="px-3 py-5 text-xl font-semibold text-[#2d2118]">
                          {formatCurrency(totals.totalCost)}
                        </td>
                        <td className="px-3 py-5 text-sm text-[#7c6648]">
                          {totals.producedWeight > 0 ? formatCurrency(realCostPerPound) : formatCurrency(0)}
                        </td>
                        <td className="no-print" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <details className="rounded-[28px] border border-[#e1d5ba] bg-white/86 p-4 shadow-[0_20px_50px_-40px_rgba(103,52,25,0.22)]" open>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.35em] text-[#7b684f]">Ajustes del costo</p>
                      <h3 className="mt-1 font-display text-2xl text-[#2d2118]">Insumos generales</h3>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-[#fff6e5] px-3 py-1 text-xs font-medium text-[#7c6648]">
                      {formatCurrency(totals.inputTotal)}
                      <ChevronDown className="size-4" />
                    </span>
                  </summary>

                  <div className="mt-5 space-y-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          inputs: [...current.inputs, createDraftInput()],
                        }))
                      }
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#dac8a1] bg-[#fffaf0] px-4 text-sm font-medium text-[#5a4433]"
                    >
                      <Plus className="size-4" />
                      Agregar insumo
                    </button>

                    {draft.inputs.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[#e3d6bf] px-4 py-6 text-center text-sm text-[#7b684f]">
                        No hay insumos cargados para esta producción.
                      </div>
                    ) : null}

                    {draft.inputs.map((input) => (
                      <div key={input.id} className="rounded-2xl border border-[#eadfc9] bg-[#fffdf8] p-3">
                        <div className="grid gap-3 lg:grid-cols-[1fr_0.38fr_0.32fr_0.32fr_auto]">
                          <select
                            value={input.manualCostItemId ?? ""}
                            onChange={(event) => updateInputArticle(input.id, event.target.value)}
                            className="h-11 rounded-2xl border border-[#dcc9a2] bg-white px-4 text-sm text-[#2d2118] outline-none transition focus:border-[#b78d39]"
                          >
                            <option value="">Seleccionar insumo</option>
                            {manualCostItems.map((item) => (
                              <option key={item.manualCostItemId} value={item.manualCostItemId}>
                                {item.code} - {item.name}
                              </option>
                            ))}
                          </select>

                          <NumericCell
                            value={input.weight}
                            onChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                inputs: current.inputs.map((row) =>
                                  row.id === input.id ? { ...row, weight: value } : row,
                                ),
                              }))
                            }
                            suffix={input.unitName || undefined}
                            placeholder="Cantidad"
                          />

                          <DisplayPill value={formatCurrency(Number(input.unitCost) || 0)} />

                          <DisplayPill
                            value={formatCurrency((Number(input.weight) || 0) * (Number(input.unitCost) || 0))}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                inputs: current.inputs.filter((row) => row.id !== input.id),
                              }))
                            }
                            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e2d5bf] text-[#6d5846]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>

                <details className="rounded-[28px] border border-[#e1d5ba] bg-white/86 p-4 shadow-[0_20px_50px_-40px_rgba(103,52,25,0.22)]" open>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.35em] text-[#7b684f]">Ajustes del costo</p>
                      <h3 className="mt-1 font-display text-2xl text-[#2d2118]">Costos adicionales</h3>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-[#fff6e5] px-3 py-1 text-xs font-medium text-[#7c6648]">
                      {formatCurrency(totals.manualCostTotal)}
                      <ChevronDown className="size-4" />
                    </span>
                  </summary>

                  <div className="mt-5 space-y-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          manualCosts: [...current.manualCosts, createDraftManualCost()],
                        }))
                      }
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#dac8a1] bg-[#fffaf0] px-4 text-sm font-medium text-[#5a4433]"
                    >
                      <Plus className="size-4" />
                      Agregar costo
                    </button>

                    {draft.manualCosts.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[#e3d6bf] px-4 py-6 text-center text-sm text-[#7b684f]">
                        No hay costos adicionales cargados.
                      </div>
                    ) : null}

                    {draft.manualCosts.map((manualCost) => (
                      <div key={manualCost.id} className="rounded-2xl border border-[#eadfc9] bg-[#fffdf8] p-3">
                        <div className="grid gap-3 lg:grid-cols-[0.75fr_1fr_0.35fr_0.35fr_0.35fr_auto]">
                          <select
                            value={manualCost.manualCostItemId ?? ""}
                            onChange={(event) => {
                              const nextItem = manualCostItems.find(
                                (item) => item.manualCostItemId === Number(event.target.value),
                              );

                              setDraft((current) => ({
                                ...current,
                                manualCosts: current.manualCosts.map((row) =>
                                  row.id === manualCost.id
                                    ? nextItem
                                      ? mergeManualCostItemIntoDraft(row, nextItem)
                                      : { ...row, manualCostItemId: null }
                                    : row,
                                ),
                              }));
                            }}
                            className="h-11 rounded-2xl border border-[#dcc9a2] bg-white px-4 text-sm text-[#2d2118] outline-none transition focus:border-[#b78d39]"
                          >
                            <option value="">Libre</option>
                            {manualCostItems.map((item) => (
                              <option key={item.manualCostItemId} value={item.manualCostItemId}>
                                {item.code} - {item.name}
                              </option>
                            ))}
                          </select>

                          <input
                            value={manualCost.label}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                manualCosts: current.manualCosts.map((row) =>
                                  row.id === manualCost.id ? { ...row, label: event.target.value } : row,
                                ),
                              }))
                            }
                            placeholder="Descripcion"
                            className="h-11 rounded-2xl border border-[#dcc9a2] bg-white px-4 text-sm text-[#2d2118] outline-none transition focus:border-[#b78d39]"
                          />

                          <NumericCell
                            value={manualCost.cost}
                            onChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                manualCosts: current.manualCosts.map((row) =>
                                  row.id === manualCost.id ? { ...row, cost: value } : row,
                                ),
                              }))
                            }
                            prefix="C$"
                          />

                          <NumericCell
                            value={manualCost.multiplier}
                            onChange={(value) =>
                              setDraft((current) => ({
                                ...current,
                                manualCosts: current.manualCosts.map((row) =>
                                  row.id === manualCost.id ? { ...row, multiplier: value } : row,
                                ),
                              }))
                            }
                            suffix="lb"
                          />

                          <DisplayPill
                            value={formatCurrency(
                              (Number(manualCost.cost) || 0) * (Number(manualCost.multiplier) || 0),
                            )}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                manualCosts: current.manualCosts.filter((row) => row.id !== manualCost.id),
                              }))
                            }
                            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e2d5bf] text-[#6d5846]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  emphasis = false,
}: {
  label: string;
  value: string;
  helper?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
        emphasis
          ? "border-[#7f201e] bg-[linear-gradient(180deg,#7f201e_0%,#9e2c28_100%)] text-white"
          : "border-[#decda8] bg-white/85 text-[#2d2118]",
      )}
    >
      <p
        className={cn(
          "text-[11px] uppercase tracking-[0.35em]",
          emphasis ? "text-[#f5e4bf]" : "text-[#7b684f]",
        )}
      >
        {label}
      </p>
      <p className={cn("mt-3 font-display text-4xl leading-none", emphasis ? "text-white" : "text-[#2d2118]")}>
        {value}
      </p>
      {helper ? (
        <p className={cn("mt-3 text-sm", emphasis ? "text-[#f9e7cf]" : "text-[#7b684f]")}>{helper}</p>
      ) : null}
    </div>
  );
}

function InlineEditor({
  label,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.35em] text-[#7b684f]">{label}</span>
      <div className="flex h-14 items-center rounded-2xl border border-[#dcc9a2] bg-white/90 px-4">
        {prefix ? <span className="mr-2 text-sm text-[#7b684f]">{prefix}</span> : null}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full flex-1 bg-transparent text-lg font-medium text-[#2d2118] outline-none"
        />
        {suffix ? <span className="ml-2 text-sm text-[#7b684f]">{suffix}</span> : null}
      </div>
    </label>
  );
}

function NumericCell({
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex h-11 items-center rounded-2xl border border-[#dcc9a2] bg-[#fffdf8] px-3">
      {prefix ? <span className="mr-1 text-sm text-[#7b684f]">{prefix}</span> : null}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-full w-full bg-transparent text-sm font-medium text-[#2d2118] outline-none"
      />
      {suffix ? <span className="ml-1 text-sm text-[#7b684f]">{suffix}</span> : null}
    </div>
  );
}

function DisplayPill({ value }: { value: string }) {
  return (
    <div className="flex h-11 items-center justify-center rounded-2xl border border-[#e4d7c0] bg-white px-3 text-sm font-medium text-[#2d2118]">
      {value}
    </div>
  );
}

function formatDecimal(value: number) {
  return formatNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
