import { CostingWorkbench } from "@/components/costing/costing-workbench";
import {
  getArticleProfileDefaults,
  getManualCostItems,
  getProductionRecipeTemplates,
} from "@/lib/production/data";
import { getProductionOrderRecord, getProductionOrders } from "@/lib/production/orders";
import { getSicarCatalogOptions } from "@/lib/sicar/catalog";

type CostingPageProps = {
  searchParams: Promise<{
    id?: string;
  }>;
};

export default async function CostingPage({ searchParams }: CostingPageProps) {
  const params = await searchParams;
  const [articleProfiles, manualCostItems, recipes, catalogOptions, orders] = await Promise.all([
    getArticleProfileDefaults(),
    getManualCostItems(),
    getProductionRecipeTemplates(),
    getSicarCatalogOptions(),
    getProductionOrders(["DRAFT", "IN_PROGRESS", "COMPLETED"]),
  ]);
  const selectedOrderId = Number(params.id ?? orders[0]?.productionOrderId ?? 0);
  const selectedOrder = selectedOrderId ? await getProductionOrderRecord(selectedOrderId) : null;

  return (
    <CostingWorkbench
      articleProfiles={articleProfiles}
      catalogOptions={catalogOptions}
      manualCostItems={manualCostItems}
      orders={orders}
      recipes={recipes}
      selectedOrder={selectedOrder}
    />
  );
}
