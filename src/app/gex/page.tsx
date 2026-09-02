import { detectLatestB3Files, getGexRunsHistory, getGexRunDetails, getGexBacktestComparison, getLatestTickBacktestEvaluations } from '@/features/gex/actions';
import { GexHubView } from '@/features/gex/components/GexHubView';

export const dynamic = 'force-dynamic';

interface GexPageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function GexPage({ searchParams }: GexPageProps) {
  const resolvedParams = await searchParams;
  const targetDate = resolvedParams?.date || '2026-08-20';

  const b3Status = await detectLatestB3Files(targetDate);
  const runs = await getGexRunsHistory(100);

  // Encontra a execução mais recente para a data selecionada no topo
  const runsForDate = runs.filter((r) => r.date === targetDate);
  const activeRunId = runsForDate[0]?.id || runs[0]?.id || '';
  const initialLatestRun = activeRunId ? await getGexRunDetails(activeRunId) : { run: null, levels: [], backtest: null };
  const backtestComparison = await getGexBacktestComparison();
  const initialTickEvaluations = await getLatestTickBacktestEvaluations(targetDate);

  return (
    <main className="min-h-screen bg-[#070a10] text-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        <GexHubView
          targetDate={targetDate}
          b3Status={b3Status}
          initialRuns={runs}
          initialLatestRun={initialLatestRun}
          backtestComparison={backtestComparison}
          initialTickEvaluations={initialTickEvaluations}
        />
      </div>
    </main>
  );
}


