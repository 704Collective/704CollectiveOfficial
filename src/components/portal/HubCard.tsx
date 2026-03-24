'use client';

import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface HubData {
  id: string;
  title: string;
  description: string | null;
  header_image_url: string | null;
  member_count?: number;
  created_at: string;
}

interface Props {
  hub: HubData;
  onClick: () => void;
}

export function HubCard({ hub, onClick }: Props) {
  return (
    <div className="bg-[#2E2E2E] border border-white/10 rounded-xl overflow-hidden flex flex-col hover:border-[#D4A853]/30 transition-colors group cursor-pointer" onClick={onClick}>
      {/* Header image */}
      <div className="h-28 relative overflow-hidden bg-gradient-to-br from-[#D4A853]/30 via-[#1A1A1A] to-[#D4A853]/10">
        {hub.header_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hub.header_image_url}
            alt={hub.title}
            className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[#D4A853]/20 font-black text-5xl select-none">704</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 gap-3">
        <div className="flex-1">
          <h3 className="font-semibold text-white leading-tight line-clamp-1">{hub.title}</h3>
          {hub.description && (
            <p className="text-xs text-white/50 mt-1 line-clamp-2 leading-relaxed">{hub.description}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          {hub.member_count !== undefined && (
            <span className="flex items-center gap-1 text-xs text-white/40">
              <Users className="h-3 w-3" />
              {hub.member_count} {hub.member_count === 1 ? 'member' : 'members'}
            </span>
          )}
          <Button
            size="sm"
            className="ml-auto bg-[#D4A853]/10 hover:bg-[#D4A853]/20 text-[#D4A853] border border-[#D4A853]/30 text-xs h-7 px-3"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
          >
            View Hub
          </Button>
        </div>
      </div>
    </div>
  );
}
