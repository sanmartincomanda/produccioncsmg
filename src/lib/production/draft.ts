import type {
  DraftArticleRef,
  ProductionDraft,
  ProductionDraftInput,
  ProductionDraftManualCost,
  ProductionDraftOutput,
  ProductionRecipeTemplate,
} from "@/types/production";

export const PRODUCTION_DRAFT_STORAGE_KEY = "transformacion-production-draft-v1";

export function createDraftInput(): ProductionDraftInput {
  return {
    id: crypto.randomUUID(),
    manualCostItemId: null,
    label: "",
    unitName: "",
    weight: "",
    unitCost: "",
  };
}

export function createDraftOutput(): ProductionDraftOutput {
  return {
    id: crypto.randomUUID(),
    article: null,
    weight: "",
    percentage: "",
  };
}

export function createDraftManualCost(): ProductionDraftManualCost {
  return {
    id: crypto.randomUUID(),
    manualCostItemId: null,
    label: "",
    cost: "",
    multiplier: "",
  };
}

export function createEmptyProductionDraft(): ProductionDraft {
  return {
    recipeId: null,
    recipeCode: "",
    recipeName: "",
    sourceProduct: null,
    sourceWeight: "",
    sourceUnitCost: "",
    inputs: [],
    outputs: [createDraftOutput()],
    manualCosts: [],
  };
}

function normalizeArticle(article: unknown): DraftArticleRef {
  if (!article || typeof article !== "object") {
    return null;
  }

  const candidate = article as Record<string, unknown>;
  const artId = Number(candidate.artId ?? 0);

  if (!artId) {
    return null;
  }

  return {
    artId,
    clave: String(candidate.clave ?? ""),
    descripcion: String(candidate.descripcion ?? ""),
    unidadVenta: String(candidate.unidadVenta ?? ""),
    existencia: Number(candidate.existencia ?? 0),
    precioCompra: Number(candidate.precioCompra ?? 0),
    preCompraProm: Number(candidate.preCompraProm ?? 0),
  };
}

function normalizeInput(input: unknown): ProductionDraftInput {
  const candidate = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const manualCostItemId = Number(candidate.manualCostItemId);
  const legacyArticle = normalizeArticle(candidate.article);
  const legacyLabel = legacyArticle ? `${legacyArticle.clave} - ${legacyArticle.descripcion}` : "";
  const legacyUnitName = legacyArticle?.unidadVenta ?? "";

  return {
    id: typeof candidate.id === "string" ? candidate.id : crypto.randomUUID(),
    manualCostItemId:
      candidate.manualCostItemId === null ||
      candidate.manualCostItemId === undefined ||
      Number.isNaN(manualCostItemId)
        ? null
        : manualCostItemId,
    label: String(candidate.label ?? legacyLabel),
    unitName: String(candidate.unitName ?? legacyUnitName),
    weight: String(candidate.weight ?? ""),
    unitCost: String(candidate.unitCost ?? ""),
  };
}

function normalizeOutput(output: unknown): ProductionDraftOutput {
  const candidate = (output && typeof output === "object" ? output : {}) as Record<string, unknown>;

  return {
    id: typeof candidate.id === "string" ? candidate.id : crypto.randomUUID(),
    article: normalizeArticle(candidate.article),
    weight: String(candidate.weight ?? ""),
    percentage: String(candidate.percentage ?? ""),
  };
}

function normalizeManualCost(cost: unknown): ProductionDraftManualCost {
  const candidate = (cost && typeof cost === "object" ? cost : {}) as Record<string, unknown>;
  const manualCostItemId = Number(candidate.manualCostItemId);

  return {
    id: typeof candidate.id === "string" ? candidate.id : crypto.randomUUID(),
    manualCostItemId:
      candidate.manualCostItemId === null ||
      candidate.manualCostItemId === undefined ||
      Number.isNaN(manualCostItemId)
        ? null
        : manualCostItemId,
    label: String(candidate.label ?? ""),
    cost: String(candidate.cost ?? ""),
    multiplier: String(candidate.multiplier ?? ""),
  };
}

export function normalizeProductionDraft(value: unknown): ProductionDraft {
  const emptyDraft = createEmptyProductionDraft();

  if (!value || typeof value !== "object") {
    return emptyDraft;
  }

  const candidate = value as Record<string, unknown>;
  const outputs = Array.isArray(candidate.outputs)
    ? candidate.outputs.map(normalizeOutput)
    : emptyDraft.outputs;
  const directInputs = Array.isArray(candidate.inputs) ? candidate.inputs.map(normalizeInput) : [];
  const nestedInputs =
    Array.isArray(candidate.outputs) && directInputs.length === 0
      ? candidate.outputs.flatMap((output) => {
          if (!output || typeof output !== "object") {
            return [];
          }

          const legacyInputs = (output as Record<string, unknown>).inputs;
          return Array.isArray(legacyInputs) ? legacyInputs.map(normalizeInput) : [];
        })
      : [];
  const inputs = [...directInputs, ...nestedInputs].filter(Boolean);
  const manualCosts = Array.isArray(candidate.manualCosts)
    ? candidate.manualCosts.map(normalizeManualCost)
    : [];

  const normalizedRecipeId = Number(candidate.recipeId);

  return {
    recipeId:
      candidate.recipeId === null || candidate.recipeId === undefined || Number.isNaN(normalizedRecipeId)
        ? null
        : normalizedRecipeId,
    recipeCode: String(candidate.recipeCode ?? ""),
    recipeName: String(candidate.recipeName ?? ""),
    sourceProduct: normalizeArticle(candidate.sourceProduct),
    sourceWeight: String(candidate.sourceWeight ?? ""),
    sourceUnitCost: String(candidate.sourceUnitCost ?? ""),
    inputs,
    outputs: outputs.length ? outputs : emptyDraft.outputs,
    manualCosts,
  };
}

export function createDraftFromRecipeTemplate(recipe: ProductionRecipeTemplate): ProductionDraft {
  return {
    recipeId: recipe.recipeId,
    recipeCode: recipe.code,
    recipeName: recipe.name,
    sourceProduct: recipe.sourceProduct,
    sourceWeight: recipe.sourceWeight ? String(recipe.sourceWeight) : "",
    sourceUnitCost: recipe.sourceUnitCost ? String(recipe.sourceUnitCost) : "",
    inputs: recipe.inputs.map((input) => ({
      id: crypto.randomUUID(),
      manualCostItemId: input.manualCostItemId,
      label: input.label,
      unitName: input.unitName,
      weight: input.weight ? String(input.weight) : "",
      unitCost: input.unitCost ? String(input.unitCost) : "",
    })),
    outputs:
      recipe.outputs.length > 0
        ? recipe.outputs.map((output) => ({
            id: crypto.randomUUID(),
            article: output.article,
            weight: output.weight ? String(output.weight) : "",
            percentage: output.percentage ? String(output.percentage) : "",
          }))
        : [createDraftOutput()],
    manualCosts: recipe.manualCosts.map((manualCost) => ({
      id: crypto.randomUUID(),
      manualCostItemId: manualCost.manualCostItemId,
      label: manualCost.label,
      cost: manualCost.cost ? String(manualCost.cost) : "",
      multiplier: manualCost.multiplier ? String(manualCost.multiplier) : "",
    })),
  };
}
