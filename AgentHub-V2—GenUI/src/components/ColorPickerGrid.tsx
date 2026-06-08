import { useState } from 'react';
import { motion } from 'framer-motion';

export interface ColorPickerGridProps {
  title: string;
  suggested: string[];
  allowCustom: boolean;
  onSubmit: (value: { hex: string }) => void;
}

/**
 * ColorPickerGrid — a grid of clickable color swatches + optional custom hex input.
 * Selected swatch gets 2px blue border + scale(1.1).
 */
export function ColorPickerGrid({
  title,
  suggested,
  allowCustom,
  onSubmit,
}: ColorPickerGridProps) {
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState('');
  const [customError, setCustomError] = useState(false);

  const handleSelect = (hex: string) => {
    setSelectedHex(hex);
    setCustomError(false);
    onSubmit({ hex });
  };

  const handleCustomSubmit = () => {
    const isValid = /^#[0-9A-Fa-f]{6}$/.test(customHex);
    if (!isValid) {
      setCustomError(true);
      return;
    }
    handleSelect(customHex);
  };

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
      <h3 className="text-base font-semibold text-[#1F2329] mb-4">{title}</h3>
      <div className="flex flex-wrap gap-3">
        {suggested.map((hex, i) => (
          <motion.button
            key={hex}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05, duration: 0.2, ease: 'easeOut' }}
            onClick={() => handleSelect(hex)}
            style={{ backgroundColor: hex }}
            title={hex}
            className={`w-10 h-10 rounded-lg border-2 transition-all cursor-pointer ${
              selectedHex === hex
                ? 'border-[#3370FF] scale-110 shadow-md'
                : 'border-gray-200 hover:border-blue-300'
            }`}
          />
        ))}
      </div>

      {allowCustom && (
        <div className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={customHex}
            onChange={(e) => {
              setCustomHex(e.target.value);
              setCustomError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomSubmit();
            }}
            placeholder="#XXXXXX"
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[#3370FF] w-28 text-[#1F2329]"
          />
          <button
            onClick={handleCustomSubmit}
            className="px-3 py-1.5 bg-[#3370FF] text-white text-sm rounded-md hover:bg-[#2860E0] transition-colors cursor-pointer"
          >
            使用
          </button>
          {customError && (
            <span className="text-xs text-red-500">无效颜色格式</span>
          )}
        </div>
      )}
    </div>
  );
}
