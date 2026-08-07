import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

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

  filePath: text('file_path').notNull(),
  caption: text('caption'),
  imageType: text('image_type'), // "entrada" | "saida" | "contexto"

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

// ─── Types ───────────────────────────────────────────────────
export type TradingDay = typeof tradingDays.$inferSelect;
export type NewTradingDay = typeof tradingDays.$inferInsert;
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type TradeImage = typeof tradeImages.$inferSelect;
export type CandleData = typeof candleData.$inferSelect;
export type AudioRecord = typeof audioRecords.$inferSelect;
export type VideoRecord = typeof videoRecords.$inferSelect;
