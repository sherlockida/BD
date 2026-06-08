import { useState, useEffect } from 'react';

const STORAGE_KEY = 'agenthub-v2-onboarding-done';

const STEPS = [
  {
    title: 'Create Orders on Canvas',
    description: 'Right-click on the canvas to create a new order, or type your request in the command bar below.',
    icon: '🎯',
  },
  {
    title: 'Watch Workstations Light Up',
    description: 'When PMO picks up your order, workstations will light up automatically as agents begin working.',
    icon: '⚡',
  },
  {
    title: 'Preview Artifacts Instantly',
    description: 'When artifacts land on the canvas, double-click any of them to open a full-screen preview.',
    icon: '🖹️',
  },
];

export function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      handleSkip();
    }
  };

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      data-testid="onboarding-overlay"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[420px] p-8 animate-slide-up"
        data-testid="onboarding-card"
      >
        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === step ? 'bg-blue-500 w-3' : i < step ? 'bg-blue-300' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step icon */}
        <div className="text-4xl text-center mb-4">{current.icon}</div>

        {/* Step title */}
        <h2 className="text-lg font-semibold text-gray-800 text-center mb-2">
          {current.title}
        </h2>

        {/* Step description */}
        <p className="text-sm text-gray-500 text-center leading-relaxed mb-8">
          {current.description}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            data-testid="onboarding-skip"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            className="px-5 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
            data-testid="onboarding-next"
          >
            {step < STEPS.length - 1 ? 'Next' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
