'use client';

import { useState } from 'react';
import type { TradingDay, Trade, TradeImage, AudioRecord, VideoRecord } from '@/lib/db/schema';
import { deleteVideoRecord } from '@/features/video/actions';
import { deleteAudioRecord } from '@/features/audio/actions';
import { deleteTradeImage } from '@/features/images/actions';
import { deleteTrade, deleteTradingDayAction } from '@/features/trades/actions';
import { useRouter } from 'next/navigation';

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
    <div className="max-w-[1440px] mx-auto space-y-6 pb-16 animate-in fade-in">
      {/* Header Datalog */}
      <div className="border-b border-slate-800/80 pb-4">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          💾 Frontend do Banco de Dados & Datalog
        </h1>
        <p className="text-xs text-slate-500 mt-0.5 font-mono">
          Gerenciador completo dos arquivos locais (`data/`) e registros SQLite
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-[#0d131f] rounded-2xl p-1 gap-1 max-w-3xl font-mono text-xs">
        <button
          onClick={() => setActiveTab('videos')}
          className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'videos' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>🎬</span> Vídeos OBS ({videos.length})
        </button>

        <button
          onClick={() => setActiveTab('trades')}
          className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'trades' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>📊</span> Trades ({trades.length})
        </button>

        <button
          onClick={() => setActiveTab('audios')}
          className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'audios' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>🎙️</span> Áudios ({audios.length})
        </button>

        <button
          onClick={() => setActiveTab('images')}
          className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'images' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>🖼️</span> Screenshots ({images.length})
        </button>

        <button
          onClick={() => setActiveTab('days')}
          className={`flex-1 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'days' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>📅</span> Dias ({days.length})
        </button>
      </div>

      {/* ABA 1: VÍDEOS OBS */}
      {activeTab === 'videos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200">
              Vídeos do OBS Processados
            </h2>
            <span className="text-xs text-slate-500 font-mono">Diretório: data/videos/</span>
          </div>

          {videos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {videos.map((vid) => (
                <div key={vid.id} className="bg-[#0d131f] border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 truncate max-w-[240px]">
                      📹 {vid.filename}
                    </span>
                    <button
                      onClick={() => handleDeleteVideo(vid.id)}
                      disabled={deletingId === vid.id}
                      className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold transition-all"
                    >
                      {deletingId === vid.id ? 'Excluindo...' : '🗑️ Deletar'}
                    </button>
                  </div>

                  {/* Player HTML5 */}
                  <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
                    <video
                      src={`/api/files/${vid.filePath}`}
                      controls
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 space-y-1">
                    <p>Caminho: <span className="text-slate-200">{vid.filePath}</span></p>
                    <p>Duração: <span className="text-cyan-400">{vid.durationSecs || 0}s</span> | Resolução: <span className="text-cyan-400">{vid.resolution || '1920x1080'}</span></p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic p-6 text-center bg-[#0d131f] border border-slate-800 rounded-2xl">
              Nenhum vídeo do OBS cadastrado no banco.
            </p>
          )}
        </div>
      )}

      {/* ABA 2: TRADES */}
      {activeTab === 'trades' && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-200">Trades no Banco SQLite</h2>

          <div className="bg-[#0d131f] border border-slate-800 rounded-2xl overflow-x-auto shadow-xl">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Ativo</th>
                  <th className="p-3">Abertura</th>
                  <th className="p-3">Lado</th>
                  <th className="p-3">Contratos</th>
                  <th className="p-3">Pontos</th>
                  <th className="p-3">Resultado R$</th>
                  <th className="p-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {trades.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-900/40">
                    <td className="p-3 font-bold">{t.tradeNumber}</td>
                    <td className="p-3 font-bold text-emerald-400">{t.instrument}</td>
                    <td className="p-3 text-slate-400">{t.openTime}</td>
                    <td className="p-3 font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${t.side === 'C' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {t.side === 'C' ? 'COMPRA' : 'VENDA'}
                      </span>
                    </td>
                    <td className="p-3">{t.contracts}</td>
                    <td className={`p-3 font-bold ${(t.points || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.points} pts
                    </td>
                    <td className={`p-3 font-bold ${(t.reais || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      R$ {t.reais?.toFixed(2)}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => handleDeleteTrade(t.id)}
                        disabled={deletingId === t.id}
                        className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold"
                      >
                        🗑️
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
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-200">Áudios & Transcrições</h2>

          <div className="space-y-3">
            {audios.map((a) => (
              <div key={a.id} className="bg-[#0d131f] border border-slate-800 rounded-2xl p-4 space-y-2 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    🎙️ {a.filePath}
                  </span>
                  <button
                    onClick={() => handleDeleteAudio(a.id)}
                    disabled={deletingId === a.id}
                    className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold"
                  >
                    🗑️ Deletar
                  </button>
                </div>

                <audio src={`/api/files/${a.filePath}`} controls className="w-full h-8" />
                <p className="text-xs text-slate-300 italic bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  "{a.transcription || 'Sem transcrição'}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABA 4: IMAGENS */}
      {activeTab === 'images' && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-200">Screenshots dos Trades</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {images.map((img) => (
              <div key={img.id} className="bg-[#0d131f] border border-slate-800 rounded-xl p-2 space-y-2 relative group">
                <img src={`/api/files/${img.filePath}`} alt="Screenshot" className="w-full h-32 object-cover rounded-lg" />
                <button
                  onClick={() => handleDeleteImage(img.id)}
                  className="absolute top-3 right-3 bg-rose-500 text-white p-1 rounded-lg text-xs font-bold opacity-80 hover:opacity-100"
                >
                  🗑️
                </button>
                <p className="text-[10px] text-slate-400 truncate">{img.caption || img.filePath}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABA 5: DIAS */}
      {activeTab === 'days' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200">Dias de Operação Cadastrados</h2>
            <span className="text-xs text-slate-500 font-mono">
              ⚠️ Deletar um dia remove TODOS os trades, áudios, vídeos e screenshots daquele dia
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {days.map((d) => (
              <div key={d.id} className="bg-[#0d131f] border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-emerald-400 font-mono">📅 {d.date}</span>

                  {confirmDayId === d.id ? (
                    <div className="flex items-center gap-2 animate-in fade-in">
                      <span className="text-[10px] text-rose-400 font-bold">TEM CERTEZA?</span>
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
                        className="px-2.5 py-1 bg-rose-500 hover:bg-rose-400 text-white rounded-lg text-[10px] font-bold transition-all"
                      >
                        {deletingId === d.id ? '⏳ Excluindo...' : '✅ SIM, DELETAR TUDO'}
                      </button>
                      <button
                        onClick={() => setConfirmDayId(null)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold transition-all"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDayId(d.id)}
                      className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                    >
                      🗑️ Deletar Dia
                    </button>
                  )}
                </div>

                <div className="text-xs text-slate-300 font-mono space-y-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                  <p>
                    Resultado: <span className={`font-bold ${(d.totalReais || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      R$ {d.totalReais?.toFixed(2) || '0.00'}
                    </span> | Pontos: <span className={`font-bold ${(d.totalPoints || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {d.totalPoints || 0}
                    </span>
                  </p>
                  <p className="text-slate-500">
                    Viés: {d.generalBias || 'N/A'} | Pré-Market: {d.preMarketDone ? '✅' : '❌'}
                  </p>
                </div>

                {confirmDayId === d.id && (
                  <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-2.5 text-[11px] text-rose-300 animate-in fade-in">
                    ⚠️ <strong>Esta ação é irreversível.</strong> Serão removidos permanentemente: todos os trades, screenshots de trades, áudios/transcrições, vídeos do OBS e níveis-chave do dia <strong>{d.date}</strong>.
                  </div>
                )}
              </div>
            ))}
          </div>

          {days.length === 0 && (
            <p className="text-xs text-slate-500 italic p-6 text-center bg-[#0d131f] border border-slate-800 rounded-2xl">
              Nenhum dia de operação cadastrado no banco.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
