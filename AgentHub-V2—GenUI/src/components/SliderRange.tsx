import { useState } from 'react';
import { motion } from 'framer-motion';

export interface SliderRangeProps {
  title: string;
  min: number;
  max: number;
  step: number;
  defaultValue?: number;
  unit?: string;
  onSubmit: (value: { value: number }) => void;
}

/**
 * SliderRange — a numeric range slider with real-time value display and confirm button.
 */
export function SliderRange({
  title,
  min,
  max,
  step,
  defaultValue,
  unit,
  onSubmit,
}: SliderRangeProps) {
  const [value, setValue] = useState<number>(defaultValue ?? min);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="rounded-xl bg-white p-5 shadow-sm border border-gray-100"
    >
      <h3 className="text-base font-semibold text-[#1F2329] mb-3">{title}</h3>

      <div className="flex justify-between text-sm text-[#646A73] mb-1">
        <span>
          {min}
          {unit ?? ''}
        </span>
        <span>
          {max}
          {unit ?? ''}
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full accent-[#3370FF] cursor-pointer"
      />

      <div className="text-center text-lg font-medium text-[#1F2329] mt-2">
        {value}
        {unit ?? ''}
      </div>

      <button
        onClick={() => onSubmit({ value })}
        className="mt-3 w-full py-2 bg-[#3370FF] text-white rounded-lg hover:bg-[#2860E0] transition-colors text-sm font-medium cursor-pointer"
      >
        确认
      </button>
    </motion.div>
  );
}
