"use client";

import { useEffect, useState } from "react";
import { DatabaseZap, RefreshCw } from "lucide-react";

import {
  getCloudCatalogSyncState,
  requestCloudCatalogSync,
  type CloudCatalogSyncState,
} from "@/lib/firebase/cloud-data";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

type CatalogSyncPanelProps = {
  compact?: boolean;
  onSynced?: () => Promise<void> | void;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function CatalogSyncPanel({
  compact = false,
  onSynced,
}: CatalogSyncPanelProps) {
  const [syncState, setSyncState] = useState<CloudCatalogSyncState | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState("Catálogo desde SICAR");

  async function refreshState() {
    try {
      const nextState = await getCloudCatalogSyncState();
      setSyncState(nextState);
      return nextState;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshState();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function handleSync() {
    setIsSyncing(true);
    setMessage("Solicitando sincronización...");
    const previousSync = syncState?.catalogSyncedAt ?? null;

    try {
      await requestCloudCatalogSync();

      for (let attempt = 0; attempt < 8; attempt += 1) {
        await sleep(3000);
        const nextState = await refreshState();

        if (!nextState) {
          continue;
        }

        if (
          nextState.catalogSyncedAt &&
          nextState.catalogSyncedAt !== previousSync
        ) {
          await onSynced?.();
          setMessage("Catálogo actualizado.");
          setIsSyncing(false);
          return;
        }
      }

      await onSynced?.();
      setMessage("Solicitud enviada. El integrador local la procesará.");
    } catch {
      setMessage("No se pudo solicitar la sincronización.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-3xl border border-slate-200 bg-white/90",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
              <DatabaseZap className="size-4" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-700">SICAR</p>
              <p className="text-sm font-medium text-slate-900">{message}</p>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            {syncState?.catalogSyncedAt
              ? `Última sync: ${formatDateTime(syncState.catalogSyncedAt)} · ${formatNumber(syncState.catalogRows)} artículos`
              : "Aún no hay catálogo cargado en Firebase."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={isSyncing}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn("size-4", isSyncing ? "animate-spin" : "")} />
          {isSyncing ? "Sincronizando..." : "Sincronizar catálogo"}
        </button>
      </div>
    </div>
  );
}
