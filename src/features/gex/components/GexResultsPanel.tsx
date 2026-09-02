'use client';

import { useState } from 'react';
import type { GexRun, GexLevel } from '@/lib/db/schema';
import { IconCheck, IconUpload } from '@/components/ui/icons';

import { openInExplorer } from '../actions';

interface GexResultsPanelProps {
  run: GexRun;
  levels: GexLevel[];
  ntslCode: string;
}

export function GexResultsPanel({ run, levels, ntslCode }: GexResultsPanelProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'master' | 'strikes' | 'ntsl'>('master');
  const [explorerFeedback, setExplorerFeedback] = useState<string | null>(null);

  const handleCopyNtsl = () => {
    if (!ntslCode) return;
    navigator.clipboard.writeText(ntslCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenExplorer = async (path?: string | null) => {
    if (!path) return;
    setExplorerFeedback('Abrindo...');
    const res = await openInExplorer(path);
    if (res.success) {
      setExplorerFeedback('✓ Aberto no Explorer');
    } else {
      setExplorerFeedback(res.message || 'Erro ao abrir');
    }
    setTimeout(() => setExplorerFeedback(null), 3000);
  };

  const handleDownloadNtsl = () => {
    if (!ntslCode) return;
    const blob = new Blob([ntslCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GEX_LEVELS_${run.asset}_${run.date.replace(/-/g, '')}.ntsl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const cw = levels.find((l) => l.levelType === 'call_wall');
  const pw = levels.find((l) => l.levelType === 'put_wall');
  const zg = levels.find((l) => l.levelType === 'zero_gamma');
  const hvl = levels.find((l) => l.levelType === 'hvl');
  const rLevels = levels.filter((l) => l.levelType.startsWith('r'));
  const sLevels = levels.filter((l) => l.levelType.startsWith('s'));
  const lLevels = levels.filter((l) => /^l\d+$/i.test(l.levelType)).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

  const scriptFileName = run.scriptPath ? run.scriptPath.split(/[\\/]/).pop() : 'calculate_gex_winfut.py';
  const ntslFileName = run.ntslFilePath ? run.ntslFilePath.split(/[\\/]/).pop() : `GEX_LEVELS_${run.asset}_${run.date.replace(/-/g, '')}.ntsl`;

  return (
    <div className="space-y-4">
      {/* Barra de Status e Ações Rápidas */}
      <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              {run.scriptName} · PREGÃO {run.date}
            </h3>
            <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[10px] font-mono font-bold">
              {run.asset}
            </span>
          </div>

          {/* Linhagem de Arquivos B3 e Scripts */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono flex-wrap">
            <span>🐍 Script: <span className="text-amber-300 font-bold">{scriptFileName}</span></span>
            <span>·</span>
            <span>📜 NTSL: <span className="text-teal-300 font-bold">{ntslFileName}</span></span>
            <span>·</span>
            <span>COTAHIST: <span className="text-slate-300">{run.cotahistFile || 'Automático'}</span></span>
            <span>·</span>
            <span>OI: <span className="text-slate-300">{run.openInterestFile || 'Automático'}</span></span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {run.scriptPath && (
            <button
              onClick={() => handleOpenExplorer(run.scriptPath)}
              title={run.scriptPath}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition-all shadow-md"
            >
              <span>📂</span>
              <span>ABRIR SCRIPT NA PASTA</span>
            </button>
          )}

          {run.ntslFilePath && (
            <button
              onClick={() => handleOpenExplorer(run.ntslFilePath)}
              title={run.ntslFilePath}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center gap-1.5 transition-all shadow-md"
            >
              <span>📁</span>
              <span>ABRIR NTSL NA PASTA</span>
            </button>
          )}

          <button
            onClick={handleCopyNtsl}
            disabled={!ntslCode}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-md ${
              copied
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30'
            }`}
          >
            {copied ? <IconCheck className="w-3.5 h-3.5" /> : <span>📋</span>}
            {copied ? 'NTSL COPIADO!' : 'COPIAR NTSL (1-CLIQUE)'}
          </button>

          <button
            onClick={handleDownloadNtsl}
            disabled={!ntslCode}
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <IconUpload className="w-3.5 h-3.5" />
            <span>BAIXAR .NTSL</span>
          </button>

          {explorerFeedback && (
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-md animate-fade-in">
              {explorerFeedback}
            </span>
          )}
        </div>
      </div>

      {/* Navegação entre Visualizações */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('master')}
          className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
            activeTab === 'master'
              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          🎯 NÍVEIS MESTRES & REGIÕES
        </button>
        <button
          onClick={() => setActiveTab('strikes')}
          className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
            activeTab === 'strikes'
              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          📊 TABELA DE STRIKES ({levels.length})
        </button>
        <button
          onClick={() => setActiveTab('ntsl')}
          className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
            activeTab === 'ntsl'
              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          💻 CÓDIGO NTSL PROFIT PRO
        </button>
      </div>

      {/* ABA 1: NÍVEIS MESTRES */}
      {activeTab === 'master' && (
        <div className="space-y-4">
          {/* Cards dos Níveis Mestres */}
          <div className={`grid grid-cols-1 ${hvl ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3`}>
            {/* Call Wall */}
            <div className="bg-[#070d18] border border-cyan-500/30 rounded-xl p-4 space-y-2 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider">
                  TETO · CALL WALL
                </span>
                <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 text-[10px] font-mono font-bold">
                  {run.callWallGex ? `+${run.callWallGex.toFixed(1)}M GEX` : 'RESISTÊNCIA'}
                </span>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold font-mono text-cyan-300 tracking-tight">
                  {run.callWallFech?.toLocaleString('pt-BR') || '---'} <span className="text-xs font-normal text-slate-500">pts (Fech)</span>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Ajuste: <span className="text-slate-200 font-bold">{run.callWallAjus?.toLocaleString('pt-BR') || '---'} pts</span> · {run.asset === 'BLUECHIPS_BASKET' ? <span className="text-cyan-400 font-bold">Cesta Sintética</span> : <>Strike: <span className="text-cyan-400 font-bold">R$ {run.callWallStrike?.toFixed(2) || '---'}</span></>}
                </div>
              </div>
              <p className="text-[10px] text-slate-500 italic">
                Região de maior pinning e resistência vendedora por market makers.
              </p>
            </div>

            {/* HVL (se presente) */}
            {hvl && (
              <div className="bg-[#071322] border border-sky-500/40 rounded-xl p-4 space-y-2 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-sky-400 uppercase tracking-wider">
                    ÍMÃ · HVL (MAX OI B3)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[10px] font-mono font-bold">
                    {run.scriptVersion === 'farol_gex' ? 'FAROL' : 'MAX OI B3'}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold font-mono text-sky-300 tracking-tight">
                    {hvl.winfutFech?.toLocaleString('pt-BR') || '---'} <span className="text-xs font-normal text-slate-500">pts</span>
                  </div>
                  <div className="text-xs font-mono text-slate-400">
                    Strike: <span className="text-sky-400 font-bold">R$ {hvl.strike ? hvl.strike.toFixed(2) : '175.00'}</span> · 32,9M Contratos B3
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 italic">
                  Ponto de maior volume institucional e atrator gravitacional do preço.
                </p>
              </div>
            )}

            {/* Zero Gamma / Gamma Flip */}
            <div className="bg-[#0e0c1a] border border-purple-500/30 rounded-xl p-4 space-y-2 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-purple-400 uppercase tracking-wider">
                  PIVOT · {hvl ? 'GAMMA FLIP' : 'ZERO GAMMA'}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 text-[10px] font-mono font-bold">
                  {hvl ? 'FLIP REGIME' : 'ROOT FINDING'}
                </span>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold font-mono text-purple-300 tracking-tight">
                  {run.zeroGammaFech?.toLocaleString('pt-BR') || '---'} <span className="text-xs font-normal text-slate-500">pts (Fech)</span>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Ajuste: <span className="text-slate-200 font-bold">{run.zeroGammaAjus?.toLocaleString('pt-BR') || '---'} pts</span> · Regime: <span className="text-purple-400 font-bold">Transição</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 italic">
                Divisor de águas: Acima é Mean-Reversion (+Gamma), Abaixo é Aceleração (-Gamma).
              </p>
            </div>

            {/* Put Wall */}
            <div className="bg-[#140a12] border border-rose-500/30 rounded-xl p-4 space-y-2 shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider">
                  PISO · PUT WALL (SUPORTE)
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 text-[10px] font-mono font-bold">
                  {run.putWallGex ? `${run.putWallGex.toFixed(1)}M GEX` : 'SUPORTE'}
                </span>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold font-mono text-rose-300 tracking-tight">
                  {run.putWallFech?.toLocaleString('pt-BR') || '---'} <span className="text-xs font-normal text-slate-500">pts (Fech)</span>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Ajuste: <span className="text-slate-200 font-bold">{run.putWallAjus?.toLocaleString('pt-BR') || '---'} pts</span> · {run.asset === 'BLUECHIPS_BASKET' ? <span className="text-rose-400 font-bold">Cesta Sintética</span> : <>Strike: <span className="text-rose-400 font-bold">R$ {run.putWallStrike?.toFixed(2) || '---'}</span></>}
                </div>
              </div>
              <p className="text-[10px] text-slate-500 italic">
                Piso mestre institucional. Absorção massiva de delta hedge comprador.
              </p>
            </div>
          </div>

          {/* Níveis Intermediários (L1-L6 para Farol ou R1-R4/S1-S4 para Quant Pro) */}
          {lLevels.length > 0 ? (
            <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span>🎯 NÍVEIS SEQUENCIAIS FAROL DO MERCADO (L1 a L6)</span>
                </span>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  GRID 25 PTS
                </span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 font-mono text-xs">
                {lLevels.map((lvl) => (
                  <div key={lvl.id} className="bg-[#070a12] border border-slate-800/80 rounded-lg p-2.5 text-center space-y-1">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                      {lvl.levelType.toUpperCase()}
                    </span>
                    <span className="text-sm font-bold text-slate-100 block">
                      {lvl.winfutFech?.toLocaleString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Resistências */}
              <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <span>📈 RESISTÊNCIAS INTERMEDIÁRIAS (R1 - R6)</span>
                </h4>
                <div className="space-y-1.5 font-mono text-xs">
                  {rLevels.map((lvl) => (
                    <div key={lvl.id} className="bg-[#070a12] border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-cyan-400">{lvl.levelType.toUpperCase()}</span>
                        <span className="text-slate-400 text-[11px] ml-2">Strike R$ {lvl.strike.toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-200 font-bold">{lvl.winfutFech?.toLocaleString('pt-BR')} pts</span>
                        <span className="text-[10px] text-slate-500 block">+{lvl.gexCall?.toFixed(1)}M GEX</span>
                      </div>
                    </div>
                  ))}
                  {rLevels.length === 0 && <p className="text-slate-500 text-xs italic">Nenhuma resistência intermediária adicional.</p>}
                </div>
              </div>

              {/* Suportes */}
              <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <span>📉 SUPORTES INTERMEDIÁRIOS (S1 - S6)</span>
                </h4>
                <div className="space-y-1.5 font-mono text-xs">
                  {sLevels.map((lvl) => (
                    <div key={lvl.id} className="bg-[#070a12] border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-rose-400">{lvl.levelType.toUpperCase()}</span>
                        <span className="text-slate-400 text-[11px] ml-2">Strike R$ {lvl.strike.toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-200 font-bold">{lvl.winfutFech?.toLocaleString('pt-BR')} pts</span>
                        <span className="text-[10px] text-slate-500 block">{lvl.gexPut?.toFixed(1)}M GEX</span>
                      </div>
                    </div>
                  ))}
                  {sLevels.length === 0 && <p className="text-slate-500 text-xs italic">Nenhum suporte intermediário adicional.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 2: TABELA DE STRIKES */}
      {activeTab === 'strikes' && (
        <div className="bg-[#0b1018] border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#070a12] text-slate-400 text-[10px] uppercase">
                  <th className="p-3">Nível</th>
                  <th className="p-3">Strike BOVA11</th>
                  <th className="p-3">WINFUT Fech (pts)</th>
                  <th className="p-3">WINFUT Ajus (pts)</th>
                  <th className="p-3 text-right">GEX Call (R$ M)</th>
                  <th className="p-3 text-right">GEX Put (R$ M)</th>
                  <th className="p-3 text-right">Contratos OI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {levels.map((lvl) => (
                  <tr key={lvl.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        lvl.levelType === 'call_wall'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : lvl.levelType === 'put_wall'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : lvl.levelType === 'zero_gamma'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {lvl.levelType.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-200">R$ {lvl.strike.toFixed(2)}</td>
                    <td className="p-3 text-teal-300 font-bold">{lvl.winfutFech?.toLocaleString('pt-BR')}</td>
                    <td className="p-3 text-slate-400">{lvl.winfutAjus?.toLocaleString('pt-BR')}</td>
                    <td className="p-3 text-right text-cyan-400">+{lvl.gexCall?.toFixed(1)}M</td>
                    <td className="p-3 text-right text-rose-400">{lvl.gexPut?.toFixed(1)}M</td>
                    <td className="p-3 text-right text-slate-400">{lvl.openInterest?.toLocaleString('pt-BR') || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 3: CÓDIGO NTSL */}
      {activeTab === 'ntsl' && (
        <div className="bg-[#070a12] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="bg-[#0b1018] border-b border-slate-800 p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
              <span>Localização:</span>
              <span className="text-teal-300 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800 break-all">
                {run.ntslFilePath || 'd:\\estudos\\ntsl-indicator\\GEX_LEVELS_WINFUT_20082026_QUANT_PRO.ntsl'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {run.ntslFilePath && (
                <button
                  onClick={() => handleOpenExplorer(run.ntslFilePath)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
                >
                  <span>📂</span>
                  <span>ABRIR PASTA DO NTSL</span>
                </button>
              )}
              <button
                onClick={handleCopyNtsl}
                className="px-2.5 py-1 rounded bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors"
              >
                {copied ? '✓ COPIADO' : '📋 COPIAR CÓDIGO'}
              </button>
            </div>
          </div>
          <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[480px] leading-relaxed select-all">
            {ntslCode || '// Nenhum código NTSL disponível para esta execução.'}
          </pre>
        </div>
      )}

    </div>
  );
}
