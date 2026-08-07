'use client';

import {
  animate,
  motion,
  useAnimationControls,
  useReducedMotion,
} from 'framer-motion';
import { useEffect, useId, useRef, useState, memo } from 'react';

type FlameLevel = 0 | 1 | 2 | 3 | 4;

interface DisciplineFlameIconProps {
  level: number; // 0–4
  size?: number;
  complete?: boolean;
  onLevelChange?: (level: number) => void;
}

const EASE_EMPHASIZED = [0.22, 1, 0.36, 1] as const;
const EASE_SMOOTH = [0.45, 0, 0.55, 1] as const;
const EASE_EXIT = [0.16, 1, 0.3, 1] as const;

const DEFAULT_FLAME_PATH =
  'M12 2C12 2 7 7.5 7 13.5C7 16.5386 9.46142 19 12.5 19C15.5386 19 18 16.5386 18 13.5C18 10 16 7 14 5.5C14 5.5 14.5 8 13 9C12 9.5 12 2 12 2Z';

const LEVEL_CONFIG: Record<
  FlameLevel,
  {
    primary: string;
    secondary: string;
    core: string;
    ring: string;
    opacity: number;
    flameScale: number;
    glowOpacity: number;
  }
> = {
  0: {
    primary: '#475569',
    secondary: '#1e293b',
    core: '#64748b',
    ring: '#334155',
    opacity: 0.35,
    flameScale: 0.88,
    glowOpacity: 0.05,
  },
  1: {
    primary: '#5EEAD4',
    secondary: '#14b8a6',
    core: '#ccfbf1',
    ring: '#2dd4bf',
    opacity: 0.8,
    flameScale: 0.94,
    glowOpacity: 0.2,
  },
  2: {
    primary: '#2DD4BF',
    secondary: '#0f766e',
    core: '#99f6e4',
    ring: '#2dd4bf',
    opacity: 0.92,
    flameScale: 1,
    glowOpacity: 0.28,
  },
  3: {
    primary: '#2DD4BF',
    secondary: '#115e59',
    core: '#f8fafc',
    ring: '#5eead4',
    opacity: 1,
    flameScale: 1.04,
    glowOpacity: 0.38,
  },
  4: {
    primary: '#99F6E4',
    secondary: '#0f766e',
    core: '#ffffff',
    ring: '#2dd4bf',
    opacity: 1,
    flameScale: 1.08,
    glowOpacity: 0.5,
  },
};

const PARTICLE_POSITIONS = [
  { x: 8, y: 12, delay: 0 },
  { x: 16, y: 14, delay: 0.2 },
  { x: 10, y: 8, delay: 0.35 },
  { x: 14, y: 9, delay: 0.5 },
];

export const DisciplineFlameIcon = memo(function DisciplineFlameIcon({
  level,
  size = 52,
  complete = false,
  onLevelChange,
}: DisciplineFlameIconProps) {
  const safeLevel = Math.min(Math.max(level, 0), 4) as FlameLevel;
  const config = LEVEL_CONFIG[safeLevel];
  const reducedMotion = useReducedMotion();
  const controls = useAnimationControls();
  const previousComplete = useRef(complete);
  const previousLevel = useRef(safeLevel);
  const gradientId = useId().replaceAll(':', '');

  useEffect(() => {
    if (safeLevel !== previousLevel.current) {
      onLevelChange?.(safeLevel);
      previousLevel.current = safeLevel;
    }
  }, [safeLevel, onLevelChange]);

  useEffect(() => {
    if (reducedMotion || !complete || previousComplete.current) {
      previousComplete.current = complete;
      return;
    }

    controls.set({ rotate: 0, opacity: 0.75 });
    controls
      .start({
        rotate: 360,
        opacity: [0.75, 1, 1],
        transition: {
          duration: 1.1,
          ease: EASE_EXIT,
          times: [0, 0.24, 1],
        },
      })
      .then(() => {
        controls.set({ rotate: 0, opacity: 1 });
      });

    previousComplete.current = complete;
  }, [complete, controls, reducedMotion]);

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-label={`Ritmo Operacional Nível ${safeLevel}`}
      role="img"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="overflow-visible"
      >
        <defs>
          <radialGradient id={`${gradientId}-disc`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={config.primary} stopOpacity={0.25} />
            <stop offset="70%" stopColor={config.secondary} stopOpacity={0.08} />
            <stop offset="100%" stopColor="#070a10" stopOpacity={0} />
          </radialGradient>

          <linearGradient id={`${gradientId}-flame`} x1="12" y1="2" x2="12" y2="19">
            <stop offset="0%" stopColor={config.core} />
            <stop offset="40%" stopColor={config.primary} />
            <stop offset="100%" stopColor={config.secondary} />
          </linearGradient>

          <radialGradient id={`${gradientId}-core`}>
            <stop offset="0%" stopColor={config.core} stopOpacity={0.95} />
            <stop offset="70%" stopColor={config.primary} stopOpacity={0.3} />
            <stop offset="100%" stopColor={config.primary} stopOpacity={0} />
          </radialGradient>

          <filter id={`${gradientId}-soft-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.8" />
          </filter>
        </defs>

        {/* Glow Radial Estático por Nível (Hardware Accelerated) */}
        <circle
          cx="12"
          cy="12"
          r="9.5"
          fill={config.primary}
          opacity={config.glowOpacity}
          filter={`url(#${gradientId}-soft-glow)`}
        />

        {/* Disco Estrutural Tático */}
        <circle
          cx="12"
          cy="12"
          r="10.5"
          fill={`url(#${gradientId}-disc)`}
          stroke="#1e293b"
          strokeWidth="0.75"
        />

        <circle
          cx="12"
          cy="12"
          r="9.8"
          stroke={config.ring}
          strokeOpacity={safeLevel === 0 ? 0.3 : 0.75}
          strokeWidth={safeLevel === 4 ? 1.2 : 0.75}
        />

        {/* Anel Orbital — Rotação Celebração Única no evento 100% */}
        {safeLevel === 4 && (
          <motion.circle
            cx="12"
            cy="12"
            r="11.2"
            stroke={config.ring}
            strokeWidth="0.75"
            strokeLinecap="round"
            strokeDasharray="2 12"
            initial={false}
            animate={controls}
            style={{ transformOrigin: '12px 12px' }}
          />
        )}

        {/* Núcleo Respiratório */}
        <motion.circle
          cx="12"
          cy="14"
          r="4.5"
          fill={`url(#${gradientId}-core)`}
          animate={
            reducedMotion || safeLevel < 3
              ? { opacity: safeLevel === 0 ? 0.1 : 0.35, scale: 1 }
              : {
                  opacity: [0.4, 0.85, 0.4],
                  scale: [0.95, 1.05, 0.95],
                }
          }
          transition={
            reducedMotion || safeLevel < 3
              ? { duration: 0.24, ease: EASE_EMPHASIZED }
              : {
                  duration: safeLevel === 4 ? 1.25 : 1.8,
                  ease: EASE_SMOOTH,
                  repeat: Infinity,
                }
          }
          style={{ transformOrigin: '12px 14px' }}
        />

        {/* Chama Vetorial Principal */}
        <motion.path
          d={DEFAULT_FLAME_PATH}
          fill={`url(#${gradientId}-flame)`}
          opacity={config.opacity}
          initial={false}
          animate={
            reducedMotion
              ? {
                  scale: config.flameScale,
                  y: 0,
                  opacity: config.opacity,
                }
              : {
                  scale:
                    safeLevel === 0
                      ? [config.flameScale, config.flameScale]
                      : [
                          config.flameScale * 0.985,
                          config.flameScale * 1.015,
                          config.flameScale * 0.99,
                        ],
                  y:
                    safeLevel === 0
                      ? 0
                      : safeLevel === 4
                      ? [0, -0.4, 0.1, 0]
                      : [0, -0.2, 0],
                  opacity:
                    safeLevel === 0
                      ? config.opacity
                      : [config.opacity * 0.94, config.opacity, config.opacity * 0.96],
                }
          }
          transition={
            reducedMotion
              ? { duration: 0.24, ease: EASE_EMPHASIZED }
              : {
                  duration: safeLevel === 1 ? 1.05 : safeLevel === 4 ? 1.18 : 1.8,
                  ease: EASE_SMOOTH,
                  repeat: Infinity,
                }
          }
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'center bottom',
          }}
        />

        {/* Brasas no Nível 4 (Overdrive) */}
        {safeLevel === 4 &&
          !reducedMotion &&
          PARTICLE_POSITIONS.map((p, idx) => (
            <motion.circle
              key={`${p.x}-${p.y}`}
              cx={p.x}
              cy={p.y}
              r={idx % 2 === 0 ? 0.6 : 0.4}
              fill="#99f6e4"
              initial={{ opacity: 0, y: 1 }}
              animate={{
                opacity: [0.1, 0.85, 0],
                y: [1, -2 - idx, -4 - idx],
                x: [0, idx % 2 ? 0.6 : -0.6, 0],
              }}
              transition={{
                duration: 1.1 + idx * 0.12,
                delay: p.delay,
                ease: 'easeOut',
                repeat: Infinity,
                repeatDelay: 0.3,
              }}
            />
          ))}
      </svg>
    </div>
  );
});

export default DisciplineFlameIcon;
