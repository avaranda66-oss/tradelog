import { sqliteTable, text, integer, real, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── Trading Days ────────────────────────────────────────────
export const tradingDays = sqliteTable('trading_days', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(), // "2026-08-06"

  // Pré-Market
  sleepTime: text('sleep_time'),      // Horário que dormiu na noite anterior
  wakeUpTime: text('wake_up_time'),
  sleepQuality: integer('sleep_quality'), // 1-5
  mentalState: text('mental_state'),
  personalNote: text('personal_note'),
  macroCalendar: text('macro_calendar'),
  overnightNote: text('overnight_note'),
  generalBias: text('general_bias'), // "alta" | "baixa" | "indefinido"

  // Resultado
  totalPoints: real('total_points'),
  totalReais: real('total_reais'),
  tradesRight: integer('trades_right'),
  tradesWrong: integer('trades_wrong'),
  avgConviction: real('avg_conviction'),
  avgExecution: real('avg_execution'),
  biasCorrect: integer('bias_correct', { mode: 'boolean' }),
  preMarketDone: integer('pre_market_done', { mode: 'boolean' }).default(false),
  overtrading: integer('overtrading', { mode: 'boolean' }).default(false),
  honestPhrase: text('honest_phrase'),

  // Pós
  retrospective: text('retrospective'),
  emotionalPost: text('emotional_post'),

  // Farol do Mercado
  farolBias: text('farol_bias'),
  farolKeyLevels: text('farol_key_levels'),
  farolNews: text('farol_news'),
  farolInsights: text('farol_insights'),

  // Tags do dia (Estratégia e Contexto)
  strategyTags: text('strategy_tags'),

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Trades ──────────────────────────────────────────────────
export const trades = sqliteTable('trades', {
  id: text('id').primaryKey(),
  tradingDayId: text('trading_day_id').references(() => tradingDays.id, { onDelete: 'cascade' }),

  tradeNumber: integer('trade_number').notNull(),
  instrument: text('instrument').notNull(),
  openTime: text('open_time').notNull(),
  closeTime: text('close_time').notNull(),
  duration: text('duration'),
  side: text('side').notNull(), // "C" | "V"
  entryPrice: real('entry_price').notNull(),
  exitPrice: real('exit_price').notNull(),
  contracts: integer('contracts').notNull(),
  points: real('points'),
  reais: real('reais'),
  isAverage: integer('is_average', { mode: 'boolean' }).default(false),
  mep: real('mep'), // Máx Excursão Positiva
  men: real('men'), // Máx Excursão Negativa
  drawdown: real('drawdown'),

  // Notas do trader
  conviction: integer('conviction'), // 1-5
  execution: integer('execution'),   // 1-5
  whatISawNow: text('what_i_saw_now'),
  retrospective: text('retrospective'),

  // Pré-Trade
  strategy: text('strategy'),           // "Rompimento", "Pullback", "VWAP", etc.
  emotionalPre: text('emotional_pre'),  // "confiante", "neutro", "ansioso", "fomo", "revenge", "medo", "euforia"
  entryType: text('entry_type'),        // "breakout", "pullback", "reversão", "scalp", "momentum"
  preTradeNote: text('pre_trade_note'), // O que viu/pensou antes de entrar

  // Durante o Trade
  marketRegime: text('market_regime'),  // "tendência", "range", "chop", "volatilidade", "abertura"
  dayPhase: text('day_phase'),          // "pré-abertura", "abertura", "meio-pregão", "final-pregão"
  stopType: text('stop_type'),          // "técnico", "financeiro", "temporal", "trail", "breakeven"
  didPartial: integer('did_partial', { mode: 'boolean' }).default(false),
  movedStop: integer('moved_stop', { mode: 'boolean' }).default(false),
  reducedSize: integer('reduced_size', { mode: 'boolean' }).default(false),
  exitedEarly: integer('exited_early', { mode: 'boolean' }).default(false),
  duringTradeNote: text('during_trade_note'),

  // Pós-Trade
  emotionalPost: text('emotional_post'),   // "calmo", "frustrado", "aliviado", "arrependido", "satisfeito"
  tradeQuality: integer('trade_quality'),  // 1-5 autoavaliação geral
  postTradeNote: text('post_trade_note'),  // O que faria diferente

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Trade Images ────────────────────────────────────────────
export const tradeImages = sqliteTable('trade_images', {
  id: text('id').primaryKey(),
  tradeId: text('trade_id').references(() => trades.id, { onDelete: 'cascade' }),
  tradingDayId: text('trading_day_id').references(() => tradingDays.id, { onDelete: 'cascade' }),

  filePath: text('file_path').notNull(),
  caption: text('caption'),
  imageType: text('image_type'), // "entrada" | "saida" | "contexto" | "session"

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Key Levels ──────────────────────────────────────────────
export const keyLevels = sqliteTable('key_levels', {
  id: text('id').primaryKey(),
  tradingDayId: text('trading_day_id').references(() => tradingDays.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  price: real('price').notNull(),
});

// ─── Audio Records ───────────────────────────────────────────
export const audioRecords = sqliteTable('audio_records', {
  id: text('id').primaryKey(),
  tradingDayId: text('trading_day_id').references(() => tradingDays.id, { onDelete: 'cascade' }),

  filePath: text('file_path').notNull(),
  durationSecs: integer('duration_secs'),
  transcription: text('transcription'),
  insights: text('insights'), // JSON com trades/emoções extraídos pelo Gemini
  status: text('status').default('recorded'), // recorded | transcribing | done | error

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Coach Notes ─────────────────────────────────────────────
export const coachNotes = sqliteTable('coach_notes', {
  id: text('id').primaryKey(),
  tradingDayId: text('trading_day_id').references(() => tradingDays.id, { onDelete: 'cascade' }),

  question: text('question').notNull(),
  answer: text('answer'),
  insight: text('insight'),

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Candle Data (1min, 5min) ────────────────────────────────
export const candleData = sqliteTable('candle_data', {
  id: text('id').primaryKey(),
  tradingDayId: text('trading_day_id').references(() => tradingDays.id, { onDelete: 'cascade' }),

  instrument: text('instrument').notNull(),
  timeframe: text('timeframe').notNull(), // "1min" | "5min"
  dateTime: text('date_time').notNull(),  // ISO string
  open: real('open').notNull(),
  high: real('high').notNull(),
  low: real('low').notNull(),
  close: real('close').notNull(),
  volume: real('volume'),
  quantity: integer('quantity'),
});

// ─── Video Records ───────────────────────────────────────────
export const videoRecords = sqliteTable('video_records', {
  id: text('id').primaryKey(),
  tradingDayId: text('trading_day_id').references(() => tradingDays.id, { onDelete: 'cascade' }),

  filename: text('filename').notNull(),
  filePath: text('file_path').notNull(),
  durationSecs: integer('duration_secs'),
  resolution: text('resolution'),

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Trade Annotations (Timestamped Video / Frame Insights) ───
export const tradeAnnotations = sqliteTable('trade_annotations', {
  id: text('id').primaryKey(),
  tradeId: text('trade_id').references(() => trades.id, { onDelete: 'cascade' }),
  tradingDayId: text('trading_day_id').references(() => tradingDays.id, { onDelete: 'cascade' }),

  timestampSecs: real('timestamp_secs').notNull(),
  formattedTime: text('formatted_time').notNull(), // ex: "00:42.3"
  clockTime: text('clock_time'),                   // ex: "09:12:15"
  text: text('text').notNull(),
  tag: text('tag').default('insight'),             // "insight" | "entrada" | "stop" | "tape_reading" | "erro" | "ai_note"
  drawingData: text('drawing_data'),               // JSON de traços do canvas
  author: text('author').default('user'),          // "user" | "ai"

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Custom Strategies ─────────────────────────────────────────
export const customStrategies = sqliteTable('custom_strategies', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  category: text('category').default('geral'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Custom Tags (Setups, Emocionais, Regimes, Stops, Fases) ───
export const customTags = sqliteTable('custom_tags', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  name: text('name').notNull(),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── GEX Runs (Execuções e Linhagem) ──────────────────────────
export const gexRuns = sqliteTable('gex_runs', {
  id: text('id').primaryKey(),
  tradingDayId: text('trading_day_id').references(() => tradingDays.id, { onDelete: 'set null' }),

  date: text('date').notNull(), // "2026-08-20"
  asset: text('asset').notNull(), // "WINFUT" | "BLUECHIPS_BASKET" | "PETR4" | "VALE3" | "BOVA11"
  scriptVersion: text('script_version').notNull(), // "v3.6_quant_pro" | "v3.5_intermediate" | "v2.0_basket" | "v1.0_legacy"
  scriptName: text('script_name').notNull(),
  scriptPath: text('script_path'),

  spotFechamento: real('spot_fechamento').notNull(),
  spotAjuste: real('spot_ajuste').notNull(),
  rangeMin: real('range_min'),
  rangeMax: real('range_max'),
  oiMode: text('oi_mode').default('effective'),

  // Linhagem dos Arquivos B3
  cotahistFile: text('cotahist_file'),
  cotahistHash: text('cotahist_hash'),
  cotahistDate: text('cotahist_date'),
  openInterestFile: text('open_interest_file'),
  openInterestHash: text('open_interest_hash'),
  openInterestDate: text('open_interest_date'),
  ivCoverage: real('iv_coverage'), // Cobertura ponderada de IV real %

  // Níveis Principais Resumidos (para consultas rápidas)
  callWallStrike: real('call_wall_strike'),
  callWallFech: real('call_wall_fech'),
  callWallAjus: real('call_wall_ajus'),
  callWallGex: real('call_wall_gex'),

  zeroGammaStrike: real('zero_gamma_strike'),
  zeroGammaFech: real('zero_gamma_fech'),
  zeroGammaAjus: real('zero_gamma_ajus'),

  putWallStrike: real('put_wall_strike'),
  putWallFech: real('put_wall_fech'),
  putWallAjus: real('put_wall_ajus'),
  putWallGex: real('put_wall_gex'),

  status: text('status').default('completed'), // "completed" | "error" | "running"
  logs: text('logs'),
  ntslCode: text('ntsl_code'),
  ntslFilePath: text('ntsl_file_path'),

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── GEX Levels (Strikes e Regiões Detalhadas) ────────────────
export const gexLevels = sqliteTable('gex_levels', {
  id: text('id').primaryKey(),
  gexRunId: text('gex_run_id').references(() => gexRuns.id, { onDelete: 'cascade' }),

  date: text('date').notNull(),
  asset: text('asset').notNull(),
  levelType: text('level_type').notNull(), // "call_wall" | "zero_gamma" | "put_wall" | "r1" | "r2" | "r3" | "r4" | "s1" | "s2" | "s3" | "s4" | "midpoint" | "strike"
  strike: real('strike').notNull(),
  winfutFech: real('winfut_fech'),
  winfutAjus: real('winfut_ajus'),
  gexCall: real('gex_call'),
  gexPut: real('gex_put'),
  gexNet: real('gex_net'),
  gexProxy: real('gex_proxy'),
  gexGross: real('gex_gross'),
  openInterest: integer('open_interest'),
  negocios: integer('negocios'),
  volumeFinanceiro: real('volume_financeiro'),
  realIv: real('real_iv'),
  orderIndex: integer('order_index').default(0),

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── GEX Backtest Results (Métricas de Eficácia) ──────────────
export const gexBacktestResults = sqliteTable('gex_backtest_results', {
  id: text('id').primaryKey(),
  gexRunId: text('gex_run_id').references(() => gexRuns.id, { onDelete: 'cascade' }),

  date: text('date').notNull(),
  asset: text('asset').notNull(),
  scriptVersion: text('script_version').notNull(),

  // Testes de Regiões
  callWallTests: integer('call_wall_tests').default(0),
  callWallHoldingRate: real('call_wall_holding_rate'), // % repulsão
  putWallTests: integer('put_wall_tests').default(0),
  putWallHoldingRate: real('put_wall_holding_rate'),
  zeroGammaCrossings: integer('zero_gamma_crossings').default(0),
  zeroGammaAccelerationRatio: real('zero_gamma_acceleration_ratio'),

  // Confluência com Trades
  tradesTested: integer('trades_tested').default(0),
  tradesWinRateNearGex: real('trades_win_rate_near_gex'),
  avgDeviationPoints: real('avg_deviation_points'),
  overallScore: real('overall_score'), // 0 - 100
  notes: text('notes'),

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Option Positions & CDI Benchmark ─────────────────────────
export const optionPositions = sqliteTable('option_positions', {
  id: text('id').primaryKey(),
  portfolio: text('portfolio').default('Principal'), // ex: "BTG Principal", "Trava de Renda"
  tickerUnderlying: text('ticker_underlying').notNull(), // ex: "ITUB4", "LREN3", "PETR4"
  tickerOption: text('ticker_option').notNull(), // ex: "ITUGU393", "LRENV184", "ITUBI390"
  optionType: text('option_type').notNull(), // "PUT" | "CALL"
  side: text('side').notNull(), // "SELL" | "BUY"
  strategyType: text('strategy_type').notNull(), // "VENDA_PUT", "VENDA_CALL", "COMPRA_CALL", "COMPRA_PUT", "TRAVA_ALTA", "TRAVA_BAIXA", "OUTRA"

  quantity: integer('quantity').notNull(), // Quantidade original imutável de abertura
  strike: real('strike').notNull(),
  entryPrice: real('entry_price').notNull(), // Preço médio de entrada
  currentPrice: real('current_price').notNull(), // Preço atual de mercado
  exitPrice: real('exit_price'), // Preço de saída (quando encerrada)

  underlyingEntrySpot: real('underlying_entry_spot'), // Cotação da ação na entrada
  underlyingCurrentSpot: real('underlying_current_spot'), // Cotação atual da ação

  entryDate: text('entry_date').notNull(), // "YYYY-MM-DD"
  expirationDate: text('expiration_date').notNull(), // "YYYY-MM-DD"
  exitDate: text('exit_date'), // "YYYY-MM-DD"

  allocatedCapital: real('allocated_capital').notNull(), // Garantia / Capital Alocado / Risco Máximo
  status: text('status').notNull().default('OPEN'), // "OPEN" | "CLOSED" | "EXERCISED" | "EXPIRED_WORTHLESS" | "ROLLED"

  // Caches Denormalizados e Baseline Legacy (Reconciliação Canônica)
  legacyClosedQuantity: integer('legacy_closed_quantity').notNull().default(0),
  legacyQuality: text('legacy_quality'), // ex: "LEGACY_INCOMPLETE"
  closedQuantity: integer('closed_quantity').notNull().default(0),
  openQuantity: integer('open_quantity'), // Sincronizado: quantity - closedQuantity
  realizedPnlReais: real('realized_pnl_reais').notNull().default(0),

  // Gregas e Métricas Operacionais
  delta: real('delta'),
  gamma: real('gamma'),
  theta: real('theta'),
  vega: real('vega'),
  iv: real('iv'),
  pop: real('pop'), // Probability of Profit (%)
  breakEven: real('break_even'),

  cdiRateAnnual: real('cdi_rate_annual').default(0.14), // 14.0% a.a. padrão
  notes: text('notes'),

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Option Strategies (Multi-Leg & Structures) ───────────────
export const optionStrategies = sqliteTable('option_strategies', {
  id: text('id').primaryKey(),
  portfolio: text('portfolio').default('Principal'),
  name: text('name').notNull(), // ex: "ITUB4 — Call Financiada por Put 2:1"
  strategyType: text('strategy_type').notNull(), // "CUSTOM_MULTI_LEG" | "BULL_PUT_SPREAD" | "BEAR_CALL_SPREAD" | "STRADDLE" | "STRANGLE" | "IRON_CONDOR"
  book: text('book').notNull().default('HYBRID'), // "INCOME" | "DIRECTIONAL" | "HYBRID"
  underlyingTicker: text('underlying_ticker').notNull(), // "ITUB4"
  collateralMode: text('collateral_mode').default('IDLE_CASH'), // "IDLE_CASH" | "REMUNERATED_100_CDI" | "CUSTOM"
  collateralYieldPctCDI: real('collateral_yield_pct_cdi'),
  capitalRemuneratedReais: real('capital_remunerated_reais'), // Saldo de garantia efetivamente remunerado a CDI (Snapshot Vigente)
  collateralCoveragePct: real('collateral_coverage_pct'), // % do capital reservado que está remunerado (ex: 100% ou 50%)
  status: text('status').notNull().default('OPEN'), // "OPEN" | "CLOSED" | "ROLLED"
  openedAt: text('opened_at').notNull(), // "YYYY-MM-DD"
  closedAt: text('closed_at'), // "YYYY-MM-DD"
  notes: text('notes'),

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Option Strategy Legs (Alocações Relacionais & Auditáveis) ─
export const optionStrategyLegs = sqliteTable('option_strategy_legs', {
  id: text('id').primaryKey(),
  strategyId: text('strategy_id')
    .notNull()
    .references(() => optionStrategies.id, { onDelete: 'cascade' }),
  positionId: text('position_id')
    .notNull()
    .references(() => optionPositions.id, { onDelete: 'restrict' }), // Restrict para segurança de auditoria
  allocatedQuantity: integer('allocated_quantity').notNull(), // Quantidade alocada original (> 0)
  economicRole: text('economic_role').notNull().default('CUSTOM'), // "FINANCING" | "DIRECTIONAL" | "HEDGE" | "INCOME" | "CUSTOM"

  // Caches Denormalizados e Baseline Legacy de Alocação
  legacyClosedAllocatedQuantity: integer('legacy_closed_allocated_quantity').notNull().default(0),
  closedAllocatedQuantity: integer('closed_allocated_quantity').notNull().default(0),
  openAllocatedQuantity: integer('open_allocated_quantity'), // allocatedQuantity - closedAllocatedQuantity

  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex('strategy_position_unique_idx').on(table.strategyId, table.positionId),
]);

// ─── Strategy Allocation Events (Audit Trail de Agrupamento) ──
export const strategyAllocationEvents = sqliteTable('strategy_allocation_events', {
  id: text('id').primaryKey(),
  strategyId: text('strategy_id').notNull(),
  positionId: text('position_id').notNull(),
  eventType: text('event_type').notNull(), // "GROUP" | "UNGROUP" | "PARTIAL_GROUP" | "PARTIAL_UNGROUP"
  allocatedQuantity: integer('allocated_quantity').notNull(),
  notes: text('notes'),
  timestamp: text('timestamp').$defaultFn(() => new Date().toISOString()),
});

// ─── Strategy Maneuver Events (Audit Trail de Manejos da Estrutura) ───
export const strategyManeuverEvents = sqliteTable('strategy_maneuver_events', {
  id: text('id').primaryKey(),
  strategyId: text('strategy_id')
    .notNull()
    .references(() => optionStrategies.id, { onDelete: 'restrict' }), // Restrict: proíbe hard-delete com histórico financeiro
  maneuverType: text('maneuver_type').notNull(), // 'SCALE_DOWN' | 'LEG_CLOSE' | 'FULL_CLOSE' | 'ROLL'
  percentageReduced: real('percentage_reduced'), // ex: 50.0 para SCALE_DOWN proporcional
  unitsReduced: integer('units_reduced'), // Strategy units encerradas
  executionDate: text('execution_date').notNull(), // "YYYY-MM-DD"

  // Audit Snapshots (Não são fonte primária)
  auditRealizedPnlReais: real('audit_realized_pnl_reais').notNull(),
  auditCapitalReleasedReais: real('audit_capital_released_reais'),
  auditRatioBefore: text('audit_ratio_before'),
  auditRatioAfter: text('audit_ratio_after'),
  preservesOriginalRatio: integer('preserves_original_ratio', { mode: 'boolean' }).notNull().default(true),

  notes: text('notes'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Strategy Funding Events (Audit Trail de Alterações de Funding) ───
export const strategyFundingEvents = sqliteTable('strategy_funding_events', {
  id: text('id').primaryKey(),
  strategyId: text('strategy_id')
    .notNull()
    .references(() => optionStrategies.id, { onDelete: 'restrict' }), // Restrict: proíbe hard-delete com histórico
  eventType: text('event_type').notNull(), // 'CHANGE' | 'CORRECTION'
  effectiveDate: text('effective_date').notNull(), // "YYYY-MM-DD"

  previousCollateralMode: text('previous_collateral_mode').notNull(),
  newCollateralMode: text('new_collateral_mode').notNull(),

  previousCoveragePct: real('previous_coverage_pct'),
  newCoveragePct: real('new_coverage_pct'),

  previousCapitalRemunerated: real('previous_capital_remunerated'),
  newCapitalRemunerated: real('new_capital_remunerated'),

  previousPctCdi: real('previous_pct_cdi'),
  newPctCdi: real('new_pct_cdi'),

  notes: text('notes'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

// ─── Strategy Funding Segments (Funding Timeline Concreta) ─────
export const strategyFundingSegments = sqliteTable('strategy_funding_segments', {
  id: text('id').primaryKey(),
  strategyId: text('strategy_id')
    .notNull()
    .references(() => optionStrategies.id, { onDelete: 'restrict' }), // Restrict: preservação de histórico
  startDate: text('start_date').notNull(), // "YYYY-MM-DD" (inclusive)
  endDate: text('end_date'), // "YYYY-MM-DD" (exclusive; null indica segmento vigente aberto)

  benchmarkCapitalReais: real('benchmark_capital_reais').notNull(),
  capitalRemuneratedReais: real('capital_remunerated_reais').notNull(),
  collateralMode: text('collateral_mode').notNull(), // "IDLE_CASH" | "REMUNERATED_100_CDI" | "CUSTOM"
  collateralPctCdi: real('collateral_pct_cdi'),

  sourceType: text('source_type').notNull(), // "CREATION" | "MANEUVER" | "FUNDING_CHANGE"
  maneuverEventId: text('maneuver_event_id').references(() => strategyManeuverEvents.id, { onDelete: 'restrict' }),
  fundingEventId: text('funding_event_id').references(() => strategyFundingEvents.id, { onDelete: 'restrict' }),

  quality: text('quality').notNull().default('FULL'), // "FULL" | "PARTIAL" | "INSUFFICIENT_DATA"
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex('one_open_funding_segment_per_strategy')
    .on(table.strategyId)
    .where(sql`${table.endDate} IS NULL`),
  check('funding_seg_end_date_check', sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`),
  check('funding_seg_benchmark_check', sql`${table.benchmarkCapitalReais} >= 0`),
  check('funding_seg_remunerated_check', sql`${table.capitalRemuneratedReais} >= 0 AND ${table.capitalRemuneratedReais} <= ${table.benchmarkCapitalReais}`),
  check('funding_seg_pct_cdi_check', sql`${table.collateralPctCdi} IS NULL OR ${table.collateralPctCdi} >= 0`),
  check('funding_seg_source_coherence_check', sql`
    (${table.sourceType} = 'CREATION' AND ${table.maneuverEventId} IS NULL AND ${table.fundingEventId} IS NULL) OR
    (${table.sourceType} = 'MANEUVER' AND ${table.maneuverEventId} IS NOT NULL AND ${table.fundingEventId} IS NULL) OR
    (${table.sourceType} = 'FUNDING_CHANGE' AND ${table.maneuverEventId} IS NULL AND ${table.fundingEventId} IS NOT NULL)
  `),
]);

// ─── Option Position Executions (Execuções Financeiras Reais — Fonte Canônica) ───
export const optionPositionExecutions = sqliteTable('option_position_executions', {
  id: text('id').primaryKey(),
  positionId: text('position_id')
    .notNull()
    .references(() => optionPositions.id, { onDelete: 'restrict' }),
  strategyId: text('strategy_id')
    .references(() => optionStrategies.id, { onDelete: 'restrict' }),
  strategyLegId: text('strategy_leg_id')
    .references(() => optionStrategyLegs.id, { onDelete: 'restrict' }),
  maneuverEventId: text('maneuver_event_id')
    .references(() => strategyManeuverEvents.id, { onDelete: 'restrict' }),

  executionType: text('execution_type').notNull(), // 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE' | 'EXPIRE_WORTHLESS'
  quantity: integer('quantity').notNull(),
  price: real('price').notNull(), // Preço unitário (0.0 para pó)
  executionDate: text('execution_date').notNull(), // "YYYY-MM-DD"

  // Fatos Contábeis Auditáveis (Calculados pelo Servidor)
  entryPriceBasisReais: real('entry_price_basis_reais').notNull(),
  grossRealizedPnlReais: real('gross_realized_pnl_reais').notNull(),
  feesReais: real('fees_reais').notNull().default(0),
  netRealizedPnlReais: real('net_realized_pnl_reais').notNull(),

  source: text('source').notNull().default('USER_MANUAL'), // 'USER_MANUAL' | 'SYSTEM_AUTO' | 'LEGACY_MIGRATION'
  notes: text('notes'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
}, (table) => [
  check('exec_quantity_check', sql`${table.quantity} > 0`),
  check('exec_price_check', sql`${table.price} >= 0`),
]);

// ─── Types ───────────────────────────────────────────────────
export type TradingDay = typeof tradingDays.$inferSelect;
export type NewTradingDay = typeof tradingDays.$inferInsert;
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type TradeImage = typeof tradeImages.$inferSelect;
export type CandleData = typeof candleData.$inferSelect;
export type AudioRecord = typeof audioRecords.$inferSelect;
export type VideoRecord = typeof videoRecords.$inferSelect;
export type CustomStrategy = typeof customStrategies.$inferSelect;
export type CustomTag = typeof customTags.$inferSelect;
export type TradeAnnotation = typeof tradeAnnotations.$inferSelect;
export type NewTradeAnnotation = typeof tradeAnnotations.$inferInsert;
export type GexRun = typeof gexRuns.$inferSelect;
export type NewGexRun = typeof gexRuns.$inferInsert;
export type GexLevel = typeof gexLevels.$inferSelect;
export type NewGexLevel = typeof gexLevels.$inferInsert;
export type GexBacktestResult = typeof gexBacktestResults.$inferSelect;
export type NewGexBacktestResult = typeof gexBacktestResults.$inferInsert;
export type OptionPosition = typeof optionPositions.$inferSelect;
export type NewOptionPosition = typeof optionPositions.$inferInsert;
export type OptionStrategy = typeof optionStrategies.$inferSelect;
export type NewOptionStrategy = typeof optionStrategies.$inferInsert;
export type OptionStrategyLeg = typeof optionStrategyLegs.$inferSelect;
export type NewOptionStrategyLeg = typeof optionStrategyLegs.$inferInsert;
export type StrategyAllocationEvent = typeof strategyAllocationEvents.$inferSelect;
export type NewStrategyAllocationEvent = typeof strategyAllocationEvents.$inferInsert;
export type StrategyManeuverEvent = typeof strategyManeuverEvents.$inferSelect;
export type NewStrategyManeuverEvent = typeof strategyManeuverEvents.$inferInsert;
export type StrategyFundingEvent = typeof strategyFundingEvents.$inferSelect;
export type NewStrategyFundingEvent = typeof strategyFundingEvents.$inferInsert;
export type StrategyFundingSegment = typeof strategyFundingSegments.$inferSelect;
export type NewStrategyFundingSegment = typeof strategyFundingSegments.$inferInsert;
export type OptionPositionExecution = typeof optionPositionExecutions.$inferSelect;
export type NewOptionPositionExecution = typeof optionPositionExecutions.$inferInsert;
export type FundingSegmentQuality = 'FULL' | 'PARTIAL' | 'INSUFFICIENT_DATA';




