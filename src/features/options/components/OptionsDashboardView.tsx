'use client';

import React, { useState, useTransition } from 'react';
import type { OptionsPortfolioSummary, ActionFeedItem } from '../actions';
import type { EnrichedOptionPosition, EnrichedOptionStrategy } from '../calculations';
import { OptionsKpiCards } from './OptionsKpiCards';
import { OptionsPositionsTable } from './OptionsPositionsTable';
import { OptionsCalculatorModal } from './OptionsCalculatorModal';
import { NewPositionModal } from './NewPositionModal';
import { RollPositionModal } from './RollPositionModal';
import { EditPositionModal } from './EditPositionModal';
import { OptionDetailDrawer } from './OptionDetailDrawer';
import { GroupPositionsModal } from './GroupPositionsModal';
import { EditStrategyFundingModal } from './EditStrategyFundingModal';
import { closeOptionPosition } from '../actions';
import { useRouter } from 'next/navigation';

interface OptionsDashboardViewProps {
  initialPositions: (EnrichedOptionPosition & { allocatedQuantity: number; unallocatedQuantity: number; strategyId?: string })[];
  initialStrategies: EnrichedOptionStrategy[];
  initialSummary: OptionsPortfolioSummary;
}

export function OptionsDashboardView({
  initialPositions,
  initialStrategies,
  initialSummary,
}: OptionsDashboardViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [isNetView, setIsNetView] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isNewPositionOpen, setIsNewPositionOpen] = useState(false);
  const [rollPosition, setRollPosition] = useState<EnrichedOptionPosition | null>(null);
  const [editPosition, setEditPosition] = useState<EnrichedOptionPosition | null>(null);
  const [selectedDrawerPosition, setSelectedDrawerPosition] = useState<EnrichedOptionPosition | null>(null);
  const [positionsToGroup, setPositionsToGroup] = useState<EnrichedOptionPosition[] | null>(null);
  const [fundingStrategy, setFundingStrategy] = useState<EnrichedOptionStrategy | null>(null);

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const handleSelectActionItem = (item: ActionFeedItem) => {
    const pos = initialPositions.find((p) => p.id === item.positionId);
    if (pos) {
      setSelectedDrawerPosition(pos);
    }
  };

  const handleQuickCloseFromDrawer = async (pos: EnrichedOptionPosition) => {
    const isShort = pos.side === 'SELL' || pos.side === 'SHORT';
    const promptText = isShort
      ? `Informe o preço de recompra da opção ${pos.tickerOption}:`
      : `Informe o preço de encerramento da opção ${pos.tickerOption}:`;

    const val = window.prompt(promptText, pos.currentPrice.toFixed(2));
    if (val === null) return;
    const exitPrice = parseFloat(val.replace(',', '.')) || 0;

    const res = await closeOptionPosition({
      id: pos.id,
      exitPrice,
      status: 'CLOSED',
      notes: 'Encerrada via Drawer de Diagnóstico',
    });

    if (res.success) {
      setSelectedDrawerPosition(null);
      handleRefresh();
    } else {
      alert('Erro ao encerrar posição');
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 pb-16 animate-in fade-in">
      {/* 1. Header de Controles, Action Feed & 4 KPI Cards */}
      <OptionsKpiCards
        summary={initialSummary}
        isNetView={isNetView}
        onToggleNetView={setIsNetView}
        onOpenCalculator={() => setIsCalculatorOpen(true)}
        onOpenNewPosition={() => setIsNewPositionOpen(true)}
        onRefresh={handleRefresh}
        onSelectActionItem={handleSelectActionItem}
      />

      {/* 2. Tabela de Posições, Estruturas e Presets */}
      <OptionsPositionsTable
        positions={initialPositions}
        strategies={initialStrategies}
        isNetView={isNetView}
        onOpenRollModal={(pos) => setRollPosition(pos)}
        onOpenEditModal={(pos) => setEditPosition(pos)}
        onOpenDetailDrawer={(pos) => setSelectedDrawerPosition(pos)}
        onOpenGroupModal={(selected) => setPositionsToGroup(selected)}
        onOpenFundingModal={(strat) => setFundingStrategy(strat)}
        onRefresh={handleRefresh}
      />

      {/* Modal de Agrupamento em Estrutura */}
      <GroupPositionsModal
        selectedPositions={positionsToGroup || []}
        isOpen={!!positionsToGroup && positionsToGroup.length >= 2}
        onClose={() => setPositionsToGroup(null)}
        onGroupCreated={handleRefresh}
      />

      {/* Modal de Edição de Funding / Remuneração de Garantia da Estrutura */}
      <EditStrategyFundingModal
        strategy={fundingStrategy}
        isOpen={!!fundingStrategy}
        onClose={() => setFundingStrategy(null)}
        onUpdated={handleRefresh}
      />

      {/* Modais & Drawer Quant */}
      <OptionDetailDrawer
        position={selectedDrawerPosition}
        isOpen={!!selectedDrawerPosition}
        isNetView={isNetView}
        onClose={() => setSelectedDrawerPosition(null)}
        onOpenRollModal={(pos) => {
          setSelectedDrawerPosition(null);
          setRollPosition(pos);
        }}
        onQuickClose={handleQuickCloseFromDrawer}
      />

      <OptionsCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        onPositionCreated={handleRefresh}
      />

      <NewPositionModal
        isOpen={isNewPositionOpen}
        onClose={() => setIsNewPositionOpen(false)}
        onPositionCreated={handleRefresh}
      />

      <RollPositionModal
        position={rollPosition}
        isOpen={!!rollPosition}
        onClose={() => setRollPosition(null)}
        onRolled={handleRefresh}
      />

      <EditPositionModal
        position={editPosition}
        isOpen={!!editPosition}
        onClose={() => setEditPosition(null)}
        onPositionUpdated={handleRefresh}
      />
    </div>
  );
}
