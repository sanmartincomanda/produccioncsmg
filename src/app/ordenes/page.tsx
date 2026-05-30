import { Factory, ListChecks, Orbit, ShieldAlert } from "lucide-react";

import { Reveal } from "@/components/ui/reveal";

const steps = [
  {
    title: "Planeacion",
    description: "Se define la receta, lote, rendimientos esperados y costos indirectos a aplicar.",
    icon: ListChecks,
  },
  {
    title: "Ejecucion",
    description: "Se capturan consumos reales, pesos de bascula y salidas de producto terminado o subproducto.",
    icon: Factory,
  },
  {
    title: "Posteo controlado",
    description: "La app genera los ajustes a SICAR y deja ligada cada orden con sus encabezados y lineas.",
    icon: Orbit,
  },
  {
    title: "Cierre y costo",
    description: "Se calcula VRN, se actualizan costos segun politica y se conserva la bitacora del lote.",
    icon: ShieldAlert,
  },
];

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <Reveal className="surface-card">
        <p className="text-xs uppercase tracking-[0.32em] text-cyan-700">Flujo operativo</p>
        <h1 className="font-display mt-2 text-3xl text-slate-950">Ordenes de produccion</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          La ruta propuesta separa claramente planeacion, ejecucion y posteo. Eso ayuda a simular,
          aprobar y solo despues impactar SICAR con total trazabilidad.
        </p>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-2">
        {steps.map((step, index) => {
          const Icon = step.icon;

          return (
            <Reveal key={step.title} className="surface-card" delay={0.05 * (index + 1)}>
              <div className="flex items-start gap-4">
                <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-800">
                  <Icon className="size-5" />
                </span>
                <div>
                  <h2 className="font-display text-2xl text-slate-950">{step.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{step.description}</p>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}
