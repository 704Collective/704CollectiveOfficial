'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LogOut, User, Settings, LayoutDashboard, Menu, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import logo from '@/assets/704-logo.png';
import { cn } from '@/lib/utils';

interface HeaderProps {
  user?: {
    email?: string;
    name?: string;
    avatarUrl?: string;
  } | null;
  isAdmin?: boolean;
}

export function Header({ user, isAdmin }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  const navLinkClass = (path: string) =>
    cn(
      "text-sm font-medium transition-colors duration-200 relative py-1",
      isActive(path)
        ? "text-primary after:absolute after:bottom-[-4px] after:left-0 after:right-0 after:h-0.5 after:bg-primary after:rounded-full"
        : "text-muted-foreground hover:text-foreground"
    );

  const mobileLinkClass = (path: string) =>
    cn(
      "text-base font-medium transition-colors py-3 px-4 rounded-lg",
      isActive(path)
        ? "text-primary bg-primary/10 border-l-2 border-primary"
        : "text-foreground hover:text-primary hover:bg-muted/50"
    );

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Failed to sign out');
    } else {
      toast.success('Signed out successfully');
      router.push('/');
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <img src={logo} alt="704 Collective" className="h-9 w-auto" />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center justify-center gap-6 flex-1">
          {user ? (
          <>
              <Link href="/events" className={navLinkClass('/events')}>Events</Link>
              <Link href="/dashboard" className={navLinkClass('/dashboard')}>Dashboard</Link>
            </>
          ) : (
            <>
              <Link href="/events" className={navLinkClass('/events')}>Events</Link>
              <Link href="/login" className={navLinkClass('/login')}>Member Login</Link>
            </>
          )}
        </nav>

        {/* Auth Section */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Mobile hamburger menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] sm:w-[320px] bg-card border-border p-0 [&>button:last-of-type]:hidden">
              <div className="flex flex-col">
                {/* Mobile menu header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <img src={logo} alt="704 Collective" className="h-7 w-auto" />
                  <SheetClose asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <X className="h-4 w-4" />
                      <span className="sr-only">Close menu</span>
                    </Button>
                  </SheetClose>
                </div>

                {/* User info (logged in) */}
                {user && (
                  <div className="px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name || 'User'} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-sm font-bold text-primary-foreground">
                            {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{user.name || 'Member'}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation links */}
                <nav className="flex flex-col gap-1 p-3">
                  {user ? (
                  <>
                      <SheetClose asChild>
                        <Link href="/events" className={mobileLinkClass('/events')}>Events</Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <Link href="/dashboard" className={mobileLinkClass('/dashboard')}>
                          <LayoutDashboard className="inline-block w-4 h-4 mr-2 -mt-0.5" />Dashboard
                        </Link>
                      </SheetClose>
                      <SheetClose asChild>
                        <Link href="/settings" className={mobileLinkClass('/settings')}>
                          <Settings className="inline-block w-4 h-4 mr-2 -mt-0.5" />Settings
                        </Link>
                      </SheetClose>
                      {isAdmin && (
                        <SheetClose asChild>
                          <Link href="/admin" className={mobileLinkClass('/admin')}>
                            <User className="inline-block w-4 h-4 mr-2 -mt-0.5" />Admin Panel
                          </Link>
                        </SheetClose>
                      )}
                    </>
                  ) : (
                    <>
                      <SheetClose asChild>
                        <Link href="/events" className={mobileLinkClass('/events')}>Events</Link>
                      </SheetClose>
                      <SheetClose asChild>
                      <Link href="/login" className={mobileLinkClass('/login')}>Member Login</Link>
                      </SheetClose>
                    </>
                  )}
                </nav>

                {/* CTA / Sign out - directly below nav */}
                <div className="px-3 pb-4">
                  {user ? (
                    <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={handleSignOut}>
                      <LogOut className="w-4 h-4 mr-2" />Sign Out
                    </Button>
                  ) : (
                    <Button variant="hero" className="w-full rounded-full" asChild>
                      <Link href="/join">Join 704 Collective</Link>
                    </Button>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Desktop auth */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative hidden md:flex">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name || 'User'} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <span className="text-sm font-bold text-primary-foreground">
                        {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user.name || 'Member'}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/dashboard')}>
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => router.push('/admin')}>
                      <User className="w-4 h-4 mr-2" />
                      Admin Panel
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Button variant="hero" className="rounded-full" asChild>
                <Link href="/join">Join</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
