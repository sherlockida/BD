import React, { useMemo } from 'react';

// ────── Color helpers ──────

function rateColor(tokensPerSec: number): string {
  if (tokensPerSec < 10) return '#22c55e'; // green
  if (tokensPerSec <= 50) return '#eab308'; // yellow
  return '#ef4444'; // red
}

function rateBackground(tokensPerSec: number): string {
  if (tokensPerSec < 10) return '#22c55e22';
  if (tokensPerSec <= 50) return '#eab30822';
  return '#ef444422';
}

// ────── LiveTelemetry Component ──────

interface LiveTelemetryProps {
  tokensPerSec: number;
  inputTokensUsed: number;
  maxHeight?: number; // default 24
}

/**
 * LiveTelemetry — a micro bar chart showing the current token throughput.
 * Renders 5 vertical bars with dynamic heights proportional to tokensPerSec.
 * Color-coded green (<10), yellow (10-50), red (>50).
 * Uses pure CSS — no chart library.
 */
export const LiveTelemetry: React.FC<LiveTelemetryProps> = ({
  tokensPerSec,
  inputTokensUsed,
  maxHeight = 24,
}) => {
  const barHeights = useMemo(() => {
    // 5 bars with slight variation for visual interest
    const factors = [0.75, 0.9, 1.0, 1.1, 0.85];
    return factors.map((f) => {
      const raw = tokensPerSec * f;
      return Math.max(2, Math.min(raw, 100)); // clamp to [2, 100]
    });
  }, [tokensPerSec]);

  const color = rateColor(tokensPerSec);

  return (
    <div
      data-testid="live-telemetry"
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: 2,
        height: maxHeight,
        padding: '2px 0',
      }}
    >
      {/* Bars */}
      {barHeights.map((h, i) => {
        const barHeight = (h / 100) * (maxHeight - 4);
        return (
          <div
            key={i}
            data-testid={`telemetry-bar-${i}`}
            style={{
              width: 4,
              height: barHeight,
              borderRadius: 2,
              background: color,
              opacity: 0.8 + 0.2 * (barHeights.length - i) / barHeights.length,
              transition: 'height 0.3s ease, background 0.3s ease',
            }}
          />
        );
      })}

      {/* Label */}
      <span
        data-testid="telemetry-value"
        style={{
          marginLeft: 4,
          fontSize: 10,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          color,
          whiteSpace: 'nowrap',
          lineHeight: `${maxHeight}px`,
          transition: 'color 0.3s ease',
        }}
      >
        {tokensPerSec} t/s
      </span>
    </div>
  );
};
