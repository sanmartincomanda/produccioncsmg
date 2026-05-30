export type CatalogOption = {
  artId: number;
  clave: string;
  descripcion: string;
  unidadVenta: string;
  existencia: number;
  precioCompra: number;
  preCompraProm: number;
};

export type DraftArticleRef = CatalogOption | null;

export type ProductionDraftInput = {
  id: string;
  manualCostItemId: number | null;
  label: string;
  unitName: string;
  weight: string;
  unitCost: string;
};

export type ProductionDraftOutput = {
  id: string;
  article: DraftArticleRef;
  weight: string;
  percentage: string;
};

export type ProductionDraftManualCost = {
  id: string;
  manualCostItemId: number | null;
  label: string;
  cost: string;
  multiplier: string;
};

export type ProductionDraft = {
  recipeId: number | null;
  recipeCode: string;
  recipeName: string;
  sourceProduct: DraftArticleRef;
  sourceWeight: string;
  sourceUnitCost: string;
  inputs: ProductionDraftInput[];
  outputs: ProductionDraftOutput[];
  manualCosts: ProductionDraftManualCost[];
};

export type ArticleProfileDefault = {
  articleProfileId: number;
  sicarArtId: number;
  articleLabel: string;
  productionRole: "RAW_MATERIAL" | "FINISHED_GOOD" | "BYPRODUCT" | "CONSUMABLE" | "PACKAGING";
  vrnPercentage: number;
  costingMode: "SICAR_AVERAGE" | "SICAR_LAST_PURCHASE" | "VRN_PRODUCED" | "STANDARD" | "MANUAL";
  manualCost: number | null;
  notes: string;
};

export type ManualCostItem = {
  manualCostItemId: number;
  code: string;
  name: string;
  unitName: string;
  costType: "LABOR" | "PACKAGING" | "UTILITY" | "INDIRECT" | "OTHER";
  currentCost: number;
  isActive: boolean;
  notes: string;
};

export type ScalePreset = {
  scaleId: number;
  name: string;
  portName: string;
  baudRate: number;
  pollDelayMs: number;
  commandSequence: string;
  useCarriageReturn: number;
  dataBits: number;
};

export type ProductionHistoryRow = {
  productionOrderId: number;
  folio: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  outputLines: number;
  inputLines: number;
  movementLines: number;
  estimatedTotalCost: number;
  notes: string;
};

export type ProductionWorkflowStage =
  | "PRODUCED"
  | "COSTED"
  | "READY_FOR_SICAR"
  | "POSTED_TO_SICAR";

export type ProductionOrderListItem = {
  productionOrderId: number;
  folio: string;
  status: string;
  workflowStage: ProductionWorkflowStage;
  sourceLabel: string;
  sourceWeight: number;
  producedWeight: number;
  totalCost: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductionOrderRecord = {
  productionOrderId: number;
  folio: string;
  status: string;
  workflowStage: ProductionWorkflowStage;
  draft: ProductionDraft;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type ProductionRecipeTemplateInput = {
  recipeInputId: number;
  manualCostItemId: number | null;
  label: string;
  unitName: string;
  weight: number;
  unitCost: number;
};

export type ProductionRecipeTemplateOutput = {
  recipeOutputId: number;
  article: DraftArticleRef;
  weight: number;
  percentage: number;
};

export type ProductionRecipeTemplateManualCost = {
  recipeInputId: number;
  manualCostItemId: number | null;
  label: string;
  cost: number;
  multiplier: number;
};

export type ProductionRecipeTemplate = {
  recipeId: number;
  code: string;
  name: string;
  versionNo: number;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  updatedAt: string;
  sourceProduct: DraftArticleRef;
  sourceWeight: number;
  sourceUnitCost: number;
  inputs: ProductionRecipeTemplateInput[];
  outputs: ProductionRecipeTemplateOutput[];
  manualCosts: ProductionRecipeTemplateManualCost[];
};

export type SicarPostingPreview = {
  productionOrderId: number;
  folio: string;
  status: string;
  workflowStage: ProductionWorkflowStage;
  sourceProductLabel: string;
  sourceWeight: number;
  totalProducedWeight: number;
  totalCost: number;
  outputCount: number;
  createdAt: string;
  updatedAt: string;
  sourceConsumption: Array<{
    label: string;
    quantity: number;
    unitName: string;
    unitCost: number;
    totalCost: number;
  }>;
  outputEntries: Array<{
    label: string;
    quantity: number;
    unitName: string;
    producedUnitCost: number;
    allocatedCost: number;
  }>;
};
