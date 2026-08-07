'use client';

import { useState, useEffect } from 'react';
import { getStrategies, createStrategy, deleteStrategy } from '@/features/strategies/actions';

interface StrategySelectorProps {
  value: string; // ex: "Rompimento | Abertura Mercado Americano | Região ADR" ou "Pullback"
  onChange: (newValue: string) => void;
  isMulti?: boolean; // Padrão true para permitir multi-seleção
}

export function StrategySelector({ value, onChange, isMulti = true }: StrategySelectorProps) {
  const [strategies, setStrategies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Carrega estratégias do SQLite
  async function loadData() {
    setLoading(true);
    try {
      const data = await getStrategies();
      setStrategies(data);
    } catch (err) {
      console.error('Erro ao carregar estratégias do SQLite:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Parse dos valores selecionados (separa por " | ")
  const selectedList = value
    ? value.split(/\s*\|\s*/).filter(Boolean)
    : [];

  function handleToggle(strategyName: string) {
    if (!isMulti) {
      onChange(value === strategyName ? '' : strategyName);
      return;
    }

    if (selectedList.includes(strategyName)) {
      const updated = selectedList.filter(s => s !== strategyName).join(' | ');
      onChange(updated);
    } else {
      const updated = [...selectedList, strategyName].join(' | ');
      onChange(updated);
    }
  }

  async function handleAddStrategy() {
    const name = newStrategyName.trim();
    if (!name) return;

    setCreating(true);
    setErrorMsg('');
    try {
      const created = await createStrategy(name);
      setStrategies(prev => [...prev, created]);
      setNewStrategyName('');
      // Seleciona automaticamente a nova estratégia criada
      handleToggle(created.name);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao criar estratégia');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteStrategy(id: string, name: string) {
    if (!confirm(`Deseja realmente deletar a estratégia "${name}" do banco SQLite?`)) return;

    try {
      await deleteStrategy(id);
      setStrategies(prev => prev.filter(s => s.id !== id));
      // Remove das selecionadas se estiver ativa
      if (selectedList.includes(name)) {
        const updated = selectedList.filter(s => s !== name).join(' | ');
        onChange(updated);
      }
    } catch (err) {
      console.error('Erro ao deletar estratégia:', err);
    }
  }

  return (
    <div className="space-y-2 font-mono">
      {/* Barra de Pílulas de Seleção Múltipla */}
      <div className="flex flex-wrap items-center gap-1.5">
        {loading ? (
          <span className="text-xs text-slate-500 animate-pulse">Carregando estratégias do SQLite...</span>
        ) : (
          strategies.map((strat) => {
            const isSelected = selectedList.includes(strat.name);
            return (
              <div key={strat.id} className="relative group flex items-center">
                <button
                  type="button"
                  onClick={() => handleToggle(strat.name)}
                  className={`px-3 py-1 rounded-md text-xs font-mono font-medium border transition-all duration-200 flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-[0_0_10px_rgba(45,212,191,0.2)]'
                      : 'bg-[#070a10] text-slate-400 border-slate-800/80 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {isSelected && <span className="text-teal-400 font-bold">✓</span>}
                  <span>#{strat.name}</span>
                </button>

                {/* Botão de Excluir visível no Manager ou Hover */}
                {isManagerOpen && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteStrategy(strat.id, strat.name);
                    }}
                    title={`Deletar #${strat.name}`}
                    className="ml-1 p-0.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded text-xs transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })
        )}

        {/* Botão de Gerenciar / Criar Nova */}
        <button
          type="button"
          onClick={() => setIsManagerOpen(!isManagerOpen)}
          className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border transition-all ${
            isManagerOpen
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          {isManagerOpen ? '✕ FECHAR EDITORIAL' : '⚙️ GERENCIAR ESTRATÉGIAS'}
        </button>
      </div>

      {/* Painel do Gerenciador de Estratégias (CRUD) */}
      {isManagerOpen && (
        <div className="p-3 bg-[#070a10] border border-slate-800 rounded-lg space-y-2 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
              ADICIONAR NOVA ESTRATÉGIA NO BANCO DE DADOS
            </span>
            <span className="text-[10px] text-slate-500 font-sans">
              Salva permanentemente no SQLite para todos os trades
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newStrategyName}
              onChange={(e) => setNewStrategyName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddStrategy())}
              placeholder="Ex: Abertura das Ações, Abertura Mercado Americano, Região ADR..."
              className="bg-[#0b1018] border border-slate-700/80 rounded px-3 py-1 text-xs text-slate-200 w-full focus:outline-none focus:border-teal-500/50 font-mono"
            />
            <button
              type="button"
              onClick={handleAddStrategy}
              disabled={creating}
              className="px-3 py-1 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded transition-all shrink-0 font-mono uppercase"
            >
              {creating ? 'SALVANDO...' : '+ ADICIONAR'}
            </button>
          </div>

          {errorMsg && (
            <p className="text-[11px] text-rose-400 font-mono">{errorMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default StrategySelector;
