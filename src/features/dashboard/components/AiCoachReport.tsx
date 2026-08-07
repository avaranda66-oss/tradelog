'use client';

import { useState } from 'react';
import type { AiCoachReportData } from '@/lib/ai-coach';

export function AiCoachReport({ report }: { report: AiCoachReportData }) {
  const [open, setOpen] = useState(true);

  const scoreColor =
    report.disciplineScore >= 80 ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' :
    report.disciplineScore >= 60 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
    'text-rose-400 border-rose-500/30 bg-rose-500/10';

  return (
    <div className="bg-[#0d131f] border border-slate-800/80 rounded-2xl p-5 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
            🤖
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Diagnóstico AI Coach
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                Claude Cookbooks Structured AI
              </span>
            </h3>
            <p className="text-xs text-slate-500">Síntese de disciplina, execução e gestão emocional</p>
          </div>
        </div>

        {/* Score Gauge */}
        <div className={`px-3 py-1 rounded-xl border flex items-center gap-2 font-mono font-bold ${scoreColor}`}>
          <span className="text-xs text-slate-400 font-normal">Disciplina:</span>
          <span className="text-base">{report.disciplineScore}/100</span>
        </div>
      </div>

      {/* Alertas de Risco / FOMO */}
      {(report.fomoAlert || report.revengeTrading) && (
        <div className="flex gap-2">
          {report.fomoAlert && (
            <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1">
              ⚠️ Alerta de FOMO detectado na voz/horários
            </span>
          )}
          {report.revengeTrading && (
            <span className="text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1">
              🚨 Alerta de Revenge Trading (boletagem consecutiva)
            </span>
          )}
        </div>
      )}

      {/* Parecer do Coach */}
      <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 space-y-1">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block">Parecer Principal</span>
        <p className="text-xs text-slate-200 leading-relaxed font-medium">
          "{report.coachFeedback}"
        </p>
      </div>

      {/* Pontos Fortes & Áreas a Melhorar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Pontos Fortes */}
        {report.keyStrengths.length > 0 && (
          <div className="bg-emerald-950/10 border border-emerald-500/20 rounded-xl p-3 space-y-1.5">
            <span className="text-emerald-400 font-semibold block flex items-center gap-1">
              ✅ Pontos Fortes
            </span>
            <ul className="space-y-1 text-slate-300">
              {report.keyStrengths.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-emerald-500 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Áreas a Melhorar */}
        {report.areasToImprove.length > 0 && (
          <div className="bg-amber-950/10 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
            <span className="text-amber-400 font-semibold block flex items-center gap-1">
              🎯 Ajustes para Amanhã
            </span>
            <ul className="space-y-1 text-slate-300">
              {report.areasToImprove.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-500 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
