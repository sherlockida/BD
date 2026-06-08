import { useState } from 'react';
import { motion } from 'framer-motion';

export interface ChoiceCardOption {
  id: string;
  label: string;
  preview?: string;
  description?: string;
}

export interface ChoiceCardsProps {
  title: string;
  options: ChoiceCardOption[];
  onSubmit: (value: { chosenId: string }) => void;
}

/**
 * ChoiceCards — clickable option cards in a 2-column grid.
 * Stagger entrance animation via framer-motion.
 * Highlights selected card with blue border + blue-50 background.
 */
export function ChoiceCards({ title, options, onSubmit }: ChoiceCardsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleClick = (id: string) => {
    setSelectedId(id);
    onSubmit({ chosenId: id });
  };

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
      <h3 className="text-base font-semibold text-[#1F2329] mb-4">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {options.map((opt, i) => (
          <motion.button
            key={opt.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3, ease: 'easeOut' }}
            onClick={() => handleClick(opt.id)}
            className={`text-left p-4 rounded-lg border-2 transition-all cursor-pointer ${
              selectedId === opt.id
                ? 'border-[#3370FF] bg-blue-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
            }`}
          >
            {opt.preview && (
              <span className="text-2xl block mb-2">{opt.preview}</span>
            )}
            <span className="block font-medium text-[#1F2329]">{opt.label}</span>
            {opt.description && (
              <span className="block text-sm text-[#646A73] mt-1">
                {opt.description}
              </span>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
