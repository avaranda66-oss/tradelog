"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import {
  IconChart, IconJournal, IconUpload, IconTarget, IconScale, IconTerminal,
} from "./ui/icons";

export interface NavItem {
  href: string;
  label: string;
  code: string; // ex: "01"
  icon?: ReactNode;
}

export interface SidebarProps {
  items?: NavItem[];
  activePath?: string;
  collapsed?: boolean;
  sessionLabel?: string; // ex: "PRE-MARKET" | "OPEN" | "CLOSED"
}

const DEFAULT_ITEMS: NavItem[] = [
  { href: "/", label: "Estúdio Command", code: "01", icon: <IconTerminal /> },
  { href: "/diario", label: "Diário de Trades", code: "02", icon: <IconJournal /> },
  { href: "/operacoes", label: "Operações & Trades", code: "03", icon: <IconChart /> },
  { href: "/analytics", label: "Analytics & Métricas", code: "04", icon: <IconTarget /> },
  { href: "/audios", label: "Estúdio de Áudios", code: "05", icon: <IconUpload /> },
  { href: "/database", label: "Banco SQLite", code: "06", icon: <IconScale /> },
];

export function Sidebar({
  items = DEFAULT_ITEMS,
  activePath: activePathProp,
  collapsed = false,
  sessionLabel = "PRE-MARKET",
}: SidebarProps) {
  const pathname = usePathname();
  const currentPath = activePathProp ?? pathname ?? "/";
  return (
    <aside
      className={`flex h-full flex-col border-r border-slate-800/80 bg-[#0b1018] transition-[width] duration-150 ${
        collapsed ? "w-12" : "w-52"
      }`}
    >
      <nav className="flex-1 py-2" aria-label="Navegação principal">
        {!collapsed && (
          <p className="px-4 pb-2 pt-1 font-mono text-[9px] tracking-[0.25em] text-slate-600">
            MODULES
          </p>
        )}
        <ul className="space-y-px">
          {items.map((item) => {
            const active =
              item.href === "/"
                ? currentPath === "/"
                : currentPath.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex h-8 items-center gap-3 border-l-2 px-3.5 font-mono text-[11px] tracking-wide transition-colors ${
                    active
                      ? "border-teal-400 bg-teal-400/5 text-slate-100 font-bold"
                      : "border-transparent text-slate-500 hover:bg-white/[0.02] hover:text-slate-300"
                  }`}
                >
                  <span className={active ? "text-teal-400" : "text-slate-600 group-hover:text-slate-400"}>
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[9px] text-slate-700 group-hover:text-slate-600">
                        {item.code}
                      </span>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {!collapsed && (
        <div className="border-t border-slate-800/80 px-4 py-3">
          <p className="font-mono text-[9px] tracking-[0.25em] text-slate-600">SESSION</p>
          <p className="mt-1 flex items-center gap-2 font-mono text-[10px] tracking-wider text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
            {sessionLabel}
          </p>
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
