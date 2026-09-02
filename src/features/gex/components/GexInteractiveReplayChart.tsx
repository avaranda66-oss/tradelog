'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { GexCandle, GexSubFrame } from '../actions';

interface GexLevelPlot {
  name: string;
  price: number;
  levelType: string;
  strike?: number;
  gexM?: number;
  firstTouch?: {
    time: string;
    entryPrice: number;
    bouncePts: number;
    adversePts: number;
    isNaMosca: boolean;
    isBounce?: boolean;
    isBreak?: boolean;
    statusLabel: string;
    minDist?: number;
  } | null;
}


interface GexInteractiveReplayChartProps {
  candles: GexCandle[];
  subFrames: GexSubFrame[];
  levels: GexLevelPlot[];
  scriptName: string;
  asset: string;
}

export function GexInteractiveReplayChart({
  candles,
  subFrames,
  levels,
  scriptName,
  asset,
}: GexInteractiveReplayChartProps) {
  // Controle de reprodução
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);


  // Modos de interação
  const [interactionMode, setInteractionMode] = useState<'crosshair' | 'hand'>('crosshair');
  
  // Transformações do Gráfico (Zoom, Pan e Escala Dinâmica)
  const [zoomLevel, setZoomLevel] = useState<number>(1.2); // Zoom horizontal
  const [panOffset, setPanOffset] = useState<number>(0); // Posição horizontal (em velas)
  const [priceScaleFactor, setPriceScaleFactor] = useState<number>(1.0); // Escala vertical do Eixo Y
  const [pricePanOffset, setPricePanOffset] = useState<number>(0); // Deslocamento vertical em pontos
  const [rightMarginSlots, setRightMarginSlots] = useState<number>(15); // Espaço vazio à direita para respiro

  // Mouse e Tooltip
  const [mousePos, setMousePos] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<GexCandle | null>(null);
  const [activeLevelFilter, setActiveLevelFilter] = useState<'all' | 'masters' | 'secondary'>('all');
  const [hoverZone, setHoverZone] = useState<'chart' | 'yAxis' | 'xAxis'>('chart');

  // Controle de Arraste (Mãozinha, Eixo Y e Eixo X)
  const isDraggingRef = useRef<boolean>(false);
  const dragTypeRef = useRef<'chart' | 'yAxis' | 'xAxis'>('chart');
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    panStart: number;
    pricePanStart: number;
    priceScaleStart: number;
    zoomStart: number;
  }>({
    mouseX: 0,
    mouseY: 0,
    panStart: 0,
    pricePanStart: 0,
    priceScaleStart: 1.0,
    zoomStart: 1.0,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalFrames = subFrames.length > 0 ? subFrames.length : candles.length;
  const currentSubFrame = subFrames[currentFrameIndex] || null;

  // Filtro de níveis visíveis
  const visibleLevels = useMemo(() => {
    return levels.filter((lvl) => {
      if (activeLevelFilter === 'masters') {
        return ['call_wall', 'put_wall', 'zero_gamma'].includes(lvl.levelType.toLowerCase());
      }
      if (activeLevelFilter === 'secondary') {
        return lvl.levelType.toLowerCase().startsWith('r') || lvl.levelType.toLowerCase().startsWith('s');
      }
      return true;
    });
  }, [levels, activeLevelFilter]);

  // Lista de eventos de primeiro toque
  const touchEvents = useMemo(() => {
    return levels
      .filter((lvl) => lvl.firstTouch && lvl.firstTouch.time && (lvl.firstTouch.isBounce || lvl.firstTouch.isBreak))
      .map((lvl) => {
        const timeStr = lvl.firstTouch!.time.slice(0, 5); // "09:35"
        const candleIdx = candles.findIndex((c) => c.minute_str === timeStr);
        const frameIdx = subFrames.findIndex((f) => f.time.startsWith(timeStr));
        return {
          levelName: lvl.name,
          levelPrice: lvl.price,
          levelType: lvl.levelType,
          candleIdx: candleIdx >= 0 ? candleIdx : 0,
          frameIdx: frameIdx >= 0 ? frameIdx : 0,
          time: lvl.firstTouch!.time,
          minuteStr: timeStr,
          statusLabel: lvl.firstTouch!.statusLabel,
          bouncePts: lvl.firstTouch!.bouncePts,
          adversePts: lvl.firstTouch!.adversePts,
          isNaMosca: lvl.firstTouch!.isNaMosca,
          isBounce: lvl.firstTouch!.isBounce,
          isBreak: lvl.firstTouch!.isBreak,
          minDist: lvl.firstTouch!.minDist,
        };
      })
      .sort((a, b) => a.candleIdx - b.candleIdx);
  }, [levels, candles, subFrames]);


  // Loop de Reprodução Frame a Frame
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isPlaying) {
      const intervalMs = Math.max(16, Math.floor(1000 / playbackSpeed));
      timer = setInterval(() => {
        setCurrentFrameIndex((prev) => {
          if (prev >= totalFrames - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, playbackSpeed, totalFrames]);

  // Auto-scroll durante o replay se passar da tela
  useEffect(() => {
    if (isPlaying && zoomLevel > 1 && currentSubFrame) {
      const activeCandleIdx = currentSubFrame.candle_idx;
      const visibleCount = Math.max(15, Math.floor(candles.length / zoomLevel));
      if (activeCandleIdx > panOffset + visibleCount - 8) {
        setPanOffset(Math.max(0, activeCandleIdx - Math.floor(visibleCount * 0.7)));
      }
    }
  }, [currentFrameIndex, isPlaying, zoomLevel, currentSubFrame, candles.length, panOffset]);

  // Listener Nativo de Wheel com { passive: false } para travar o scroll da página
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const mouseCanvasX = (e.clientX - rect.left) * scaleX;
      const padding = { left: 15, right: 95 };

      // Se o mouse estiver sobre o Eixo Y lateral direito: roda o zoom da escala vertical
      if (mouseCanvasX >= canvas.width - padding.right) {
        const factor = e.deltaY < 0 ? 0.9 : 1.1;
        setPriceScaleFactor((prev) => Math.max(0.05, Math.min(50, prev * factor)));
        return;
      }

      // Zoom horizontal normal no gráfico
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoomLevel((prev) => {
        const next = Math.max(0.6, Math.min(30, parseFloat((prev * zoomFactor).toFixed(2))));
        if (next <= 0.6) setPanOffset(0);
        return next;
      });
    };

    canvas.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

  // Renderização de Alta Performance no Canvas
  const renderChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Fundo do gráfico
    ctx.fillStyle = '#050912';
    ctx.fillRect(0, 0, width, height);

    const padding = { top: 25, right: 95, bottom: 35, left: 15 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Fundo do Eixo Y lateral direito
    ctx.fillStyle = '#070d18';
    ctx.fillRect(width - padding.right, 0, padding.right, height);

    // Linha divisória do Eixo Y
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width - padding.right, 0);
    ctx.lineTo(width - padding.right, height);
    ctx.stroke();

    // Linha divisória do Eixo X
    ctx.beginPath();
    ctx.moveTo(0, height - padding.bottom);
    ctx.lineTo(width, height - padding.bottom);
    ctx.stroke();

    // Janela de velas visíveis pelo Zoom, Pan e Margem Direita
    const totalSlotsInView = Math.max(8, Math.min(candles.length + rightMarginSlots, Math.floor((candles.length + rightMarginSlots) / zoomLevel)));
    const candleSlotWidth = chartWidth / totalSlotsInView;
    // Largura proporcional sem teto artificial: ocupa 80% do slot
    const candleBodyWidth = Math.max(2, candleSlotWidth * 0.80);
    const wickWidth = Math.max(1.2, Math.min(5, candleSlotWidth * 0.08));


    // Determina o estado da vela atual no replay
    let activeCandleIdx = 0;
    let isPreOpen = false;
    let partialCandle: { open: number; high: number; low: number; close: number; time: string; volume: number; ticks: number } | null = null;

    if (currentSubFrame) {
      isPreOpen = currentSubFrame.is_pre_open;
      activeCandleIdx = currentSubFrame.candle_idx;
      if (!isPreOpen && activeCandleIdx >= 0) {
        partialCandle = {
          open: currentSubFrame.open,
          high: currentSubFrame.high,
          low: currentSubFrame.low,
          close: currentSubFrame.close,
          time: currentSubFrame.time,
          volume: currentSubFrame.volume,
          ticks: currentSubFrame.ticks,
        };
      }
    } else {
      activeCandleIdx = candles.length - 1;
    }

    // Calcula limites de preço de referência
    let baseMinPrice = Infinity;
    let baseMaxPrice = -Infinity;

    for (let i = 0; i <= activeCandleIdx && i < candles.length; i++) {
      if (i === activeCandleIdx && partialCandle) {
        baseMinPrice = Math.min(baseMinPrice, partialCandle.low);
        baseMaxPrice = Math.max(baseMaxPrice, partialCandle.high);
      } else if (candles[i]) {
        baseMinPrice = Math.min(baseMinPrice, candles[i].low);
        baseMaxPrice = Math.max(baseMaxPrice, candles[i].high);
      }
    }

    if (baseMinPrice === Infinity || baseMaxPrice === -Infinity) {
      baseMinPrice = candles[0]?.open || 170000;
      baseMaxPrice = candles[0]?.open || 170000;
    }

    for (const lvl of visibleLevels) {
      if (lvl.price > 0) {
        baseMinPrice = Math.min(baseMinPrice, lvl.price);
        baseMaxPrice = Math.max(baseMaxPrice, lvl.price);
      }
    }

    // Aplica escala vertical dinâmica (priceScaleFactor) e deslocamento vertical (pricePanOffset)
    const rawRange = baseMaxPrice - baseMinPrice || 500;
    const centerPrice = (baseMaxPrice + baseMinPrice) / 2 + pricePanOffset;
    const scaledHalfRange = (rawRange * 0.6 * priceScaleFactor);

    const minPrice = centerPrice - scaledHalfRange;
    const maxPrice = centerPrice + scaledHalfRange;
    const priceRange = maxPrice - minPrice || 1;

    const getY = (price: number) => {
      return padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    };

    // Grade Horizontal e Preços no Eixo Y
    ctx.strokeStyle = '#0e1726';
    ctx.lineWidth = 1;
    
    // Escolhe step inteligente conforme o zoom vertical
    let priceStep = 250;
    if (priceRange > 6000) priceStep = 1000;
    else if (priceRange > 3000) priceStep = 500;
    else if (priceRange < 800) priceStep = 100;
    else if (priceRange < 300) priceStep = 50;

    const firstGridPrice = Math.ceil(minPrice / priceStep) * priceStep;
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';

    for (let p = firstGridPrice; p <= maxPrice; p += priceStep) {
      const y = getY(p);
      if (y >= padding.top && y <= height - padding.bottom) {
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        ctx.fillText(`${p.toLocaleString('pt-BR')} pts`, width - padding.right + 8, y + 3);
      }
    }

    // Linhas Horizontais das Regiões GEX
    for (const lvl of visibleLevels) {
      if (!lvl.price || lvl.price <= 0) continue;
      const y = getY(lvl.price);
      if (y < padding.top - 20 || y > height - padding.bottom + 20) continue;

      const lt = lvl.levelType.toLowerCase();
      let strokeColor = '#3b82f6';
      let bgColor = 'rgba(59, 130, 246, 0.2)';
      let textColor = '#60a5fa';

      if (lt === 'call_wall') {
        strokeColor = '#ef4444';
        bgColor = 'rgba(239, 68, 68, 0.25)';
        textColor = '#f87171';
      } else if (lt === 'put_wall') {
        strokeColor = '#10b981';
        bgColor = 'rgba(16, 185, 129, 0.25)';
        textColor = '#34d399';
      } else if (lt === 'zero_gamma') {
        strokeColor = '#a855f7';
        bgColor = 'rgba(168, 85, 247, 0.25)';
        textColor = '#c084fc';
      } else if (lt.startsWith('r')) {
        strokeColor = '#06b6d4';
        bgColor = 'rgba(6, 182, 212, 0.15)';
        textColor = '#22d3ee';
      } else if (lt.startsWith('s')) {
        strokeColor = '#f59e0b';
        bgColor = 'rgba(245, 158, 11, 0.15)';
        textColor = '#fbbf24';
      }

      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lt === 'call_wall' || lt === 'put_wall' || lt === 'zero_gamma' ? 2 : 1;
      ctx.setLineDash(lt === 'zero_gamma' ? [5, 4] : lt.startsWith('r') || lt.startsWith('s') ? [3, 3] : []);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.restore();

      // Badge no eixo Y lateral direito
      ctx.fillStyle = bgColor;
      ctx.fillRect(width - padding.right + 2, y - 9, 88, 18);
      ctx.strokeStyle = strokeColor;
      ctx.strokeRect(width - padding.right + 2, y - 9, 88, 18);

      ctx.fillStyle = textColor;
      ctx.font = 'bold 9px monospace';
      ctx.fillText(lvl.name.slice(0, 11), width - padding.right + 5, y + 3);
    }

    // Modo Pré-Abertura (09:00:00)
    if (isPreOpen) {
      const openPrice = candles[0]?.open || 170650;
      const yOpen = getY(openPrice);
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, yOpen);
      ctx.lineTo(width - padding.right, yOpen);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`⚡ PREÇO DE ABERTURA: ${openPrice.toLocaleString('pt-BR')} pts (Aguardando Play)`, width / 2, yOpen - 12);
      ctx.restore();
    } else {
      // Desenha Candlesticks visíveis
      const startSlot = panOffset;
      const endSlot = panOffset + totalSlotsInView;

      for (let i = startSlot; i < endSlot; i++) {
        if (i < 0 || i >= candles.length || i > activeCandleIdx) continue;

        const slotX = padding.left + (i - startSlot) * candleSlotWidth + candleSlotWidth / 2;
        let cOpen = candles[i].open;
        let cHigh = candles[i].high;
        let cLow = candles[i].low;
        let cClose = candles[i].close;

        // Formação intra-candle
        const isCurrentForming = i === activeCandleIdx && partialCandle !== null;
        if (isCurrentForming && partialCandle) {
          cOpen = partialCandle.open;
          cHigh = partialCandle.high;
          cLow = partialCandle.low;
          cClose = partialCandle.close;
        }

        const isUp = cClose >= cOpen;
        const color = isUp ? '#10b981' : '#f43f5e';

        const openY = getY(cOpen);
        const closeY = getY(cClose);
        const highY = getY(cHigh);
        const lowY = getY(cLow);

        // Pavio
        ctx.strokeStyle = color;
        ctx.lineWidth = wickWidth;
        ctx.beginPath();

        ctx.moveTo(slotX, highY);
        ctx.lineTo(slotX, lowY);
        ctx.stroke();

        // Corpo
        ctx.fillStyle = color;
        const bodyY = Math.min(openY, closeY);
        const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
        ctx.fillRect(slotX - candleBodyWidth / 2, bodyY, candleBodyWidth, bodyHeight);

        // Efeito de formação viva no candle ativo
        if (isCurrentForming) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.strokeRect(slotX - candleBodyWidth / 2, bodyY, candleBodyWidth, bodyHeight);

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(slotX, closeY, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Rótulos de tempo no Eixo X
        const step = zoomLevel > 4 ? 5 : zoomLevel > 1.8 ? 10 : 30;
        if (i % step === 0 || i === activeCandleIdx) {
          ctx.fillStyle = '#64748b';
          ctx.font = '9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(candles[i].minute_str, slotX, height - padding.bottom + 15);
        }
      }

      // Marcadores de 1º Toque
      for (const ev of touchEvents) {
        if (ev.candleIdx >= startSlot && ev.candleIdx < endSlot && ev.candleIdx <= activeCandleIdx) {
          const x = padding.left + (ev.candleIdx - startSlot) * candleSlotWidth + candleSlotWidth / 2;
          const y = getY(ev.levelPrice);

          ctx.save();
          const dotColor = ev.isBreak ? '#f43f5e' : ev.isNaMosca ? '#10b981' : '#06b6d4';
          const textColor = ev.isBreak ? '#fb7185' : ev.isNaMosca ? '#34d399' : '#38bdf8';
          const labelText = ev.isBreak ? '❌ ROMPEU' : ev.isNaMosca ? `🎯 +${ev.bouncePts}pts` : `✅ +${ev.bouncePts}pts`;

          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = textColor;
          ctx.textAlign = 'center';
          ctx.fillText(labelText, x, y - 9);
          ctx.restore();
        }
      }

    }

    // Mira e Cursor Crosshair
    if (interactionMode === 'crosshair' && mousePos && hoverZone === 'chart') {
      const { canvasX, canvasY } = mousePos;
      if (canvasX >= padding.left && canvasX <= width - padding.right && canvasY >= padding.top && canvasY <= height - padding.bottom) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(canvasX, padding.top);
        ctx.lineTo(canvasX, height - padding.bottom);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(padding.left, canvasY);
        ctx.lineTo(width - padding.right, canvasY);
        ctx.stroke();

        // Tag de preço no Eixo Y sob a mira
        const priceAtCursor = minPrice + ((padding.top + chartHeight - canvasY) / chartHeight) * priceRange;
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(width - padding.right + 2, canvasY - 8, 88, 16);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`${Math.round(priceAtCursor).toLocaleString('pt-BR')} pts`, width - padding.right + 6, canvasY + 3);
        ctx.restore();
      }
    }
  }, [
    candles,
    subFrames,
    currentSubFrame,
    currentFrameIndex,
    zoomLevel,
    panOffset,
    priceScaleFactor,
    pricePanOffset,
    rightMarginSlots,
    visibleLevels,
    touchEvents,
    interactionMode,
    mousePos,
    hoverZone,
  ]);

  useEffect(() => {
    renderChart();
  }, [renderChart]);

  // Manipulação de Mouse
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const padding = { left: 15, right: 95, bottom: 35, top: 25 };

    // Determina a zona sob o mouse
    let currentZone: 'chart' | 'yAxis' | 'xAxis' = 'chart';
    if (canvasX >= canvas.width - padding.right) {
      currentZone = 'yAxis';
    } else if (canvasY >= canvas.height - padding.bottom) {
      currentZone = 'xAxis';
    }
    setHoverZone(currentZone);

    // Se estiver no meio de um arraste (Drag)
    if (isDraggingRef.current) {
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      // 1. Arrastar a Escala de Preços (Eixo Y)
      if (dragTypeRef.current === 'yAxis') {
        const factor = 1 + deltaY * 0.006;
        setPriceScaleFactor(Math.max(0.05, Math.min(50, dragStartRef.current.priceScaleStart * factor)));
        return;
      }

      // 2. Arrastar o Eixo X (Zoom Horizontal)
      if (dragTypeRef.current === 'xAxis') {
        const factor = 1 - deltaX * 0.005;
        setZoomLevel(Math.max(0.6, Math.min(30, dragStartRef.current.zoomStart * factor)));
        return;
      }

      // 3. Arrastar o Gráfico Livremente (Modo Mãozinha)
      if (dragTypeRef.current === 'chart') {
        const chartWidth = canvas.width - padding.left - padding.right;
        const totalSlotsInView = Math.max(10, Math.floor((candles.length + rightMarginSlots) / zoomLevel));
        const slotWidth = chartWidth / totalSlotsInView;
        const candleDelta = Math.round(deltaX / slotWidth);

        // Deslocamento horizontal
        setPanOffset(dragStartRef.current.panStart - candleDelta);

        // Deslocamento vertical em pontos
        const ptsPerPixel = (2000 * priceScaleFactor) / canvas.height;
        setPricePanOffset(dragStartRef.current.pricePanStart + deltaY * ptsPerPixel);
        return;
      }
    }

    setMousePos({ x: e.clientX, y: e.clientY, canvasX, canvasY });

    // Acha a vela sob o cursor
    if (currentZone === 'chart') {
      const chartWidth = canvas.width - padding.left - padding.right;
      const totalSlotsInView = Math.max(10, Math.floor((candles.length + rightMarginSlots) / zoomLevel));
      const slotWidth = chartWidth / totalSlotsInView;
      const slotIdx = Math.floor((canvasX - padding.left) / slotWidth);
      const candleIdx = panOffset + slotIdx;

      if (candleIdx >= 0 && candleIdx < candles.length) {
        setHoveredCandle(candles[candleIdx]);
      } else {
        setHoveredCandle(null);
      }
    } else {
      setHoveredCandle(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    const padding = { right: 95, bottom: 35 };

    isDraggingRef.current = true;

    if (canvasX >= canvas.width - padding.right) {
      dragTypeRef.current = 'yAxis';
    } else if (canvasY >= canvas.height - padding.bottom) {
      dragTypeRef.current = 'xAxis';
    } else {
      dragTypeRef.current = 'chart';
    }

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panStart: panOffset,
      pricePanStart: pricePanOffset,
      priceScaleStart: priceScaleFactor,
      zoomStart: zoomLevel,
    };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setMousePos(null);
    setHoveredCandle(null);
  };

  // Duplo clique para resetar a escala do eixo
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const padding = { right: 95 };

    if (canvasX >= canvas.width - padding.right) {
      // Reset Escala Vertical (Auto-Fit)
      setPriceScaleFactor(1.0);
      setPricePanOffset(0);
    } else {
      // Reset Zoom e Posição
      setZoomLevel(1.2);
      setPanOffset(0);
      setPriceScaleFactor(1.0);
      setPricePanOffset(0);
    }
  };

  // Determina o cursor do mouse
  const getCursorClass = () => {
    if (isDraggingRef.current) {
      if (dragTypeRef.current === 'yAxis') return 'cursor-ns-resize';
      if (dragTypeRef.current === 'xAxis') return 'cursor-ew-resize';
      return 'cursor-grabbing';
    }
    if (hoverZone === 'yAxis') return 'cursor-ns-resize';
    if (hoverZone === 'xAxis') return 'cursor-ew-resize';
    if (interactionMode === 'hand') return 'cursor-grab';
    return 'cursor-crosshair';
  };

  const displayCandle = hoveredCandle || (currentSubFrame && currentSubFrame.candle_idx >= 0 ? candles[currentSubFrame.candle_idx] : candles[0]);
  const progressPct = totalFrames > 0 ? ((currentFrameIndex + 1) / totalFrames) * 100 : 0;

  return (
    <div className="bg-[#050912] border-2 border-teal-500/40 rounded-2xl p-5 space-y-4 shadow-2xl font-mono text-slate-100 relative select-none">
      {/* HEADER: TÍTULO & CONTROLES */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-3 w-3 relative">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPlaying ? 'bg-emerald-400' : 'bg-teal-400'} opacity-75`} />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isPlaying ? 'bg-emerald-500' : 'bg-teal-500'}`} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-teal-300 uppercase tracking-wider flex items-center gap-2">
              <span>🎬 REPLAY INTERATIVO & ENGINE GRÁFICA GEX</span>
              <span className="text-[10px] text-slate-400 font-normal">({scriptName} · {asset})</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Escala vertical arrastável no Eixo Y, zoom contínuo no Eixo X, navegação livre e formação intra-candle.
            </p>
          </div>
        </div>

        {/* FERRAMENTAS DE INTERAÇÃO (MÃOZINHA, CROSSHAIR, RESET) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Alternador de Modo: Mira vs Mãozinha */}
          <div className="flex items-center bg-[#080f1a] p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setInteractionMode('crosshair')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                interactionMode === 'crosshair'
                  ? 'bg-teal-500/25 text-teal-300 border border-teal-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Modo Mira (Crosshair & Leitura de Preços)"
            >
              <span>🎯</span>
              <span>MIRA</span>
            </button>
            <button
              type="button"
              onClick={() => setInteractionMode('hand')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                interactionMode === 'hand'
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Modo Mãozinha (Arrastar Livremente o Gráfico)"
            >
              <span>🖐️</span>
              <span>MÃOZINHA</span>
            </button>
          </div>

          {/* Botões de Zoom Rápido e Auto-Fit */}
          <div className="flex items-center gap-1 bg-[#080f1a] p-1 rounded-xl border border-slate-800 text-xs">
            <span className="text-[10px] text-slate-500 px-1 font-bold">ZOOM:</span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(30, parseFloat((z * 1.3).toFixed(2))))}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded font-bold text-slate-200"
              title="Zoom In (Velas Maiores)"
            >
              🔍 +
            </button>
            <span className="px-1.5 text-teal-300 font-bold text-[11px]">{zoomLevel.toFixed(1)}x</span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.6, parseFloat((z / 1.3).toFixed(2))))}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded font-bold text-slate-200"
              title="Zoom Out (Mais Velas)"
            >
              🔍 -
            </button>
            <button
              type="button"
              onClick={() => {
                setZoomLevel(1.2);
                setPanOffset(0);
                setPriceScaleFactor(1.0);
                setPricePanOffset(0);
              }}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-teal-300 font-bold hover:text-white"
              title="Auto-Fit (Redefinir Escalas e Posição)"
            >
              AUTO-FIT
            </button>
          </div>

          {/* Filtro de Níveis Visíveis */}
          <div className="flex items-center gap-1 bg-[#080f1a] p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveLevelFilter('all')}
              className={`px-2 py-1 rounded text-[11px] font-bold ${
                activeLevelFilter === 'all' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400'
              }`}
            >
              Todos ({levels.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveLevelFilter('masters')}
              className={`px-2 py-1 rounded text-[11px] font-bold ${
                activeLevelFilter === 'masters' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400'
              }`}
            >
              Mestres
            </button>
          </div>
        </div>
      </div>

      {/* PAINEL SUPERIOR DO TOOLTIP E STATUS DA VELA ATUAL */}
      {displayCandle && (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 bg-[#080e18] p-3 rounded-xl border border-teal-500/30 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 block font-bold">HORÁRIO TICK</span>
            <span className="text-teal-300 font-bold text-sm">
              {currentSubFrame ? currentSubFrame.time : displayCandle.minute_str} BRT
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-bold">ABERTURA</span>
            <span className="text-slate-200 font-bold">{displayCandle.open.toLocaleString('pt-BR')}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-bold">MÁXIMA</span>
            <span className="text-emerald-400 font-bold">{displayCandle.high.toLocaleString('pt-BR')}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-bold">MÍNIMA</span>
            <span className="text-rose-400 font-bold">{displayCandle.low.toLocaleString('pt-BR')}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-bold">FECHAMENTO / ATUAL</span>
            <span className={`font-bold text-sm ${displayCandle.close >= displayCandle.open ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(currentSubFrame && !currentSubFrame.is_pre_open ? currentSubFrame.close : displayCandle.close).toLocaleString('pt-BR')} pts
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block font-bold">TICKS / VOLUME</span>
            <span className="text-cyan-300 font-bold">
              {(currentSubFrame ? currentSubFrame.ticks : displayCandle.ticks_count).toLocaleString('pt-BR')} ticks
            </span>
          </div>
        </div>
      )}

      {/* ÁREA PRINCIPAL DO GRÁFICO (CANVAS COM ENGINE ESTILO TRADINGVIEW / PROFIT) */}
      <div
        ref={containerRef}
        className={`relative w-full h-[470px] bg-[#050912] rounded-xl border border-slate-800 overflow-hidden shadow-inner ${getCursorClass()}`}
      >
        <canvas
          ref={canvasRef}
          width={1120}
          height={470}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onDoubleClick={handleDoubleClick}
          className="w-full h-full block"
        />

        {/* Badge Flutuante Informativa no Canto Superior Esquerdo */}
        <div className="absolute top-3 left-3 bg-[#080f1a]/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/80 text-[11px] flex items-center gap-2 shadow-lg">
          <span className="text-slate-400">Tempo:</span>
          <span className="text-teal-300 font-bold">{currentSubFrame ? currentSubFrame.time : '09:00:00'}</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">Zoom:</span>
          <span className="text-amber-300 font-bold">{zoomLevel.toFixed(1)}x</span>
          <span className="text-slate-600">|</span>
          <span className="text-[10px] text-slate-400">
            💡 <strong className="text-teal-300">Dica:</strong> Arraste o <span className="text-cyan-300">Eixo de Preço (Direita)</span> para esticar verticalmente!
          </span>
        </div>
      </div>

      {/* BARRA DE CONTROLES DO REPLAY / SIMULADOR FRAME A FRAME */}
      <div className="bg-[#080e18] p-4 rounded-xl border border-slate-800 space-y-3">
        {/* Slider Temporal */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-bold">09:00:00 (Abertura WINFUT)</span>
            <span className="text-teal-300 font-bold">
              Frame: {currentFrameIndex + 1} / {totalFrames} ({currentSubFrame?.time || '09:00:00'}) · {progressPct.toFixed(1)}%
            </span>
            <span className="text-slate-400 font-bold">18:00:00 (Fechamento)</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, totalFrames - 1)}
            value={currentFrameIndex}
            onChange={(e) => {
              setCurrentFrameIndex(parseInt(e.target.value, 10));
              setIsPlaying(false);
            }}
            className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-400"
          />
        </div>

        {/* Botoeira de Ações do Player */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            {/* Início (Frame 0 Pré-Abertura) */}
            <button
              type="button"
              onClick={() => {
                setCurrentFrameIndex(0);
                setIsPlaying(false);
                setPanOffset(0);
              }}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-bold"
              title="Voltar para a Pré-Abertura (09:00:00)"
            >
              ⏮ Abertura
            </button>

            {/* Passo Anterior (-1 Sub-Frame) */}
            <button
              type="button"
              onClick={() => {
                setCurrentFrameIndex((prev) => Math.max(0, prev - 1));
                setIsPlaying(false);
              }}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-bold"
              title="Recuar 1 Passo Tick"
            >
              ⏪ -1 Tick
            </button>

            {/* Play / Pause */}
            <button
              type="button"
              onClick={() => setIsPlaying((prev) => !prev)}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg flex items-center gap-2 ${
                isPlaying
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-amber-500/20'
                  : 'bg-teal-500 hover:bg-teal-400 text-slate-950 font-black shadow-teal-500/30'
              }`}
            >
              <span>{isPlaying ? '⏸ PAUSAR' : '▶ REPLAY (PLAY)'}</span>
            </button>

            {/* Próximo Passo (+1 Sub-Frame) */}
            <button
              type="button"
              onClick={() => {
                setCurrentFrameIndex((prev) => Math.min(totalFrames - 1, prev + 1));
                setIsPlaying(false);
              }}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-bold"
              title="Avançar 1 Passo Tick"
            >
              ⏩ +1 Tick
            </button>

            {/* Fim */}
            <button
              type="button"
              onClick={() => {
                setCurrentFrameIndex(totalFrames - 1);
                setIsPlaying(false);
              }}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-bold"
              title="Ir para o Fechamento"
            >
              ⏭ Fim
            </button>
          </div>

          {/* Velocidade de Reprodução */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400 font-bold mr-1">Velocidade:</span>
            {[1, 2, 5, 10, 20, 50, 100].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                  playbackSpeed === spd
                    ? 'bg-teal-500 text-slate-950 font-black shadow-md shadow-teal-500/30'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

        </div>

        {/* ATALHOS DE PULO DIRETO NOS 1º TOQUES */}
        {touchEvents.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-slate-500 font-bold uppercase">PULO RÁPIDO NOS 1º TOQUES:</span>
            {touchEvents.map((ev, eIdx) => (
              <button
                key={ev.levelName + eIdx}
                type="button"
                onClick={() => {
                  setCurrentFrameIndex(ev.frameIdx);
                  setIsPlaying(false);
                  if (zoomLevel > 1) {
                    setPanOffset(Math.max(0, ev.candleIdx - 10));
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 border ${
                  currentSubFrame && currentSubFrame.time.startsWith(ev.minuteStr)
                    ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-md'
                    : 'bg-[#050912] text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                }`}
                title={`Pular para o 1º toque às ${ev.time} (${ev.levelName})`}
              >
                <span>🎯</span>
                <span>{ev.levelName} ({ev.minuteStr})</span>
                <span className="text-emerald-400 font-bold">+{ev.bouncePts} pts</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
