'use client';

import { useState } from 'react';
import { overrideReasonOk, type DoorDecision } from '@/lib/doorCheckIn';

export function DoorCheckInPrompt({
  name,
  decision,
  onDismiss,
  onConfirm,
}: {
  name: string;
  decision: Exclude<DoorDecision, { outcome: 'allow' }>;
  onDismiss: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const canOverride = decision.outcome === 'override';
  const reasonOk = overrideReasonOk(reason);

  return (
    <div
      role="alertdialog"
      aria-label="Check-in decision"
      data-testid="door-decision"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#3f1212',
          color: '#fff',
          border: '1px solid #f87171',
          borderRadius: 16,
          padding: 24,
        }}
      >
        <p data-testid="door-name" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{name}</p>
        <p data-testid="door-reason" style={{ color: '#fecaca', fontSize: 16, lineHeight: 1.4, marginBottom: 16 }}>
          {decision.message}
        </p>
        {canOverride && (
          <>
            <label htmlFor="door-override-reason" style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>
              Why are you letting them in?
            </label>
            <input
              id="door-override-reason"
              data-testid="door-override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Short reason"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.2)',
                background: '#1a1a1a',
                color: '#fff',
                marginBottom: 12,
              }}
            />
            <button
              type="button"
              data-testid="door-let-in"
              disabled={!reasonOk}
              onClick={() => onConfirm(reason.trim())}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: 'none',
                fontWeight: 700,
                background: reasonOk ? '#fecaca' : '#5c2a2a',
                color: reasonOk ? '#3f1212' : '#a8a8a8',
                cursor: reasonOk ? 'pointer' : 'not-allowed',
                marginBottom: 8,
              }}
            >
              Let in anyway
            </button>
          </>
        )}
        <button
          type="button"
          data-testid="door-dismiss"
          onClick={onDismiss}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.25)',
            background: 'transparent',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
