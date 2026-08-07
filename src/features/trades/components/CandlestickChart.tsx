'use client';

import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import type { Trade, CandleData } from '@/lib/db/schema';

interface CandlestickChartProps {
  candles: CandleData[];
  trades: Trade[];
}

interface CandlePoint {
  time: string;
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // Para o bar chart de candlestick
  bodyBottom: number;
  bodyHeight: number;
  wickTop: number;
  wickBottom: number;
  isBullish: boolean;
}

function formatTime(dateTime: string): string {
  const timePart = dateTime.includes('T') ? dateTime.split('T')[1] : dateTime;
  return timePart?.substring(0, 5) || '';
}

function CustomCandlestick(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: CandlePoint;
}) {
  const { x = 0, width = 0, payload } = props;
  if (!payload) return null;

  const { open, high, low, close, isBullish } = payload;
  const color = isBullish ? '#22c55e' : '#ef4444';
  const centerX = x + width / 2;

  // Preciso de escala Y - vou usar o container height
  // Os valores são renderizados pelo Recharts, preciso calcular posições relativas
  return (
    <g>
      {/* Corpo do candle */}
      <rect
        x={x + width * 0.15}
        y={props.y}
        width={width * 0.7}
        height={Math.max(Math.abs(props.height || 1), 1)}
        fill={isBullish ? color : color}
        fillOpacity={isBullish ? 0.3 : 0.5}
        stroke={color}
        strokeWidth={1}
        rx={1}
      />
    </g>
  );
}

export function CandlestickChart({ candles, trades }: CandlestickChartProps) {
  if (candles.length === 0) return null;

  // Ordena candles por horário (mais antigo primeiro)
  const sortedCandles = [...candles].sort((a, b) =>
    a.dateTime.localeCompare(b.dateTime)
  );

  // Calcula min/max para o eixo Y
  const allLows = sortedCandles.map(c => c.low);
  const allHighs = sortedCandles.map(c => c.high);
  const minPrice = Math.min(...allLows) - 100;
  const maxPrice = Math.max(...allHighs) + 100;

  // Transforma em dados para o chart
  const data: CandlePoint[] = sortedCandles.map(c => {
    const isBullish = c.close >= c.open;
    const bodyBottom = isBullish ? c.open : c.close;
    const bodyTop = isBullish ? c.close : c.open;

    return {
      time: c.dateTime,
      timeLabel: formatTime(c.dateTime),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume || 0,
      bodyBottom,
      bodyHeight: bodyTop - bodyBottom || 5,
      wickTop: c.high - bodyTop,
      wickBottom: bodyBottom - c.low,
      isBullish,
    };
  });

  // Encontra os horários dos trades para marcar no gráfico
  const tradeMarkers = trades.map(t => {
    const timeStr = t.openTime.includes(' ')
      ? t.openTime.split(' ')[1]?.substring(0, 5)
      : t.openTime.substring(0, 5);
    return {
      time: timeStr,
      side: t.side,
      price: t.entryPrice,
      result: t.reais || 0,
    };
  });

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
        📈 Gráfico Intraday (Candles)
      </h3>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <XAxis
              dataKey="timeLabel"
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#1e293b' }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => v.toLocaleString('pt-BR')}
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value: any, name: any) => {
                const labels: Record<string, string> = {
                  bodyBottom: 'Abertura',
                  bodyHeight: 'Corpo',
                  high: 'Máxima',
                  low: 'Mínima',
                  close: 'Fechamento',
                };
                return [value.toLocaleString('pt-BR'), labels[name] || name];
              }}
            />

            {/* Linhas de trades */}
            {tradeMarkers.map((marker, i) => (
              <ReferenceLine
                key={`trade-${i}`}
                y={marker.price}
                stroke={marker.side === 'C' ? '#22c55e' : '#ef4444'}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `${marker.side === 'C' ? '🟢' : '🔴'} ${marker.price.toLocaleString('pt-BR')}`,
                  position: 'right',
                  fill: marker.side === 'C' ? '#22c55e' : '#ef4444',
                  fontSize: 10,
                }}
              />
            ))}

            {/* Candles como barras empilhadas */}
            <Bar dataKey="bodyBottom" stackId="candle" fill="transparent" />
            <Bar dataKey="bodyHeight" stackId="candle" shape={<CustomCandlestick />}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.isBullish ? '#22c55e' : '#ef4444'}
                  fillOpacity={entry.isBullish ? 0.3 : 0.5}
                  stroke={entry.isBullish ? '#22c55e' : '#ef4444'}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda de trades */}
      {tradeMarkers.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {tradeMarkers.map((m, i) => (
            <span
              key={i}
              className={`px-2 py-1 rounded ${
                m.result >= 0
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-rose-500/10 text-rose-400'
              }`}
            >
              {m.side === 'C' ? '🟢 Compra' : '🔴 Venda'} {m.time} @ {m.price.toLocaleString('pt-BR')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
