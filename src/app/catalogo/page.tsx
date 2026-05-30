import { Boxes } from "lucide-react";

import { CatalogExplorer } from "@/components/catalog/catalog-explorer";
import { Reveal } from "@/components/ui/reveal";
import { getSicarCatalog } from "@/lib/sicar/catalog";

export default async function CatalogPage() {
  const initialData = await getSicarCatalog({
    status: "all",
    page: 1,
    limit: 24,
  });

  return (
    <div className="space-y-6">
      <Reveal className="surface-card">
        <div className="flex items-center gap-4">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-800">
            <Boxes className="size-5" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-700">Catalogo base</p>
            <h1 className="font-display text-3xl text-slate-950">Todos los productos de SICAR</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              Esta vista es el punto de partida para enlazar recetas, perfiles de articulo,
              configuracion de VRN y futuras ordenes de produccion.
            </p>
          </div>
        </div>
      </Reveal>

      <CatalogExplorer initialData={initialData} />
    </div>
  );
}
