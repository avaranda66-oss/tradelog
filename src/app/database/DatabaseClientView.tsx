'use client';

import { useState } from 'react';
import type { TradingDay, Trade, TradeImage, AudioRecord, VideoRecord } from '@/lib/db/schema';
import { deleteVideoRecord } from '@/features/video/actions';
import { deleteAudioRecord } from '@/features/audio/actions';
import { deleteTradeImage } from '@/features/images/actions';
import { deleteTrade, deleteTradingDayAction } from '@/features/trades/actions';
import { useRouter } from 'next/navigation';
import { IconScale, IconVideo, IconChart, IconMic, IconCamera, IconAlert, IconCheck } from '@/components/ui/icons';
import { DatabaseHealthPanel } from './DatabaseHealthPanel';
import { InlineCell } from './InlineCell';

interface DatabaseClientViewProps {
  days: TradingDay[];
  trades: Trade[];
  videos: VideoRecord[];
  audios: AudioRecord[];
  images: TradeImage[];
}

export function DatabaseClientView({
  days: initialDays,
  trades: initialTrades,
  videos: initialVideos,
  audios: initialAudios,
  images: initialImages,
}: DatabaseClientViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'days' | 'trades' | 'videos' | 'audios' | 'images'>('days');
  const [videos, setVideos] = useState(initialVideos);
  const [audios, setAudios] = useState(initialAudios);
  const [images, setImages] = useState(initialImages);
  const [trades, setTrades] = useState(initialTrades);
  const [days, setDays] = useState(initialDays);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDayId, setConfirmDayId] = useState<string | null>(null);
  
  // Preset Filters
  const [activePreset, setActivePreset] = useState<'all' | 'negative' | 'unreviewed'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Inspector Drawer State
  const [expandedDay, setExpandedDay] = useState<TradingDay | null>(null);
  const [expandedTrade, setExpandedTrade] = useState<Trade | null>(null);

  async function handleDeleteVideo(id: string) {
    setDeletingId(id);
    try {
      await deleteVideoRecord(id);
      setVideos(videos.filter(v => v.id !== id));
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteAudio(id: string) {
    setDeletingId(id);
    try {
      await deleteAudioRecord(id);
      setAudios(audios.filter(a => a.id !== id));
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteImage(id: string) {
    setDeletingId(id);
    try {
      await deleteTradeImage(id);
      setImages(images.filter(i => i.id !== id));
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteTrade(id: string) {
    setDeletingId(id);
    try {
      await deleteTrade(id);
      setTrades(trades.filter(t => t.id !== id));
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  // Download JSON Backup
  function downloadJsonBackup() {
    const payload = {
      format: 'tradelog-database-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      days,
      trades,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradelog-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredDays = days.filter(d => {
    if (activePreset === 'negative' && (d.totalReais || 0) >= 0) return false;
    if (activePreset === 'unreviewed' && d.retrospective) return false;
    
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      d.date.includes(term) ||
      (d.personalNote && d.personalNote.toLowerCase().includes(term)) ||
      (d.honestPhrase && d.honestPhrase.toLowerCase().includes(term)) ||
      (d.retrospective && d.retrospective.toLowerCase().includes(term))
    );
  });

  const filteredTrades = trades.filter(t => {
    if (activePreset === 'negative' && (t.reais || 0) >= 0) return false;
    
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      t.instrument.toLowerCase().includes(term) ||
      t.openTime.includes(term) ||
      (t.strategy && t.strategy.toLowerCase().includes(term))
    );
  });

  return (
    <div className="max-w-[1440px] mx-auto space-y-5 pb-16 animate-in fade-in font-mono">
      {/* Header Datalog Command */}
      <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconScale className="text-teal-400" />
          <div>
            <h1 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-[0.2em]">
              SQLITE DATABASE COMMAND CENTER // DATA WORKSPACE
            </h1>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              Edição inline, auditoria de textos gravados, busca global e backup de registros SQLite
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={downloadJsonBackup}
            type="button"
            className="px-3 py-1 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/30 rounded text-xs font-bold transition-all"
          >
            💾 BACKUP JSON
          </button>
          <span className="text-[10px] bg-[#070a10] border border-slate-800/80 px-2.5 py-1 rounded text-teal-400 font-bold tabular-nums">
            WAL ACTIVE
          </span>
        </div>
      </div>

      {/* Painel de Saúde e Métricas do SQLite */}
      <DatabaseHealthPanel
        daysCount={days.length}
        tradesCount={trades.length}
        videosCount={videos.length}
        audiosCount={audios.length}
        imagesCount={images.length}
      />

      {/* Toolbar & Presets de Filtro */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0b1018] border border-slate-800/80 rounded-xl p-3 shadow-xl">
        <div className="flex items-center gap-1.5 text-xs">
          {[
            { id: 'all', label: 'TODOS OS REGISTROS' },
            { id: 'negative', label: 'DIAS / TRADES NEGATIVOS' },
            { id: 'unreviewed', label: 'SEM RETROSPECTIVA' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setActivePreset(p.id as any)}
              type="button"
              className={`px-3 py-1 rounded-md text-[10px] font-bold border transition-all ${
                activePreset === p.id
                  ? 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                  : 'bg-[#070a10] text-slate-500 border-slate-800/80 hover:text-slate-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filtrar por data, texto ou ativo…"
          className="bg-[#070a10] border border-slate-800/80 rounded px-3 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/60 font-mono w-full sm:w-64"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/80 bg-[#070a10] rounded-md p-1 gap-1 max-w-4xl text-xs font-mono">
        <button
          onClick={() => setActiveTab('days')}
          type="button"
          className={`flex-1 py-2 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'days' ? 'bg-[#0b1018] text-teal-400 border border-teal-500/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconScale width={14} height={14} className="text-teal-400" />
          <span>DIAS DE PREGÃO ({filteredDays.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('trades')}
          type="button"
          className={`flex-1 py-2 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'trades' ? 'bg-[#0b1018] text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconChart width={14} height={14} className="text-cyan-400" />
          <span>TRADES ({filteredTrades.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('videos')}
          type="button"
          className={`flex-1 py-2 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'videos' ? 'bg-[#0b1018] text-purple-400 border border-purple-500/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconVideo width={14} height={14} className="text-purple-400" />
          <span>VÍDEOS OBS ({videos.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audios')}
          type="button"
          className={`flex-1 py-2 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'audios' ? 'bg-[#0b1018] text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconMic width={14} height={14} className="text-amber-400" />
          <span>ÁUDIOS ({audios.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('images')}
          type="button"
          className={`flex-1 py-2 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'images' ? 'bg-[#0b1018] text-rose-400 border border-rose-500/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconCamera width={14} height={14} className="text-rose-400" />
          <span>PRINTS ({images.length})</span>
        </button>
      </div>

      {/* ABA 1: DIAS DE PREGÃO (COM EDIÇÃO INLINE DUPLO-CLIQUE) */}
      {activeTab === 'days' && (
        <div className="space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              TABELA DE DIAS · EDITÁVEL (DUPLO-CLIQUE EM UMA CÉLULA PARA EDITAR)
            </h2>
            <span className="text-[10px] text-slate-500 font-mono">
              CLIQUE NA LINHA PARA VER O INSPECTOR COMPLETO
            </span>
          </div>

          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl overflow-x-auto shadow-xl">
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead className="bg-[#070a10] text-slate-500 uppercase border-b border-slate-800/80 text-[10px] tracking-widest">
                <tr>
                  <th className="p-3">DATA</th>
                  <th className="p-3">RESULTADO (R$)</th>
                  <th className="p-3">PONTOS</th>
                  <th className="p-3">VIÉS</th>
                  <th className="p-3">WAKE TIME</th>
                  <th className="p-3">SONO</th>
                  <th className="p-3">ESTADO MENTAL</th>
                  <th className="p-3">FRASE HONESTA</th>
                  <th className="p-3">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredDays.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setExpandedDay(d)}
                    className="hover:bg-white/[0.03] cursor-pointer transition-all"
                  >
                    <td className="p-3 font-bold text-teal-400">{d.date}</td>
                    <td className={`p-3 font-bold ${(d.totalReais || 0) >= 0 ? 'text-teal-400' : 'text-rose-400'}`} onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={d.id} target="day" field="totalReais" value={d.totalReais} type="number" />
                    </td>
                    <td className={`p-3 font-bold ${(d.totalPoints || 0) >= 0 ? 'text-teal-400' : 'text-rose-400'}`} onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={d.id} target="day" field="totalPoints" value={d.totalPoints} type="number" />
                    </td>
                    <td className="p-3 uppercase text-slate-300 font-bold" onClick={(e) => e.stopPropagation()}>
                      <InlineCell
                        id={d.id}
                        target="day"
                        field="generalBias"
                        value={d.generalBias}
                        type="select"
                        options={[
                          { value: 'alta', label: 'ALTA' },
                          { value: 'baixa', label: 'BAIXA' },
                          { value: 'indefinido', label: 'INDEFINIDO' },
                        ]}
                      />
                    </td>
                    <td className="p-3 text-slate-400" onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={d.id} target="day" field="wakeUpTime" value={d.wakeUpTime} />
                    </td>
                    <td className="p-3 text-slate-400" onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={d.id} target="day" field="sleepQuality" value={d.sleepQuality} type="number" />
                    </td>
                    <td className="p-3 text-slate-300 truncate max-w-[140px] font-sans" title={d.mentalState || ''} onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={d.id} target="day" field="mentalState" value={d.mentalState} />
                    </td>
                    <td className="p-3 text-slate-300 truncate max-w-[160px] font-sans" title={d.honestPhrase || ''} onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={d.id} target="day" field="honestPhrase" value={d.honestPhrase} />
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      {confirmDayId === d.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={async () => {
                              setDeletingId(d.id);
                              setConfirmDayId(null);
                              try {
                                await deleteTradingDayAction(d.id);
                                setDays(days.filter(day => day.id !== d.id));
                                router.refresh();
                              } finally {
                                setDeletingId(null);
                              }
                            }}
                            type="button"
                            className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold"
                          >
                            SIM
                          </button>
                          <button
                            onClick={() => setConfirmDayId(null)}
                            type="button"
                            className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-bold"
                          >
                            NÃO
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDayId(d.id)}
                          type="button"
                          className="px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold"
                        >
                          DEL
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 2: TRADES (COM EDIÇÃO INLINE DUPLO-CLIQUE) */}
      {activeTab === 'trades' && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">TABELA DE TRADES · EDITÁVEL (DUPLO-CLIQUE EM UMA CÉLULA PARA EDITAR)</h2>

          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl overflow-x-auto shadow-xl">
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead className="bg-[#070a10] text-slate-500 uppercase border-b border-slate-800/80 text-[10px] tracking-widest">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">ATIVO</th>
                  <th className="p-3">HORÁRIO</th>
                  <th className="p-3">LADO</th>
                  <th className="p-3">QTD</th>
                  <th className="p-3">ENTRADA</th>
                  <th className="p-3">SAÍDA</th>
                  <th className="p-3">PONTOS</th>
                  <th className="p-3">REAIS (R$)</th>
                  <th className="p-3">ESTRATÉGIA</th>
                  <th className="p-3">AÇÃO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {filteredTrades.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setExpandedTrade(t)}
                    className="hover:bg-white/[0.03] cursor-pointer transition-all"
                  >
                    <td className="p-3 font-bold text-slate-400">#{t.tradeNumber}</td>
                    <td className="p-3 font-bold text-slate-200" onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={t.id} target="trade" field="instrument" value={t.instrument} />
                    </td>
                    <td className="p-3 text-slate-500">{t.openTime}</td>
                    <td className="p-3 font-bold" onClick={(e) => e.stopPropagation()}>
                      <InlineCell
                        id={t.id}
                        target="trade"
                        field="side"
                        value={t.side}
                        type="select"
                        options={[
                          { value: 'C', label: 'BUY' },
                          { value: 'V', label: 'SELL' },
                        ]}
                      />
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={t.id} target="trade" field="contracts" value={t.contracts} type="number" />
                    </td>
                    <td className="p-3 text-slate-300" onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={t.id} target="trade" field="entryPrice" value={t.entryPrice} type="number" />
                    </td>
                    <td className="p-3 text-slate-300" onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={t.id} target="trade" field="exitPrice" value={t.exitPrice} type="number" />
                    </td>
                    <td className={`p-3 font-bold ${(t.points || 0) >= 0 ? 'text-teal-400' : 'text-rose-400'}`} onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={t.id} target="trade" field="points" value={t.points} type="number" />
                    </td>
                    <td className={`p-3 font-bold ${(t.reais || 0) >= 0 ? 'text-teal-400' : 'text-rose-400'}`} onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={t.id} target="trade" field="reais" value={t.reais} type="number" />
                    </td>
                    <td className="p-3 text-cyan-400 font-bold" onClick={(e) => e.stopPropagation()}>
                      <InlineCell id={t.id} target="trade" field="strategy" value={t.strategy} />
                    </td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDeleteTrade(t.id)}
                        disabled={deletingId === t.id}
                        type="button"
                        className="px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[9px] font-bold"
                      >
                        DEL
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 3: VÍDEOS OBS */}
      {activeTab === 'videos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              REGISTROS DE VÍDEO DO OBS REPLAY
            </h2>
            <span className="text-[10px] text-slate-500 font-mono">LOCATION: data/videos/</span>
          </div>

          {videos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {videos.map((vid) => (
                <div key={vid.id} className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-xs font-bold text-slate-200 truncate max-w-[240px] flex items-center gap-2">
                      <IconVideo className="text-purple-400" />
                      {vid.filename}
                    </span>
                    <button
                      onClick={() => handleDeleteVideo(vid.id)}
                      disabled={deletingId === vid.id}
                      type="button"
                      className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded font-mono text-[10px] font-bold transition-all"
                    >
                      {deletingId === vid.id ? 'EXCLUINDO…' : 'DELETAR'}
                    </button>
                  </div>

                  <div className="aspect-video bg-[#070a10] rounded-md overflow-hidden border border-slate-800/80">
                    <video src={`/api/files/${vid.filePath}`} controls className="w-full h-full object-contain" />
                  </div>

                  <div className="text-[10px] font-mono text-slate-400 space-y-0.5 tabular-nums">
                    <p>CAMINHO: <span className="text-slate-300">{vid.filePath}</span></p>
                    <p>DURAÇÃO: <span className="text-teal-400">{vid.durationSecs || 0}s</span> | RES: <span className="text-teal-400">{vid.resolution || '1920x1080'}</span></p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-[#0b1018] border border-slate-800/80 rounded-xl">
              <p className="text-xs text-slate-500 font-mono uppercase">NENHUM VÍDEO DO OBS CADASTRADO NO BANCO DE DADOS.</p>
            </div>
          )}
        </div>
      )}

      {/* ABA 4: ÁUDIOS */}
      {activeTab === 'audios' && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">REGISTROS DE ÁUDIO & TRANSCRIÇÕES</h2>

          <div className="space-y-3">
            {audios.map((a) => (
              <div key={a.id} className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-2 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <IconMic className="text-amber-400" />
                    {a.filePath}
                  </span>
                  <button
                    onClick={() => handleDeleteAudio(a.id)}
                    disabled={deletingId === a.id}
                    type="button"
                    className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold"
                  >
                    DELETAR
                  </button>
                </div>

                <audio src={`/api/files/${a.filePath}`} controls className="w-full h-8" />
                <p className="text-xs text-slate-300 font-sans italic bg-[#070a10] p-2.5 rounded-md border border-slate-800/80">
                  "{a.transcription || 'Sem transcrição'}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABA 5: IMAGENS */}
      {activeTab === 'images' && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">SCREENSHOTS DE TRADES</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {images.map((img) => (
              <div key={img.id} className="bg-[#0b1018] border border-slate-800/80 rounded-lg p-2 space-y-2 relative group">
                <img src={`/api/files/${img.filePath}`} alt="Screenshot" className="w-full h-32 object-cover rounded-md border border-slate-800/80" />
                <button
                  onClick={() => handleDeleteImage(img.id)}
                  type="button"
                  className="absolute top-3 right-3 bg-rose-600 hover:bg-rose-500 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-md"
                >
                  DEL
                </button>
                <p className="text-[9px] font-mono text-slate-400 truncate">{img.caption || img.filePath}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DRAWER INSPECTOR PARA DIA DE PREGÃO */}
      {expandedDay && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 font-mono">
          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in">
            <div className="p-3.5 bg-[#070a10] border-b border-slate-800/80 flex items-center justify-between">
              <span className="text-xs font-bold text-teal-400">INSPECTOR DE REGISTROS DE PREGÃO · {expandedDay.date}</span>
              <button onClick={() => setExpandedDay(null)} type="button" className="text-slate-400 hover:text-slate-200 text-sm">✕</button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 text-xs flex-1 font-sans">
              <div className="bg-[#070a10] p-3 rounded-md border border-slate-800/80 space-y-1 font-mono">
                <span className="text-[9px] text-teal-400 uppercase font-bold block">PRÉ-MARKET & CONTEXTO</span>
                <p><strong>Wake Time:</strong> {expandedDay.wakeUpTime || 'N/A'}</p>
                <p><strong>Qualidade do Sono:</strong> {expandedDay.sleepQuality ? `${expandedDay.sleepQuality}/5` : 'N/A'}</p>
                <p><strong>Viés Pré-Abertura:</strong> {expandedDay.generalBias || 'N/A'}</p>
                <p><strong>Estado Mental:</strong> {expandedDay.mentalState || 'N/A'}</p>
              </div>

              {expandedDay.personalNote && (
                <div className="bg-[#070a10] p-3 rounded-md border border-slate-800/80 space-y-1">
                  <span className="text-[9px] text-slate-400 uppercase font-mono font-bold block">NOTA PESSOAL</span>
                  <p className="text-slate-200">{expandedDay.personalNote}</p>
                </div>
              )}

              {expandedDay.honestPhrase && (
                <div className="bg-[#070a10] p-3 rounded-md border border-slate-800/80 space-y-1">
                  <span className="text-[9px] text-rose-400 uppercase font-mono font-bold block">FRASE BRUTALMENTE HONESTA</span>
                  <p className="text-rose-300 font-mono">"{expandedDay.honestPhrase}"</p>
                </div>
              )}

              {expandedDay.retrospective && (
                <div className="bg-[#070a10] p-3 rounded-md border border-slate-800/80 space-y-1">
                  <span className="text-[9px] text-teal-400 uppercase font-mono font-bold block">DEBRIEF & RETROSPECTIVA</span>
                  <pre className="text-slate-200 font-mono text-[11px] whitespace-pre-wrap">{expandedDay.retrospective}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DRAWER INSPECTOR PARA TRADE */}
      {expandedTrade && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 font-mono">
          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in">
            <div className="p-3.5 bg-[#070a10] border-b border-slate-800/80 flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400">INSPECTOR DE TRADE #{expandedTrade.tradeNumber} · {expandedTrade.instrument}</span>
              <button onClick={() => setExpandedTrade(null)} type="button" className="text-slate-400 hover:text-slate-200 text-sm">✕</button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 text-xs flex-1 font-mono">
              <div className="grid grid-cols-2 gap-2 bg-[#070a10] p-3 rounded-md border border-slate-800/80">
                <p><strong>Lado:</strong> {expandedTrade.side === 'C' ? 'Compra' : 'Venda'}</p>
                <p><strong>Contratos:</strong> {expandedTrade.contracts}</p>
                <p><strong>Entrada:</strong> {expandedTrade.entryPrice}</p>
                <p><strong>Saída:</strong> {expandedTrade.exitPrice}</p>
                <p><strong>Pontos:</strong> {expandedTrade.points} pts</p>
                <p><strong>Resultado R$:</strong> R$ {expandedTrade.reais?.toFixed(2)}</p>
              </div>

              {expandedTrade.strategy && (
                <div className="bg-[#070a10] p-3 rounded-md border border-slate-800/80">
                  <span className="text-[9px] text-cyan-400 uppercase font-bold block">ESTRATÉGIA / SETUP</span>
                  <p>{expandedTrade.strategy}</p>
                </div>
              )}

              {expandedTrade.whatISawNow && (
                <div className="bg-[#070a10] p-3 rounded-md border border-slate-800/80">
                  <span className="text-[9px] text-slate-400 uppercase font-bold block">O QUE VI NA HORA</span>
                  <p className="font-sans text-slate-200">{expandedTrade.whatISawNow}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DatabaseClientView;
