import type {
  ArticleProfileDefault,
  ManualCostItem,
  ProductionDraft,
  ProductionDraftManualCost,
} from "@/types/production";

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0) || 0;
}

export function resolveOutputPercentage(
  draftPercentage: string,
  profileDefault: ArticleProfileDefault | undefined,
) {
  return draftPercentage ? toNumber(draftPercentage) : Number(profileDefault?.vrnPercentage ?? 0);
}

export function calculateProductionTotals(
  draft: ProductionDraft,
  articleProfiles: ArticleProfileDefault[],
) {
  const profileMap = new Map(articleProfiles.map((profile) => [profile.sicarArtId, profile]));
  const sourceWeight = toNumber(draft.sourceWeight);
  const sourceUnitCost = toNumber(draft.sourceUnitCost);
  const sourceTotal = sourceWeight * sourceUnitCost;

  const inputRows = draft.inputs.map((input) => ({
    id: input.id,
    label: input.label || "Insumo pendiente",
    weight: toNumber(input.weight),
    unitCost: toNumber(input.unitCost),
    total: toNumber(input.weight) * toNumber(input.unitCost),
  }));

  const inputTotal = inputRows.reduce((sum, row) => sum + row.total, 0);
  const manualCostTotal = draft.manualCosts.reduce(
    (sum, item) => sum + toNumber(item.cost) * toNumber(item.multiplier),
    0,
  );
  const totalCost = sourceTotal + inputTotal + manualCostTotal;
  const producedWeight = draft.outputs.reduce((sum, output) => sum + toNumber(output.weight), 0);
  const shrinkWeight = Math.max(sourceWeight - producedWeight, 0);
  const shrinkPercentage = sourceWeight > 0 ? (shrinkWeight / sourceWeight) * 100 : 0;
  const yieldPercentage = sourceWeight > 0 ? (producedWeight / sourceWeight) * 100 : 0;

  const relativeValues = draft.outputs.map((output) =>
    resolveOutputPercentage(output.percentage, output.article ? profileMap.get(output.article.artId) : undefined),
  );
  const vrnValues = draft.outputs.map((output, index) => toNumber(output.weight) * relativeValues[index]);
  const totalVrn = vrnValues.reduce((sum, value) => sum + value, 0);
  const totalOutputWeight = draft.outputs.reduce((sum, output) => sum + toNumber(output.weight), 0);

  const outputs = draft.outputs.map((output, index) => {
    const weight = toNumber(output.weight);
    const relativeValue = relativeValues[index];
    const vrn = vrnValues[index];
    const shareRatio =
      totalVrn > 0
        ? vrn / totalVrn
        : totalOutputWeight > 0
          ? weight / totalOutputWeight
          : 0;
    const allocatedCost = totalCost * shareRatio;
    const producedUnitCost = weight > 0 ? allocatedCost / weight : allocatedCost;
    const cutPercentage = shareRatio * 100;

    return {
      id: output.id,
      label: output.article ? `${output.article.clave} - ${output.article.descripcion}` : `Producto ${index + 1}`,
      relativeValue,
      vrn,
      cutPercentage,
      weight,
      allocatedCost,
      producedUnitCost,
    };
  });

  return {
    sourceWeight,
    sourceUnitCost,
    sourceTotal,
    producedWeight,
    shrinkWeight,
    shrinkPercentage,
    yieldPercentage,
    inputRows,
    inputTotal,
    manualCostTotal,
    totalCost,
    totalVrn,
    outputs,
    percentageSum: outputs.reduce((sum, output) => sum + output.cutPercentage, 0),
  };
}

export function mergeManualCostItemIntoDraft(
  item: ProductionDraftManualCost,
  manualCost: ManualCostItem | undefined,
) {
  if (!manualCost) {
    return item;
  }

  return {
    ...item,
    manualCostItemId: manualCost.manualCostItemId,
    label: `${manualCost.code} - ${manualCost.name}`,
    cost: String(manualCost.currentCost),
  };
}
