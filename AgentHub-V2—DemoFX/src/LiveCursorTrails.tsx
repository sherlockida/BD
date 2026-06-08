import React, { useCallback } from 'react';
import { motion } from 'framer-motion';

// ────── Types ──────

interface Position {
  x: number;
  y: number;
}

interface LiveCursorTrailsProps {
  active: boolean;
  fromPosition: Position;
  toPosition: Position;
  color?: string;
  onComplete?: () => void;
}

// ────── Curve helper ──────

/**
 * Build a cubic bezier SVG path string from `from` to `to`.
 * The control points are offset horizontally to create a gentle arc.
 */
function buildCurvePath(from: Position, to: Position): string {
  const dx = to.x - from.x;
  const cp1x = from.x + dx * 0.25;
  const cp1y = from.y;
  const cp2x = to.x - dx * 0.25;
  const cp2y = to.y;
  return `M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`;
}

// ────── LiveCursorTrails Component ──────

/**
 * LiveCursorTrails — renders a glowing bezier curve from a source position
 * to a target position using framer-motion's pathLength animation.
 *
 * The curve draws from 0 to 1 when `active` is true, with a blur glow and
 * gradient stroke for a "cursor trail" effect.
 */
export const LiveCursorTrails: React.FC<LiveCursorTrailsProps> = ({
  active,
  fromPosition,
  toPosition,
  color = '#6366f1',
  onComplete,
}) => {
  const path = buildCurvePath(fromPosition, toPosition);

  const handleAnimationComplete = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  // Compute bounding box for the viewBox
  const minX = Math.min(fromPosition.x, toPosition.x) - 40;
  const minY = Math.min(fromPosition.y, toPosition.y) - 40;
  const maxX = Math.max(fromPosition.x, toPosition.x) + 40;
  const maxY = Math.max(fromPosition.y, toPosition.y) + 40;
  const vbWidth = maxX - minX;
  const vbHeight = maxY - minY;

  return (
    <svg
      data-testid="cursor-trail"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 100,
        opacity: active ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
      viewBox={`${minX} ${minY} ${vbWidth} ${vbHeight}`}
      preserveAspectRatio="none"
    >
      {/* Glow filter */}
      <defs>
        <filter id="cursor-trail-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Gradient stroke */}
        <linearGradient id="cursor-trail-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="50%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Glow layer */}
      {active && (
        <motion.path
          d={path}
          fill="none"
          stroke={`url(#cursor-trail-gradient)`}
          strokeWidth={6}
          strokeLinecap="round"
          filter="url(#cursor-trail-glow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          exit={{ pathLength: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          onAnimationComplete={handleAnimationComplete}
        />
      )}

      {/* Core visible line */}
      {active && (
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeOpacity={0.9}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          exit={{ pathLength: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
        />
      )}
    </svg>
  );
};
