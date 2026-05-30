import { ProductionWorkbench } from "@/components/production/production-workbench";

export const dynamic = "force-static";

export default function ProducePage() {
  return (
    <ProductionWorkbench
      catalogOptions={[]}
      manualCostItems={[]}
      recipeTemplates={[]}
      scalePresets={[]}
    />
  );
}
