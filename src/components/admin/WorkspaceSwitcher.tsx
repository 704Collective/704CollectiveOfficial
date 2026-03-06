'use client';

import { useRouter } from 'next/navigation';
import { Shield, ChevronsUpDown, Check, LayoutDashboard } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface WorkspaceSwitcherProps {
  onMobileClose?: () => void;
}

export function WorkspaceSwitcher({ onMobileClose }: WorkspaceSwitcherProps) {
  const router = useRouter();

  const handleMemberPortal = () => {
    router.push('/dashboard');
    onMobileClose?.();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 w-full rounded-lg border border-border bg-accent/30 hover:bg-accent/60 px-3 h-9 text-sm font-medium transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Shield className="w-4 h-4 shrink-0 text-primary" />
          <span className="flex-1 text-left truncate text-foreground">Admin Portal</span>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" sideOffset={4} className="w-[--radix-dropdown-menu-trigger-width]">
        {/* Active workspace */}
        <DropdownMenuItem className="gap-2 cursor-default focus:bg-accent/40">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <span className="flex-1 text-sm">Admin Portal</span>
          <Check className="h-4 w-4 text-primary shrink-0" />
        </DropdownMenuItem>

        {/* Switch to member portal */}
        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleMemberPortal}>
          <LayoutDashboard className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 text-sm">Member Portal</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}