import type { TradingDay, Trade, keyLevels, AudioRecord } from '@/lib/db/schema';

export type RarityLevel = 'Lendário' | 'Raro' | 'Comum';

export interface BadgeProgress {
  current: number;
  target: number;
}

export interface BadgeSpec {
  id: string; // ex: 'BDG-01', 'BDG-04'
  code: string; // ex: 'L-01', 'R-02', 'C-01'
  name: string;
  rarity: RarityLevel;
  criterion: string;
  description: string;
  iconType: string;
  unlocked?: boolean;
  unlockedAt?: string;
  progress?: BadgeProgress;
}

export interface GamificationCheckItem {
  id: string;
  label: string;
  weight: number;
  completed: boolean;
  hint: string;
}

export interface GamificationResult {
  score: number; // 0 a 100
  flameLevel: number; // 0 a 4
  badgeTitle: string;
  badgeTag: string;
  badgeColor: string;
  items: GamificationCheckItem[];
  completedCount: number;
  totalCount: number;
  streakDays: number;
  streakStatus: string;
}

// ─── ESPECIFICAÇÃO DAS 15 INSÍGNIAS INSTITUCIONAIS ─────────────
export const ALL_BADGES: BadgeSpec[] = [
  { id: 'BDG-01', code: 'L-01', name: 'Diário Lendário', rarity: 'Lendário', criterion: '20 dias operacionais consecutivos com diário 100% preenchido.', description: 'Consistência estóica e documentação inviolável.', iconType: 'hexagon-diamond' },
  { id: 'BDG-02', code: 'R-01', name: 'Mestre do Pré-Market', rarity: 'Raro', criterion: 'Preencher o Pré-Market e Farol antes das 08:50 por 10 dias.', description: 'Análise de overnight e níveis antes da abertura.', iconType: 'horizon-sun' },
  { id: 'BDG-03', code: 'L-02', name: 'Executor Estóico', rarity: 'Lendário', criterion: 'Nota de execução média ≥ 4.8 em uma semana inteira.', description: 'Aderência ao plano independente do P&L.', iconType: 'shield-lines' },
  { id: 'BDG-04', code: 'C-01', name: 'Guardião do Stop', rarity: 'Comum', criterion: '10 trades acumulados sem mover o stop contra a posição.', description: 'Gestão de risco blindada sem violações.', iconType: 'stop-guard' },
  { id: 'BDG-05', code: 'C-02', name: 'Frio na Abertura', rarity: 'Comum', criterion: 'Não boletar nos primeiros 5 minutos (09:00 - 09:05) por 5 dias.', description: 'Controle de impulso na formação de leilão.', iconType: 'clock-freeze' },
  { id: 'BDG-06', code: 'R-02', name: 'Zero Overtrading', rarity: 'Raro', criterion: 'Operar dentro do limite de trades estipulado por 10 dias.', description: 'Seleção cirúrgica de entradas operacionais.', iconType: 'lock-cross' },
  { id: 'BDG-07', code: 'R-03', name: 'Imunidade ao FOMO', rarity: 'Raro', criterion: 'Ficar de fora do pregão quando sem setup por 3 sessões.', description: 'Capacidade de não operar sem convicção.', iconType: 'fomo-shield' },
  { id: 'BDG-08', code: 'C-03', name: 'Voz da Sessão', rarity: 'Comum', criterion: 'Gravar narração de voz em 5 dias operacionais no mês.', description: 'Documentação verbal em tempo real.', iconType: 'wave-audio' },
  { id: 'BDG-09', code: 'R-04', name: 'Sintonizado com o GEX', rarity: 'Raro', criterion: 'Cadastrar zonas de Gamma Flip/Call Wall em 5 sessões.', description: 'Mapeamento microestrutural de opções.', iconType: 'gex-parabola' },
  { id: 'BDG-10', code: 'C-04', name: 'Visão Multimodal', rarity: 'Comum', criterion: 'Anexar gráficos com análise de Visão AI em 3 sessões.', description: 'Integração de inteligência gráfica.', iconType: 'vision-matrix' },
  { id: 'BDG-11', code: 'C-05', name: 'Frase Brutalmente Honesta', rarity: 'Comum', criterion: 'Registrar a Frase Honesta pós-pregão por 7 dias.', description: 'Registro sincero da conduta pessoal.', iconType: 'honest-quote' },
  { id: 'BDG-12', code: 'R-05', name: 'Revisão Semanal de Elite', rarity: 'Raro', criterion: 'Concluir a revisão semanal com Coach em 10 dias.', description: 'Auditoria periódica de ciclo.', iconType: 'calendar-check' },
  { id: 'BDG-13', code: 'L-03', name: 'Respeito ao Trade Plan', rarity: 'Lendário', criterion: '100% de conformidade com alvos e parciais (Execução ≥ 4.5).', description: 'Fidelidade estratégica absoluta.', iconType: 'target-reticle' },
  { id: 'BDG-14', code: 'C-06', name: 'Domínio de Contexto Macro', rarity: 'Comum', criterion: 'Registrar drivers macro e overnight em 10 diários.', description: 'Compreensão de catalisadores globais.', iconType: 'macro-globe' },
  { id: 'BDG-15', code: 'L-04', name: 'Registro Inviolável', rarity: 'Lendário', criterion: 'Preencher 100% dos campos por 30 dias operacionais.', description: 'Banco de dados pessoal perfeito.', iconType: 'inviolable-seal' },
];

/**
 * Avalia o status de desbloqueio das insígnias com base no histórico global (allTrades)
 */
export function evaluateBadgesStatus(
  historyDays: TradingDay[] = [],
  currentDay: TradingDay | null = null,
  allTrades: Trade[] = [],
  audios: AudioRecord[] = []
): BadgeSpec[] {
  const completedDaysCount = historyDays.filter(d => (d.totalPoints !== null || d.retrospective || d.preMarketDone)).length;
  const preMarketDaysCount = historyDays.filter(d => d.preMarketDone || d.generalBias).length;
  const noOvertradingDaysCount = historyDays.filter(d => d.overtrading === false).length;
  const honestDaysCount = historyDays.filter(d => Boolean(d.honestPhrase && d.honestPhrase.length > 3)).length;
  const gexDaysCount = historyDays.filter(d => Boolean(d.farolKeyLevels)).length;
  const macroDaysCount = historyDays.filter(d => Boolean(d.macroCalendar || d.overnightNote)).length;
  const streak = calculateStreakDays(historyDays);

  // Calcula acumulado real de trades consecutivos sem mover stop no histórico global
  let consecutiveNoMovedStop = 0;
  for (const t of allTrades) {
    if (!t.movedStop) {
      consecutiveNoMovedStop++;
    } else {
      consecutiveNoMovedStop = 0; // reset se moveu stop
    }
  }

  return ALL_BADGES.map(badge => {
    let unlocked = false;
    let progress: BadgeProgress = { current: 0, target: 1 };

    switch (badge.id) {
      case 'BDG-01': // Diário Lendário (20 dias streak)
        progress = { current: Math.min(streak, 20), target: 20 };
        unlocked = streak >= 20;
        break;
      case 'BDG-02': // Mestre do Pré-Market (10 dias pré-market)
        progress = { current: Math.min(preMarketDaysCount, 10), target: 10 };
        unlocked = preMarketDaysCount >= 10;
        break;
      case 'BDG-03': // Executor Estóico (Avg execution >= 4.8)
        const currentExec = currentDay?.avgExecution || 0;
        progress = { current: Math.round(currentExec * 10) / 10, target: 4.8 };
        unlocked = currentExec >= 4.8;
        break;
      case 'BDG-04': // Guardião do Stop (10 trades sem mover stop)
        progress = { current: Math.min(consecutiveNoMovedStop, 10), target: 10 };
        unlocked = consecutiveNoMovedStop >= 10;
        break;
      case 'BDG-05': // Frio na Abertura (5 dias)
        progress = { current: Math.min(completedDaysCount, 5), target: 5 };
        unlocked = completedDaysCount >= 5;
        break;
      case 'BDG-06': // Zero Overtrading (10 dias)
        progress = { current: Math.min(noOvertradingDaysCount, 10), target: 10 };
        unlocked = noOvertradingDaysCount >= 10;
        break;
      case 'BDG-07': // Imunidade ao FOMO (3 dias)
        progress = { current: Math.min(completedDaysCount, 3), target: 3 };
        unlocked = completedDaysCount >= 3;
        break;
      case 'BDG-08': // Voz da Sessão (5 áudios)
        progress = { current: Math.min(audios.length, 5), target: 5 };
        unlocked = audios.length >= 5;
        break;
      case 'BDG-09': // Sintonizado com o GEX (5 dias)
        progress = { current: Math.min(gexDaysCount, 5), target: 5 };
        unlocked = gexDaysCount >= 5;
        break;
      case 'BDG-10': // Visão Multimodal (3 dias)
        progress = { current: Math.min(completedDaysCount, 3), target: 3 };
        unlocked = completedDaysCount >= 3;
        break;
      case 'BDG-11': // Frase Honesta (7 dias)
        progress = { current: Math.min(honestDaysCount, 7), target: 7 };
        unlocked = honestDaysCount >= 7;
        break;
      case 'BDG-12': // Revisão Semanal (10 dias)
        progress = { current: Math.min(completedDaysCount, 10), target: 10 };
        unlocked = completedDaysCount >= 10;
        break;
      case 'BDG-13': // Respeito ao Trade Plan (Execução >= 4.5)
        const exec13 = currentDay?.avgExecution || 0;
        progress = { current: Math.round(exec13 * 10) / 10, target: 4.5 };
        unlocked = exec13 >= 4.5;
        break;
      case 'BDG-14': // Domínio Macro (10 dias)
        progress = { current: Math.min(macroDaysCount, 10), target: 10 };
        unlocked = macroDaysCount >= 10;
        break;
      case 'BDG-15': // Registro Inviolável (30 dias)
        progress = { current: Math.min(completedDaysCount, 30), target: 30 };
        unlocked = completedDaysCount >= 30;
        break;
      default:
        unlocked = false;
    }

    return {
      ...badge,
      unlocked,
      unlockedAt: unlocked ? 'REGISTRO ATIVO' : undefined,
      progress,
    };
  });
}

/**
 * Calcula a sequência ininterrupta de dias operacionais preenchidos
 */
export function calculateStreakDays(days: TradingDay[] = []): number {
  if (!days.length) return 0;
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;

  for (const d of sorted) {
    const isComplete = Boolean(
      (d.preMarketDone || d.generalBias) &&
      (d.retrospective || d.honestPhrase || d.totalPoints !== null)
    );
    if (isComplete) streak++;
    else break;
  }
  return streak;
}

/**
 * Calcula a completude operacional do dia (0% a 100%)
 */
export function calculateJournalCompleteness(
  day: TradingDay | null,
  tradesList: Trade[] = [],
  levelsList: (typeof keyLevels.$inferSelect)[] = [],
  audiosList: AudioRecord[] = [],
  imagesCount: number = 0,
  historyDays: TradingDay[] = []
): GamificationResult {
  const streakDays = calculateStreakDays(historyDays);

  if (!day) {
    return {
      score: 0,
      flameLevel: 0,
      badgeTitle: 'SEM REGISTRO',
      badgeTag: 'INATIVO',
      badgeColor: 'text-slate-500 border-slate-800 bg-slate-950',
      items: [],
      completedCount: 0,
      totalCount: 5,
      streakDays: 0,
      streakStatus: 'STREAK 00 DAYS // INICIANDO SEQUÊNCIA',
    };
  }

  // Item 1: Pré-Market Básico (20 pts)
  const hasPreMarket = Boolean(
    day.preMarketDone ||
    (day.wakeUpTime && day.sleepQuality && day.mentalState && day.generalBias && day.wakeUpTime !== '' && day.mentalState !== '')
  );

  // Item 2: Farol do Mercado / Níveis-Chave (15 pts)
  const hasFarolOrLevels = Boolean(
    levelsList.length > 0 || day.farolKeyLevels || day.farolBias || day.farolNews || day.farolInsights || day.macroCalendar
  );

  // Item 3: Registro de Trades + "O que vi NA HORA" (25 pts)
  const hasTradesWithNotes = Boolean(
    tradesList.length > 0 &&
    tradesList.some(t => t.whatISawNow || t.preTradeNote || t.conviction || t.execution)
  );

  // Item 4: Vinculação de Mídias (Prints de Gráfico ou Narração de Voz) (15 pts)
  const hasMedia = Boolean(imagesCount > 0 || audiosList.length > 0);

  // Item 5: Retrospectiva & Frase Honesta (25 pts)
  const hasRetrospective = Boolean(
    (day.retrospective && day.retrospective.length > 10) ||
    day.honestPhrase ||
    day.emotionalPost
  );

  const items: GamificationCheckItem[] = [
    {
      id: 'preMarket',
      label: 'PRÉ-MARKET & LEITURA DIRECIONAL',
      weight: 20,
      completed: hasPreMarket,
      hint: 'Horário de despertar, estado mental, sono e viés matinal',
    },
    {
      id: 'farol',
      label: 'FAROL DO MERCADO & GEX LEVELS',
      weight: 15,
      completed: hasFarolOrLevels,
      hint: 'Mapeamento de Call/Put Wall, VWAP e briefing macro',
    },
    {
      id: 'trades',
      label: 'TRADES & NARRATIVA EM TEMPO REAL',
      weight: 25,
      completed: hasTradesWithNotes,
      hint: 'Extrato do Profit Pro e registro "O que vi NA HORA"',
    },
    {
      id: 'media',
      label: 'INSTRUMENTAÇÃO MULTIMODAL',
      weight: 15,
      completed: hasMedia,
      hint: 'Frames de vídeo do OBS, prints ou narração de voz',
    },
    {
      id: 'retrospective',
      label: 'RETROSPECTIVA & AUTOAVALIAÇÃO',
      weight: 25,
      completed: hasRetrospective,
      hint: 'Análise a frio e Frase Brutalmente Honesta pós-pregão',
    },
  ];

  const score = items.reduce((acc, item) => acc + (item.completed ? item.weight : 0), 0);
  const completedCount = items.filter(i => i.completed).length;

  let flameLevel = 0;
  if (score >= 100) flameLevel = 4;
  else if (score >= 80) flameLevel = 3;
  else if (score >= 50) flameLevel = 2;
  else if (score >= 20) flameLevel = 1;

  let badgeTitle = 'RITMO INICIAL';
  let badgeTag = 'BLOCO 1';
  let badgeColor = 'text-slate-400 border-slate-800 bg-slate-900/60';

  if (score >= 100) {
    badgeTitle = 'REGISTRO PERFEITO';
    badgeTag = '100% SINCRONIZADO';
    badgeColor = 'text-teal-400 border-teal-500/40 bg-teal-500/10 shadow-[0_0_12px_rgba(45,212,191,0.15)]';
  } else if (score >= 80) {
    badgeTitle = 'ALTA PERFORMANCE';
    badgeTag = 'DISCIPLINA SÊNIOR';
    badgeColor = 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
  } else if (score >= 50) {
    badgeTitle = 'CONSISTENTE';
    badgeTag = 'RITMO ATIVO';
    badgeColor = 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10';
  } else if (score >= 20) {
    badgeTitle = 'EM CONSTRUÇÃO';
    badgeTag = 'EM EVOLUÇÃO';
    badgeColor = 'text-purple-400 border-purple-500/40 bg-purple-500/10';
  }

  let streakStatus = `STREAK ${streakDays.toString().padStart(2, '0')} DAYS // `;
  if (streakDays >= 15) streakStatus += 'DOMÍNIO OPERACIONAL';
  else if (streakDays >= 3) streakStatus += 'RITMO CONSTANTE';
  else streakStatus += 'INICIANDO SEQUÊNCIA';

  return {
    score,
    flameLevel,
    badgeTitle,
    badgeTag,
    badgeColor,
    items,
    completedCount,
    totalCount: items.length,
    streakDays,
    streakStatus,
  };
}
