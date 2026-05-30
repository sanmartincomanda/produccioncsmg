import { Scale, ShieldCheck } from "lucide-react";

import { ConfigurationWorkbench } from "@/components/configuration/configuration-workbench";
import { getFirebaseAdminStatus } from "@/lib/firebase/admin";
import { getConfigurationOverview } from "@/lib/production/data";
import { getSicarCatalogOptions } from "@/lib/sicar/catalog";
import { getSicarScalePresets } from "@/lib/overview";

export default async function SettingsPage() {
  const [catalogOptions, configurationOverview, scalePresets] = await Promise.all([
    getSicarCatalogOptions(),
    getConfigurationOverview(),
    getSicarScalePresets(),
  ]);
  const firebaseAdminStatus = getFirebaseAdminStatus();

  return (
    <div className="space-y-6">
      <section className="module-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-tag">Configuración</p>
            <h1 className="font-display text-4xl text-slate-950">Parámetros base</h1>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStatus label="Perfiles" value={String(configurationOverview.profiles.length)} />
            <MiniStatus label="Costos" value={String(configurationOverview.manualCosts.length)} />
            <MiniStatus label="Básculas" value={String(scalePresets.scaleRows.length)} />
          </div>
        </div>
      </section>

      <ConfigurationWorkbench
        catalogOptions={catalogOptions}
        profiles={configurationOverview.profiles}
        manualCostItems={configurationOverview.manualCosts}
      />

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="module-card space-y-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <p className="section-tag">Servidor</p>
              <h2 className="font-display text-2xl text-slate-950">Firebase Admin</h2>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">
              {firebaseAdminStatus.configured
                ? `Conectado a ${firebaseAdminStatus.projectId}`
                : "Sin configuración"}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {firebaseAdminStatus.clientEmail ?? firebaseAdminStatus.error ?? "Sin llave cargada"}
            </p>
          </div>
        </div>

        <div className="module-card space-y-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
              <Scale className="size-5" />
            </span>
            <div>
              <p className="section-tag">Básculas</p>
              <h2 className="font-display text-2xl text-slate-950">Presets detectados en SICAR</h2>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {scalePresets.scaleRows.map((scaleRow) => (
              <div key={scaleRow.scaleId} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-medium text-slate-900">{scaleRow.name}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">
                  {scaleRow.portName} · {scaleRow.baudRate} baud · {scaleRow.dataBits} bits
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="font-display mt-2 text-2xl text-slate-950">{value}</p>
    </div>
  );
}
