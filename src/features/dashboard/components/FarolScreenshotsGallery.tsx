'use client';

import { useState } from 'react';
import { deleteTradeImage } from '@/features/images/actions';

export interface FarolImage {
  id: string;
  filePath: string;
  imageType?: string | null;
  caption?: string | null;
  createdAt?: string | null;
}

interface FarolScreenshotsGalleryProps {
  images: FarolImage[];
  date: string;
}

interface FarolBatch {
  timeLabel: string;
  periodBadge: { text: string; color: string };
  timestampKey: number;
  images: FarolImage[];
}

function getPeriodBadge(timeStr: string): { text: string; color: string } {
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr || '12', 10);
  const min = parseInt(minStr || '0', 10);
  const timeVal = hour * 60 + min;

  if (timeVal < 9 * 60) {
    return { text: '🌅 PRÉ-MERCADO', color: 'bg-amber-500/10 text-amber-300 border-amber-500/30' };
  } else if (timeVal <= 10 * 60 + 30) {
    return { text: '🔔 ABERTURA B3', color: 'bg-teal-500/10 text-teal-300 border-teal-500/30' };
  } else if (timeVal <= 13 * 60) {
    return { text: '🇺🇸 ABERTURA NYSE', color: 'bg-blue-500/10 text-blue-300 border-blue-500/30' };
  } else if (timeVal < 17 * 60) {
    return { text: '📈 PREGÃO DA TARDE', color: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' };
  } else {
    return { text: '🏁 FECHAMENTO', color: 'bg-purple-500/10 text-purple-300 border-purple-500/30' };
  }
}

function extractTimeFromImage(img: FarolImage): { timeLabel: string; timeKey: number } {
  const captionMatch = img.caption?.match(/\((\d{2}:\d{2})\)/);
  if (captionMatch) {
    return { timeLabel: captionMatch[1], timeKey: 0 };
  }

  const fileMatch = img.filePath.match(/_(\d{2})(\d{2})(\d{2})\.png/);
  if (fileMatch) {
    return { timeLabel: `${fileMatch[1]}:${fileMatch[2]}`, timeKey: 0 };
  }

  if (img.createdAt) {
    try {
      const d = new Date(img.createdAt);
      const timeLabel = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return { timeLabel, timeKey: d.getTime() };
    } catch {}
  }

  return { timeLabel: 'Horário do Pregão', timeKey: 0 };
}

export function FarolScreenshotsGallery({ images, date }: FarolScreenshotsGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<FarolImage | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const [localImages, setLocalImages] = useState<FarolImage[]>(images);

  const farolImages = localImages.filter((img) =>
    img.imageType === 'farol-briefing' ||
    img.imageType === 'farol-gps' ||
    img.imageType === 'farol-gps-flow' ||
    img.imageType === 'farol-radar' ||
    (img.filePath.includes('/farol/') && !img.filePath.includes('gex'))
  );

  async function handleDelete(imageId: string) {
    setDeletingId(imageId);
    setLocalImages(prev => prev.filter(img => img.id !== imageId));
    if (selectedImage?.id === imageId) setSelectedImage(null);

    try {
      await deleteTradeImage(imageId);
    } catch (err) {
      console.error('Erro ao deletar print do farol:', err);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteBatch(batchImages: FarolImage[], batchLabel: string) {
    if (!confirm(`Deseja excluir todas as capturas das ${batchLabel}?`)) return;
    setDeletingBatch(batchLabel);
    const ids = batchImages.map(img => img.id);
    setLocalImages(prev => prev.filter(img => !ids.includes(img.id)));

    try {
      for (const id of ids) {
        await deleteTradeImage(id);
      }
    } catch (err) {
      console.error('Erro ao deletar lote do farol:', err);
    } finally {
      setDeletingBatch(null);
    }
  }

  if (farolImages.length === 0) {
    return null;
  }

  const batchesMap = new Map<string, FarolBatch>();
  for (const img of farolImages) {
    const { timeLabel, timeKey } = extractTimeFromImage(img);
    if (!batchesMap.has(timeLabel)) {
      batchesMap.set(timeLabel, {
        timeLabel,
        periodBadge: getPeriodBadge(timeLabel),
        timestampKey: timeKey,
        images: [],
      });
    }
    batchesMap.get(timeLabel)!.images.push(img);
  }

  const batches = Array.from(batchesMap.values()).sort((a, b) => b.timeLabel.localeCompare(a.timeLabel));

  const typeConfig: Record<string, { label: string; icon: string; badgeColor: string; order: number }> = {
    'farol-briefing': {
      label: 'BRIEFING DE MERCADO',
      icon: '📰',
      badgeColor: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      order: 1,
    },
    'farol-gps': {
      label: 'GPS DE MERCADO',
      icon: '🧭',
      badgeColor: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
      order: 2,
    },
    'farol-gps-flow': {
      label: 'GPS — FLUXO & PLAYERS',
      icon: '📈',
      badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      order: 2.5,
    },
    'farol-radar': {
      label: 'RADAR & COMMODITIES',
      icon: '📊',
      badgeColor: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      order: 3,
    },
  };

  return (
    <div className="space-y-4 pt-2 font-mono">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <span>📸</span>
          <span>HISTÓRICO DE CAPTURAS DO FAROL ({farolImages.length} PRINTS EM {batches.length} HORÁRIO{batches.length > 1 ? 'S' : ''})</span>
        </span>
        <span className="text-[9px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded font-bold">
          PLAYWRIGHT HD · SESSÕES ACUMULATIVAS
        </span>
      </div>

      {/* Lista de Blocos agrupados por Horário */}
      <div className="space-y-4">
        {batches.map((batch, batchIdx) => {
          const sortedBatchImages = [...batch.images].sort((a, b) => {
            const orderA = typeConfig[a.imageType || '']?.order || 99;
            const orderB = typeConfig[b.imageType || '']?.order || 99;
            return orderA - orderB;
          });

          return (
            <div
              key={batch.timeLabel || batchIdx}
              className="bg-[#05080e] border border-slate-800/90 rounded-2xl p-3.5 space-y-3 shadow-xl"
            >
              {/* Header do Lote de Horário */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span>🕒</span>
                    <span>CAPTURA DAS {batch.timeLabel}</span>
                  </span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${batch.periodBadge.color}`}>
                    {batch.periodBadge.text}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    ({sortedBatchImages.length} prints sincronizados)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteBatch(sortedBatchImages, batch.timeLabel)}
                  disabled={deletingBatch === batch.timeLabel}
                  className="text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer"
                  title="Excluir todas as capturas deste horário"
                >
                  <span>🗑️</span>
                  <span>{deletingBatch === batch.timeLabel ? 'Excluindo...' : 'Excluir Lote'}</span>
                </button>
              </div>

              {/* Grid das 3 telas deste horário (Briefing, GPS Completo com Scroll e Radar) */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${sortedBatchImages.length >= 4 ? '4' : '3'} gap-3`}>
                {sortedBatchImages.map((img, idx) => {
                  const config = typeConfig[img.imageType || ''] || {
                    label: 'SNAPSHOT FAROL',
                    icon: '📸',
                    badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
                    order: 99,
                  };

                  return (
                    <div
                      key={img.id || idx}
                      onClick={() => setSelectedImage(img)}
                      className="group relative bg-[#090e17] border border-slate-800/80 hover:border-teal-500/60 rounded-xl overflow-hidden shadow-md cursor-pointer transition-all duration-200 flex flex-col"
                    >
                      {/* Image Preview Container */}
                      <div className="relative aspect-[16/10] overflow-hidden bg-slate-950 flex items-center justify-center">
                        <img
                          src={`/api/files/${img.filePath.replace(/\\/g, '/')}?v=${img.id}`}
                          alt={img.caption || config.label}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                          <span className="text-sm">🔍</span>
                          <span className="text-[10px] font-bold text-teal-300 font-mono">
                            AMPLIAR {config.label}
                          </span>
                        </div>

                        {/* Badge Top Left */}
                        <div className={`absolute top-2 left-2 border backdrop-blur-md px-2 py-0.5 rounded text-[8px] font-bold font-mono flex items-center gap-1 ${config.badgeColor}`}>
                          <span>{config.icon}</span>
                          <span>{config.label}</span>
                        </div>
                      </div>

                      {/* Caption Footer */}
                      <div className="p-2 bg-[#080c14] border-t border-slate-800/60 flex items-center justify-between gap-1">
                        <span className="text-[10px] text-slate-300 font-sans truncate flex-1" title={img.caption || config.label}>
                          {img.caption || config.label}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(img.id);
                          }}
                          disabled={deletingId === img.id}
                          className="text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 px-1.5 py-0.5 rounded transition-colors shrink-0"
                          title="Deletar apenas este print"
                        >
                          {deletingId === img.id ? '...' : '🗑️'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal / Lightbox de Visualização em Alta Resolução com Scroll Vertical Completo */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-6xl w-full max-h-[94vh] bg-[#0b1018] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="p-3.5 bg-[#070a10] border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-200 font-bold tracking-wider uppercase flex items-center gap-2">
                <span>📸</span>
                <span>{selectedImage.caption || 'Farol do Mercado Snapshot'} · {date}</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleDelete(selectedImage.id)}
                  disabled={deletingId === selectedImage.id}
                  className="px-3 py-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  🗑️ {deletingId === selectedImage.id ? 'Deletando...' : 'Excluir Print'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="text-slate-400 hover:text-slate-200 text-lg px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Imagem em Tamanho Cheio com Scroll Completo de Cima a Baixo */}
            <div className="overflow-y-auto max-h-[84vh] p-4 flex flex-col items-center bg-black/90 space-y-4">
              <img
                src={`/api/files/${selectedImage.filePath.replace(/\\/g, '/')}?v=${selectedImage.id}`}
                alt="Snapshot ampliado do Farol do Mercado"
                className="w-full max-w-5xl h-auto object-contain rounded-lg shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FarolScreenshotsGallery;
