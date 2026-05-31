"use client";

import { AnimatePresence, motion } from "framer-motion";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  CalendarDays,
  CopyPlus,
  FolderOpen,
  ListPlus,
  PauseCircle,
  Printer,
  Save,
  Scale,
  Search,
  Star,
  Trash2,
  Undo2,
  Wifi,
  X,
} from "lucide-react";

import { CatalogSyncPanel } from "@/components/catalog/catalog-sync-panel";
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
import {
  createCloudProductionOrder,
  deleteCloudProductionSession,
  listCloudCatalogOptions,
  listCloudManualCostItems,
  listCloudProductionSessions,
  listCloudRecipes,
  listCloudScalePresets,
  saveCloudProductionSession,
} from "@/lib/firebase/cloud-data";
import {
  createDraftFromRecipeTemplate,
  createDraftInput,
  createDraftOutput,
  createEmptyProductionDraft,
  normalizeProductionDraft,
  PRODUCTION_DRAFT_STORAGE_KEY,
} from "@/lib/production/draft";
import { cn, formatNumber } from "@/lib/utils";
import type {
  CatalogOption,
  ManualCostItem,
  ProductionDraft,
  ProductionDraftInput,
  ProductionRecipeTemplate,
  ProductionSessionRecord,
  ScalePreset,
} from "@/types/production";

const TOUCH_STATION_STORAGE_KEY = "transformacion-production-touch-station-v2";

type CaptureRecord = {
  id: string;
  outputId: string;
  articleCode: string;
  articleName: string;
  weight: string;
  capturedAt: string;
};

type TouchStationState = {
  activeOutputId: string | null;
  captureWeight: string;
  productionDate: string;
  selectedScaleId: number | null;
  autoPrint: boolean;
  recentCaptures: CaptureRecord[];
};

type CatalogDrawerState =
  | { kind: "source" }
  | { kind: "new-output" }
  | { kind: "replace-output"; outputId: string }
  | null;

type OutputWeightPromptState = {
  article: CatalogOption;
  outputId: string | null;
  initialWeight: string;
  mode: "capture" | "stage";
} | null;

type ProductionWorkbenchProps = {
  catalogOptions: CatalogOption[];
  manualCostItems: ManualCostItem[];
  recipeTemplates: ProductionRecipeTemplate[];
  scalePresets: ScalePreset[];
};

function todayAsInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createEmptyTouchStationState(scalePresets: ScalePreset[]): TouchStationState {
  return {
    activeOutputId: null,
    captureWeight: "",
    productionDate: todayAsInputValue(),
    selectedScaleId: scalePresets[0]?.scaleId ?? null,
    autoPrint: true,
    recentCaptures: [],
  };
}

function normalizeTouchStationState(
  value: unknown,
  scalePresets: ScalePreset[],
  fallback?: Partial<TouchStationState>,
): TouchStationState {
  const base = {
    ...createEmptyTouchStationState(scalePresets),
    ...(fallback ?? {}),
  };

  if (!value || typeof value !== "object") {
    return base;
  }

  const candidate = value as Partial<TouchStationState>;

  return {
    ...base,
    activeOutputId: typeof candidate.activeOutputId === "string" ? candidate.activeOutputId : base.activeOutputId,
    captureWeight: typeof candidate.captureWeight === "string" ? candidate.captureWeight : base.captureWeight,
    productionDate:
      typeof candidate.productionDate === "string" ? candidate.productionDate : base.productionDate,
    selectedScaleId:
      typeof candidate.selectedScaleId === "number" ? candidate.selectedScaleId : base.selectedScaleId,
    autoPrint: typeof candidate.autoPrint === "boolean" ? candidate.autoPrint : base.autoPrint,
    recentCaptures: Array.isArray(candidate.recentCaptures)
      ? candidate.recentCaptures.filter(
          (item): item is CaptureRecord =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof (item as CaptureRecord).id === "string" &&
                typeof (item as CaptureRecord).outputId === "string" &&
                typeof (item as CaptureRecord).weight === "string",
            ),
        )
      : base.recentCaptures,
  };
}

function parseDecimal(value: string | number | null | undefined) {
  return Number(value ?? 0) || 0;
}

function formatEditableWeight(value: number) {
  return value.toFixed(2);
}

function formatWeight(value: number | string) {
  return `${formatNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} lb`;
}

function sanitizeWeightInput(value: string) {
  const cleaned = value.replace(/[^0-9.]/gu, "");
  const [integerPart = "", decimalPart = ""] = cleaned.split(".");
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/u, "") || (cleaned.startsWith("0") ? "0" : "");
  const normalizedDecimal = decimalPart.slice(0, 3);

  return normalizedDecimal.length > 0
    ? `${normalizedInteger || "0"}.${normalizedDecimal}`
    : normalizedInteger;
}

function appendKey(currentValue: string, key: string) {
  if (key === "C") {
    return "";
  }

  if (key === "DEL") {
    return currentValue.slice(0, -1);
  }

  if (key === ".") {
    if (currentValue.includes(".")) {
      return currentValue;
    }

    return currentValue ? `${currentValue}.` : "0.";
  }

  if (key === "00") {
    if (!currentValue) {
      return "0";
    }

    return sanitizeWeightInput(`${currentValue}00`);
  }

  return sanitizeWeightInput(`${currentValue}${key}`);
}

export function ProductionWorkbench({
  catalogOptions,
  manualCostItems,
  recipeTemplates,
  scalePresets,
}: ProductionWorkbenchProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProductionDraft>(createEmptyProductionDraft());
  const [liveCatalogOptions, setLiveCatalogOptions] = useState<CatalogOption[]>(catalogOptions);
  const [liveManualCostItems, setLiveManualCostItems] = useState<ManualCostItem[]>(manualCostItems);
  const [liveRecipeTemplates, setLiveRecipeTemplates] = useState<ProductionRecipeTemplate[]>(recipeTemplates);
  const [liveScalePresets, setLiveScalePresets] = useState<ScalePreset[]>(scalePresets);
  const [station, setStation] = useState<TouchStationState>(() => createEmptyTouchStationState(scalePresets));
  const [isSaving, setIsSaving] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [catalogDrawer, setCatalogDrawer] = useState<CatalogDrawerState>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [outputWeightPrompt, setOutputWeightPrompt] = useState<OutputWeightPromptState>(null);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [isInputsModalOpen, setIsInputsModalOpen] = useState(false);
  const [isSessionsModalOpen, setIsSessionsModalOpen] = useState(false);
  const [sessionRecords, setSessionRecords] = useState<ProductionSessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{
    tone: "neutral" | "success" | "error";
    message: string;
  }>({
    tone: "neutral",
    message: "Lista para capturar.",
  });

  const refreshCloudData = useCallback(async () => {
    try {
      const [nextCatalog, nextManualCosts, nextRecipes, nextScalePresets, nextSessions] = await Promise.all([
        listCloudCatalogOptions(),
        listCloudManualCostItems(),
        listCloudRecipes(),
        listCloudScalePresets(),
        listCloudProductionSessions(),
      ]);

      setLiveCatalogOptions(nextCatalog);
      setLiveManualCostItems(nextManualCosts);
      setLiveRecipeTemplates(nextRecipes);
      setLiveScalePresets(nextScalePresets);
      setSessionRecords(nextSessions);
    } catch {
      // If Firebase is not available we keep the initial payload from the server.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshCloudData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshCloudData]);

  const availableCatalogOptions = liveCatalogOptions.length > 0 ? liveCatalogOptions : catalogOptions;
  const availableManualCostItems = liveManualCostItems.length > 0 ? liveManualCostItems : manualCostItems;
  const availableRecipeTemplates = liveRecipeTemplates.length > 0 ? liveRecipeTemplates : recipeTemplates;
  const availableScalePresets = liveScalePresets.length > 0 ? liveScalePresets : scalePresets;

  useEffect(() => {
    const rawDraft = window.localStorage.getItem(PRODUCTION_DRAFT_STORAGE_KEY);
    const rawStation = window.localStorage.getItem(TOUCH_STATION_STORAGE_KEY);

    if (rawDraft) {
      try {
        const parsedDraft = JSON.parse(rawDraft) as unknown;
        startTransition(() => {
          setDraft(normalizeProductionDraft(parsedDraft));
        });
      } catch {
        window.localStorage.removeItem(PRODUCTION_DRAFT_STORAGE_KEY);
      }
    }

    if (rawStation) {
      try {
        const parsedStation = JSON.parse(rawStation) as Partial<TouchStationState>;
        startTransition(() => {
          setStation((current) =>
            normalizeTouchStationState(parsedStation, availableScalePresets, current),
          );
        });
      } catch {
        window.localStorage.removeItem(TOUCH_STATION_STORAGE_KEY);
      }
    }
  }, [availableScalePresets]);

  useEffect(() => {
    window.localStorage.setItem(PRODUCTION_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  const validOutputIds = useMemo(() => new Set(draft.outputs.map((output) => output.id)), [draft.outputs]);

  const activeOutputId =
    station.activeOutputId && validOutputIds.has(station.activeOutputId)
      ? station.activeOutputId
      : draft.outputs[0]?.id ?? null;

  const recentCaptures = useMemo(
    () => station.recentCaptures.filter((capture) => validOutputIds.has(capture.outputId)),
    [station.recentCaptures, validOutputIds],
  );

  useEffect(() => {
    window.localStorage.setItem(
      TOUCH_STATION_STORAGE_KEY,
      JSON.stringify({
        ...station,
        activeOutputId,
        recentCaptures,
      }),
    );
  }, [activeOutputId, recentCaptures, station]);

  const selectedOutputs = useMemo(() => draft.outputs.filter((output) => output.article), [draft.outputs]);

  const activeOutput = useMemo(
    () => selectedOutputs.find((output) => output.id === activeOutputId) ?? selectedOutputs[0] ?? null,
    [activeOutputId, selectedOutputs],
  );

  const activeScale = useMemo(
    () =>
      availableScalePresets.find((item) => item.scaleId === station.selectedScaleId) ??
      availableScalePresets[0] ??
      null,
    [availableScalePresets, station.selectedScaleId],
  );

  const piecesByOutput = useMemo(() => {
    return recentCaptures.reduce<Record<string, number>>((accumulator, capture) => {
      accumulator[capture.outputId] = (accumulator[capture.outputId] ?? 0) + 1;
      return accumulator;
    }, {});
  }, [recentCaptures]);

  const totalProducedWeight = useMemo(
    () => draft.outputs.reduce((total, output) => total + parseDecimal(output.weight), 0),
    [draft.outputs],
  );

  const activeOutputPieces = activeOutput ? piecesByOutput[activeOutput.id] ?? 0 : 0;
  const selectedOutputCount = selectedOutputs.length;

  function buildSessionLabel() {
    const sourceLabel = draft.sourceProduct
      ? `${draft.sourceProduct.clave} - ${draft.sourceProduct.descripcion}`
      : "Produccion en espera";

    return `${sourceLabel} - ${station.productionDate}`;
  }

  function resetAll() {
    const nextDraft = createEmptyProductionDraft();
    const nextStation = createEmptyTouchStationState(availableScalePresets);
    setDraft(nextDraft);
    setStation(nextStation);
    setActiveSessionId(null);
    setOutputWeightPrompt(null);
    window.localStorage.setItem(PRODUCTION_DRAFT_STORAGE_KEY, JSON.stringify(nextDraft));
    window.localStorage.setItem(TOUCH_STATION_STORAGE_KEY, JSON.stringify(nextStation));
  }

  function applyRecipe(recipe: ProductionRecipeTemplate) {
    const nextDraft = createDraftFromRecipeTemplate(recipe);
    setDraft(nextDraft);
    setStation((current) => ({
      ...current,
      activeOutputId: nextDraft.outputs[0]?.id ?? null,
      recentCaptures: [],
      captureWeight: "",
    }));
    setSaveFeedback({
      tone: "success",
      message: `Receta ${recipe.name} cargada.`,
    });
    setIsRecipeModalOpen(false);
  }

  function openCatalogDrawer(nextState: CatalogDrawerState) {
    setCatalogQuery("");
    setCatalogDrawer(nextState);
  }

  function handleCatalogPick(article: CatalogOption) {
    if (!catalogDrawer) {
      return;
    }

    if (catalogDrawer.kind === "source") {
      setDraft((current) => ({
        ...current,
        sourceProduct: article,
        sourceUnitCost: String(article.preCompraProm),
      }));
      setSaveFeedback({
        tone: "neutral",
        message: `${article.descripcion} listo.`,
      });
    }

    if (catalogDrawer.kind === "new-output") {
      const existingOutput = draft.outputs.find((output) => output.article?.artId === article.artId);
      const emptyOutput = draft.outputs.find((output) => !output.article);

      if (existingOutput) {
        setOutputWeightPrompt({
          article,
          outputId: existingOutput.id,
          initialWeight: station.captureWeight,
          mode: "capture",
        });
      } else if (emptyOutput) {
        setOutputWeightPrompt({
          article,
          outputId: emptyOutput.id,
          initialWeight: station.captureWeight,
          mode: "capture",
        });
      } else {
        setOutputWeightPrompt({
          article,
          outputId: null,
          initialWeight: station.captureWeight,
          mode: "capture",
        });
      }
    }

    if (catalogDrawer.kind === "replace-output") {
      setOutputWeightPrompt({
        article,
        outputId: catalogDrawer.outputId,
        initialWeight: station.captureWeight,
        mode: "stage",
      });
    }

    setCatalogDrawer(null);
  }

  function confirmOutputWeight(value: string) {
    if (!outputWeightPrompt) {
      return;
    }

    const weight = parseDecimal(value);

    if (weight <= 0) {
      setSaveFeedback({
        tone: "error",
        message: "Ingresa un peso valido.",
      });
      return;
    }

    const prompt = outputWeightPrompt;
    const outputId = prompt.outputId ?? crypto.randomUUID();
    const formattedWeight = formatEditableWeight(weight);

    setDraft((current) => {
      const outputExists = current.outputs.some((output) => output.id === outputId);
      const nextOutputs = outputExists
        ? current.outputs.map((output) =>
            output.id === outputId
              ? {
                  ...output,
                  article: prompt.article,
                  weight:
                    prompt.mode === "capture"
                      ? formatEditableWeight(parseDecimal(output.weight) + weight)
                      : output.weight,
                }
              : output,
          )
        : [
            ...current.outputs,
            {
              id: outputId,
              article: prompt.article,
              weight: prompt.mode === "capture" ? formattedWeight : "",
              percentage: "",
            },
          ];

      return {
        ...current,
        outputs: nextOutputs,
      };
    });

    setStation((current) => ({
      ...current,
      activeOutputId: outputId,
      captureWeight: prompt.mode === "capture" ? "" : sanitizeWeightInput(value),
      recentCaptures:
        prompt.mode === "capture"
          ? [
              {
                id: crypto.randomUUID(),
                outputId,
                articleCode: prompt.article.clave,
                articleName: prompt.article.descripcion,
                weight: formattedWeight,
                capturedAt: new Date().toISOString(),
              },
              ...current.recentCaptures,
            ].slice(0, 24)
          : current.recentCaptures,
    }));

    setOutputWeightPrompt(null);
    setSaveFeedback({
      tone: "success",
      message:
        prompt.mode === "capture"
          ? `${prompt.article.descripcion} listo y capturado.`
          : `${prompt.article.descripcion} listo para capturar.`,
    });
  }

  async function handleSaveOnHold() {
    if (!draft.sourceProduct && !draft.outputs.some((output) => output.article)) {
      setSaveFeedback({
        tone: "error",
        message: "No hay produccion para poner en espera.",
      });
      return;
    }

    setIsHolding(true);
    setSaveFeedback({
      tone: "neutral",
      message: "Guardando en espera...",
    });

    try {
      const result = await saveCloudProductionSession({
        sessionId: activeSessionId,
        label: buildSessionLabel(),
        draft,
        stationState: {
          ...station,
          activeOutputId,
          recentCaptures,
        },
      });

      await refreshCloudData();
      resetAll();
      setSaveFeedback({
        tone: "success",
        message: `Produccion en espera ${result.sessionId}.`,
      });
    } catch (error) {
      setSaveFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo guardar en espera.",
      });
    } finally {
      setIsHolding(false);
    }
  }

  function handleOpenSession(record: ProductionSessionRecord) {
    setDraft(normalizeProductionDraft(record.draft));
    setStation((current) => normalizeTouchStationState(record.stationState, availableScalePresets, current));
    setActiveSessionId(record.sessionId);
    setIsSessionsModalOpen(false);
    setSaveFeedback({
      tone: "success",
      message: `${record.label} abierta.`,
    });
  }

  async function handleDeleteSession(sessionId: string) {
    try {
      await deleteCloudProductionSession(sessionId);
      await refreshCloudData();

      if (activeSessionId === sessionId) {
        resetAll();
      }
    } catch (error) {
      setSaveFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo eliminar la espera.",
      });
    }
  }

  function setCaptureWeight(value: string) {
    setStation((current) => ({
      ...current,
      captureWeight: sanitizeWeightInput(value),
    }));
  }

  function handleKeypadPress(key: string) {
    setStation((current) => ({
      ...current,
      captureWeight: appendKey(current.captureWeight, key),
    }));
  }

  function simulateScaleRead() {
    const simulatedWeight = (0.35 + ((recentCaptures.length % 12) + 1) * 0.27).toFixed(2);
    setStation((current) => ({
      ...current,
      captureWeight: simulatedWeight,
    }));
    setSaveFeedback({
      tone: "neutral",
      message: `Lectura tomada de ${activeScale?.name ?? "bascula"}: ${simulatedWeight} lb.`,
    });
  }

  function captureOutput() {
    const selectedOutput = activeOutput;
    const weight = parseDecimal(station.captureWeight);

    if (!selectedOutput?.article) {
      setSaveFeedback({
        tone: "error",
        message: "Selecciona una salida antes de capturar.",
      });
      return;
    }

    if (weight <= 0) {
      setSaveFeedback({
        tone: "error",
        message: "Ingresa o lee un peso valido.",
      });
      return;
    }

    setDraft((current) => ({
      ...current,
      outputs: current.outputs.map((output) =>
        output.id === selectedOutput.id
          ? {
              ...output,
              weight: formatEditableWeight(parseDecimal(output.weight) + weight),
            }
          : output,
      ),
    }));

    setStation((current) => ({
      ...current,
      captureWeight: "",
      recentCaptures: [
        {
          id: crypto.randomUUID(),
          outputId: selectedOutput.id,
          articleCode: selectedOutput.article?.clave ?? "",
          articleName: selectedOutput.article?.descripcion ?? "",
          weight: formatEditableWeight(weight),
          capturedAt: new Date().toISOString(),
        },
        ...current.recentCaptures,
      ].slice(0, 24),
    }));

    setSaveFeedback({
      tone: "success",
      message: station.autoPrint
        ? `Captura registrada. Etiqueta lista para ${selectedOutput.article.descripcion}.`
        : `Captura registrada para ${selectedOutput.article.descripcion}.`,
    });
  }

  function undoLastCapture() {
    const latestCapture = recentCaptures[0];

    if (!latestCapture) {
      setSaveFeedback({
        tone: "error",
        message: "No hay capturas para deshacer.",
      });
      return;
    }

    setDraft((current) => ({
      ...current,
      outputs: current.outputs.map((output) =>
        output.id === latestCapture.outputId
          ? {
              ...output,
              weight: formatEditableWeight(
                Math.max(0, parseDecimal(output.weight) - parseDecimal(latestCapture.weight)),
              ),
            }
          : output,
      ),
    }));

    setStation((current) => ({
      ...current,
      activeOutputId: latestCapture.outputId,
      captureWeight: latestCapture.weight,
      recentCaptures: current.recentCaptures.filter((capture) => capture.id !== latestCapture.id),
    }));

    setSaveFeedback({
      tone: "neutral",
      message: "Ultima captura deshecha.",
    });
  }

  function removeOutput(outputId: string) {
    if (draft.outputs.length === 1) {
      setDraft((current) => ({
        ...current,
        outputs: current.outputs.map((output) =>
          output.id === outputId ? { ...output, article: null, weight: "", percentage: "" } : output,
        ),
      }));
      setStation((current) => ({
        ...current,
        recentCaptures: current.recentCaptures.filter((capture) => capture.outputId !== outputId),
        activeOutputId: outputId,
      }));
      return;
    }

    setDraft((current) => ({
      ...current,
      outputs: current.outputs.filter((output) => output.id !== outputId),
    }));
    setStation((current) => ({
      ...current,
      recentCaptures: current.recentCaptures.filter((capture) => capture.outputId !== outputId),
    }));
  }

  async function handleSaveProduction() {
    if (!draft.sourceProduct) {
      setSaveFeedback({
        tone: "error",
        message: "Selecciona el producto que sale.",
      });
      return;
    }

    if (!draft.outputs.some((output) => output.article && parseDecimal(output.weight) > 0)) {
      setSaveFeedback({
        tone: "error",
        message: "Captura al menos una salida antes de grabar.",
      });
      return;
    }

    const payloadDraft: ProductionDraft = {
      ...draft,
      sourceWeight: formatEditableWeight(totalProducedWeight),
      sourceUnitCost: draft.sourceProduct ? String(draft.sourceProduct.preCompraProm) : draft.sourceUnitCost,
      outputs: draft.outputs.filter((output) => output.article && parseDecimal(output.weight) > 0),
    };

    setIsSaving(true);
    setSaveFeedback({
      tone: "neutral",
      message: "Grabando produccion...",
    });

    try {
      const result = await createCloudProductionOrder(payloadDraft);

      if (activeSessionId) {
        await deleteCloudProductionSession(activeSessionId);
        await refreshCloudData();
      }

      resetAll();
      setSaveFeedback({
        tone: "success",
        message: `Produccion ${result.folio ?? ""} grabada.`,
      });
      router.refresh();
    } catch (error) {
      setSaveFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "No se pudo grabar la produccion.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="h-[calc(100dvh-7.8rem)] min-h-[640px] overflow-hidden">
      <div className="grid h-full min-h-0 gap-4 min-[1050px]:grid-cols-[minmax(0,1fr)_23rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="module-card flex min-h-0 flex-col p-0">
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="grid gap-3">
              {availableCatalogOptions.length === 0 ? (
                <CatalogSyncPanel compact onSynced={refreshCloudData} />
              ) : null}

              <button
                type="button"
                onClick={() => openCatalogDrawer({ kind: "source" })}
                className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-cyan-200"
              >
                <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Sale</p>
                <p className="mt-2 truncate font-medium text-slate-950">
                  {draft.sourceProduct
                    ? `${draft.sourceProduct.clave} - ${draft.sourceProduct.descripcion}`
                    : "Seleccionar producto"}
                </p>
              </button>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[150px_170px_1fr_1fr]">
                <CompactField
                  label="Fecha"
                  value={station.productionDate}
                  onChange={(value) =>
                    setStation((current) => ({
                      ...current,
                      productionDate: value,
                    }))
                  }
                  type="date"
                  icon={<CalendarDays className="size-4 text-slate-400" />}
                />

                <label className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Bascula</span>
                  <select
                    value={station.selectedScaleId ?? ""}
                    onChange={(event) =>
                      setStation((current) => ({
                        ...current,
                        selectedScaleId: Number(event.target.value) || null,
                      }))
                    }
                    className="h-12 w-full rounded-[18px] border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-slate-500"
                  >
                    {availableScalePresets.length === 0 ? <option value="">Manual</option> : null}
                    {availableScalePresets.map((scalePreset) => (
                      <option key={scalePreset.scaleId} value={scalePreset.scaleId}>
                        {scalePreset.name}
                      </option>
                    ))}
                  </select>
                </label>

                <ToolbarButton
                  label="Recetas"
                  detail={draft.recipeName || "Sin receta"}
                  onClick={() => setIsRecipeModalOpen(true)}
                />

                <ToolbarButton
                  label="Insumos"
                  detail={`${draft.inputs.length} cargados`}
                  onClick={() => setIsInputsModalOpen(true)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <SmallActionButton onClick={handleSaveOnHold} disabled={isHolding}>
                  <PauseCircle className="size-4" />
                  {isHolding ? "Guardando..." : "En espera"}
                </SmallActionButton>
                <SmallActionButton onClick={() => setIsSessionsModalOpen(true)}>
                  <FolderOpen className="size-4" />
                  Abrir espera
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                    {sessionRecords.length}
                  </span>
                </SmallActionButton>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl text-slate-950">Entra</h1>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                {selectedOutputCount} seleccionados
              </span>
            </div>

            <div className="flex gap-2">
              <SmallActionButton onClick={() => openCatalogDrawer({ kind: "new-output" })}>
                <CopyPlus className="size-4" />
                Agregar
              </SmallActionButton>
              <SmallActionButton onClick={undoLastCapture}>
                <Undo2 className="size-4" />
                Deshacer
              </SmallActionButton>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {selectedOutputs.length === 0 ? (
              <button
                type="button"
                onClick={() => openCatalogDrawer({ kind: "new-output" })}
                className="flex h-full min-h-[280px] w-full items-center justify-center rounded-[26px] border border-dashed border-slate-300 bg-slate-50 text-lg font-medium text-slate-500 transition hover:border-cyan-300 hover:bg-cyan-50/60"
              >
                Agregar primer producto
              </button>
            ) : (
              <div className="grid h-full auto-rows-fr gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {selectedOutputs.map((output, index) => {
                  const isSelected = output.id === activeOutputId;
                  const pieceCount = piecesByOutput[output.id] ?? 0;

                  return (
                    <button
                      key={output.id}
                      type="button"
                      onClick={() =>
                        setStation((current) => ({
                          ...current,
                          activeOutputId: output.id,
                        }))
                      }
                      className={cn(
                        "relative min-h-[206px] rounded-[24px] border p-4 text-left transition-all",
                        isSelected
                          ? "border-orange-300 bg-orange-50 shadow-[0_18px_34px_-26px_rgba(249,115,22,0.45)]"
                          : "border-slate-200 bg-white hover:border-cyan-200",
                      )}
                    >
                      <div className="absolute right-3 top-3 flex gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openCatalogDrawer({ kind: "replace-output", outputId: output.id });
                          }}
                          className="inline-flex h-8 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600"
                        >
                          Cambiar
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeOutput(output.id);
                          }}
                          className="inline-flex size-8 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>

                      <p className="text-[10px] uppercase tracking-[0.26em] text-slate-400">
                        Producto {String(index + 1).padStart(2, "0")}
                      </p>
                      <p className="mt-3 line-clamp-2 pr-24 font-display text-[1.65rem] leading-[1.02] text-slate-950">
                        {output.article?.descripcion}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">{output.article?.clave}</p>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <CompactValueCard label="Peso" value={formatWeight(output.weight || 0)} />
                        <CompactValueCard label="Piezas" value={String(pieceCount)} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="module-card flex min-h-0 flex-col p-0">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.26em] text-slate-500">Activo</p>
                <p className="mt-1 truncate text-lg font-semibold text-slate-950">
                  {activeOutput?.article
                    ? `${activeOutput.article.clave} - ${activeOutput.article.descripcion}`
                    : "Seleccionar producto"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {activeOutput ? `${activeOutputPieces} piezas` : "Elige una salida"}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setStation((current) => ({
                    ...current,
                    autoPrint: !current.autoPrint,
                  }))
                }
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-2xl border transition",
                  station.autoPrint
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-500",
                )}
                title={station.autoPrint ? "Etiqueta automatica" : "Etiqueta manual"}
              >
                <Printer className="size-4" />
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_1fr_auto] gap-3 px-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <CompactValueCard label="Piezas" value={String(activeOutputPieces)} />
              <CompactValueCard label="Total" value={formatWeight(totalProducedWeight)} />
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
                <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
                  <div className="flex items-center gap-2">
                    <Scale className="size-4 text-cyan-700" />
                    <span>{activeScale?.name ?? "Manual"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-600">
                    <Wifi className="size-4" />
                    <span>Listo</span>
                  </div>
                </div>

                <div className="rounded-[20px] border-2 border-orange-400 bg-orange-50 px-4 py-4 text-center">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Peso</p>
                  <div className="mt-2 flex items-end justify-center gap-2">
                    <span className="font-display text-[3rem] leading-none text-slate-950">
                      {station.captureWeight || "0.00"}
                    </span>
                    <span className="pb-2 text-xl text-slate-500">lb</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {["7", "8", "9", "C", "4", "5", "6", "DEL", "1", "2", "3", ".", "0", "00"].map((key) => {
                  const isWideAction = key === "0";

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        handleKeypadPress(key);
                      }}
                      className={cn(
                        "inline-flex h-12 items-center justify-center rounded-[16px] border border-slate-200 bg-white text-sm font-semibold text-slate-900 transition hover:border-slate-300",
                        isWideAction ? "col-span-2" : "",
                      )}
                    >
                      {key}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={simulateScaleRead}
                  className="col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-[16px] border border-cyan-200 bg-cyan-50 text-sm font-semibold text-cyan-900"
                >
                  <Scale className="size-4" />
                  Leer
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureWeight("")}
                  className="col-span-2 inline-flex h-12 items-center justify-center rounded-[16px] border border-slate-200 bg-white text-sm font-semibold text-slate-700"
                >
                  Limpiar
                </button>
              </div>

            <div className="grid gap-3">
              <div className="rounded-[18px] border border-dashed border-orange-200 bg-orange-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-950">
                      {activeOutput?.article?.clave ?? "SIN-COD"}
                    </p>
                    <p className="truncate text-sm text-slate-600">
                      {activeOutput?.article?.descripcion ?? "Selecciona producto"}
                    </p>
                  </div>
                  <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-medium text-orange-700">
                    {station.autoPrint ? "Auto" : "Manual"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ActionButton
                  tone="orange"
                  onClick={captureOutput}
                  disabled={false}
                  icon={<Boxes className="size-5" />}
                >
                  Capturar
                </ActionButton>
                <ActionButton
                  tone="green"
                  onClick={handleSaveProduction}
                  disabled={isSaving}
                  icon={<Save className="size-5" />}
                >
                  {isSaving ? "Grabando..." : "Grabar"}
                </ActionButton>
              </div>

              <p
                className={cn(
                  "rounded-[16px] border px-3 py-2 text-xs",
                  saveFeedback.tone === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : saveFeedback.tone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-500",
                )}
              >
                {saveFeedback.message}
              </p>
            </div>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {catalogDrawer ? (
          <CatalogSelectorModal
            title={
              catalogDrawer.kind === "source"
                ? "Seleccionar producto que sale"
                : "Seleccionar producto que entra"
            }
            query={catalogQuery}
            options={availableCatalogOptions}
            onClose={() => setCatalogDrawer(null)}
            onQueryChange={setCatalogQuery}
            onSelect={handleCatalogPick}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {outputWeightPrompt ? (
          <WeightPromptModal
            article={outputWeightPrompt.article}
            initialWeight={outputWeightPrompt.initialWeight}
            mode={outputWeightPrompt.mode}
            onClose={() => setOutputWeightPrompt(null)}
            onConfirm={confirmOutputWeight}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isRecipeModalOpen ? (
          <RecipeModal
            recipes={availableRecipeTemplates}
            activeRecipeId={draft.recipeId}
            onClose={() => setIsRecipeModalOpen(false)}
            onSelect={applyRecipe}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isInputsModalOpen ? (
          <InputsModal
            inputs={draft.inputs}
            manualCostItems={availableManualCostItems}
            onClose={() => setIsInputsModalOpen(false)}
            onChange={(nextInputs) =>
              setDraft((current) => ({
                ...current,
                inputs: nextInputs,
              }))
            }
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isSessionsModalOpen ? (
          <ProductionSessionsModal
            sessions={sessionRecords}
            activeSessionId={activeSessionId}
            onClose={() => setIsSessionsModalOpen(false)}
            onOpen={handleOpenSession}
            onDelete={handleDeleteSession}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CompactField({
  label,
  value,
  onChange,
  type,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: "date" | "text";
  icon: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.26em] text-slate-500">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-full rounded-[18px] border border-slate-300 bg-white px-4 pr-10 text-sm outline-none transition focus:border-slate-500"
        />
      </div>
    </label>
  );
}

function ToolbarButton({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-cyan-200"
    >
      <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-2 truncate text-sm font-medium text-slate-900">{detail}</p>
    </button>
  );
}

function SmallActionButton({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-[16px] border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function CompactValueCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
      <span className="uppercase tracking-[0.18em] text-slate-400">{label}</span>
      <span className="ml-2 font-medium text-slate-900">{value}</span>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  tone,
  icon,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: "orange" | "green";
  icon: React.ReactNode;
  disabled: boolean;
}) {
  const toneClass =
    tone === "orange"
      ? "bg-[linear-gradient(135deg,#f59e0b,#f97316)] shadow-[0_20px_36px_-22px_rgba(249,115,22,0.65)]"
      : "bg-[linear-gradient(135deg,#0f766e,#14b8a6)] shadow-[0_20px_36px_-22px_rgba(20,184,166,0.6)]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-14 items-center justify-center gap-2 rounded-[18px] px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60",
        toneClass,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function CatalogSelectorModal({
  title,
  query,
  options,
  onClose,
  onQueryChange,
  onSelect,
}: {
  title: string;
  query: string;
  options: CatalogOption[];
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (article: CatalogOption) => void;
}) {
  const [activeFilter, setActiveFilter] = useState(ALL_FILTER);
  const [preferences, setPreferences] = useState(() => readCatalogBrowserPreferences());
  const categoryFilters = useMemo(() => getCatalogDepartmentFilters(options), [options]);
  const filteredOptions = useMemo(
    () => filterCatalogOptions(options, query, activeFilter, preferences).slice(0, 48),
    [activeFilter, options, preferences, query],
  );

  function handleSelect(option: CatalogOption) {
    setPreferences((current) => registerCatalogUsage(option.artId, current));
    onSelect(option);
  }

  function handleToggleFavorite(artId: number) {
    setPreferences((current) => toggleCatalogFavorite(artId, current));
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="border-b border-slate-200 px-6 py-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar producto"
            className="h-14 w-full rounded-[18px] border border-slate-300 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-cyan-300"
          />
        </label>

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
          {categoryFilters.map((category) => (
            <FilterChip
              key={category}
              active={activeFilter === category}
              onClick={() => setActiveFilter(category)}
            >
              {category}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredOptions.map((option) => {
            const favorite = isCatalogFavorite(option.artId, preferences);
            const usageCount = getCatalogUsageCount(option.artId, preferences);

            return (
            <button
              key={option.artId}
              type="button"
              onClick={() => handleSelect(option)}
              className="rounded-[22px] border border-slate-200 bg-white p-4 text-left transition hover:border-cyan-200 hover:bg-cyan-50/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-950">{option.descripcion}</p>
                  <p className="mt-2 text-sm text-slate-500">{option.clave}</p>
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleToggleFavorite(option.artId);
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

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  {(option.departmentName || "OTROS").toUpperCase()}
                </span>
                {option.categoryName ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    {option.categoryName}
                  </span>
                ) : null}
                {usageCount > 0 ? (
                  <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700">
                    {usageCount} usos
                  </span>
                ) : null}
              </div>
            </button>
            );
          })}
        </div>

        {filteredOptions.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            Sin resultados
          </div>
        ) : null}
      </div>
    </ModalShell>
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

function WeightPromptModal({
  article,
  initialWeight,
  mode,
  onClose,
  onConfirm,
}: {
  article: CatalogOption;
  initialWeight: string;
  mode: "capture" | "stage";
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const [weight, setWeight] = useState(() => sanitizeWeightInput(initialWeight));

  return (
    <ModalShell title={mode === "capture" ? "Peso a producir" : "Peso para capturar"} onClose={onClose}>
      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="border-b border-slate-200 px-6 py-6 lg:border-b-0 lg:border-r">
          <p className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Producto</p>
          <p className="mt-3 font-display text-3xl leading-tight text-slate-950">{article.descripcion}</p>
          <p className="mt-2 text-sm text-slate-500">{article.clave}</p>

          <div className="mt-6 rounded-[24px] border-2 border-orange-300 bg-orange-50 px-6 py-6 text-center">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Peso</p>
            <div className="mt-3 flex items-end justify-center gap-2">
              <span className="font-display text-[3.4rem] leading-none text-slate-950">
                {weight || "0.00"}
              </span>
              <span className="pb-2 text-xl text-slate-500">lb</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col px-6 py-6">
          <div className="grid grid-cols-4 gap-2">
            {["7", "8", "9", "C", "4", "5", "6", "DEL", "1", "2", "3", ".", "0", "00"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setWeight((current) => appendKey(current, key))}
                className={cn(
                  "inline-flex h-14 items-center justify-center rounded-[18px] border border-slate-200 bg-white text-base font-semibold text-slate-950 transition hover:border-slate-300",
                  key === "0" ? "col-span-2" : "",
                )}
              >
                {key}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3">
            <button
              type="button"
              onClick={() => onConfirm(weight)}
              className="inline-flex h-14 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#0f766e,#14b8a6)] text-base font-semibold text-white shadow-[0_20px_36px_-22px_rgba(20,184,166,0.6)]"
            >
              Continuar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-12 items-center justify-center rounded-[18px] border border-slate-200 bg-white text-sm font-semibold text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function ProductionSessionsModal({
  sessions,
  activeSessionId,
  onClose,
  onOpen,
  onDelete,
}: {
  sessions: ProductionSessionRecord[];
  activeSessionId: string | null;
  onClose: () => void;
  onOpen: (record: ProductionSessionRecord) => void;
  onDelete: (sessionId: string) => void | Promise<void>;
}) {
  return (
    <ModalShell title="Producciones en espera" onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.sessionId}
              className={cn(
                "rounded-[22px] border p-4 transition",
                activeSessionId === session.sessionId
                  ? "border-orange-300 bg-orange-50"
                  : "border-slate-200 bg-white",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-950">{session.label}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {new Date(session.updatedAt).toLocaleString("es-NI")}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(session)}
                    className="inline-flex h-11 items-center justify-center rounded-[16px] border border-cyan-200 bg-cyan-50 px-4 text-sm font-semibold text-cyan-900"
                  >
                    Abrir
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(session.sessionId)}
                    className="inline-flex h-11 items-center justify-center rounded-[16px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}

          {sessions.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              Sin producciones en espera
            </div>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}

function RecipeModal({
  recipes,
  activeRecipeId,
  onClose,
  onSelect,
}: {
  recipes: ProductionRecipeTemplate[];
  activeRecipeId: number | null;
  onClose: () => void;
  onSelect: (recipe: ProductionRecipeTemplate) => void;
}) {
  return (
    <ModalShell title="Recetas" onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {recipes.map((recipe) => (
            <button
              key={recipe.recipeId}
              type="button"
              onClick={() => onSelect(recipe)}
              className={cn(
                "rounded-[22px] border p-4 text-left transition",
                activeRecipeId === recipe.recipeId
                  ? "border-orange-300 bg-orange-50"
                  : "border-slate-200 bg-white hover:border-cyan-200",
              )}
            >
              <p className="font-medium text-slate-950">{recipe.name}</p>
              <p className="mt-2 text-sm text-slate-500">
                {recipe.outputs.length} salidas · {recipe.code}
              </p>
            </button>
          ))}
        </div>

        {recipes.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            Sin recetas
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}

function InputsModal({
  inputs,
  manualCostItems,
  onClose,
  onChange,
}: {
  inputs: ProductionDraftInput[];
  manualCostItems: ManualCostItem[];
  onClose: () => void;
  onChange: (nextInputs: ProductionDraftInput[]) => void;
}) {
  function updateRow(id: string, patch: Partial<ProductionDraftInput>) {
    onChange(inputs.map((input) => (input.id === id ? { ...input, ...patch } : input)));
  }

  function removeRow(id: string) {
    onChange(inputs.filter((input) => input.id !== id));
  }

  return (
    <ModalShell title="Insumos" onClose={onClose}>
      <div className="border-b border-slate-200 px-6 py-4">
        <button
          type="button"
          onClick={() => onChange([...inputs, createDraftInput()])}
          className="inline-flex items-center gap-2 rounded-[16px] border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-900"
        >
          <ListPlus className="size-4" />
          Agregar insumo
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="space-y-3">
          {inputs.map((input) => (
            <div key={input.id} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr_auto]">
                <label className="space-y-2">
                  <span className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Insumo</span>
                  <select
                    value={input.manualCostItemId ?? ""}
                    onChange={(event) => {
                      const nextItem = manualCostItems.find(
                        (item) => item.manualCostItemId === Number(event.target.value),
                      );

                      updateRow(input.id, {
                        manualCostItemId: nextItem?.manualCostItemId ?? null,
                        label: nextItem ? `${nextItem.code} - ${nextItem.name}` : "",
                        unitName: nextItem?.unitName ?? "",
                        unitCost: nextItem ? String(nextItem.currentCost) : input.unitCost,
                      });
                    }}
                    className="h-12 w-full rounded-[18px] border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-slate-500"
                  >
                    <option value="">Seleccionar</option>
                    {manualCostItems.map((item) => (
                      <option key={item.manualCostItemId} value={item.manualCostItemId}>
                        {item.code} - {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <InlineField
                    label={input.unitName ? `Cant. ${input.unitName}` : "Cantidad"}
                    value={input.weight}
                    onChange={(value) => updateRow(input.id, { weight: value })}
                  />
                  <div className="space-y-2">
                    <span className="block text-[11px] uppercase tracking-[0.26em] text-slate-500">Unidad</span>
                    <div className="inline-flex h-12 min-w-[88px] items-center justify-center rounded-[18px] border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700">
                      {input.unitName || "--"}
                    </div>
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeRow(input.id)}
                    className="inline-flex h-12 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-slate-500"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {inputs.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              Sin insumos
            </div>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}

function InlineField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] uppercase tracking-[0.26em] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-[18px] border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-slate-500"
      />
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-950/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_44px_110px_-58px_rgba(15,23,42,0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <h3 className="font-display text-3xl text-slate-950">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
