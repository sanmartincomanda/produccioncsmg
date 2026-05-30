import { Beaker, GitBranchPlus, PackagePlus } from "lucide-react";

import { Reveal } from "@/components/ui/reveal";

const cards = [
  {
    title: "Entradas",
    icon: Beaker,
    copy: "Las recetas manejaran materias primas SICAR y costos manuales como empaque, mano de obra o energia.",
  },
  {
    title: "Salidas",
    icon: PackagePlus,
    copy: "Una receta puede generar varios productos terminados o subproductos, cada uno con su porcentaje VRN.",
  },
  {
    title: "Versionado",
    icon: GitBranchPlus,
    copy: "El modelo ya soporta recetas por version para preservar historico de formula y rendimientos.",
  },
];

export default function RecipesPage() {
  return (
    <div className="space-y-6">
      <Reveal className="surface-card">
        <p className="text-xs uppercase tracking-[0.32em] text-cyan-700">Modelo de produccion</p>
        <h1 className="font-display mt-2 text-3xl text-slate-950">Recetas listas para VRN</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          La base auxiliar ya contempla `recipes`, `recipe_inputs` y `recipe_outputs`. Con esto
          evitamos amarrarnos al modelo nativo de SICAR, que en esta base no ofrece una
          manufactura completa con entradas y salidas trazables.
        </p>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-3">
        {cards.map((card, index) => {
          const Icon = card.icon;

          return (
            <Reveal key={card.title} className="surface-card" delay={0.05 * (index + 1)}>
              <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <Icon className="size-5" />
              </span>
              <h2 className="font-display mt-5 text-2xl text-slate-950">{card.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{card.copy}</p>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
