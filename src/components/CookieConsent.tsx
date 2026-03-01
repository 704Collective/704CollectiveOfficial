'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('cookie-consent')) {
      setVisible(true);
    }
  }, []);

  const handleChoice = (choice: string) => {
    localStorage.setItem('cookie-consent', choice);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border px-4 py-3">
      <div className="container flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">We use cookies to improve your experience.</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => handleChoice('declined')}>Decline</Button>
          <Button size="sm" onClick={() => handleChoice('accepted')}>Accept</Button>
        </div>
      </div>
    </div>
  );
}
