import { ProductionWorkbench } from "@/components/production/production-workbench";
import { getManualCostItems } from "@/lib/production/data";
import { getSicarCatalogOptions } from "@/lib/sicar/catalog";

export default async function ProducePage() {
  const [catalogOptions, manualCostItems] = await Promise.all([
    getSicarCatalogOptions(),
    getManualCostItems(),
  ]);

  return <ProductionWorkbench catalogOptions={catalogOptions} manualCostItems={manualCostItems} />;
}
