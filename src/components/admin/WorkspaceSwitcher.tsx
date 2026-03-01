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
        <button className="flex items-center gap-2 w-full rounded-lg border border-border bg-muted/30 hover:bg-muted/50 px-3 h-9 text-sm font-medium transition-colors outline-none">
          <Shield className="w-4 h-4 shrink-0 text-primary" />
          <span className="flex-1 text-left truncate">Admin Portal</span>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
        <DropdownMenuItem>
          <Shield className="mr-2 h-4 w-4" />
          <span className="flex-1">Admin Portal</span>
          <Check className="ml-2 h-4 w-4 text-primary" />
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleMemberPortal}>
          <LayoutDashboard className="mr-2 h-4 w-4" />
          <span>Member Portal</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
