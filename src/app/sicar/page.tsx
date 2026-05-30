import { SicarControlCenter } from "@/components/sicar/sicar-control-center";
import { getSicarPostingPreviews } from "@/lib/production/orders";

export const dynamic = "force-dynamic";

export default async function SicarPage() {
  const previews = await getSicarPostingPreviews();

  return <SicarControlCenter previews={previews} />;
}
