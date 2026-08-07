import { db } from '@/lib/db';
import { tradingDays } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function CalendarioPage() {
  const allDays = await db.query.tradingDays.findMany({
    orderBy: desc(tradingDays.date),
  });

  const byMonth: Record<string, typeof allDays> = {};
  for (const day of allDays) {
    const month = day.date.substring(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(day);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            📅 Calendário Mensal
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Visão mensal em heatmap de resultados P&L, dias operados e consistência
          </p>
        </div>

        {/* Legend */}
        <div className="hidden sm:flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
            <span className="text-slate-400">Positivo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-rose-500" />
            <span className="text-slate-400">Negativo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-slate-600" />
            <span className="text-slate-400">Zerado</span>
          </div>
        </div>
      </div>

      {Object.keys(byMonth).length === 0 && (
        <div className="bg-[#0d131f] border border-slate-800 rounded-xl p-12 text-center text-slate-500 space-y-3">
          <span className="text-4xl block">📅</span>
          <p className="text-sm font-medium">Nenhum dia registrado no calendário ainda.</p>
          <p className="text-xs text-slate-600">Importe um CSV de operações no Dashboard para ver o histórico no calendário.</p>
        </div>
      )}

      {Object.entries(byMonth).map(([month, days]) => {
        const monthName = new Date(`${month}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        const totalReais = days.reduce((sum, d) => sum + (d.totalReais || 0), 0);
        const positiveDays = days.filter(d => (d.totalReais || 0) > 0).length;

        return (
          <div key={month} className="bg-[#0d131f] border border-slate-800/80 rounded-2xl p-6 space-y-5">
            {/* Header do Mês */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-lg font-bold text-slate-100 capitalize">{monthName}</h2>
              <div className="flex items-center gap-6 text-xs">
                <span className="text-slate-400">
                  Dias positivos: <strong className="text-emerald-400 font-mono">{positiveDays}</strong>/{days.length}
                </span>
                <span className={`font-mono text-sm font-bold ${totalReais >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  R$ {totalReais > 0 ? '+' : ''}{totalReais.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Grid de Dias */}
            <div className="grid grid-cols-7 gap-2">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
                <div key={d} className="text-[11px] text-slate-500 font-semibold text-center uppercase tracking-wider py-1">
                  {d}
                </div>
              ))}

              {/* Offset do primeiro dia */}
              {(() => {
                const firstDay = new Date(`${month}-01T12:00:00`);
                let dow = firstDay.getDay();
                dow = dow === 0 ? 6 : dow - 1;
                return Array.from({ length: dow }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ));
              })()}

              {/* Dias do mês */}
              {(() => {
                const [y, mo] = month.split('-').map(Number);
                const daysInMonth = new Date(y, mo, 0).getDate();
                return Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${month}-${dayNum.toString().padStart(2, '0')}`;
                  const dayData = days.find(d => d.date === dateStr);

                  const reais = dayData?.totalReais || 0;
                  const hasTrades = dayData && (dayData.tradesRight || 0) + (dayData.tradesWrong || 0) > 0;

                  let cardStyle = 'bg-slate-900/30 text-slate-600 border-slate-800/40';
                  if (hasTrades) {
                    if (reais > 0) cardStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20';
                    else if (reais < 0) cardStyle = 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20';
                    else cardStyle = 'bg-slate-800/50 text-slate-300 border-slate-700/50';
                  }

                  const cardContent = (
                    <div className={`aspect-square rounded-xl border p-2 flex flex-col justify-between transition-all duration-200 hover:scale-105 cursor-pointer ${cardStyle}`}>
                      <span className="text-xs font-bold font-mono">{dayNum}</span>
                      {hasTrades && (
                        <div className="text-right">
                          <span className="text-[10px] font-mono font-bold block">
                            R$ {reais > 0 ? '+' : ''}{reais.toFixed(0)}
                          </span>
                        </div>
                      )}
                    </div>
                  );

                  return (
                    <Link key={dateStr} href={`/?date=${dateStr}`}>
                      {cardContent}
                    </Link>
                  );
                });
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
