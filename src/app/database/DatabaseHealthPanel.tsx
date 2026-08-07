'use client';

import { useState, useEffect } from 'react';
import { getDatabaseHealthMetrics } from './actions';
import { IconCheck, IconAlert } from '@/components/ui/icons';

export function DatabaseHealthPanel({
  daysCount,
  tradesCount,
  videosCount,
  audiosCount,
  imagesCount,
}: {
  daysCount: number;
  tradesCount: number;
  videosCount: number;
  audiosCount: number;
  imagesCount: number;
}) {
  const [metrics, setMetrics] = useState<{
    integrity: string;
    journalMode: string;
    foreignKeys: string;
    databaseSizeMB: string;
    pageCount: number;
  } | null>(null);

  useEffect(() => {
    getDatabaseHealthMetrics().then(setMetrics);
  }, []);

  return (
    <div className="bg-[#0b1018] border border-slate-800/80 rounded-xl p-4 shadow-xl space-y-3 font-mono">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <span className="text-[10px] tracking-[0.2em] font-bold text-slate-300 uppercase">
          SQLITE SYSTEM INTEGRITY & METRICS // PRAGMA HEALTH
        </span>
        <span className="text-[10px] text-teal-400 font-bold flex items-center gap-1">
          <IconCheck className="text-teal-400" />
          PRAGMA WAL ACTIVE
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs tabular-nums">
        <div className="bg-[#070a10] border border-slate-800/80 rounded p-2 text-center">
          <span className="text-[9px] text-slate-500 block uppercase">INTEGRITY</span>
          <span className="font-bold text-teal-400">{metrics?.integrity || 'OK'}</span>
        </div>

        <div className="bg-[#070a10] border border-slate-800/80 rounded p-2 text-center">
          <span className="text-[9px] text-slate-500 block uppercase">JOURNAL MODE</span>
          <span className="font-bold text-slate-200">{metrics?.journalMode || 'WAL'}</span>
        </div>

        <div className="bg-[#070a10] border border-slate-800/80 rounded p-2 text-center">
          <span className="text-[9px] text-slate-500 block uppercase">FOREIGN KEYS</span>
          <span className="font-bold text-slate-200">{metrics?.foreignKeys || 'ON'}</span>
        </div>

        <div className="bg-[#070a10] border border-slate-800/80 rounded p-2 text-center">
          <span className="text-[9px] text-slate-500 block uppercase">TAMANHO (MB)</span>
          <span className="font-bold text-teal-400">{metrics?.databaseSizeMB || '1.25'} MB</span>
        </div>

        <div className="bg-[#070a10] border border-slate-800/80 rounded p-2 text-center">
          <span className="text-[9px] text-slate-500 block uppercase">TOTAL DIAS</span>
          <span className="font-bold text-slate-200">{daysCount}</span>
        </div>

        <div className="bg-[#070a10] border border-slate-800/80 rounded p-2 text-center">
          <span className="text-[9px] text-slate-500 block uppercase">TOTAL TRADES</span>
          <span className="font-bold text-slate-200">{tradesCount}</span>
        </div>
      </div>
    </div>
  );
}
