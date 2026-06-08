import { motion } from 'framer-motion';

export interface ConfirmCardProps {
  title: string;
  body: string;
  danger: boolean;
  confirmLabel: string;
  cancelLabel: string;
  onSubmit: (value: { confirmed: boolean }) => void;
}

/**
 * ConfirmCard — a confirmation dialog card with two action buttons.
 * danger=true makes the confirm button red; otherwise it uses the primary blue.
 * Animated: spring-based slide-up entrance.
 */
export function ConfirmCard({
  title,
  body,
  danger,
  confirmLabel,
  cancelLabel,
  onSubmit,
}: ConfirmCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 15, stiffness: 200 }}
      className="rounded-xl bg-white p-5 shadow-sm border border-gray-100"
    >
      <h3 className="text-base font-semibold text-[#1F2329] mb-2">{title}</h3>
      <p className="text-sm text-[#646A73] mb-5">{body}</p>
      <div className="flex gap-3">
        <button
          onClick={() => onSubmit({ confirmed: false })}
          className="flex-1 py-2 border border-gray-300 text-[#646A73] rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium cursor-pointer"
        >
          {cancelLabel}
        </button>
        <button
          onClick={() => onSubmit({ confirmed: true })}
          className={`flex-1 py-2 rounded-lg text-white transition-colors text-sm font-medium cursor-pointer ${
            danger
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-[#3370FF] hover:bg-[#2860E0]'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </motion.div>
  );
}
