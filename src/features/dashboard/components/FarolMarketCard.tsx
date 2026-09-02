'use client';

import { useState } from 'react';
import type { TradingDay } from '@/lib/db/schema';
import { updatePreMarket } from '@/features/trades/actions';
import { IconTarget, IconArrowUp, IconArrowDown, IconDash, IconCheck } from '@/components/ui/icons';
import { FarolScreenshotsGallery, type FarolImage } from './FarolScreenshotsGallery';

interface FarolMarketCardProps {
  day: TradingDay;
  images?: FarolImage[];
}

export function FarolMarketCard({ day, images = [] }: FarolMarketCardProps) {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [capturingPlaywright, setCapturingPlaywright] = useState(false);
  const [playwrightStatus, setPlaywrightStatus] = useState<string | null>(null);
  const [analyzingVision, setAnalyzingVision] = useState(false);
  const [visionStatus, setVisionStatus] = useState<string | null>(null);

  const [farolBias, setFarolBias] = useState(day.farolBias || 'Baixa');
  const [farolKeyLevels, setFarolKeyLevels] = useState(
    day.farolKeyLevels || 'Range: 172.000 a 174.500 | Stop: 180-220 pts | Call Wall: 174.500 | Put Wall: 171.800 | Zero Gamma: 173.200'
  );
  const [farolNews, setFarolNews] = useState(
    day.farolNews || 'Minério Dalian -1.8% | Brent $92.25 | DXY 98.92 (+0.25%) | VIX 16.25 | ADRs VALE (-1.2%), ITUB (-0.6%)'
  );
  const [farolInsights, setFarolInsights] = useState(
    day.farolInsights || 'GPS Farol: Pressão vendedora com 70% peso externo. Monitorar repique na VWAP e suportes de GEX.'
  );

  async function handleSave() {
    setLoading(true);
    try {
      await updatePreMarket(day.id, {
        generalBias: day.generalBias || (farolBias.toLowerCase().includes('alta') ? 'alta' : farolBias.toLowerCase().includes('baixa') ? 'baixa' : 'indefinido'),
        farolBias,
        farolKeyLevels,
        farolNews,
        farolInsights,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setLoading(false);
    }
  }

  async function handleCapturePlaywright() {
    setCapturingPlaywright(true);
    setPlaywrightStatus('Iniciando Chromium e abrindo Farol do Mercado...');
    try {
      setPlaywrightStatus('Acessando GPS e Briefing do Mercado...');
      const response = await fetch('/api/farol/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: day.date }),
      });

      setPlaywrightStatus('Capturando Radar de ADRs e Commodities...');
      const data = await response.json();

      if (data.success) {
        setPlaywrightStatus('✓ Screenshots e Dados do Farol capturados!');
        if (data.extractedData?.winBias) {
          setFarolBias(`Farol: ${data.extractedData.winBias}`);
        }
        if (data.extractedData?.probableRange) {
          setFarolKeyLevels(
            `Range: ${data.extractedData.probableRange}${data.extractedData.suggestedStop ? ` | Stop: ${data.extractedData.suggestedStop}` : ''}`
          );
        }
        setTimeout(() => {
          setPlaywrightStatus(null);
          window.location.reload();
        }, 1500);
      } else {
        setPlaywrightStatus(`⚠️ Erro: ${data.error || 'Falha na captura'}`);
        setTimeout(() => setPlaywrightStatus(null), 4000);
      }
    } catch (err: any) {
      setPlaywrightStatus(`❌ Erro: ${err.message || 'Falha de conexão'}`);
      setTimeout(() => setPlaywrightStatus(null), 4000);
    } finally {
      setCapturingPlaywright(false);
    }
  }

  async function handleAnalyzeVision() {
    setAnalyzingVision(true);
    setVisionStatus('🤖 Carregando screenshots e consultando Gemini Vision AI...');
    try {
      const response = await fetch('/api/farol/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: day.date }),
      });

      const data = await response.json();
      if (data.success && data.data) {
        const ext = data.data;
        if (ext.farolBias) setFarolBias(ext.farolBias);
        if (ext.farolKeyLevels) setFarolKeyLevels(ext.farolKeyLevels);
        if (ext.farolNews) setFarolNews(ext.farolNews);
        if (ext.farolInsights) setFarolInsights(ext.farolInsights);

        setVisionStatus('✓ PROTOCOLO PRÉ-MARKET & FAROL MACRO/GPS EXTRAÍDOS COM SUCESSO!');
        setTimeout(() => {
          setVisionStatus(null);
          window.location.reload();
        }, 1800);
      } else {
        setVisionStatus(`⚠️ ${data.error || 'Nenhum screenshot encontrado ou falha na IA.'}`);
        setTimeout(() => setVisionStatus(null), 5000);
      }
    } catch (err: any) {
      setVisionStatus(`❌ Erro na análise Gemini: ${err.message || 'Falha de conexão'}`);
      setTimeout(() => setVisionStatus(null), 5000);
    } finally {
      setAnalyzingVision(false);
    }
  }

  async function handleOpenLogin() {
    setPlaywrightStatus('Abrindo navegador Google Chrome para autenticação...');
    try {
      const res = await fetch('/api/farol/login', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPlaywrightStatus('🌐 Navegador aberto! Faça login no Farol do Mercado com avaranda66@gmail.com.');
      } else {
        setPlaywrightStatus(`⚠️ ${data.error}`);
      }
    } catch (e: any) {
      setPlaywrightStatus(`❌ Erro ao abrir navegador: ${e.message}`);
    }
  }

  function handleAutoFill() {
    setFarolBias('Baixa Moderada (70% Externo)');
    setFarolKeyLevels('Range: 172.000 a 174.500 | Stop: 180-220 pts | Call Wall: 174.500 | Put Wall: 171.800 | Zero Gamma: 173.200');
    setFarolNews('Minério SGX $101.40 (-1.65%) | Brent $92.25 (-0.78%) | DXY 98.92 (+0.25%) | USD/BRL R$ 5,1880 | VIX 16.25');
    setFarolInsights('Farol do Mercado indica cautela com peso externo predominante. Aguardar retração nas médias antes de agredir.');
  }

  return (
    <section aria-label="Farol do mercado" className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 shadow-xl space-y-4 font-mono">
      {/* Header Command */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <IconTarget className="text-teal-400" width={18} height={18} />
          <div>
            <h2 className="font-mono text-xs tracking-[0.2em] text-slate-200 uppercase font-bold flex items-center gap-2">
              <span>FAROL DO MERCADO · PROTOCOLO MACRO & GPS</span>
              <span className="text-[9px] bg-teal-500/10 text-teal-300 border border-teal-500/20 px-1.5 py-0.5 rounded font-bold">
                PLAYWRIGHT + VISION AI
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 font-sans mt-0.5">
              Captura automatizada em alta definição e extração de dados via IA Multimodal
            </p>
          </div>
        </div>

        {/* Botões de Ação do Header */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenLogin}
            type="button"
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 hover:text-amber-200 border border-amber-500/40 rounded-md font-mono text-[10px] font-bold tracking-wider transition-all flex items-center gap-1 cursor-pointer"
            title="Abrir Google Chrome para autenticar avaranda66@gmail.com permanentemente"
          >
            <span>🔑</span>
            <span>LOGIN FAROL</span>
          </button>

          <button
            onClick={handleCapturePlaywright}
            disabled={capturingPlaywright || analyzingVision}
            type="button"
            className="px-3 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-mono font-bold text-xs rounded-md transition-all flex items-center gap-1.5 shadow-lg shadow-teal-500/10 disabled:opacity-50 cursor-pointer"
          >
            <span>{capturingPlaywright ? '⏳' : '📸'}</span>
            <span>{capturingPlaywright ? 'CAPTURANDO...' : 'CAPTURAR (PLAYWRIGHT)'}</span>
          </button>

          <button
            onClick={handleAnalyzeVision}
            disabled={analyzingVision || capturingPlaywright}
            type="button"
            className="px-3 py-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-400 hover:via-purple-400 hover:to-pink-400 text-white font-mono font-bold text-xs rounded-md transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-500/20 disabled:opacity-50 cursor-pointer animate-in fade-in"
            title="Lê todos os screenshots salvos do Farol do Mercado e preenche o Pré-Market e GPS automaticamente com Gemini Vision AI"
          >
            <span>{analyzingVision ? '⏳' : '🤖'}</span>
            <span>{analyzingVision ? 'ANALISANDO PRINTS...' : 'LER PRINTS COM AI (VISION)'}</span>
          </button>

          <button
            onClick={handleAutoFill}
            type="button"
            className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/80 rounded-md font-mono text-[10px] font-bold tracking-wider transition-all"
            title="Preencher valores de referência"
          >
            SYNC
          </button>
        </div>
      </div>

      {/* Status da Captura Playwright */}
      {playwrightStatus && (
        <div className={`p-2.5 rounded-lg border text-xs font-mono flex items-center gap-2 animate-in fade-in ${
          playwrightStatus.includes('✓')
            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            : playwrightStatus.includes('Erro')
            ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
            : 'bg-teal-500/10 text-teal-300 border-teal-500/30 animate-pulse'
        }`}>
          <span>{playwrightStatus.includes('✓') ? '✅' : playwrightStatus.includes('Erro') ? '⚠️' : '⚡'}</span>
          <span>{playwrightStatus}</span>
        </div>
      )}

      {/* Status da Análise Vision */}
      {visionStatus && (
        <div className={`p-2.5 rounded-lg border text-xs font-mono flex items-center gap-2 animate-in fade-in ${
          visionStatus.includes('✓')
            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            : visionStatus.includes('Erro') || visionStatus.includes('⚠️') || visionStatus.includes('❌')
            ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
            : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 animate-pulse'
        }`}>
          <span>{visionStatus.includes('✓') ? '✅' : visionStatus.includes('Erro') || visionStatus.includes('⚠️') || visionStatus.includes('❌') ? '⚠️' : '🤖'}</span>
          <span>{visionStatus}</span>
        </div>
      )}

      {/* Galeria Visual de Screenshots Capturados */}
      <FarolScreenshotsGallery images={images} date={day.date} />

      {/* Grid do Formulário com Campos Estruturados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
        {/* Viés do Farol */}
        <div className="space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            VIÉS DO FAROL DO MERCADO (WIN / WDO)
          </label>
          <input
            type="text"
            value={farolBias}
            onChange={(e) => setFarolBias(e.target.value)}
            placeholder="Ex: Baixa Moderada (70% Externo)"
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500/60 font-mono text-xs font-bold"
          />
        </div>

        {/* Níveis-Chave do Farol */}
        <div className="space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            RANGE PROVÁVEL & STOP SUGERIDO
          </label>
          <input
            type="text"
            value={farolKeyLevels}
            onChange={(e) => setFarolKeyLevels(e.target.value)}
            placeholder="Ex: Range: 172.000 a 174.500 | Stop: 180-220 pts"
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500/60 font-mono text-xs"
          />
        </div>

        {/* Notícias, ADRs & Calendário Macro */}
        <div className="md:col-span-2 space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            RADAR MACRO, COMMODITIES & ADRS
          </label>
          <input
            type="text"
            value={farolNews}
            onChange={(e) => setFarolNews(e.target.value)}
            placeholder="Ex: Minério SGX -1.65% | Brent $92.25 | DXY 98.92 | VALE -1.2% | ITUB -0.56%"
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500/60 font-mono text-xs"
          />
        </div>

        {/* Insights do Farol */}
        <div className="md:col-span-2 space-y-1">
          <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
            SÍNTESE OPERACIONAL & INSIGHTS DO FAROL
          </label>
          <textarea
            rows={2}
            value={farolInsights}
            onChange={(e) => setFarolInsights(e.target.value)}
            placeholder="Síntese dos drivers, riscos do dia e recomendações estratégicas do Farol..."
            className="w-full bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500/60 font-sans text-xs leading-relaxed"
          />
        </div>
      </div>

      {/* Footer de Ação */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 font-mono text-[10px]">
        <span className="text-slate-500">
          CONFLUÊNCIA DE PRÉ-MARKET SINCRONIZADA
        </span>

        <button
          onClick={handleSave}
          disabled={loading}
          type="button"
          className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-mono font-bold text-xs rounded-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          {saved ? (
            <>
              <IconCheck className="text-slate-950" />
              <span>REGISTRO SALVO</span>
            </>
          ) : loading ? (
            'SALVANDO…'
          ) : (
            'SALVAR FAROL MARKET'
          )}
        </button>
      </div>
    </section>
  );
}

export default FarolMarketCard;
