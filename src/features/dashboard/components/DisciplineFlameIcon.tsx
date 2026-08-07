'use client';

import { useEffect, useRef, useState } from 'react';
import {
  motion,
  useReducedMotion,
  useMotionValue,
  animate,
  type Transition,
} from 'framer-motion';

/**
 * DisciplineFlameIcon — Motion Design Spec (Estética Command Center / Framer Motion Orgânico)
 *
 * Níveis de Disciplina:
 *   0 Extinto        → estático, stroke slate-700, silêncio visual
 *   1 Ignição        → flicker lento, chama cyan frágil (glow 4px)
 *   2 Constante      → flicker estável, teal intenso (glow 7px)
 *   3 Alta Perf.     → flicker médio, núcleo respirando (glow 11px)
 *   4 Overdrive      → flicker acelerado, brasas subindo, anel orbital ativo (glow 15px)
 */

interface DisciplineFlameIconProps {
  level: number;                    // 0–4
  size?: number;
  complete?: boolean;               // true quando score === 100
  onLevelChange?: (level: number) => void;
}

const COLORS = {
  0: { stroke: '#475569', core: 'transparent', glow: 0, discBg: '#070a10', discBorder: '#1e293b' },
  1: { stroke: '#5EEAD4', core: '#2DD4BF', glow: 4, discBg: '#070a10', discBorder: '#134e4a' },
  2: { stroke: '#2DD4BF', core: '#2DD4BF', glow: 7, discBg: '#070a10', discBorder: '#0f766e' },
  3: { stroke: '#2DD4BF', core: '#99F6E4', glow: 11, discBg: '#070a10', discBorder: '#14b8a6' },
  4: { stroke: '#99F6E4', core: '#F8FAFC', glow: 15, discBg: '#070a10', discBorder: '#2dd4bf' },
} as const;

const FLICKER: Record<1 | 2 | 3 | 4, { scale: number[]; rotate: number[]; duration: number }> = {
  1: { scale: [1, 1.015, 0.99, 1.02, 1], rotate: [0, 0.8, -0.6, 1.1, 0], duration: 2.4 },
  2: { scale: [1, 1.02, 0.985, 1.03, 1], rotate: [0, 1.2, -0.9, 1.5, 0], duration: 1.8 },
  3: { scale: [1, 1.03, 0.98, 1.045, 1.01, 1], rotate: [0, 1.6, -1.2, 2, -0.5, 0], duration: 1.35 },
  4: { scale: [1, 1.045, 0.975, 1.06, 0.99, 1.03, 1], rotate: [0, 2, -1.6, 2.6, -1, 1.2, 0], duration: 1.05 },
};

export function DisciplineFlameIcon({
  level,
  size = 40,
  complete = false,
  onLevelChange,
}: DisciplineFlameIconProps) {
  const safeLevel = Math.min(Math.max(level, 0), 4) as 0 | 1 | 2 | 3 | 4;
  const colors = COLORS[safeLevel];
  const reduceMotion = useReducedMotion();

  const prevLevel = useRef(safeLevel);
  const [igniting, setIgniting] = useState(false);
  const [extinguishing, setExtinguishing] = useState(false);

  const ringRotation = useMotionValue(0);

  useEffect(() => {
    if (safeLevel > prevLevel.current) {
      setIgniting(true);
      const t = setTimeout(() => setIgniting(false), 900);
      onLevelChange?.(safeLevel);
      prevLevel.current = safeLevel;
      return () => clearTimeout(t);
    }
    if (safeLevel < prevLevel.current) {
      setExtinguishing(true);
      const t = setTimeout(() => setExtinguishing(false), 500);
      prevLevel.current = safeLevel;
      return () => clearTimeout(t);
    }
  }, [safeLevel, onLevelChange]);

  useEffect(() => {
    if (complete && safeLevel === 4 && !reduceMotion) {
      const controls = animate(ringRotation, ringRotation.get() + 360, {
        duration: 1.6,
        ease: [0.22, 1, 0.36, 1],
      });
      return () => controls.stop();
    }
  }, [complete, safeLevel, reduceMotion, ringRotation]);

  const flicker = safeLevel > 0 ? FLICKER[safeLevel as 1 | 2 | 3 | 4] : null;

  const idleTransition: Transition = flicker
    ? { duration: flicker.duration, repeat: Infinity, ease: 'easeInOut' }
    : {};

  const flameAnimate = extinguishing
    ? { scale: [1, 1.06, 0.94, 1.02, 0.9], opacity: [1, 0.85, 0.6, 0.4, 1] }
    : igniting
    ? { scale: [0.92, 1.14, 1], opacity: [0.7, 1, 1] }
    : flicker && !reduceMotion
    ? { scale: flicker.scale, rotate: flicker.rotate }
    : {};

  const flameTransition: Transition = extinguishing
    ? { duration: 0.45, ease: 'easeOut' }
    : igniting
    ? { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
    : idleTransition;

  return (
    <div
      className="relative flex items-center justify-center rounded-full transition-colors duration-500"
      style={{
        width: size,
        height: size,
        backgroundColor: colors.discBg,
        border: `1px solid ${colors.discBorder}`,
      }}
    >
      {/* Glow radial tático em torno do disco */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        animate={{
          opacity: safeLevel === 0 ? 0 : 1,
          boxShadow:
            safeLevel === 0
              ? '0 0 0px rgba(45,212,191,0)'
              : `0 0 ${colors.glow}px rgba(45,212,191,${0.2 + safeLevel * 0.08})`,
        }}
        transition={{ duration: igniting ? 0.6 : 0.4, ease: 'easeOut' }}
      />

      {/* Anel orbital tracejado — nível 4 */}
      {safeLevel === 4 && (
        <motion.svg
          className="absolute inset-0 pointer-events-none"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          style={{ rotate: ringRotation }}
        >
          <circle
            cx="12"
            cy="12"
            r="10.5"
            fill="none"
            stroke="#2DD4BF"
            strokeOpacity="0.4"
            strokeWidth="0.75"
            strokeDasharray="1.5 3"
          />
          <circle cx="12" cy="1.5" r="1" fill="#99F6E4" />
        </motion.svg>
      )}

      {/* Chama Vetorial com Gradiente Tático */}
      <motion.svg
        width={size * 0.65}
        height={size * 0.65}
        viewBox="0 0 24 24"
        fill="none"
        animate={flameAnimate}
        transition={flameTransition}
        style={{ transformOrigin: '50% 85%' }}
      >
        <motion.path
          d="M12 2C12 2 7 7.5 7 13.5C7 16.5386 9.46142 19 12.5 19C15.5386 19 18 16.5386 18 13.5C18 10 16 7 14 5.5C14 5.5 14.5 8 13 9C12 9.5 12 2 12 2Z"
          stroke={colors.stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={safeLevel > 0 ? `${colors.stroke}18` : 'transparent'}
          animate={{ stroke: colors.stroke }}
          transition={{ duration: 0.4 }}
        />

        {/* Núcleo — respira suavemente a partir do nível 1 */}
        {safeLevel > 0 && (
          <motion.path
            d="M12 11C12 11 10 13 10 15C10 16.1046 10.8954 17 12 17C13.1046 17 14 16.1046 14 15C14 13.5 13 12.5 12.5 12C12.5 12 12.5 12.5 12 11Z"
            fill={colors.core}
            animate={
              safeLevel >= 3 && !reduceMotion
                ? { opacity: [0.6, 0.95, 0.65, 1, 0.6] }
                : { opacity: 0.75 }
            }
            transition={
              safeLevel >= 3 && !reduceMotion
                ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.3 }
            }
          />
        )}
      </motion.svg>

      {/* Brasas subindo — apenas no nível 4 */}
      {safeLevel === 4 && !reduceMotion && <Embers size={size} />}
    </div>
  );
}

function Embers({ size }: { size: number }) {
  const [embers, setEmbers] = useState<{ id: number; x: number; delay: number }[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const spawn = () => {
      const id = ++idRef.current;
      setEmbers(prev => [
        ...prev.slice(-2),
        { id, x: (Math.random() - 0.5) * 8, delay: 0 },
      ]);
      timeout = setTimeout(spawn, 2200 + Math.random() * 2500);
    };
    spawn();
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {embers.map(e => (
        <motion.span
          key={e.id}
          className="absolute block rounded-full"
          style={{
            width: 2,
            height: 2,
            background: '#99F6E4',
            left: size / 2,
            bottom: size * 0.3,
          }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 1 }}
          animate={{
            opacity: [0, 0.85, 0],
            x: [0, e.x, e.x * 1.5],
            y: [0, -size * 0.4, -size * 0.75],
            scale: [1, 0.7, 0.2],
          }}
          transition={{ duration: 1.4, ease: [0.3, 0.6, 0.6, 1], delay: e.delay }}
          onAnimationComplete={() =>
            setEmbers(prev => prev.filter(p => p.id !== e.id))
          }
        />
      ))}
    </div>
  );
}

export default DisciplineFlameIcon;
