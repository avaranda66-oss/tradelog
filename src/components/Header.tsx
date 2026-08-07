"use client";

import { useEffect, useState, Suspense } from "react";
import { IconSync, IconTerminal, IconSettings, IconAlert } from "./ui/icons";
import { DateNavigatorBar } from "./DateNavigatorBar";

export type SyncStatus = "synced" | "syncing" | "error" | "offline";

export interface HeaderProps {
  syncStatus?: SyncStatus;
  lastSyncAt?: Date | string | null;
  environment?: "LIVE" | "PAPER";
  onOpenSettings?: () => void;
}

const SYNC_LABEL: Record<SyncStatus, string> = {
  synced: "SYNCED",
  syncing: "SYNCING",
  error: "SYNC ERROR",
  offline: "OFFLINE",
};

const dotColor: Record<SyncStatus, string> = {
  synced: "bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.5)]",
  syncing: "bg-teal-400 animate-pulse",
  error: "bg-rose-400",
  offline: "bg-slate-600",
};

function formatClock(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour12: false });
}

export function Header({
  syncStatus = "synced",
  lastSyncAt = null,
  environment = "LIVE",
  onOpenSettings,
}: HeaderProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const syncTs =
    lastSyncAt == null
      ? "--:--:--"
      : formatClock(typeof lastSyncAt === "string" ? new Date(lastSyncAt) : lastSyncAt);

  return (
    <header className="flex h-11 items-center justify-between border-b border-slate-800/80 bg-[#0b1018] px-4 shadow-md gap-4">
      <div className="flex items-center gap-3">
        <IconTerminal className="text-teal-400" />
        <span className="font-mono text-[11px] font-semibold tracking-[0.2em] text-slate-100">
          TRADELOG
        </span>
        <span className="hidden border-l border-slate-800/80 pl-3 font-mono text-[10px] tracking-widest text-slate-500 lg:inline">
          WINFUT · B3
        </span>
      </div>

      {/* Date Navigator Bar */}
      <Suspense fallback={<div className="font-mono text-[10px] text-slate-500">CARREGANDO DATA…</div>}>
        <DateNavigatorBar />
      </Suspense>

      <div className="flex items-center gap-4">
        <div
          className="flex items-center gap-2 font-mono text-[10px] tracking-wider"
          role="status"
          aria-live="polite"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor[syncStatus]}`} />
          <span className={syncStatus === "error" ? "text-rose-400" : "text-slate-400"}>
            {syncStatus === "error" && <IconAlert className="mr-1 inline h-3 w-3" />}
            {SYNC_LABEL[syncStatus]}
          </span>
          <span className="tabular-nums text-slate-600">{syncTs}</span>
        </div>

        <span
          className={`border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.15em] ${
            environment === "LIVE"
              ? "border-teal-500/40 text-teal-400"
              : "border-slate-600 text-slate-400"
          }`}
        >
          {environment}
        </span>

        <span className="hidden font-mono text-[11px] tabular-nums text-slate-400 md:inline">
          {formatClock(now)}
        </span>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Configurações"
          className="flex h-7 w-7 items-center justify-center border border-slate-800 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200 rounded-sm"
        >
          <IconSettings />
        </button>
      </div>
    </header>
  );
}

export default Header;
