import { HistoryWorkbench } from "@/components/history/history-workbench";

type HistoryPageProps = {
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    folio?: string;
  }>;
};

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const filters = await searchParams;

  return <HistoryWorkbench initialRows={[]} initialFilters={filters} />;
}
