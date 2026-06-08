import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ────── Types ──────

interface SkillTopology {
  orderIntent: string;
  agentIds: string[];
  artifactCount: number;
}

interface SkillSnapCardProps {
  topology: SkillTopology;
  onSave: (topology: SkillTopology) => void;
  onDismiss: () => void;
  open: boolean;
}

// ────── SkillSnapCard Component ──────

/**
 * SkillSnapCard — slides up from the bottom after a replay completes,
 * offering to save the canvas topology as a reusable Skill.
 *
 * Animation driven by framer-motion: slides in on `open`, fades out on dismiss.
 */
export const SkillSnapCard: React.FC<SkillSnapCardProps> = ({
  topology,
  onSave,
  onDismiss,
  open,
}) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="skill-snap-card"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 360,
            maxWidth: '90vw',
            background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: 16,
            padding: 20,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 9999,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              marginBottom: 12,
            }}
          >
            &#9733;
          </div>

          {/* Title */}
          <h3
            style={{
              margin: 0,
              color: '#e2e8f0',
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Precipitate into Skill?
          </h3>
          <p
            style={{
              margin: 0,
              color: '#94a3b8',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            Save this collaboration topology as a reusable skill for future
            sessions.
          </p>

          {/* Topology summary */}
          <div
            style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <SummaryRow label="Intent" value={topology.orderIntent} />
            <SummaryRow
              label="Workstations"
              value={`${topology.agentIds.length} involved`}
            />
            <SummaryRow
              label="Artifacts"
              value={`${topology.artifactCount} produced`}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              data-testid="skill-save-btn"
              onClick={() => onSave(topology)}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Precipitate as Skill
            </button>
            <button
              data-testid="skill-dismiss-btn"
              onClick={onDismiss}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent',
                color: '#94a3b8',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Skip
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ────── Summary Row Sub-component ──────

const SummaryRow: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}
  >
    <span style={{ color: '#64748b', fontSize: 12 }}>{label}</span>
    <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>
      {value}
    </span>
  </div>
);
