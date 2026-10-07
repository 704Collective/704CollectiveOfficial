import type { CSSProperties, ReactNode } from 'react';
import { nwSans, nwSerif } from '@/lib/network/fonts';
import { HUB_ACCENTS, type HubSlug } from '@/lib/network/hubs';
import './network.css';

/**
 * Wraps every public Network page: loads Fraunces + Archivo, sets the hub
 * accent CSS variables (ink for non-hub pages such as Get Listed / How We Vet).
 */
export function NetworkShell({ hub, children }: { hub?: HubSlug; children: ReactNode }) {
  const accent = hub ? HUB_ACCENTS[hub] : { accent: '#141412', soft: '#B8B5AD' };
  const style = { '--nw-accent': accent.accent, '--nw-soft': accent.soft } as CSSProperties;
  return (
    <div className={`nw ${nwSans.variable} ${nwSerif.variable}`} style={style} data-hub={hub ?? 'none'}>
      {children}
    </div>
  );
}
