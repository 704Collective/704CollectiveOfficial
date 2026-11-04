'use client';

import { useEffect, useState } from 'react';

export function ConfettiBurst({ show }: { show: boolean }) {
  const [bits, setBits] = useState<{ id: number; left: number; delay: number; color: string }[]>([]);

  useEffect(() => {
    if (!show) {
      setBits([]);
      return;
    }
    const colors = ['#C6A664', '#4CAF50', '#E24B4A', '#6B8E9F', '#f4f1ea'];
    setBits(
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        color: colors[i % colors.length],
      }))
    );
    const t = window.setTimeout(() => setBits([]), 1800);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!bits.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" data-testid="tm-confetti" aria-hidden>
      {bits.map((b) => (
        <span
          key={b.id}
          className="absolute top-0 h-2 w-2 rounded-sm"
          style={{
            left: `${b.left}%`,
            background: b.color,
            animation: `tm-confetti 1.4s ease-out ${b.delay}s both`,
          }}
        />
      ))}
      <style>{`@keyframes tm-confetti { 0% { transform: translateY(-10px) rotate(0); opacity: 1; } 100% { transform: translateY(90vh) rotate(540deg); opacity: 0; } }`}</style>
    </div>
  );
}
