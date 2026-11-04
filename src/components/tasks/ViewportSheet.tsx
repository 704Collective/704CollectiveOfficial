'use client';

import type { ReactNode } from 'react';
import { useLockBodyScroll, useVisualViewport, visualViewportStyle } from '@/hooks/useVisualViewport';

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
  const box = useVisualViewport(open);
  useLockBodyScroll(open);
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
        className="z-10 flex flex-col overflow-hidden bg-[#111] text-[#f4f1ea]"
        style={visualViewportStyle(box)}
      >
        {children}
      </div>
    </div>
  );
}
