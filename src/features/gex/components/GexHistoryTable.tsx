'use client';

import { useState } from 'react';
import type { GexRun } from '@/lib/db/schema';
import { deleteGexRun, getGexRunDetails } from '../actions';
import { IconCheck, IconTarget } from '@/components/ui/icons';

interface GexHistoryTableProps {
  runs: GexRun[];
  onSelectRun: (runId: string) => void;
  onRefresh: () => void;
}

export function GexHistoryTable({ runs, onSelectRun, onRefresh }: GexHistoryTableProps) {
  const [filterAsset, setFilterAsset] = useState<string>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredRuns = runs.filter((r) => {
    if (filterAsset !== 'ALL' && r.asset !== filterAsset) return false;
    return true;
  });

  const handleCopyNtsl = (run: GexRun) => {
    if (!run.ntslCode) return;
    navigator.clipboard.writeText(run.ntslCode);
    setCopiedId(run.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta execução histórica do GEX?')) return;
    setDeletingId(id);
    await deleteGexRun(id);
    setDeletingId(null);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {/* Barra de Filtros */}
      <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-2">
          <IconTarget className="text-teal-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            HISTÓRICO & VERSIONAMENTO DE EXECUÇÕES GEX ({filteredRuns.length})
          </h3>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-slate-500 text-[11px]">FILTRAR POR ATIVO:</span>
          <select
            value={filterAsset}
            onChange={(e) => setFilterAsset(e.target.value)}
            className="bg-[#070a12] border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none"
          >
            <option value="ALL">Todos os Ativos</option>
            <option value="WINFUT">WINFUT</option>
            <option value="BLUECHIPS_BASKET">Bluechips Basket</option>
            <option value="PETR4">PETR4</option>
            <option value="VALE3">VALE3</option>
            <option value="BOVA11">BOVA11</option>
          </select>
        </div>
      </div>

      {/* Tabela de Execuções */}
      <div className="bg-[#0b1018] border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#070a12] text-slate-400 text-[10px] uppercase">
                <th className="p-3">Data Pregão</th>
                <th className="p-3">Ativo</th>
                <th className="p-3">Versão do Motor</th>
                <th className="p-3">Call Wall (Teto)</th>
                <th className="p-3">Zero Gamma (Pivot)</th>
                <th className="p-3">Put Wall (Piso)</th>
                <th className="p-3">Linhagem B3</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRuns.map((r) => (
                <tr key={r.id} className="hover:bg-slate-900/50 transition-colors">
                  <td className="p-3 font-bold text-slate-200 whitespace-nowrap">
                    {r.date}
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[10px] font-bold">
                      {r.asset}
                    </span>
                  </td>
                  <td className="p-3 text-slate-300 text-[11px]">
                    {r.scriptName}
                  </td>
                  <td className="p-3 text-cyan-300 font-bold">
                    {r.callWallFech ? `${r.callWallFech.toLocaleString('pt-BR')} pts` : '---'}
                  </td>
                  <td className="p-3 text-purple-300 font-bold">
                    {r.zeroGammaFech ? `${r.zeroGammaFech.toLocaleString('pt-BR')} pts` : '---'}
                  </td>
                  <td className="p-3 text-rose-300 font-bold">
                    {r.putWallFech ? `${r.putWallFech.toLocaleString('pt-BR')} pts` : '---'}
                  </td>
                  <td className="p-3 text-[10px] text-slate-500">
                    <div>{r.cotahistFile || 'N/A'}</div>
                    <div className="text-[9px] text-slate-600">{r.openInterestFile || 'N/A'}</div>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap space-x-2">
                    <button
                      onClick={() => onSelectRun(r.id)}
                      className="px-2.5 py-1 rounded bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[11px] font-bold transition-colors"
                      title="Ver Níveis e Detalhes"
                    >
                      👁️ DETALHES
                    </button>
                    <button
                      onClick={() => handleCopyNtsl(r)}
                      disabled={!r.ntslCode}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-colors"
                      title="Copiar NTSL"
                    >
                      {copiedId === r.id ? <IconCheck className="w-3.5 h-3.5 inline text-emerald-400" /> : '📋 NTSL'}
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deletingId === r.id}
                      className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[11px] font-bold transition-colors"
                      title="Excluir Registro"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRuns.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-500 text-xs italic">
                    Nenhuma execução histórica de GEX salva ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
