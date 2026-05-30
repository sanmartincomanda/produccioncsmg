import { CostingWorkbench } from "@/components/costing/costing-workbench";

type CostingPageProps = {
  searchParams: Promise<{
    id?: string;
  }>;
};

export default async function CostingPage({ searchParams }: CostingPageProps) {
  const params = await searchParams;
  const selectedOrderId = Number(params.id ?? 0) || null;

  return (
    <CostingWorkbench
      articleProfiles={[]}
      catalogOptions={[]}
      manualCostItems={[]}
      orders={[]}
      recipes={[]}
      selectedOrderId={selectedOrderId}
      selectedOrder={null}
    />
  );
}
