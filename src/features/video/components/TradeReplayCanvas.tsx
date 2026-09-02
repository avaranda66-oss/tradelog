'use client';

import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';

export interface TradeReplayCanvasHandle {
  clear: () => void;
  undo: () => void;
  hasDrawings: () => boolean;
  exportDrawingData: () => string;
  importDrawingData: (json: string) => void;
  toDataURL: () => string;
}


interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  color: string;
  size: number;
  isEraser: boolean;
}

interface TradeReplayCanvasProps {
  enabled: boolean;
  color: string;
  size: number;
  isEraser: boolean;
  onDrawingStart?: () => void;
  className?: string;
}

export const TradeReplayCanvas = forwardRef<TradeReplayCanvasHandle, TradeReplayCanvasProps>(
  ({ enabled, color, size, isEraser, onDrawingStart, className = '' }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
    const isDrawingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      clear() {
        setStrokes([]);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      },
      undo() {
        setStrokes((prev) => prev.slice(0, -1));
      },
      hasDrawings() {
        return strokes.length > 0;
      },
      exportDrawingData() {
        return JSON.stringify(strokes);
      },
      importDrawingData(json: string) {
        try {
          const parsed = JSON.parse(json);
          if (Array.isArray(parsed)) {
            setStrokes(parsed);
          }
        } catch {}
      },
      toDataURL() {
        const canvas = canvasRef.current;
        if (!canvas) return '';
        return canvas.toDataURL('image/png');
      },
    }));


    // Redimensiona o canvas para casar com o tamanho real do container
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            canvas.width = width;
            canvas.height = height;
            redraw(strokes);
          }
        }
      });

      if (canvas.parentElement) {
        resizeObserver.observe(canvas.parentElement);
      }

      return () => resizeObserver.disconnect();
    }, [strokes]);

    const redraw = (strokeList: Stroke[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const stroke of strokeList) {
        if (stroke.points.length < 1) continue;

        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.size;

        if (stroke.isEraser) {
          ctx.globalCompositeOperation = 'destination-out';
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = stroke.color;
        }

        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
    };

    useEffect(() => {
      redraw(strokes);
    }, [strokes]);

    const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      e.preventDefault();
      isDrawingRef.current = true;
      onDrawingStart?.();

      const point = getCanvasCoordinates(e);
      const newStroke: Stroke = {
        points: [point],
        color,
        size,
        isEraser,
      };
      setCurrentStroke(newStroke);
    };

    const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!enabled || !isDrawingRef.current || !currentStroke) return;
      e.preventDefault();

      const point = getCanvasCoordinates(e);
      const updatedStroke = {
        ...currentStroke,
        points: [...currentStroke.points, point],
      };
      setCurrentStroke(updatedStroke);
      redraw([...strokes, updatedStroke]);
    };

    const handleEnd = () => {
      if (!isDrawingRef.current || !currentStroke) return;
      isDrawingRef.current = false;
      setStrokes((prev) => [...prev, currentStroke]);
      setCurrentStroke(null);
    };

    return (
      <canvas
        ref={canvasRef}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        className={`absolute inset-0 z-30 transition-opacity ${
          enabled ? 'cursor-crosshair pointer-events-auto' : 'pointer-events-none'
        } ${className}`}
      />
    );
  }
);

TradeReplayCanvas.displayName = 'TradeReplayCanvas';
