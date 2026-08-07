'use client';

import { useState } from 'react';
import { ALL_BADGES, evaluateBadgesStatus, type BadgeSpec } from '@/lib/gamification';
import type { TradingDay, Trade, AudioRecord } from '@/lib/db/schema';

interface BadgeMatrixWidgetProps {
  historyDays?: TradingDay[];
  currentDay?: TradingDay | null;
  allTrades?: Trade[];
  audios?: AudioRecord[];
}

export function BadgeMatrixWidget({
  historyDays = [],
  currentDay = null,
  allTrades = [],
  audios = [],
}: BadgeMatrixWidgetProps) {
  const [selectedBadge, setSelectedBadge] = useState<BadgeSpec | null>(null);
  const [filterRarity, setFilterRarity] = useState<'TODOS' | 'Lendário' | 'Raro' | 'Comum'>('TODOS');
  const [mousePosMap, setMousePosMap] = useState<Record<string, { x: number; y: number }>>({});

  const evaluatedBadges = evaluateBadgesStatus(historyDays, currentDay, allTrades, audios);

  const filtered = evaluatedBadges.filter(b => {
    if (filterRarity === 'TODOS') return true;
    return b.rarity === filterRarity;
  });

  const unlockedCount = evaluatedBadges.filter(b => b.unlocked).length;

  function handleMouseMove(id: string, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePosMap(prev => ({ ...prev, [id]: { x, y } }));
  }

  return (
    <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-5 space-y-4 shadow-2xl">
      {/* Header do Arquivo */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
                ARQUIVO DE CONQUISTAS OPERACIONAIS
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-slate-900 border border-slate-800 text-slate-400">
                {unlockedCount}/{ALL_BADGES.length} REGISTROS ATIVOS
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Auditoria de disciplina, gestão de risco e consistência institucional no WINFUT
            </p>
          </div>
        </div>

        {/* Filtro Discreto de Classificação */}
        <div className="flex items-center gap-1 font-mono text-[10px]">
          {(['TODOS', 'Lendário', 'Raro', 'Comum'] as const).map(rarity => (
            <button
              key={rarity}
              onClick={() => setFilterRarity(rarity)}
              className={`px-2.5 py-1 rounded-md border font-bold transition-all ${
                filterRarity === rarity
                  ? 'bg-slate-800 text-teal-400 border-slate-700'
                  : 'bg-slate-950 text-slate-500 border-slate-900 hover:text-slate-300'
              }`}
            >
              {rarity}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Selos Institucionais */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filtered.map(badge => {
          const isLegendary = badge.rarity === 'Lendário';
          const isRare = badge.rarity === 'Raro';
          const pos = mousePosMap[badge.id] || { x: 50, y: 50 };

          const borderStyle = badge.unlocked
            ? isLegendary
              ? 'border-amber-500/40 bg-amber-500/5 hover:border-amber-400'
              : isRare
              ? 'border-cyan-500/40 bg-cyan-500/5 hover:border-cyan-400'
              : 'border-teal-500/30 bg-teal-500/5 hover:border-teal-400'
            : 'border-slate-800/60 bg-slate-950/40 opacity-40 border-dashed hover:opacity-75';

          const badgeCodeColor = isLegendary
            ? 'text-amber-400 border-amber-500/30 bg-amber-950/40'
            : isRare
            ? 'text-cyan-400 border-cyan-500/30 bg-cyan-950/40'
            : 'text-slate-400 border-slate-800 bg-slate-900';

          return (
            <div
              key={badge.id}
              onMouseMove={(e) => handleMouseMove(badge.id, e)}
              onClick={() => setSelectedBadge(badge)}
              className={`p-3.5 rounded-lg border transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-2 group relative overflow-hidden ${borderStyle}`}
            >
              {/* Refined Spotlight Radial Gradient */}
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background: `radial-gradient(260px circle at ${pos.x}% ${pos.y}%, rgba(148, 163, 184, 0.055), rgba(45, 212, 191, 0.035) 38%, transparent 68%)`,
                }}
              />

              <div className="flex items-center justify-between font-mono text-[9px]">
                <span className={`font-bold px-1.5 py-0.5 rounded border uppercase ${badgeCodeColor}`}>
                  {badge.code}
                </span>

                <span className={badge.unlocked ? 'text-teal-400 font-bold' : 'text-slate-500 font-mono font-semibold'}>
                  {badge.unlocked
                    ? 'REGISTRO ATIVO'
                    : badge.progress
                    ? `${badge.progress.current}/${badge.progress.target} BLOQUEADO`
                    : 'PENDENTE'}
                </span>
              </div>

              {/* Ícone Vetorial */}
              <div className="flex items-center gap-2 pt-1">
                <BadgeVectorIcon iconType={badge.iconType} unlocked={badge.unlocked} rarity={badge.rarity} />
                <div>
                  <h4 className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">
                    {badge.name}
                  </h4>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed font-sans">
                {badge.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Modal de Registro Operacional da Conquista */}
      {selectedBadge && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#0b1018] border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setSelectedBadge(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-200 text-xs font-mono"
            >
              FECHAR ✕
            </button>

            <div className="flex items-center gap-3">
              <BadgeVectorIcon iconType={selectedBadge.iconType} unlocked={selectedBadge.unlocked} rarity={selectedBadge.rarity} size={36} />
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-teal-400 tracking-wider">
                  CLASSIFICAÇÃO {selectedBadge.code} // {selectedBadge.rarity}
                </span>
                <h3 className="text-base font-bold text-slate-100">{selectedBadge.name}</h3>
              </div>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase block font-bold">Critério Operacional</span>
                <p className="text-slate-300 font-sans text-xs">{selectedBadge.criterion}</p>
              </div>

              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase block font-bold">Descrição Técnica</span>
                <p className="text-slate-400 font-sans text-xs">{selectedBadge.description}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 font-mono text-[10px]">
              <span className={selectedBadge.unlocked ? 'text-teal-400 font-bold' : 'text-slate-500'}>
                STATUS: {selectedBadge.unlocked ? `CONQUISTADO // ${currentDay?.date || '06 AGO 2026'}` : 'PENDENTE DE REGISTRO'}
              </span>

              <button
                onClick={() => setSelectedBadge(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md font-bold transition-all"
              >
                ENTENDIDO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Renderiza o ícone vetorial de precisão SVG (1px / 1.25px stroke)
 */
function BadgeVectorIcon({ iconType, unlocked, rarity, size = 22 }: { iconType: string; unlocked?: boolean; rarity: string; size?: number }) {
  const strokeColor = unlocked
    ? rarity === 'Lendário'
      ? '#F59E0B'
      : rarity === 'Raro'
      ? '#06B6D4'
      : '#2DD4BF'
    : '#475569';

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {iconType === 'hexagon-diamond' && (
        <>
          <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke={strokeColor} strokeWidth="1.25" />
          <path d="M12 8L15 12L12 16L9 12L12 8Z" fill={unlocked ? strokeColor : 'none'} stroke={strokeColor} strokeWidth="1" />
        </>
      )}
      {iconType === 'horizon-sun' && (
        <>
          <circle cx="12" cy="12" r="8" stroke={strokeColor} strokeWidth="1.25" />
          <path d="M4 14H20" stroke={strokeColor} strokeWidth="1" strokeDasharray="2 2" />
        </>
      )}
      {iconType === 'shield-lines' && (
        <>
          <path d="M12 3L4 6V12C4 17 8 20 12 21C16 20 20 17 20 12V6L12 3Z" stroke={strokeColor} strokeWidth="1.25" />
          <path d="M8 10H16M9 13H15" stroke={strokeColor} strokeWidth="1" />
        </>
      )}
      {iconType === 'stop-guard' && (
        <>
          <rect x="5" y="5" width="14" height="14" rx="2" stroke={strokeColor} strokeWidth="1.25" />
          <path d="M12 8V16M8 12H16" stroke={strokeColor} strokeWidth="1" />
        </>
      )}
      {!['hexagon-diamond', 'horizon-sun', 'shield-lines', 'stop-guard'].includes(iconType) && (
        <>
          <rect x="4" y="4" width="16" height="16" rx="2" stroke={strokeColor} strokeWidth="1.25" />
          <circle cx="12" cy="12" r="3.5" fill={unlocked ? strokeColor : 'none'} stroke={strokeColor} strokeWidth="1" />
        </>
      )}
    </svg>
  );
}
