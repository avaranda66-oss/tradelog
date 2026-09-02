import { getOptionPositions, seedInitialOptionsIfEmpty } from '@/features/options/actions';
import { OptionsDashboardView } from '@/features/options/components/OptionsDashboardView';

export const dynamic = 'force-dynamic';

export default async function OpcoesPage() {
  // Semeia com os dados dos prints do usuário se o banco estiver vazio
  await seedInitialOptionsIfEmpty();

  const { positions, strategies, summary } = await getOptionPositions('ALL');

  return (
    <div className="space-y-6">
      <OptionsDashboardView
        initialPositions={positions}
        initialStrategies={strategies}
        initialSummary={summary}
      />
    </div>
  );
}
