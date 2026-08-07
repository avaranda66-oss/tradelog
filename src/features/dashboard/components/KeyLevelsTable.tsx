'use client';

import { useState } from 'react';
import type { TradingDay } from '@/lib/db/schema';
import { saveKeyLevels } from '@/features/dashboard/actions';

interface KeyLevel {
  id: string;
  name: string;
  price: string;
}

export function KeyLevelsTable({
  day,
  initialLevels,
}: {
  day: TradingDay;
  initialLevels: { id: string; name: string; price: number }[];
}) {
  const [levels, setLevels] = useState<KeyLevel[]>(
    initialLevels.length > 0
      ? initialLevels.map(l => ({ id: l.id, name: l.name, price: l.price.toString() }))
      : [
          { id: '1', name: '', price: '' },
          { id: '2', name: '', price: '' },
          { id: '3', name: '', price: '' },
        ]
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function addRow() {
    setLevels(prev => [...prev, { id: Date.now().toString(), name: '', price: '' }]);
  }

  function removeRow(id: string) {
    setLevels(prev => prev.filter(l => l.id !== id));
  }

  function updateRow(id: string, field: 'name' | 'price', value: string) {
    setLevels(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const parsed = levels
        .filter(l => l.name.trim() || l.price.trim())
        .map(l => ({
          name: l.name.trim(),
          price: parseFloat(l.price.replace(/\./g, '').replace(',', '.')) || 0,
        }));
      await saveKeyLevels(day.id, parsed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">📍 Níveis-Chave do Dia</h3>
        <button
          onClick={addRow}
          className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          + Adicionar
        </button>
      </div>

      <div className="space-y-2">
        {/* Header */}
        <div className="grid grid-cols-[1fr_140px_32px] gap-2 text-[10px] text-slate-500 uppercase tracking-wider px-1">
          <span>Nível</span>
          <span>Preço</span>
          <span />
        </div>

        {/* Rows */}
        {levels.map((level) => (
          <div key={level.id} className="grid grid-cols-[1fr_140px_32px] gap-2 items-center">
            <input
              value={level.name}
              onChange={(e) => updateRow(level.id, 'name', e.target.value)}
              placeholder="Ex: S1 GEX, Mín. anterior, VWAP..."
              className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50"
            />
            <input
              value={level.price}
              onChange={(e) => updateRow(level.id, 'price', e.target.value)}
              placeholder="177.740"
              className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 font-mono text-right focus:outline-none focus:border-emerald-500/50"
            />
            <button
              onClick={() => removeRow(level.id)}
              className="text-slate-600 hover:text-rose-400 transition-colors text-sm"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-all disabled:opacity-50 border border-emerald-500/20"
        >
          {saving ? 'Salvando...' : '💾 Salvar níveis'}
        </button>
        {saved && <span className="text-xs text-emerald-400 animate-in fade-in">✅ Salvo!</span>}
      </div>
    </div>
  );
}
