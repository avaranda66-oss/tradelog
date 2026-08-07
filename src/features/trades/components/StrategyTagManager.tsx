'use client';

import { useState } from 'react';

export function StrategyTagManager() {
  const [tags, setTags] = useState<string[]>([
    '#Rompimento',
    '#Pullback',
    '#VWAP',
    '#GEXZeroGamma',
    '#FundoDuplo',
  ]);
  const [newTag, setNewTag] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  function handleAddTag() {
    if (!newTag.trim()) return;
    const formatted = newTag.startsWith('#') ? newTag.trim() : `#${newTag.trim()}`;
    if (!tags.includes(formatted)) {
      setTags([...tags, formatted]);
    }
    setNewTag('');
    setIsAdding(false);
  }

  function handleRemoveTag(tagToRemove: string) {
    setTags(tags.filter(t => t !== tagToRemove));
  }

  return (
    <div className="bg-[#0d131f] border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-xl">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">
          🏷️ TAGS DE ESTRATÉGIA E CONTEXTO DO DIA
        </span>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="text-xs text-emerald-400 hover:underline font-medium"
        >
          {isAdding ? 'Cancelar' : '+ Adicionar Tag'}
        </button>
      </div>

      {/* Input para nova Tag */}
      {isAdding && (
        <div className="flex items-center gap-2 bg-slate-950/60 p-2 rounded-xl border border-slate-800 animate-in fade-in">
          <input
            type="text"
            placeholder="Ex: #Rompimento"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); }}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-mono"
          />
          <button
            onClick={handleAddTag}
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
              className="text-slate-500 group-hover:text-rose-400 transition-colors text-[10px] font-bold"
              title="Remover tag"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
