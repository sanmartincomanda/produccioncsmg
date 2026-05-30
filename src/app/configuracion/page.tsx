import { Database, ShieldCheck } from "lucide-react";

import { ConfigurationWorkbench } from "@/components/configuration/configuration-workbench";
import { getFirebaseAdminStatus } from "@/lib/firebase/admin";

export const dynamic = "force-static";

export default function SettingsPage() {
  const firebaseAdminStatus = getFirebaseAdminStatus();

  return (
    <div className="space-y-6">
      <section className="module-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-tag">Configuración</p>
            <h1 className="font-display text-4xl text-slate-950">Parámetros base</h1>
            <p className="mt-2 text-sm text-slate-500">
              La web guarda perfiles y costos en Firebase. El integrador local sincroniza SICAR.
            </p>
          </div>
        </div>
      </section>

      <ConfigurationWorkbench catalogOptions={[]} profiles={[]} manualCostItems={[]} />

      <section className="grid gap-6 xl:grid-cols-2">
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
              <Database className="size-5" />
            </span>
            <div>
              <p className="section-tag">Integrador</p>
              <h2 className="font-display text-2xl text-slate-950">Sincronización local</h2>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            El catálogo, las básculas y los ajustes de SICAR deben pasar por el integrador local,
            no por Netlify.
          </div>
        </div>
      </section>
    </div>
  );
}
