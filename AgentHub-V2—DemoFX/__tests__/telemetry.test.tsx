import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveTelemetry } from '../src/LiveTelemetry';

function getBarElements(container: HTMLElement): HTMLElement[] {
  const bars: HTMLElement[] = [];
  for (let i = 0; i < 5; i++) {
    const bar = container.querySelector(`[data-testid="telemetry-bar-${i}"]`);
    if (bar) bars.push(bar as HTMLElement);
  }
  return bars;
}

describe('LiveTelemetry', () => {
  it('renders the tokensPerSec number', () => {
    render(<LiveTelemetry tokensPerSec={42} inputTokensUsed={100} />);
    const valueEl = screen.getByTestId('telemetry-value');
    expect(valueEl.textContent).toContain('42');
    expect(valueEl.textContent).toContain('t/s');
  });

  it('renders green bars when tokensPerSec is low (<10)', () => {
    const { container } = render(
      <LiveTelemetry tokensPerSec={5} inputTokensUsed={50} />,
    );
    const bars = getBarElements(container);
    expect(bars.length).toBeGreaterThanOrEqual(3);
    bars.forEach((bar) => {
      const bg = bar.style.background;
      // Green in hex (#22c55e) or rgb/rgba form
      expect(
        bg === '#22c55e' ||
          bg === 'rgb(34, 197, 94)' ||
          bg.includes('22c55e') ||
          bg.includes('34, 197, 94'),
      ).toBe(true);
    });
    // Value text should also be green
    const valueEl = screen.getByTestId('telemetry-value');
    const color = valueEl.style.color;
    expect(
      color === '#22c55e' ||
        color === 'rgb(34, 197, 94)' ||
        color.includes('22c55e') ||
        color.includes('34, 197, 94'),
    ).toBe(true);
  });

  it('renders yellow bars when tokensPerSec is medium (10-50)', () => {
    const { container } = render(
      <LiveTelemetry tokensPerSec={30} inputTokensUsed={200} />,
    );
    const bars = getBarElements(container);
    expect(bars.length).toBeGreaterThanOrEqual(3);
    bars.forEach((bar) => {
      const bg = bar.style.background;
      // Yellow in hex (#eab308) or rgb form
      expect(
        bg === '#eab308' ||
          bg === 'rgb(234, 179, 8)' ||
          bg.includes('eab308') ||
          bg.includes('234, 179, 8'),
      ).toBe(true);
    });
    const valueEl = screen.getByTestId('telemetry-value');
    const color = valueEl.style.color;
    expect(
      color === '#eab308' ||
        color === 'rgb(234, 179, 8)' ||
        color.includes('eab308') ||
        color.includes('234, 179, 8'),
    ).toBe(true);
  });

  it('renders red bars when tokensPerSec is high (>50)', () => {
    const { container } = render(
      <LiveTelemetry tokensPerSec={80} inputTokensUsed={500} />,
    );
    const bars = getBarElements(container);
    expect(bars.length).toBeGreaterThanOrEqual(3);
    bars.forEach((bar) => {
      const bg = bar.style.background;
      // Red in hex (#ef4444) or rgb form
      expect(
        bg === '#ef4444' ||
          bg === 'rgb(239, 68, 68)' ||
          bg.includes('ef4444') ||
          bg.includes('239, 68, 68'),
      ).toBe(true);
    });
    const valueEl = screen.getByTestId('telemetry-value');
    const color = valueEl.style.color;
    expect(
      color === '#ef4444' ||
        color === 'rgb(239, 68, 68)' ||
        color.includes('ef4444') ||
        color.includes('239, 68, 68'),
    ).toBe(true);
  });
});
