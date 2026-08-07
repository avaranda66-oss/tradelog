'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { updateTradingDayCell, updateTradeCell } from './actions';

interface InlineCellProps {
  id: string;
  target: 'day' | 'trade';
  field: string;
  value: any;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  onSaved?: (newValue: any) => void;
}

export function InlineCell({
  id,
  target,
  field,
  value: initialValue,
  type = 'text',
  options = [],
  onSaved,
}: InlineCellProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? '');
  const [status, setStatus] = useState<'clean' | 'saving' | 'saved' | 'error'>('clean');
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    setValue(initialValue ?? '');
  }, [initialValue]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  function handleSave() {
    if (value === initialValue) {
      setEditing(false);
      return;
    }

    setStatus('saving');
    startTransition(async () => {
      try {
        if (target === 'day') {
          await updateTradingDayCell(id, field, value);
        } else {
          await updateTradeCell(id, field, value);
        }
        setStatus('saved');
        onSaved?.(value);
        setEditing(false);
        setTimeout(() => setStatus('clean'), 2000);
      } catch (err) {
        setStatus('error');
        setTimeout(() => setStatus('clean'), 3000);
      }
    });
  }

  if (editing) {
    if (type === 'select' && options.length > 0) {
      return (
        <select
          ref={inputRef as any}
          value={value}
          disabled={isPending}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="bg-[#070a10] border border-teal-500 text-teal-300 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        ref={inputRef as any}
        type={type === 'number' ? 'number' : 'text'}
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(type === 'number' ? Number(e.target.value) : e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="bg-[#070a10] border border-teal-500 text-teal-300 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none w-full"
      />
    );
  }

  return (
    <span
      onDoubleClick={() => setEditing(true)}
      title="Duplo clique para editar este campo"
      className={`inline-block px-1 py-0.5 rounded cursor-pointer transition-all border border-transparent hover:border-slate-700 hover:bg-slate-800/40 ${
        status === 'saving'
          ? 'text-amber-400 font-bold animate-pulse'
          : status === 'saved'
          ? 'text-teal-400 font-bold'
          : status === 'error'
          ? 'text-rose-400 font-bold'
          : ''
      }`}
    >
      {value !== null && value !== undefined && value !== '' ? String(value) : '—'}
    </span>
  );
}
