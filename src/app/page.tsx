import { ProductionWorkbench } from "@/components/production/production-workbench";
import { getManualCostItems, getProductionRecipeTemplates } from "@/lib/production/data";
import { getSicarScalePresets } from "@/lib/overview";
import { getSicarCatalogOptions } from "@/lib/sicar/catalog";

export const dynamic = "force-dynamic";

export default async function ProducePage() {
  const [catalogOptions, manualCostItems, recipeTemplates, scalePresets] = await Promise.all([
    getSicarCatalogOptions(),
    getManualCostItems(),
    getProductionRecipeTemplates(),
    getSicarScalePresets(),
  ]);

  return (
    <ProductionWorkbench
      catalogOptions={catalogOptions}
      manualCostItems={manualCostItems}
      recipeTemplates={recipeTemplates}
      scalePresets={scalePresets.scaleRows}
    />
  );
}
