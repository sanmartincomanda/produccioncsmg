import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { getFirebaseFirestore } from "@/lib/firebase/firestore-client";
import { calculateProductionTotals } from "@/lib/production/costing";
import {
  createEmptyProductionDraft,
  normalizeProductionDraft,
} from "@/lib/production/draft";
import type { SicarCatalogItem, SicarCatalogResult } from "@/lib/sicar/catalog";
import type {
  ArticleProfileDefault,
  CatalogOption,
  ManualCostItem,
  ProductionDraft,
  ProductionHistoryRow,
  ProductionOrderListItem,
  ProductionOrderRecord,
  ProductionRecipeTemplate,
  ProductionSessionRecord,
  ProductionWorkflowStage,
  ScalePreset,
  SicarPostingPreview,
} from "@/types/production";

const COLLECTIONS = {
  articleProfiles: "article_profiles",
  catalogItems: "catalog_items",
  integratorRuntime: "integrator_runtime",
  manualCostItems: "manual_cost_items",
  productionOrders: "production_orders",
  productionSessions: "production_sessions",
  recipes: "recipes",
  scalePresets: "scale_presets",
  sicarPostingRequests: "sicar_posting_requests",
  syncRequests: "sync_requests",
  systemMeta: "system_meta",
} as const;

export type CloudCatalogSyncState = {
  integratorStatus: string | null;
  integratorMode: string | null;
  integratorHost: string | null;
  catalogRows: number;
  catalogSyncedAt: string | null;
  lastErrorMessage: string | null;
  requestStatus: string | null;
  requestUpdatedAt: string | null;
};

type CloudRecipeSavePayload = {
  recipeId?: number | null;
  name: string;
  draft: ProductionDraft;
};

type CloudArticleProfilePayload = {
  sicarArtId: number;
  articleLabel: string;
  productionRole: ArticleProfileDefault["productionRole"];
  vrnPercentage: number;
  costingMode: ArticleProfileDefault["costingMode"];
  manualCost: number | null;
  notes: string;
};

type CloudManualCostPayload = {
  code: string;
  name: string;
  unitName: string;
  costType: ManualCostItem["costType"];
  currentCost: number;
  notes: string;
};

type CounterFields = {
  nextProductionOrderId?: number;
  nextProductionFolio?: number;
  nextRecipeId?: number;
};

function getDb() {
  const db = getFirebaseFirestore();

  if (!db) {
    throw new Error("Firebase no esta configurado para esta app.");
  }

  return db;
}

function nowIso() {
  return new Date().toISOString();
}

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

function toBoolean(value: unknown) {
  return Boolean(value);
}

function toIso(value: unknown, fallback = nowIso()) {
  if (!value) {
    return fallback;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      const asDate = (value as { toDate: () => Date }).toDate();
      return asDate.toISOString();
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function sanitizeDocId(value: string) {
  return value.trim().replace(/[^\w-]+/gu, "_").toLowerCase();
}

function mapCatalogItemDoc(snapshot: QueryDocumentSnapshot): SicarCatalogItem {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    artId: toNumber(data.artId),
    clave: String(data.clave ?? ""),
    descripcion: String(data.descripcion ?? ""),
    caracteristicas: String(data.caracteristicas ?? ""),
    status: toNumber(data.status),
    servicio: toNumber(data.servicio),
    insumo: toNumber(data.insumo),
    receta: toNumber(data.receta),
    platillo: toNumber(data.platillo),
    existencia: String(data.existencia ?? 0),
    precioCompra: String(data.precioCompra ?? 0),
    preCompraProm: String(data.preCompraProm ?? 0),
    categoryId:
      data.categoryId === null || data.categoryId === undefined ? null : toNumber(data.categoryId),
    categoryName: String(data.categoryName ?? ""),
    departmentId:
      data.departmentId === null || data.departmentId === undefined ? null : toNumber(data.departmentId),
    departmentName: String(data.departmentName ?? ""),
    unidadCompra: String(data.unidadCompra ?? ""),
    unidadVenta: String(data.unidadVenta ?? ""),
  };
}

function toCatalogOption(item: SicarCatalogItem): CatalogOption {
  return {
    artId: item.artId,
    clave: item.clave,
    descripcion: item.descripcion,
    unidadVenta: item.unidadVenta,
    existencia: Number(item.existencia ?? 0),
    precioCompra: Number(item.precioCompra ?? 0),
    preCompraProm: Number(item.preCompraProm ?? 0),
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    departmentId: item.departmentId,
    departmentName: item.departmentName,
  };
}

function mapArticleProfileDoc(snapshot: QueryDocumentSnapshot): ArticleProfileDefault {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    articleProfileId: toNumber(data.articleProfileId ?? data.sicarArtId),
    sicarArtId: toNumber(data.sicarArtId),
    articleLabel: String(data.articleLabel ?? data.sicarArtId ?? ""),
    productionRole: data.productionRole as ArticleProfileDefault["productionRole"],
    vrnPercentage: toNumber(data.vrnPercentage),
    costingMode: data.costingMode as ArticleProfileDefault["costingMode"],
    manualCost: data.manualCost === null || data.manualCost === undefined ? null : toNumber(data.manualCost),
    notes: String(data.notes ?? ""),
  };
}

function mapManualCostDoc(snapshot: QueryDocumentSnapshot): ManualCostItem {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    manualCostItemId: toNumber(data.manualCostItemId),
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    unitName: String(data.unitName ?? ""),
    costType: data.costType as ManualCostItem["costType"],
    currentCost: toNumber(data.currentCost),
    isActive: data.isActive === undefined ? true : toBoolean(data.isActive),
    notes: String(data.notes ?? ""),
  };
}

function mapScalePresetDoc(snapshot: QueryDocumentSnapshot): ScalePreset {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    scaleId: toNumber(data.scaleId),
    name: String(data.name ?? ""),
    portName: String(data.portName ?? ""),
    baudRate: toNumber(data.baudRate),
    pollDelayMs: toNumber(data.pollDelayMs),
    commandSequence: String(data.commandSequence ?? ""),
    useCarriageReturn: toNumber(data.useCarriageReturn),
    dataBits: toNumber(data.dataBits),
  };
}

function mapRecipeDoc(snapshot: QueryDocumentSnapshot): ProductionRecipeTemplate {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    recipeId: toNumber(data.recipeId),
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    versionNo: toNumber(data.versionNo || 1),
    status: (data.status as ProductionRecipeTemplate["status"]) ?? "ACTIVE",
    updatedAt: toIso(data.updatedAt),
    sourceProduct: normalizeProductionDraft({
      sourceProduct: data.sourceProduct ?? null,
    }).sourceProduct,
    sourceWeight: toNumber(data.sourceWeight),
    sourceUnitCost: toNumber(data.sourceUnitCost),
    inputs: Array.isArray(data.inputs)
      ? data.inputs.map((input, index) => {
          const candidate = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
          return {
            recipeInputId: toNumber(candidate.recipeInputId ?? index + 1),
            manualCostItemId:
              candidate.manualCostItemId === null || candidate.manualCostItemId === undefined
                ? null
                : toNumber(candidate.manualCostItemId),
            label: String(candidate.label ?? ""),
            unitName: String(candidate.unitName ?? ""),
            weight: toNumber(candidate.weight),
            unitCost: toNumber(candidate.unitCost),
          };
        })
      : [],
    outputs: Array.isArray(data.outputs)
      ? data.outputs.map((output, index) => {
          const candidate = (output && typeof output === "object" ? output : {}) as Record<string, unknown>;
          return {
            recipeOutputId: toNumber(candidate.recipeOutputId ?? index + 1),
            article: normalizeProductionDraft({ outputs: [{ article: candidate.article ?? null }] }).outputs[0]
              ?.article,
            weight: toNumber(candidate.weight),
            percentage: toNumber(candidate.percentage),
          };
        })
      : [],
    manualCosts: Array.isArray(data.manualCosts)
      ? data.manualCosts.map((manualCost, index) => {
          const candidate = (manualCost && typeof manualCost === "object"
            ? manualCost
            : {}) as Record<string, unknown>;
          return {
            recipeInputId: toNumber(candidate.recipeInputId ?? index + 1),
            manualCostItemId:
              candidate.manualCostItemId === null || candidate.manualCostItemId === undefined
                ? null
                : toNumber(candidate.manualCostItemId),
            label: String(candidate.label ?? ""),
            cost: toNumber(candidate.cost),
            multiplier: toNumber(candidate.multiplier),
          };
        })
      : [],
  };
}

function mapOrderDoc(snapshot: QueryDocumentSnapshot): ProductionOrderRecord {
  const data = snapshot.data() as Record<string, unknown>;
  const sicarPosting =
    typeof data.sicarPosting === "object" && data.sicarPosting !== null
      ? (data.sicarPosting as Record<string, unknown>)
      : null;
  const sicarExclusion =
    typeof data.sicarExclusion === "object" && data.sicarExclusion !== null
      ? (data.sicarExclusion as Record<string, unknown>)
      : null;

  return {
    productionOrderId: toNumber(data.productionOrderId),
    folio: String(data.folio ?? ""),
    status: String(data.status ?? "DRAFT"),
    workflowStage: (data.workflowStage as ProductionWorkflowStage) ?? "PRODUCED",
    draft: normalizeProductionDraft(data.draft),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    completedAt: data.completedAt ? toIso(data.completedAt) : null,
    sicarPosting: sicarPosting
      ? {
          ainId: toNumber(sicarPosting.ainId),
          comment: String(sicarPosting.comment ?? ""),
          postedAt: toIso(sicarPosting.postedAt),
          requestId: String(sicarPosting.requestId ?? ""),
          reused: toBoolean(sicarPosting.reused),
        }
      : null,
    sicarExclusion: sicarExclusion
      ? {
          reason: String(sicarExclusion.reason ?? ""),
          excludedAt: toIso(sicarExclusion.excludedAt),
        }
      : null,
  };
}

function mapSessionDoc(snapshot: QueryDocumentSnapshot): ProductionSessionRecord {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    sessionId: String(data.sessionId ?? snapshot.id),
    label: String(data.label ?? "Producción en espera"),
    draft: normalizeProductionDraft(data.draft),
    stationState: data.stationState ?? null,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function toOrderListItem(record: ProductionOrderRecord): ProductionOrderListItem {
  const totals = calculateProductionTotals(record.draft, []);

  return {
    productionOrderId: record.productionOrderId,
    folio: record.folio,
    status: record.status,
    workflowStage: record.workflowStage,
    sourceLabel: record.draft.sourceProduct
      ? `${record.draft.sourceProduct.clave} - ${record.draft.sourceProduct.descripcion}`
      : "Produccion sin base",
    sourceWeight: totals.sourceWeight,
    producedWeight: totals.producedWeight,
    totalCost: totals.totalCost,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toHistoryRow(
  record: ProductionOrderRecord,
  articleProfiles: ArticleProfileDefault[],
): ProductionHistoryRow {
  const totals = calculateProductionTotals(record.draft, articleProfiles);
  const sicarStatusLabel =
    record.workflowStage === "POSTED_TO_SICAR"
      ? "SUBIDO A SICAR"
      : record.workflowStage === "SICAR_EXCLUDED"
        ? "NO INCLUIDO EN SICAR"
        : record.workflowStage === "READY_FOR_SICAR"
          ? "ENVIADO A SICAR"
          : "PENDIENTE";

  return {
    productionOrderId: record.productionOrderId,
    folio: record.folio,
    status: record.status,
    workflowStage: record.workflowStage,
    scheduledAt: record.createdAt,
    completedAt: record.completedAt,
    updatedAt: record.updatedAt,
    outputLines: record.draft.outputs.filter((output) => output.article).length,
    inputLines: record.draft.inputs.length + record.draft.manualCosts.length,
    movementLines: 0,
    estimatedTotalCost: totals.totalCost,
    sourceLabel: record.draft.sourceProduct
      ? `${record.draft.sourceProduct.clave} - ${record.draft.sourceProduct.descripcion}`
      : "Produccion sin base",
    sourceWeight: totals.sourceWeight,
    producedWeight: totals.producedWeight,
    sourceConsumption: [
      ...(record.draft.sourceProduct
        ? [
            {
              label: `${record.draft.sourceProduct.clave} - ${record.draft.sourceProduct.descripcion}`,
              quantity: totals.sourceWeight,
              unitName: record.draft.sourceProduct.unidadVenta || "LB",
              unitCost: totals.sourceUnitCost,
              totalCost: totals.sourceTotal,
            },
          ]
        : []),
      ...totals.inputRows.map((row) => ({
        label: row.label,
        quantity: row.weight,
        unitName: record.draft.inputs.find((input) => input.id === row.id)?.unitName || "PZA",
        unitCost: row.unitCost,
        totalCost: row.total,
      })),
    ],
    outputEntries: totals.outputs.map((output) => ({
      label: output.label,
      quantity: output.weight,
      unitName:
        record.draft.outputs.find((item) => item.id === output.id)?.article?.unidadVenta || "LB",
      producedUnitCost: output.producedUnitCost,
      allocatedCost: output.allocatedCost,
    })),
    manualCostEntries: record.draft.manualCosts.map((item) => ({
      label: item.label || "Costo adicional",
      multiplier: toNumber(item.multiplier),
      cost: toNumber(item.cost),
      totalCost: toNumber(item.multiplier) * toNumber(item.cost),
    })),
    sicarStatusLabel,
    sicarAinId: record.sicarPosting?.ainId ?? null,
    sicarComment: record.sicarPosting?.comment ?? "",
    excludedReason: record.sicarExclusion?.reason ?? null,
    notes: record.draft.sourceProduct
      ? `${record.draft.sourceProduct.clave} - ${record.draft.sourceProduct.descripcion}`
      : "",
  };
}

function toPostingPreview(
  record: ProductionOrderRecord,
  articleProfiles: ArticleProfileDefault[],
): SicarPostingPreview {
  const totals = calculateProductionTotals(record.draft, articleProfiles);

  return {
    productionOrderId: record.productionOrderId,
    folio: record.folio,
    status: record.status,
    workflowStage: record.workflowStage,
    sourceProductLabel: record.draft.sourceProduct
      ? `${record.draft.sourceProduct.clave} - ${record.draft.sourceProduct.descripcion}`
      : "Sin producto base",
    sourceWeight: totals.sourceWeight,
    totalProducedWeight: totals.producedWeight,
    totalCost: totals.totalCost,
    outputCount: totals.outputs.length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sourceConsumption: [
      ...(record.draft.sourceProduct
        ? [
            {
              label: `${record.draft.sourceProduct.clave} - ${record.draft.sourceProduct.descripcion}`,
              quantity: totals.sourceWeight,
              unitName: record.draft.sourceProduct.unidadVenta || "LB",
              unitCost: totals.sourceUnitCost,
              totalCost: totals.sourceTotal,
            },
          ]
        : []),
      ...totals.inputRows.map((row) => ({
        label: row.label,
        quantity: row.weight,
        unitName:
          record.draft.inputs.find((input) => input.id === row.id)?.unitName || "PZA",
        unitCost: row.unitCost,
        totalCost: row.total,
      })),
    ],
    outputEntries: totals.outputs.map((output) => ({
      label: output.label,
      quantity: output.weight,
      unitName:
        record.draft.outputs.find((item) => item.id === output.id)?.article?.unidadVenta || "LB",
      producedUnitCost: output.producedUnitCost,
      allocatedCost: output.allocatedCost,
    })),
  };
}

async function nextCounter<K extends keyof CounterFields>(key: K, startAt = 1) {
  const db = getDb();
  const countersRef = doc(db, COLLECTIONS.systemMeta, "counters");

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(countersRef);
    const data = (snapshot.data() ?? {}) as CounterFields;
    const nextValue = Number(data[key] ?? startAt);
    transaction.set(countersRef, { [key]: nextValue + 1 }, { merge: true });
    return nextValue;
  });
}

async function nextProductionIdentifiers() {
  const db = getDb();
  const countersRef = doc(db, COLLECTIONS.systemMeta, "counters");

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(countersRef);
    const data = (snapshot.data() ?? {}) as CounterFields;
    const productionOrderId = Number(data.nextProductionOrderId ?? 1);
    const folioNumber = Number(data.nextProductionFolio ?? 1);

    transaction.set(
      countersRef,
      {
        nextProductionOrderId: productionOrderId + 1,
        nextProductionFolio: folioNumber + 1,
      },
      { merge: true },
    );

    return {
      productionOrderId,
      folio: `PR-${String(folioNumber).padStart(3, "0")}`,
    };
  });
}

export async function listCloudCatalogItems() {
  const db = getDb();
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.catalogItems), orderBy("clave", "asc"), limit(1500)),
  );
  return snapshot.docs.map(mapCatalogItemDoc);
}

export async function listCloudCatalogOptions() {
  const items = await listCloudCatalogItems();
  return items.map(toCatalogOption);
}

export async function listCloudCatalogPageData(): Promise<SicarCatalogResult> {
  const rows = await listCloudCatalogItems();

  return {
    rows,
    total: rows.length,
    page: 1,
    limit: Math.max(rows.length, 1),
  };
}

export async function getCloudCatalogSyncState(): Promise<CloudCatalogSyncState> {
  const db = getDb();
  const [runtimeSnapshot, requestSnapshot] = await Promise.all([
    getDoc(doc(db, COLLECTIONS.integratorRuntime, "main")),
    getDoc(doc(db, COLLECTIONS.syncRequests, "catalog")),
  ]);

  const runtimeData = (runtimeSnapshot.data() ?? {}) as Record<string, unknown>;
  const requestData = (requestSnapshot.data() ?? {}) as Record<string, unknown>;
  const catalogData =
    typeof runtimeData.catalog === "object" && runtimeData.catalog !== null
      ? (runtimeData.catalog as Record<string, unknown>)
      : {};

  return {
    integratorStatus: typeof runtimeData.status === "string" ? runtimeData.status : null,
    integratorMode: typeof runtimeData.mode === "string" ? runtimeData.mode : null,
    integratorHost: typeof runtimeData.host === "string" ? runtimeData.host : null,
    catalogRows: toNumber(catalogData.rows),
    catalogSyncedAt: catalogData.syncedAt ? toIso(catalogData.syncedAt) : null,
    lastErrorMessage:
      typeof runtimeData.lastErrorMessage === "string" ? runtimeData.lastErrorMessage : null,
    requestStatus: typeof requestData.status === "string" ? requestData.status : null,
    requestUpdatedAt: requestData.updatedAt ? toIso(requestData.updatedAt) : null,
  };
}

export async function requestCloudCatalogSync() {
  const db = getDb();
  const now = nowIso();

  await setDoc(
    doc(db, COLLECTIONS.syncRequests, "catalog"),
    {
      kind: "catalog",
      scope: "sicar",
      status: "PENDING",
      requestedAt: now,
      requestedBy: "web",
      updatedAt: now,
    },
    { merge: true },
  );
}

export async function listCloudScalePresets() {
  const db = getDb();
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.scalePresets), orderBy("scaleId", "asc"), limit(100)),
  );
  return snapshot.docs.map(mapScalePresetDoc);
}

export async function listCloudManualCostItems() {
  const db = getDb();
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.manualCostItems), orderBy("code", "asc"), limit(300)),
  );
  return snapshot.docs.map(mapManualCostDoc);
}

export async function listCloudArticleProfiles() {
  const db = getDb();
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.articleProfiles), orderBy("articleLabel", "asc"), limit(300)),
  );
  return snapshot.docs.map(mapArticleProfileDoc);
}

export async function listCloudRecipes() {
  const db = getDb();
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.recipes), orderBy("updatedAt", "desc"), limit(100)),
  );
  return snapshot.docs.map(mapRecipeDoc);
}

export async function saveCloudManualCostItem(payload: CloudManualCostPayload) {
  const db = getDb();
  const docId = sanitizeDocId(payload.code);
  const now = nowIso();
  const ref = doc(db, COLLECTIONS.manualCostItems, docId);
  const previous = await getDoc(ref);
  const previousData = previous.data() as Record<string, unknown> | undefined;

  await setDoc(
    ref,
    {
      manualCostItemId: toNumber(previousData?.manualCostItemId) || Date.now(),
      code: payload.code,
      name: payload.name,
      unitName: payload.unitName,
      costType: payload.costType,
      currentCost: payload.currentCost,
      isActive: true,
      notes: payload.notes,
      updatedAt: now,
      createdAt: previous.exists() ? previousData?.createdAt ?? now : now,
    },
    { merge: true },
  );
}

export async function saveCloudArticleProfile(payload: CloudArticleProfilePayload) {
  const db = getDb();
  const docId = String(payload.sicarArtId);
  const now = nowIso();

  await setDoc(
    doc(db, COLLECTIONS.articleProfiles, docId),
    {
      articleProfileId: payload.sicarArtId,
      sicarArtId: payload.sicarArtId,
      articleLabel: payload.articleLabel,
      productionRole: payload.productionRole,
      vrnPercentage: payload.vrnPercentage,
      costingMode: payload.costingMode,
      manualCost: payload.manualCost,
      notes: payload.notes,
      updatedAt: now,
    },
    { merge: true },
  );
}

export async function saveCloudRecipe(payload: CloudRecipeSavePayload) {
  const db = getDb();
  const recipeId = payload.recipeId ?? (await nextCounter("nextRecipeId", 1));
  const recipeRef = doc(db, COLLECTIONS.recipes, String(recipeId));
  const previous = await getDoc(recipeRef);
  const previousData = previous.data() as Record<string, unknown> | undefined;
  const nextVersion = previous.exists() ? toNumber(previousData?.versionNo || 1) + 1 : 1;
  const code =
    (typeof previousData?.code === "string" && previousData.code) ||
    `REC-${String(recipeId).padStart(5, "0")}`;
  const normalizedDraft = normalizeProductionDraft(payload.draft);
  const now = nowIso();

  await setDoc(
    recipeRef,
    {
      recipeId,
      code,
      name: payload.name,
      versionNo: nextVersion,
      status: "ACTIVE",
      updatedAt: now,
      sourceProduct: normalizedDraft.sourceProduct,
      sourceWeight: toNumber(normalizedDraft.sourceWeight),
      sourceUnitCost: toNumber(normalizedDraft.sourceUnitCost),
      inputs: normalizedDraft.inputs.map((input, index) => ({
        recipeInputId: index + 1,
        manualCostItemId: input.manualCostItemId,
        label: input.label,
        unitName: input.unitName,
        weight: toNumber(input.weight),
        unitCost: toNumber(input.unitCost),
      })),
      outputs: normalizedDraft.outputs
        .filter((output) => output.article)
        .map((output, index) => ({
          recipeOutputId: index + 1,
          article: output.article,
          weight: toNumber(output.weight),
          percentage: toNumber(output.percentage),
        })),
      manualCosts: normalizedDraft.manualCosts.map((manualCost, index) => ({
        recipeInputId: index + 1,
        manualCostItemId: manualCost.manualCostItemId,
        label: manualCost.label,
        cost: toNumber(manualCost.cost),
        multiplier: toNumber(manualCost.multiplier),
      })),
    },
    { merge: true },
  );

  return {
    recipeId,
    recipeCode: code,
    recipeName: payload.name,
  };
}

export async function listCloudProductionSessions() {
  const db = getDb();
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.productionSessions), orderBy("updatedAt", "desc"), limit(100)),
  );
  return snapshot.docs.map(mapSessionDoc);
}

export async function saveCloudProductionSession(payload: {
  sessionId?: string | null;
  label: string;
  draft: unknown;
  stationState: unknown;
}) {
  const db = getDb();
  const sessionId = payload.sessionId?.trim() || `hold-${Date.now()}`;
  const sessionRef = doc(db, COLLECTIONS.productionSessions, sessionId);
  const previous = await getDoc(sessionRef);
  const now = nowIso();

  await setDoc(
    sessionRef,
    {
      sessionId,
      label: payload.label.trim() || "Producción en espera",
      draft: normalizeProductionDraft(payload.draft),
      stationState: payload.stationState ?? null,
      createdAt: previous.exists() ? previous.data()?.createdAt ?? now : now,
      updatedAt: now,
    },
    { merge: true },
  );

  return { sessionId };
}

export async function deleteCloudProductionSession(sessionId: string) {
  await deleteDoc(doc(getDb(), COLLECTIONS.productionSessions, sessionId));
}

export async function createCloudProductionOrder(draftInput: unknown) {
  const draft = normalizeProductionDraft(draftInput);

  if (!draft.sourceProduct) {
    throw new Error("Selecciona el producto base antes de grabar la produccion.");
  }

  if (!draft.outputs.some((item) => item.article && toNumber(item.weight) > 0)) {
    throw new Error("Captura al menos una salida antes de grabar.");
  }

  const { productionOrderId, folio } = await nextProductionIdentifiers();
  const now = nowIso();
  const normalizedDraft = {
    ...draft,
    outputs: draft.outputs.filter((output) => output.article && toNumber(output.weight) > 0),
  };
  const totals = calculateProductionTotals(normalizedDraft, []);

  await setDoc(doc(getDb(), COLLECTIONS.productionOrders, String(productionOrderId)), {
    productionOrderId,
    folio,
    status: "DRAFT",
    workflowStage: "PRODUCED",
    draft: normalizedDraft,
    sourceLabel: `${draft.sourceProduct.clave} - ${draft.sourceProduct.descripcion}`,
    sourceWeight: totals.sourceWeight,
    producedWeight: totals.producedWeight,
    totalCost: totals.totalCost,
    outputCount: normalizedDraft.outputs.length,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  });

  return { productionOrderId, folio };
}

export async function listCloudProductionOrders() {
  const db = getDb();
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.productionOrders), orderBy("productionOrderId", "desc"), limit(200)),
  );

  return snapshot.docs
    .map(mapOrderDoc)
    .filter(
      (record) =>
        record.workflowStage !== "POSTED_TO_SICAR" && record.workflowStage !== "SICAR_EXCLUDED",
    )
    .map(toOrderListItem);
}

export async function getCloudProductionOrderRecord(productionOrderId: number) {
  const snapshot = await getDoc(doc(getDb(), COLLECTIONS.productionOrders, String(productionOrderId)));

  if (!snapshot.exists()) {
    return null;
  }

  return mapOrderDoc(snapshot as QueryDocumentSnapshot);
}

export async function updateCloudProductionOrderCosting(
  productionOrderId: number,
  draftInput: unknown,
  articleProfiles: ArticleProfileDefault[],
) {
  const draft = normalizeProductionDraft(draftInput);
  const totals = calculateProductionTotals(draft, articleProfiles);
  const recordRef = doc(getDb(), COLLECTIONS.productionOrders, String(productionOrderId));
  const current = await getDoc(recordRef);

  if (!current.exists()) {
    throw new Error("Produccion no encontrada.");
  }

  const currentData = current.data() as Record<string, unknown>;

  await setDoc(
    recordRef,
    {
      productionOrderId,
      folio: String(currentData.folio ?? `PR-${String(productionOrderId).padStart(3, "0")}`),
      status: "IN_PROGRESS",
      workflowStage: "COSTED",
      draft,
      sourceLabel: draft.sourceProduct
        ? `${draft.sourceProduct.clave} - ${draft.sourceProduct.descripcion}`
        : String(currentData.sourceLabel ?? ""),
      sourceWeight: totals.sourceWeight,
      producedWeight: totals.producedWeight,
      totalCost: totals.totalCost,
      outputCount: totals.outputs.length,
      createdAt: currentData.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      completedAt: currentData.completedAt ?? null,
    },
    { merge: true },
  );

  return { ok: true };
}

export async function listCloudProductionHistory() {
  const db = getDb();
  const [snapshot, articleProfiles] = await Promise.all([
    getDocs(
      query(collection(db, COLLECTIONS.productionOrders), orderBy("productionOrderId", "desc"), limit(200)),
    ),
    listCloudArticleProfiles(),
  ]);

  return snapshot.docs.map(mapOrderDoc).map((record) => toHistoryRow(record, articleProfiles));
}

export async function listCloudSicarPostingPreviews(articleProfiles: ArticleProfileDefault[]) {
  const db = getDb();
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.productionOrders), orderBy("productionOrderId", "desc"), limit(200)),
  );

  return snapshot.docs
    .map(mapOrderDoc)
    .filter((record) => record.status === "IN_PROGRESS" && record.workflowStage === "COSTED")
    .map((record) => toPostingPreview(record, articleProfiles));
}

export async function requestCloudSicarPosting(productionOrderIds: number[]) {
  const ids = [...new Set(productionOrderIds.filter((value) => Number(value) > 0))];

  if (ids.length === 0) {
    throw new Error("Selecciona al menos una produccion.");
  }

  const db = getDb();
  const now = nowIso();

  await Promise.all(
    ids.map(async (productionOrderId) => {
      const orderRef = doc(db, COLLECTIONS.productionOrders, String(productionOrderId));
      const orderSnapshot = await getDoc(orderRef);

      if (!orderSnapshot.exists()) {
        throw new Error(`Produccion ${productionOrderId} no encontrada.`);
      }

      const orderData = orderSnapshot.data() as Record<string, unknown>;

      if (String(orderData.workflowStage ?? "") === "POSTED_TO_SICAR") {
        throw new Error(`La produccion ${productionOrderId} ya fue subida a SICAR.`);
      }

      if (String(orderData.workflowStage ?? "") === "SICAR_EXCLUDED") {
        throw new Error(`La produccion ${productionOrderId} esta excluida de SICAR.`);
      }

      const requestRef = doc(db, COLLECTIONS.sicarPostingRequests, String(productionOrderId));
      const requestSnapshot = await getDoc(requestRef);
      const requestData = requestSnapshot.data() as Record<string, unknown> | undefined;

      await setDoc(
        orderRef,
        {
          workflowStage: "READY_FOR_SICAR",
          updatedAt: now,
        },
        { merge: true },
      );

      await setDoc(
        requestRef,
        {
          requestId: String(productionOrderId),
          productionOrderId,
          status: "PENDING",
          requestedAt: now,
          updatedAt: now,
          createdAt: requestSnapshot.exists() ? requestData?.createdAt ?? now : now,
        },
        { merge: true },
      );
    }),
  );

  return { ok: true, count: ids.length };
}

export async function excludeCloudProductionFromSicar(
  productionOrderIds: number[],
  reason: string,
) {
  const ids = [...new Set(productionOrderIds.filter((value) => Number(value) > 0))];
  const normalizedReason = reason.trim();

  if (ids.length === 0) {
    throw new Error("Selecciona al menos una produccion.");
  }

  if (!normalizedReason) {
    throw new Error("Escribe un motivo para excluir de SICAR.");
  }

  const db = getDb();
  const now = nowIso();

  await Promise.all(
    ids.map(async (productionOrderId) => {
      const orderRef = doc(db, COLLECTIONS.productionOrders, String(productionOrderId));
      const orderSnapshot = await getDoc(orderRef);

      if (!orderSnapshot.exists()) {
        throw new Error(`Produccion ${productionOrderId} no encontrada.`);
      }

      const requestRef = doc(db, COLLECTIONS.sicarPostingRequests, String(productionOrderId));
      const requestSnapshot = await getDoc(requestRef);
      const requestData = requestSnapshot.data() as Record<string, unknown> | undefined;

      await setDoc(
        orderRef,
        {
          status: "COMPLETED",
          workflowStage: "SICAR_EXCLUDED",
          updatedAt: now,
          sicarExclusion: {
            reason: normalizedReason,
            excludedAt: now,
          },
        },
        { merge: true },
      );

      await setDoc(
        requestRef,
        {
          requestId: String(productionOrderId),
          productionOrderId,
          status: "EXCLUDED",
          exclusionReason: normalizedReason,
          excludedAt: now,
          updatedAt: now,
          createdAt: requestSnapshot.exists() ? requestData?.createdAt ?? now : now,
        },
        { merge: true },
      );
    }),
  );

  return { ok: true, count: ids.length };
}
