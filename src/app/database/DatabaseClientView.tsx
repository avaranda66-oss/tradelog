'use client';

import { useState } from 'react';
import type { TradingDay, Trade, TradeImage, AudioRecord, VideoRecord } from '@/lib/db/schema';
import { deleteVideoRecord } from '@/features/video/actions';
import { deleteAudioRecord } from '@/features/audio/actions';
import { deleteTradeImage } from '@/features/images/actions';
import { deleteTrade, deleteTradingDayAction } from '@/features/trades/actions';
import { useRouter } from 'next/navigation';
import { IconScale, IconVideo, IconChart, IconMic, IconCamera, IconAlert, IconCheck } from '@/components/ui/icons';

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
  const [activeTab, setActiveTab] = useState<'videos' | 'trades' | 'audios' | 'images' | 'days'>('videos');
  const [videos, setVideos] = useState(initialVideos);
  const [audios, setAudios] = useState(initialAudios);
  const [images, setImages] = useState(initialImages);
  const [trades, setTrades] = useState(initialTrades);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDayId, setConfirmDayId] = useState<string | null>(null);
  const [days, setDays] = useState(initialDays);

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

  return (
    <div className="max-w-[1440px] mx-auto space-y-5 pb-16 animate-in fade-in font-mono">
      {/* Header Datalog Command */}
      <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconScale className="text-teal-400" />
          <div>
            <h1 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-[0.2em]">
              SQLITE LOCAL DATABASE INTAKE // DATALOG ENGINE
            </h1>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              Gerenciamento estrito de tabelas SQLite e diretórios locais (data/)
            </p>
          </div>
        </div>

        <span className="text-[10px] bg-[#070a10] border border-slate-800/80 px-2.5 py-1 rounded text-slate-400 font-bold tabular-nums">
          SYSTEM ACTIVE
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/80 bg-[#070a10] rounded-md p-1 gap-1 max-w-3xl text-xs font-mono">
        <button
          onClick={() => setActiveTab('videos')}
          type="button"
          className={`flex-1 py-2 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'videos' ? 'bg-[#0b1018] text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconVideo width={14} height={14} className="text-cyan-400" />
          <span>VÍDEOS OBS ({videos.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('trades')}
          type="button"
          className={`flex-1 py-2 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'trades' ? 'bg-[#0b1018] text-teal-400 border border-teal-500/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconChart width={14} height={14} className="text-teal-400" />
          <span>TRADES ({trades.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audios')}
          type="button"
          className={`flex-1 py-2 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'audios' ? 'bg-[#0b1018] text-purple-400 border border-purple-500/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconMic width={14} height={14} className="text-purple-400" />
          <span>ÁUDIOS ({audios.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('images')}
          type="button"
          className={`flex-1 py-2 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'images' ? 'bg-[#0b1018] text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconCamera width={14} height={14} className="text-amber-400" />
          <span>PRINTS ({images.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('days')}
          type="button"
          className={`flex-1 py-2 rounded font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'days' ? 'bg-[#0b1018] text-slate-200 border border-slate-700' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <IconScale width={14} height={14} className="text-slate-300" />
          <span>DIAS ({days.length})</span>
        </button>
      </div>

      {/* ABA 1: VÍDEOS OBS */}
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
                      <IconVideo className="text-cyan-400" />
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

                  {/* Player HTML5 */}
                  <div className="aspect-video bg-[#070a10] rounded-md overflow-hidden border border-slate-800/80">
                    <video
                      src={`/api/files/${vid.filePath}`}
                      controls
                      className="w-full h-full object-contain"
                    />
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

      {/* ABA 2: TRADES */}
      {activeTab === 'trades' && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">TABELA DE TRADES (SQLITE TRADES TABLE)</h2>

          <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl overflow-x-auto shadow-xl">
            <table className="w-full text-left text-xs font-mono tabular-nums">
              <thead className="bg-[#070a10] text-slate-500 uppercase border-b border-slate-800/80 text-[10px] tracking-widest">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">ATIVO</th>
                  <th className="p-3">HORÁRIO</th>
                  <th className="p-3">LADO</th>
                  <th className="p-3">QTD</th>
                  <th className="p-3">PONTOS</th>
                  <th className="p-3">REAIS (R$)</th>
                  <th className="p-3">AÇÃO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {trades.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.02]">
                    <td className="p-3 font-bold text-slate-400">#{t.tradeNumber}</td>
                    <td className="p-3 font-bold text-slate-200">{t.instrument}</td>
                    <td className="p-3 text-slate-500">{t.openTime}</td>
                    <td className="p-3 font-bold">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] border ${t.side === 'C' ? 'bg-teal-500/10 text-teal-400 border-teal-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}>
                        {t.side === 'C' ? 'BUY' : 'SELL'}
                      </span>
                    </td>
                    <td className="p-3">{t.contracts}</td>
                    <td className={`p-3 font-bold ${(t.points || 0) >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                      {t.points} pts
                    </td>
                    <td className={`p-3 font-bold ${(t.reais || 0) >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                      R$ {t.reais?.toFixed(2)}
                    </td>
                    <td className="p-3">
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

      {/* ABA 3: ÁUDIOS */}
      {activeTab === 'audios' && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">REGISTROS DE ÁUDIO & TRANSCRIÇÕES</h2>

          <div className="space-y-3">
            {audios.map((a) => (
              <div key={a.id} className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-2 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <IconMic className="text-purple-400" />
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

      {/* ABA 4: IMAGENS */}
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

      {/* ABA 5: DIAS */}
      {activeTab === 'days' && (
        <div className="space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">DIAS DE PREGÃO CADASTRADOS NO BANCO</h2>
            <span className="text-[10px] text-slate-500 font-mono">
              AVISO: Deletar um dia remove todos os seus dados associados.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {days.map((d) => (
              <div key={d.id} className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-3.5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="text-xs font-bold text-teal-400 font-mono tabular-nums">{d.date}</span>

                  {confirmDayId === d.id ? (
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
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
                        disabled={deletingId === d.id}
                        type="button"
                        className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold transition-all"
                      >
                        {deletingId === d.id ? '…' : 'CONFIRMAR'}
                      </button>
                      <button
                        onClick={() => setConfirmDayId(null)}
                        type="button"
                        className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded font-bold transition-all"
                      >
                        CANCELAR
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDayId(d.id)}
                      type="button"
                      className="px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold transition-all"
                    >
                      DELETAR DIA
                    </button>
                  )}
                </div>

                <div className="text-[10px] text-slate-300 font-mono space-y-1 bg-[#070a10] p-2 rounded-md border border-slate-800/80 tabular-nums">
                  <p>
                    RESULTADO: <span className={`font-bold ${(d.totalReais || 0) >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                      R$ {d.totalReais?.toFixed(2) || '0.00'}
                    </span> | PTS: <span className={`font-bold ${(d.totalPoints || 0) >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                      {d.totalPoints || 0}
                    </span>
                  </p>
                  <p className="text-slate-500">
                    VIÉS: {d.generalBias || 'N/A'} | PRE-MARKET: {d.preMarketDone ? 'DONE' : 'PENDING'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DatabaseClientView;
