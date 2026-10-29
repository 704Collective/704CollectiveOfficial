'use client';

import { HEARD_ABOUT_OPTIONS, type HeardAboutValue } from '@/lib/heardAbout';

type Variant = 'join' | 'signup';

export function HeardAboutField({
  value,
  other,
  error,
  onChange,
  onOtherChange,
  variant,
}: {
  value: HeardAboutValue | '';
  other: string;
  error: string | null;
  onChange: (value: HeardAboutValue) => void;
  onOtherChange: (value: string) => void;
  variant: Variant;
}) {
  const join = variant === 'join';
  return (
    <div>
      <label style={join ? { display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginBottom: '6px' } : undefined} className={join ? undefined : 'text-sm font-medium'}>
        How did you hear about us? <span style={join ? { color: '#C6A664' } : undefined} className={join ? undefined : 'text-[#C6A664]'}>*</span>
      </label>
      <div
        role="radiogroup"
        aria-label="How did you hear about us?"
        data-testid="heard-about"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '2px' }}
      >
        {HEARD_ABOUT_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              data-testid={`heard-about-${opt.value}`}
              onClick={() => onChange(opt.value)}
              style={{
                minHeight: '44px',
                padding: '8px 14px',
                borderRadius: '100px',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                border: active ? '1px solid #C6A664' : '1px solid rgba(255,255,255,0.15)',
                backgroundColor: active ? '#C6A664' : 'transparent',
                color: active ? '#1A1A1A' : join ? 'rgba(255,255,255,0.7)' : undefined,
              }}
              className={join ? undefined : (active ? '' : 'text-foreground')}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {value === 'other' && (
        <input
          data-testid="heard-about-other"
          value={other}
          maxLength={80}
          onChange={(e) => onOtherChange(e.target.value.slice(0, 80))}
          placeholder="Tell us in a few words"
          aria-label="How did you hear about us? Other"
          style={join ? {
            marginTop: '8px',
            width: '100%',
            minHeight: '44px',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'transparent',
            color: '#fff',
            padding: '10px 12px',
          } : undefined}
          className={join ? undefined : 'mt-2 flex h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm'}
        />
      )}
      {error && (
        <p data-testid="heard-about-error" style={{ fontSize: '0.8125rem', color: '#ef4444', margin: '4px 0 0' }}>{error}</p>
      )}
    </div>
  );
}
