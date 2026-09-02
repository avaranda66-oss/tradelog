'use client';

import { useState, useEffect, useTransition } from 'react';
import type { B3FilesStatus } from '../actions';
import {
  executeGexCalculation,
  executeAllGexCalculations,
  downloadAndSyncB3Files,
  detectLatestB3Files,
  type GexExecutionParams,
  type GexExecutionResult,
} from '../actions';
import { IconTerminal, IconTarget, IconUpload } from '@/components/ui/icons';

interface GexExecutionFormProps {
  b3Status: B3FilesStatus;
  targetDate?: string;
  onExecutionComplete: (result: GexExecutionResult | GexExecutionResult[]) => void;
}

export function GexExecutionForm({
  b3Status: initialB3Status,
  targetDate,
  onExecutionComplete,
}: GexExecutionFormProps) {
  const [isPending, startTransition] = useTransition();
  const [isSyncingB3, startSyncTransition] = useTransition();
  const [b3Status, setB3Status] = useState<B3FilesStatus>(initialB3Status);
  const [asset, setAsset] = useState<'WINFUT' | 'BLUECHIPS_BASKET' | 'PETR4' | 'VALE3' | 'BOVA11'>('WINFUT');
  const [scriptVersion, setScriptVersion] = useState<'v5.3_institutional' | 'v4.0_hybrid' | 'farol_gex' | 'v3.6_quant_pro' | 'v2.0_basket'>('v5.3_institutional');
  const [date, setDate] = useState(targetDate || new Date().toISOString().slice(0, 10));
  const [spotFechamento, setSpotFechamento] = useState('180075');
  const [spotAjuste, setSpotAjuste] = useState('180208');
  const [rangeMin, setRangeMin] = useState('');
  const [rangeMax, setRangeMax] = useState('');
  const [oiMode, setOiMode] = useState<'effective' | 'total' | 'uncovered'>('effective');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [latestLogs, setLatestLogs] = useState<string | null>(null);

  // Sincroniza a data do formulário e os arquivos B3 sempre que a data no topo mudar
  useEffect(() => {
    if (targetDate) {
      setDate(targetDate);
      detectLatestB3Files(targetDate).then((status) => {
        setB3Status(status);
      });
    }
  }, [targetDate]);


  const handleSyncB3 = () => {
    setErrorMsg(null);
    startSyncTransition(async () => {
      try {
        const res = await downloadAndSyncB3Files();
        setB3Status(res.status);
        if (res.downloadLogs) {
          setLatestLogs(`=== [DOWNLOAD / SYNC B3] ===\n${res.downloadLogs}`);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Erro ao sincronizar arquivos com a B3.');
      }
    });
  };

  const handleRunAll = () => {
    setErrorMsg(null);
    setShowLogs(true);
    setLatestLogs('🚀 Disparando cálculo em paralelo de todas as versões (v4.0 Hybrid, v3.6, Farol, v3.5, v2.0 Basket e v1.0)...\nAguarde processamento de milhões de contratos e matriz de volatilidade...');

    const fech = parseFloat(spotFechamento.replace(/\./g, '').replace(',', '.'));
    const ajus = parseFloat(spotAjuste.replace(/\./g, '').replace(',', '.'));
    const rMin = parseFloat(rangeMin.replace(/\./g, '').replace(',', '.'));
    const rMax = parseFloat(rangeMax.replace(/\./g, '').replace(',', '.'));

    if (isNaN(fech) || isNaN(ajus)) {
      setErrorMsg('Por favor, informe valores válidos para Spot Fechamento e Ajuste.');
      return;
    }

    startTransition(async () => {
      try {
        const results = await executeAllGexCalculations({
          date,
          spotFechamento: fech,
          spotAjuste: ajus,
          rangeMin: isNaN(rMin) ? undefined : rMin,
          rangeMax: isNaN(rMax) ? undefined : rMax,
          oiMode,
        });

        if (results.length > 0) {
          onExecutionComplete(results);
        } else {
          setErrorMsg('Nenhuma versão concluiu com sucesso.');
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Erro ao executar cálculo em lote.');
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setShowLogs(true);

    const fech = parseFloat(spotFechamento.replace(/\./g, '').replace(',', '.'));
    const ajus = parseFloat(spotAjuste.replace(/\./g, '').replace(',', '.'));
    const rMin = parseFloat(rangeMin.replace(/\./g, '').replace(',', '.'));
    const rMax = parseFloat(rangeMax.replace(/\./g, '').replace(',', '.'));

    if (isNaN(fech) || isNaN(ajus)) {
      setErrorMsg('Por favor, informe valores válidos para Spot Fechamento e Ajuste.');
      return;
    }

    startTransition(async () => {
      try {
        const result = await executeGexCalculation({
          date,
          asset,
          scriptVersion,
          spotFechamento: fech,
          spotAjuste: ajus,
          rangeMin: isNaN(rMin) ? undefined : rMin,
          rangeMax: isNaN(rMax) ? undefined : rMax,
          oiMode,
        });

        onExecutionComplete(result);
      } catch (err: any) {
        setErrorMsg(err.message || 'Erro ao executar cálculo GEX.');
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Linhagem de Dados B3 */}
      <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-4 space-y-3 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-teal-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              LINHAGEM DE DADOS OFICIAIS B3 (D-1 / D-2)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncB3}
              disabled={isSyncingB3 || isPending}
              className="px-2.5 py-1 rounded bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30 text-[11px] font-mono font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <IconUpload className={isSyncingB3 ? 'animate-spin' : ''} />
              <span>{isSyncingB3 ? 'BAIXANDO B3...' : 'SINCRONIZAR ARQUIVOS B3'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          {/* COTAHIST */}
          <div className="bg-[#070a12] border border-slate-800/80 rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span>📁 COTAHIST Diário:</span>
                <span className="text-teal-400 font-bold">{b3Status.latestCotahist?.dateStr || 'N/A'}</span>
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                b3Status.latestCotahist ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              }`}>
                {b3Status.latestCotahist ? 'PRONTO' : 'AUSENTE'}
              </span>
            </div>
            <div className="text-slate-200 font-bold truncate">
              {b3Status.latestCotahist?.filename || 'Nenhum COTAHIST_D*.TXT encontrado'}
            </div>
            <div className="text-[9px] text-slate-500 truncate" title={b3Status.latestCotahist?.sha256}>
              SHA-256: {b3Status.latestCotahist?.sha256 ? `${b3Status.latestCotahist.sha256.slice(0, 16)}...` : 'N/A'} ({b3Status.latestCotahist?.sizeFormatted})
            </div>
          </div>

          {/* Open Interest */}
          <div className="bg-[#070a12] border border-slate-800/80 rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span>📊 Open Interest (Posições em Aberto):</span>
                <span className="text-teal-400 font-bold">{b3Status.latestOpenInterest?.dateStr || 'N/A'}</span>
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                b3Status.latestOpenInterest ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
              }`}>
                {b3Status.latestOpenInterest ? 'PRONTO' : 'AUSENTE'}
              </span>
            </div>
            <div className="text-slate-200 font-bold truncate">
              {b3Status.latestOpenInterest?.filename || 'Nenhum DerivativesOpenPositionFile_*.csv encontrado'}
            </div>
            <div className="text-[9px] text-slate-500 truncate" title={b3Status.latestOpenInterest?.sha256}>
              SHA-256: {b3Status.latestOpenInterest?.sha256 ? `${b3Status.latestOpenInterest.sha256.slice(0, 16)}...` : 'N/A'} ({b3Status.latestOpenInterest?.sizeFormatted})
            </div>
          </div>
        </div>
      </div>

      {/* Formulário de Parâmetros de Execução */}
      <div className="bg-[#0b1018] border border-slate-800 rounded-xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <IconTarget className="text-teal-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              CONFIGURAR PARÂMETROS DO CÁLCULO GEX
            </h3>
          </div>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
            scriptVersion === 'v5.3_institutional'
              ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30 font-bold'
              : scriptVersion === 'v4.0_hybrid'
              ? 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30 font-bold'
              : scriptVersion === 'farol_gex'
              ? 'text-amber-400 bg-amber-400/10 border-amber-400/20 font-bold'
              : 'text-teal-400/80 bg-teal-400/10 border-teal-400/20'
          }`}>
            {scriptVersion === 'v5.3_institutional'
              ? '👑 calculate_gex_winfut.py (V5.3.2)'
              : scriptVersion === 'v4.0_hybrid'
              ? '🚀 calculate_gex_winfut_v4_hybrid.py'
              : scriptVersion === 'farol_gex'
              ? '🎯 calculate_farol_gex.py'
              : '📦 calculate_gex_winfut_v5.py'}
          </span>
        </div>

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-xs font-mono text-rose-300">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          {/* Ativo */}
          <div className="space-y-1.5">
            <label className="text-slate-400 text-[11px] block font-bold">ATIVO REFERÊNCIA</label>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value as any)}
              className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2.5 text-slate-200 focus:border-teal-400 focus:outline-none"
            >
              <option value="WINFUT">WINFUT (BOVA11 Base)</option>
              <option value="BLUECHIPS_BASKET">Bluechips Basket (PETR/VALE/ITUB)</option>
              <option value="PETR4">PETR4 (Petrobras PN)</option>
              <option value="VALE3">VALE3 (Vale ON)</option>
              <option value="BOVA11">BOVA11 (ETF Spot)</option>
            </select>
          </div>

          {/* Versão do Motor (com Nome Real do Arquivo) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-400 text-[11px] block font-bold">SCRIPT PYTHON EXECUTADO</label>
            </div>
            <select
              value={scriptVersion}
              onChange={(e) => setScriptVersion(e.target.value as any)}
              className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2.5 text-slate-200 focus:border-teal-400 focus:outline-none font-bold text-teal-300 font-mono text-[11px]"
            >
              <option value="v5.3_institutional">👑 calculate_gex_winfut.py (v5.3.2 Institutional Master)</option>
              <option value="v4.0_hybrid">🚀 calculate_gex_winfut_v4_hybrid.py (v4.0 Master Hybrid)</option>
              <option value="farol_gex">🎯 calculate_farol_gex.py (Farol do Mercado GEX)</option>
              <option value="v3.6_quant_pro">📦 calculate_gex_winfut_v5.py (v3.6 Quant Pro Legado)</option>
              <option value="v2.0_basket">📊 test_gex_basket_synthetics.py (v2.0 Basket Synthetics)</option>
            </select>
            <div className="text-[9px] text-slate-500 font-mono truncate" title={
              scriptVersion === 'v5.3_institutional'
                ? 'd:\\estudos\\.agents\\skills\\gex-winfut\\scripts\\calculate_gex_winfut.py'
                : scriptVersion === 'v4.0_hybrid'
                ? 'd:\\estudos\\.agents\\skills\\gex-winfut\\scripts\\calculate_gex_winfut_v4_hybrid.py'
                : scriptVersion === 'farol_gex'
                ? 'd:\\estudos\\.agents\\skills\\gex-winfut\\scripts\\calculate_farol_gex.py'
                : scriptVersion === 'v3.6_quant_pro'
                ? 'd:\\estudos\\.agents\\skills\\gex-winfut\\scripts\\calculate_gex_winfut_v5.py'
                : 'd:\\estudos\\03-PRATICA-E-CODIGO\\desenvolvimento\\gex\\test_gex_basket_synthetics.py'
            }>
              📁 {
                scriptVersion === 'v5.3_institutional'
                  ? '.agents/skills/gex-winfut/scripts/calculate_gex_winfut.py'
                  : scriptVersion === 'v4.0_hybrid'
                  ? '.agents/skills/gex-winfut/scripts/calculate_gex_winfut_v4_hybrid.py'
                  : scriptVersion === 'farol_gex'
                  ? '.agents/skills/gex-winfut/scripts/calculate_farol_gex.py'
                  : scriptVersion === 'v3.6_quant_pro'
                  ? '.agents/skills/gex-winfut/scripts/calculate_gex_winfut_v5.py'
                  : '03-PRATICA-E-CODIGO/desenvolvimento/gex/test_gex_basket_synthetics.py'
              }
            </div>
          </div>

          {/* Spot Fechamento */}
          <div className="space-y-1.5">
            <label className="text-slate-400 text-[11px] block font-bold">SPOT FECHAMENTO (PTS)</label>
            <input
              type="text"
              value={spotFechamento}
              onChange={(e) => setSpotFechamento(e.target.value)}
              placeholder="ex: 180075"
              className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-teal-400 focus:outline-none font-bold text-teal-300"
            />
          </div>

          {/* Spot Ajuste */}
          <div className="space-y-1.5">
            <label className="text-slate-400 text-[11px] block font-bold">SPOT AJUSTE (PTS)</label>
            <input
              type="text"
              value={spotAjuste}
              onChange={(e) => setSpotAjuste(e.target.value)}
              placeholder="ex: 180208"
              className="w-full bg-[#070a12] border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:border-teal-400 focus:outline-none font-bold text-teal-300"
            />
          </div>
        </div>

        {/* Botão de Disparo */}
        <div className="pt-2 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setShowLogs(!showLogs)}
            className="text-[11px] font-mono text-slate-500 hover:text-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <IconTerminal className="w-3.5 h-3.5" />
            <span>{showLogs ? 'Ocultar Terminal de Logs' : 'Exibir Terminal de Logs'}</span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={handleRunAll}
              className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold tracking-wider uppercase transition-all shadow-lg flex items-center gap-2 border ${
                isPending
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400/40 hover:shadow-purple-500/25'
              }`}
            >
              <span>⚡</span>
              <span>EXECUTAR TODAS AS VERSÕES (v5.3 + v4.0 + FAROL + v3.6)</span>
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className={`px-6 py-2.5 rounded-xl font-mono text-xs font-bold tracking-wider uppercase transition-all shadow-lg flex items-center gap-2 ${
                isPending
                  ? 'bg-teal-500/30 text-teal-300 cursor-not-allowed'
                  : scriptVersion === 'v5.3_institutional'
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 hover:shadow-emerald-500/25 font-bold'
                  : scriptVersion === 'v4.0_hybrid'
                  ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 hover:shadow-cyan-400/25 font-bold'
                  : scriptVersion === 'farol_gex'
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 hover:shadow-amber-500/25 font-bold'
                  : 'bg-teal-500 hover:bg-teal-400 text-slate-950 hover:shadow-teal-500/25'
              }`}
            >
              {isPending ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
                  <span>CALCULANDO...</span>
                </>
              ) : (
                <>
                  <span>{scriptVersion === 'v5.3_institutional' ? '👑' : (scriptVersion === 'v4.0_hybrid' ? '🚀' : (scriptVersion === 'farol_gex' ? '🎯' : '🚀'))}</span>
                  <span>{scriptVersion === 'v5.3_institutional' ? 'EXECUTAR calculate_gex_winfut.py (v5.3.2)' : (scriptVersion === 'v4.0_hybrid' ? 'EXECUTAR calculate_gex_winfut_v4_hybrid.py' : (scriptVersion === 'farol_gex' ? 'EXECUTAR calculate_farol_gex.py' : `EXECUTAR (${asset})`))}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Terminal de Logs */}
      {showLogs && latestLogs && (
        <div className="bg-[#05070c] border border-slate-800 rounded-xl p-4 space-y-2 shadow-2xl font-mono text-xs">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 text-slate-400 text-[11px]">
            <span className="flex items-center gap-2">
              <IconTerminal className="text-teal-400" />
              <span>TERMINAL DE LOGS DA EXECUÇÃO PYTHON</span>
            </span>
            <span className="text-[10px] text-slate-600">STDOUT / STDERR</span>
          </div>
          <pre className="text-[11px] text-slate-300 max-h-[300px] overflow-y-auto leading-relaxed whitespace-pre-wrap select-all">
            {latestLogs}
          </pre>
        </div>
      )}
    </div>
  );
}
