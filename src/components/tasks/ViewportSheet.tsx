'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useLockBodyScroll, useVisualViewport, visualViewportStyle } from '@/hooks/useVisualViewport';

const DESKTOP_MQ = '(min-width: 1024px)';

function useDesktopSheet() {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_MQ).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}

export function ViewportSheet({
  open,
  onOpenChange,
  children,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  testId?: string;
}) {
  const desktop = useDesktopSheet();
  const box = useVisualViewport(open && !desktop);
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid={testId}>
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        data-testid={testId ? `${testId}-frame` : undefined}
        className={
          desktop
            ? 'z-10 flex max-h-[85vh] min-h-0 w-full max-w-[480px] flex-col overflow-y-auto rounded-2xl bg-[#111] text-[#f4f1ea] shadow-2xl'
            : 'z-10 flex min-h-0 flex-col overflow-hidden bg-[#111] text-[#f4f1ea]'
        }
        style={
          desktop
            ? {
                position: 'fixed',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 'min(480px, calc(100vw - 32px))',
                maxHeight: '85vh',
              }
            : visualViewportStyle(box)
        }
      >
        {children}
      </div>
    </div>
  );
}
