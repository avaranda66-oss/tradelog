'use client';

import { useState } from 'react';
import type { TradingDay } from '@/lib/db/schema';
import { saveKeyLevels } from '@/features/dashboard/actions';
import { IconTarget, IconCheck } from '@/components/ui/icons';

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
          { id: '1', name: 'CALL WALL GEX', price: '125.600' },
          { id: '2', name: 'PUT WALL GEX', price: '124.800' },
          { id: '3', name: 'VWAP MATINAL', price: '125.000' },
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
    <section aria-label="Níveis-chave" className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <IconTarget className="text-teal-400" />
          <h3 className="font-mono text-[10px] tracking-[0.25em] font-bold text-slate-300 uppercase">
            KEY LEVELS · NÍVEIS-CHAVE DO DIA
          </h3>
        </div>

        <button
          onClick={addRow}
          type="button"
          className="font-mono text-[10px] text-teal-400 hover:text-teal-300 font-bold transition-colors uppercase tracking-wider"
        >
          + ADICIONAR LINHA
        </button>
      </div>

      <div className="space-y-1.5 font-mono text-xs">
        {/* Header Table */}
        <div className="grid grid-cols-[1fr_140px_28px] gap-2 text-[9px] text-slate-500 uppercase tracking-widest px-1">
          <span>IDENTIFICADOR / NÍVEL</span>
          <span className="text-right">PREÇO (PTS)</span>
          <span />
        </div>

        {/* Rows */}
        {levels.map((level) => (
          <div key={level.id} className="grid grid-cols-[1fr_140px_28px] gap-2 items-center">
            <input
              value={level.name}
              onChange={(e) => updateRow(level.id, 'name', e.target.value)}
              placeholder="Ex: CALL WALL, GAMMA FLIP, VWAP…"
              className="bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-teal-500/60 font-mono"
            />
            <input
              value={level.price}
              onChange={(e) => updateRow(level.id, 'price', e.target.value)}
              placeholder="125.000"
              className="bg-[#070a10] border border-slate-800/80 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-700 font-mono text-right focus:outline-none focus:border-teal-500/60 tabular-nums"
            />
            <button
              onClick={() => removeRow(level.id)}
              type="button"
              className="text-slate-600 hover:text-rose-400 transition-colors font-mono text-xs"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 font-mono text-[10px]">
        <span className="text-slate-500">{levels.length} NÍVEIS MAPEADOS</span>

        <button
          onClick={handleSave}
          disabled={saving}
          type="button"
          className="px-3.5 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-md font-mono font-bold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
        >
          {saved ? (
            <>
              <IconCheck className="text-slate-950" />
              <span>NÍVEIS SALVOS</span>
            </>
          ) : saving ? (
            'SALVANDO…'
          ) : (
            'SALVAR NÍVEIS'
          )}
        </button>
      </div>
    </section>
  );
}

export default KeyLevelsTable;
