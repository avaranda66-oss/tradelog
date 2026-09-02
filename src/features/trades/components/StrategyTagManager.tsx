'use client';

import { useState, useEffect } from 'react';
import type { AudioRecord } from '@/lib/db/schema';
import { saveTradingDayTags } from '@/app/database/actions';

interface StrategyTagManagerProps {
  date: string;
  initialTags?: string[];
  audios?: AudioRecord[];
}

const DEFAULT_TAGS = [
  '#Rompimento',
  '#Pullback',
  '#VWAP',
  '#GEXZeroGamma',
  '#FundoDuplo',
];

/**
 * Extrai tags de contexto/estratégia a partir das transcrições de áudio do dia
 */

export function extractTagsFromAudios(audios?: AudioRecord[]): string[] {
  if (!audios || audios.length === 0) return [];
  
  const textContent = audios
    .map(a => `${a.transcription || ''} ${a.insights || ''}`)
    .join(' ')
    .toLowerCase();

  if (!textContent.trim()) return [];

  const dictionary: Record<string, string> = {
    'lateralidade': '#Lateralidade',
    'lateral': '#Lateralidade',
    'consolidação': '#Consolidação',
    'consolidacao': '#Consolidação',
    'tendência': '#Tendência',
    'tendencia': '#Tendência',
    'rompimento': '#Rompimento',
    'pullback': '#Pullback',
    'vwap': '#VWAP',
    'gex': '#GEX',
    'zero gamma': '#GEXZeroGamma',
    'zerogamma': '#GEXZeroGamma',
    'fundo duplo': '#FundoDuplo',
    'topo duplo': '#TopoDuplo',
    'reversão': '#Reversão',
    'reversao': '#Reversão',
    'scalp': '#Scalp',
    'momentum': '#Momentum',
    'abertura': '#Abertura',
    'fechamento': '#Fechamento',
    'absorção': '#Absorção',
    'absorcao': '#Absorção',
    'exaustão': '#Exaustão',
    'exaustao': '#Exaustão',
    'volume': '#Volume',
    'suporte': '#Suporte',
    'resistência': '#Resistência',
    'resistencia': '#Resistência',
    'pivô': '#Pivot',
    'pivo': '#Pivot',
    'pivot': '#Pivot',
    'stop': '#StopTécnico',
    'fomo': '#FOMO',
    'revenge': '#RevengeTrade',
    'ansiedade': '#Ansiedade',
    'disciplina': '#Disciplina',
    'adr': '#RegiãoADR',
  };

  const found = new Set<string>();
  for (const [key, hashtag] of Object.entries(dictionary)) {
    if (textContent.includes(key)) {
      found.add(hashtag);
    }
  }

  return Array.from(found);
}

export function StrategyTagManager({ date, initialTags, audios = [] }: StrategyTagManagerProps) {
  const [tags, setTags] = useState<string[]>(() => {
    if (initialTags && Array.isArray(initialTags) && initialTags.length > 0) {
      return initialTags;
    }
    return DEFAULT_TAGS;
  });

  const [newTag, setNewTag] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractedMsg, setExtractedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialTags && Array.isArray(initialTags)) {
      setTags(initialTags);
    }
  }, [date, initialTags]);

  async function persistTags(updatedTags: string[]) {
    setTags(updatedTags);
    setIsSaving(true);
    try {
      await saveTradingDayTags(date, updatedTags);
    } catch (err) {
      console.error('Erro ao salvar tags:', err);
    } finally {
      setIsSaving(false);
    }
  }

  function handleAddTag() {
    if (!newTag.trim()) return;
    const formatted = newTag.startsWith('#') ? newTag.trim() : `#${newTag.trim()}`;
    if (!tags.includes(formatted)) {
      const updated = [...tags, formatted];
      persistTags(updated);
    }
    setNewTag('');
    setIsAdding(false);
  }

  function handleRemoveTag(tagToRemove: string) {
    const updated = tags.filter(t => t !== tagToRemove);
    persistTags(updated);
  }

  async function handleAutoExtract() {
    const extracted = extractTagsFromAudios(audios);
    if (extracted.length === 0) {
      setExtractedMsg('Nenhuma tag encontrada na transcrição.');
      setTimeout(() => setExtractedMsg(null), 3000);
      return;
    }

    const existingLower = tags.map(t => t.toLowerCase());
    const newExtracted = extracted.filter(t => !existingLower.includes(t.toLowerCase()));

    if (newExtracted.length === 0) {
      setExtractedMsg('Todas as tags da transcrição já foram adicionadas!');
      setTimeout(() => setExtractedMsg(null), 3000);
      return;
    }

    const merged = [...tags, ...newExtracted];
    await persistTags(merged);
    setExtractedMsg(`+${newExtracted.length} tag(s) extraída(s) da transcrição!`);
    setTimeout(() => setExtractedMsg(null), 3500);
  }

  return (
    <div className="bg-[#0d131f] border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-xl font-mono">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-bold block">
            🏷️ TAGS DE ESTRATÉGIA E CONTEXTO DO DIA
          </span>
          {isSaving && (
            <span className="text-[9px] text-amber-400 font-mono animate-pulse">
              [Salvando...]
            </span>
          )}
          {extractedMsg && (
            <span className="text-[10px] text-teal-400 font-mono bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 animate-in fade-in">
              {extractedMsg}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {audios.length > 0 && (
            <button
              onClick={handleAutoExtract}
              type="button"
              className="text-xs text-teal-400 hover:text-teal-300 font-medium flex items-center gap-1.5 bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 rounded-lg transition-all"
              title="Extrair tags faladas nas transcrições de voz do dia"
            >
              <span>⚡ Extrair da Transcrição</span>
            </button>
          )}

          <button
            onClick={() => setIsAdding(!isAdding)}
            type="button"
            className="text-xs text-emerald-400 hover:underline font-medium"
          >
            {isAdding ? 'Cancelar' : '+ Adicionar Tag'}
          </button>
        </div>
      </div>

      {/* Input para nova Tag */}
      {isAdding && (
        <div className="flex items-center gap-2 bg-slate-950/60 p-2 rounded-xl border border-slate-800 animate-in fade-in">
          <input
            type="text"
            placeholder="Ex: #Rompimento ou #Lateralidade"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); }}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono"
            autoFocus
          />
          <button
            onClick={handleAddTag}
            type="button"
            className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold hover:bg-emerald-500/30 transition-all"
          >
            Adicionar
          </button>
        </div>
      )}

      {/* Lista de Tags */}
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 rounded-xl text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 shadow-sm group"
          >
            <span>{tag}</span>
            <button
              onClick={() => handleRemoveTag(tag)}
              type="button"
              className="text-slate-500 group-hover:text-rose-400 transition-colors text-[10px] font-bold"
              title="Remover tag"
            >
              ✕
            </button>
          </span>
        ))}

        {tags.length === 0 && (
          <span className="text-xs text-slate-500 italic">
            Nenhuma tag adicionada para este dia. Clique acima em "+ Adicionar Tag" ou "⚡ Extrair da Transcrição".
          </span>
        )}
      </div>
    </div>
  );
}
