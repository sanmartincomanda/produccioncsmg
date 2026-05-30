"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Database, Plus, Save } from "lucide-react";

import { ArticlePicker } from "@/components/fields/article-picker";
import { formatCurrency } from "@/lib/utils";
import type { ArticleProfileDefault, CatalogOption, ManualCostItem } from "@/types/production";

type ConfigurationWorkbenchProps = {
  catalogOptions: CatalogOption[];
  profiles: ArticleProfileDefault[];
  manualCostItems: ManualCostItem[];
};

const profileRoles = [
  { value: "RAW_MATERIAL", label: "Materia prima" },
  { value: "FINISHED_GOOD", label: "Producto terminado" },
  { value: "BYPRODUCT", label: "Subproducto" },
  { value: "CONSUMABLE", label: "Consumible" },
  { value: "PACKAGING", label: "Empaque" },
] as const;

const costingModes = [
  { value: "SICAR_AVERAGE", label: "Costo promedio SICAR" },
  { value: "SICAR_LAST_PURCHASE", label: "Última compra" },
  { value: "VRN_PRODUCED", label: "Costo producido VRN" },
  { value: "STANDARD", label: "Costo estándar" },
  { value: "MANUAL", label: "Costo manual" },
] as const;

const manualCostTypes = [
  { value: "LABOR", label: "Mano de obra" },
  { value: "PACKAGING", label: "Empaque" },
  { value: "UTILITY", label: "Servicios" },
  { value: "INDIRECT", label: "Indirecto" },
  { value: "OTHER", label: "Otro" },
] as const;

export function ConfigurationWorkbench({
  catalogOptions,
  profiles,
  manualCostItems,
}: ConfigurationWorkbenchProps) {
  const router = useRouter();
  const [selectedArticle, setSelectedArticle] = useState<CatalogOption | null>(null);
  const [profileRole, setProfileRole] = useState<(typeof profileRoles)[number]["value"]>("FINISHED_GOOD");
  const [costingMode, setCostingMode] = useState<(typeof costingModes)[number]["value"]>("VRN_PRODUCED");
  const [vrnPercentage, setVrnPercentage] = useState("");
  const [manualCost, setManualCost] = useState("");
  const [profileNotes, setProfileNotes] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualUnit, setManualUnit] = useState("PZA");
  const [manualType, setManualType] = useState<(typeof manualCostTypes)[number]["value"]>("OTHER");
  const [manualCurrentCost, setManualCurrentCost] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [saving, setSaving] = useState<null | "profile" | "manual">(null);

  async function saveProfile() {
    if (!selectedArticle) {
      return;
    }

    setSaving("profile");

    try {
      await fetch("/api/configuracion/article-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sicarArtId: selectedArticle.artId,
          productionRole: profileRole,
          vrnPercentage: Number(vrnPercentage || 0),
          costingMode,
          manualCost: manualCost ? Number(manualCost) : null,
          notes: profileNotes,
        }),
      });

      startTransition(() => {
        setSelectedArticle(null);
        setVrnPercentage("");
        setManualCost("");
        setProfileNotes("");
        router.refresh();
      });
    } finally {
      setSaving(null);
    }
  }

  async function saveManualCostItem() {
    if (!manualCode || !manualName || !manualUnit) {
      return;
    }

    setSaving("manual");

    try {
      await fetch("/api/configuracion/manual-cost-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: manualCode,
          name: manualName,
          unitName: manualUnit,
          costType: manualType,
          currentCost: Number(manualCurrentCost || 0),
          notes: manualNotes,
        }),
      });

      startTransition(() => {
        setManualCode("");
        setManualName("");
        setManualUnit("PZA");
        setManualType("OTHER");
        setManualCurrentCost("");
        setManualNotes("");
        router.refresh();
      });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <div className="module-card space-y-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <Save className="size-5" />
          </span>
          <div>
            <p className="section-tag">Predeterminado</p>
            <h2 className="font-display text-2xl text-slate-950">Clasificación por artículo</h2>
          </div>
        </div>

        <ArticlePicker
          label="Artículo del catálogo"
          value={selectedArticle}
          options={catalogOptions}
          onChange={setSelectedArticle}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Rol"
            value={profileRole}
            onChange={(value) => setProfileRole(value as (typeof profileRoles)[number]["value"])}
            options={profileRoles}
          />
          <Field
            label="% VRN"
            value={vrnPercentage}
            onChange={setVrnPercentage}
            placeholder="0.00"
          />
          <SelectField
            label="Modo de costeo"
            value={costingMode}
            onChange={(value) => setCostingMode(value as (typeof costingModes)[number]["value"])}
            options={costingModes}
          />
          <Field
            label="Costo manual"
            value={manualCost}
            onChange={setManualCost}
            placeholder="Opcional"
          />
        </div>

        <Field
          label="Notas"
          value={profileNotes}
          onChange={setProfileNotes}
          placeholder="Observaciones o características"
        />

        <button
          type="button"
          disabled={saving === "profile" || !selectedArticle}
          onClick={() => void saveProfile()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          <Save className="size-4" />
          Guardar clasificación
        </button>

        <div className="space-y-3">
          {profiles.length === 0 ? (
            <EmptyState text="Todavía no hay clasificaciones guardadas." />
          ) : null}

          {profiles.map((profile) => (
            <div key={profile.articleProfileId} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">{profile.articleLabel}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Tag>{profile.productionRole}</Tag>
                <Tag>{profile.costingMode}</Tag>
                <Tag>{profile.vrnPercentage}%</Tag>
                {profile.manualCost !== null ? <Tag>{formatCurrency(profile.manualCost)}</Tag> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="module-card space-y-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-cyan-600 text-white">
            <Database className="size-5" />
          </span>
          <div>
            <p className="section-tag">Editable</p>
            <h2 className="font-display text-2xl text-slate-950">Base de costos e insumos</h2>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Código" value={manualCode} onChange={setManualCode} placeholder="EMP-001" />
          <Field label="Nombre" value={manualName} onChange={setManualName} placeholder="Bolsa, mano de obra, energía..." />
          <Field label="Unidad" value={manualUnit} onChange={setManualUnit} placeholder="PZA" />
          <SelectField
            label="Tipo"
            value={manualType}
            onChange={(value) => setManualType(value as (typeof manualCostTypes)[number]["value"])}
            options={manualCostTypes}
          />
          <Field
            label="Costo actual"
            value={manualCurrentCost}
            onChange={setManualCurrentCost}
            placeholder="0.00"
          />
          <Field label="Notas" value={manualNotes} onChange={setManualNotes} placeholder="Opcional" />
        </div>

        <button
          type="button"
          disabled={saving === "manual" || !manualCode || !manualName}
          onClick={() => void saveManualCostItem()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus className="size-4" />
          Guardar costo
        </button>

        <div className="space-y-3">
          {manualCostItems.length === 0 ? (
            <EmptyState text="Todavía no hay costos manuales guardados." />
          ) : null}

          {manualCostItems.map((item) => (
            <div key={item.manualCostItemId} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">
                    {item.code} - {item.name}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-500">
                    {item.unitName} · {item.costType}
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-800">
                  {formatCurrency(item.currentCost)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 outline-none transition focus:border-slate-500"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 outline-none transition focus:border-slate-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
      {children}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
