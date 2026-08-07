'use client';

import { useState, useEffect } from 'react';
import { getTags, createTag, deleteTag } from '@/features/tags/actions';

interface TagGroupSelectorProps {
  category: string; // "strategy" | "entry_type" | "emotion_pre" | "market_regime" | "day_phase" | "stop_type" | "emotion_post"
  label?: string;
  value: string; // ex: "Tendência | Abertura EUA" ou "Breakout"
  onChange: (newValue: string) => void;
  defaultOptions?: string[];
  isMulti?: boolean;
}

export function TagGroupSelector({
  category,
  label,
  value,
  onChange,
  defaultOptions = [],
  isMulti = true,
}: TagGroupSelectorProps) {
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Carrega tags da categoria do SQLite
  async function loadData() {
    setLoading(true);
    try {
      const data = await getTags(category);
      if (data && data.length > 0) {
        setTags(data);
      } else if (defaultOptions.length > 0) {
        setTags(defaultOptions.map((opt, i) => ({ id: `default_${i}`, name: opt })));
      }
    } catch (err) {
      console.error(`Erro ao carregar tags para ${category}:`, err);
      if (defaultOptions.length > 0) {
        setTags(defaultOptions.map((opt, i) => ({ id: `default_${i}`, name: opt })));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [category]);

  const selectedList = value
    ? value.split(/\s*\|\s*/).filter(Boolean)
    : [];

  function handleToggle(tagName: string) {
    if (!isMulti) {
      onChange(value === tagName ? '' : tagName);
      return;
    }

    if (selectedList.includes(tagName)) {
      const updated = selectedList.filter(s => s !== tagName).join(' | ');
      onChange(updated);
    } else {
      const updated = [...selectedList, tagName].join(' | ');
      onChange(updated);
    }
  }

  async function handleAddTag() {
    const name = newTagName.trim();
    if (!name) return;

    setCreating(true);
    setErrorMsg('');
    try {
      const created = await createTag(category, name);
      setTags(prev => [...prev, created]);
      setNewTagName('');
      handleToggle(created.name);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao adicionar opção');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteTag(id: string, name: string) {
    if (!confirm(`Deseja deletar "${name}" do banco SQLite?`)) return;

    try {
      if (!id.startsWith('default_')) {
        await deleteTag(id);
      }
      setTags(prev => prev.filter(t => t.id !== id));
      if (selectedList.includes(name)) {
        const updated = selectedList.filter(s => s !== name).join(' | ');
        onChange(updated);
      }
    } catch (err) {
      console.error('Erro ao deletar opção:', err);
    }
  }

  return (
    <div className="space-y-1.5 font-mono">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {label}
          </label>
        </div>
      )}

      {/* Grid de Pílulas com Multi-Seleção e Botão de Gerenciamento */}
      <div className="flex flex-wrap items-center gap-1.5">
        {loading ? (
          <span className="text-[10px] text-slate-500 animate-pulse">Carregando opções...</span>
        ) : (
          tags.map((tag) => {
            const isSelected = selectedList.includes(tag.name);
            return (
              <div key={tag.id} className="relative group flex items-center">
                <button
                  type="button"
                  onClick={() => handleToggle(tag.name)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold border transition-all duration-200 flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-[0_0_8px_rgba(45,212,191,0.2)]'
                      : 'bg-[#070a10] text-slate-400 border-slate-800/80 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {isSelected && <span className="text-teal-400 font-bold">✓</span>}
                  <span>{tag.name}</span>
                </button>

                {isManagerOpen && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTag(tag.id, tag.name);
                    }}
                    title={`Deletar "${tag.name}"`}
                    className="ml-0.5 p-0.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded text-[10px] transition-colors font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })
        )}

        <button
          type="button"
          onClick={() => setIsManagerOpen(!isManagerOpen)}
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all ${
            isManagerOpen
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-slate-900/60 text-slate-500 border-slate-800/80 hover:text-slate-300'
          }`}
        >
          {isManagerOpen ? '✕ FECHAR' : '⚙️ EDITAR OPÇÕES'}
        </button>
      </div>

      {/* Painel do Gerenciador Inline */}
      {isManagerOpen && (
        <div className="p-2.5 bg-[#070a10] border border-slate-800 rounded-lg space-y-2 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
              CRIAR NOVA OPÇÃO EM "{label || category}"
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              placeholder="Digite o nome da nova opção (ex: Abertura Mercado Americano)..."
              className="bg-[#0b1018] border border-slate-700/80 rounded px-2.5 py-1 text-xs text-slate-200 w-full focus:outline-none focus:border-teal-500/50 font-mono"
            />
            <button
              type="button"
              onClick={handleAddTag}
              disabled={creating}
              className="px-3 py-1 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-[10px] rounded transition-all shrink-0 font-mono uppercase"
            >
              {creating ? 'SALVANDO...' : '+ ADICIONAR'}
            </button>
          </div>

          {errorMsg && (
            <p className="text-[10px] text-rose-400 font-mono">{errorMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default TagGroupSelector;
