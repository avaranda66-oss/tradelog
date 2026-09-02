import { getOptionPositions, seedInitialOptionsIfEmpty } from '@/features/options/actions';
import { OptionsDashboardView } from '@/features/options/components/OptionsDashboardView';

export const dynamic = 'force-dynamic';

export default async function OpcoesPage() {
  // Semeia com os dados dos prints do usuário se o banco estiver vazio
  await seedInitialOptionsIfEmpty();

  const result = await getOptionPositions('ALL');

  if (!result.success) {
    return (
      <div className="max-w-[1440px] mx-auto p-8 font-mono">
        <div className="bg-rose-950/40 border border-rose-600/50 rounded-2xl p-6 text-rose-200 shadow-2xl space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <h2 className="text-lg font-bold tracking-wider uppercase text-rose-300">
              Falha na Leitura da Carteira de Opções
            </h2>
          </div>
          <p className="text-sm text-rose-200/90 leading-relaxed">
            Não foi possível carregar as posições e estruturas do banco de dados. 
            <strong className="text-white ml-1">Seus dados não foram alterados nem perdidos.</strong>
          </p>
          <div className="bg-black/50 p-3 rounded-lg text-xs text-rose-400 font-mono border border-rose-900/50">
            {result.errorCode}: {result.error}
          </div>
          <div>
            <a
              href="/opcoes"
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-rose-950/50"
            >
              🔄 Tentar Novamente
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OptionsDashboardView
        initialPositions={result.positions}
        initialStrategies={result.strategies}
        initialSummary={result.summary}
      />
    </div>
  );
}
