"use client";

import { Header } from "@/components/Header";
import { DashboardNav } from "@/components/DashboardNav";
import { Skeleton } from "@/components/ui/skeleton";
import { DASHBOARD_MAIN, DASHBOARD_MAIN_WIDE } from "@/lib/dashboard-layout";
import { cn } from "@/lib/utils";

function PostCardSkeleton() {
  return (
    <div className="card-elevated p-4 space-y-3 w-full min-w-0">
      <div className="flex items-center gap-2.5">
        <Skeleton className="w-9 h-9 rounded-full shrink-0" />
        <div className="space-y-1.5 flex-1 min-w-0">
          <Skeleton className="h-3.5 w-32 max-w-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5 max-w-full" />
    </div>
  );
}

export function SocialOrBusinessFeedPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <DashboardNav />
      <main id="main-content" className={cn(DASHBOARD_MAIN, "space-y-4")}>
        <Skeleton className="h-8 w-48 max-w-full" />
        <div className="space-y-4">
          <PostCardSkeleton />
          <PostCardSkeleton />
          <PostCardSkeleton />
        </div>
      </main>
    </div>
  );
}

function MemberCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#2E2E2E] p-5 space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-14 w-14 rounded-full shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <Skeleton className="h-4 w-3/5 max-w-full" />
          <Skeleton className="h-3 w-2/5 max-w-full" />
          <Skeleton className="h-3 w-1/2 max-w-full" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 flex-1 rounded-md" />
        <Skeleton className="h-8 flex-1 rounded-md" />
      </div>
    </div>
  );
}

export function MemberDirectoryPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <Header />
      <DashboardNav />
      <main id="main-content" className={cn(DASHBOARD_MAIN_WIDE)}>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-8 w-56 max-w-full mx-auto sm:mx-0" />
            <Skeleton className="h-10 w-full max-w-md sm:max-w-xs rounded-md" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <MemberCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function HubCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-[#2E2E2E] overflow-hidden flex flex-col">
      <Skeleton className="h-28 w-full rounded-none" />
      <div className="p-4 space-y-3 flex-1">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-7 w-24 ml-auto rounded-md" />
      </div>
    </div>
  );
}

export function HubsListingPageSkeleton() {
  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <Header />
      <DashboardNav />
      <main id="main-content" className={cn(DASHBOARD_MAIN_WIDE)}>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-8 w-32 max-w-full mx-auto sm:mx-0" />
            <Skeleton className="h-10 w-full max-w-md sm:w-64 rounded-md" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <HubCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function PartnerCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-5 space-y-3">
      <Skeleton className="h-16 w-16 rounded-lg" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

export function PartnerDirectoryPageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <DashboardNav />
      <main id="main-content" className={cn(DASHBOARD_MAIN_WIDE)}>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48 max-w-full" />
          <Skeleton className="h-10 w-full max-w-md rounded-md" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <PartnerCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Messages layout inside main (use for Suspense fallback; avoids duplicating header/nav). */
export function MessagesInnerSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[420px]">
      <div className="lg:col-span-4 space-y-2 rounded-xl border border-white/10 bg-[#2E2E2E] p-3">
        <Skeleton className="h-10 w-full rounded-md" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
      <div className="lg:col-span-8 rounded-xl border border-white/10 bg-[#2E2E2E] p-4 space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  );
}

export function MessagesPageShellSkeleton() {
  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <Header />
      <DashboardNav />
      <main id="main-content" className={cn(DASHBOARD_MAIN_WIDE)}>
        <MessagesInnerSkeleton />
      </main>
    </div>
  );
}

export function PartnerPortalLayoutSkeleton() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0a0a0a" }}>
      <Skeleton className="h-16 w-full rounded-none bg-[#2a2a2a]" />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <Skeleton className="h-12 w-48 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
        <Skeleton className="h-px w-full bg-white/10" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function PartnerPortalDashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-6 w-32 rounded-md" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-10 w-48 rounded-md ml-auto" />
    </div>
  );
}

export function PartnerPortalEventsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function PartnerPortalInquiriesSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-56 max-w-full" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function DashboardOverviewSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <DashboardNav />
      <main id="main-content" className={cn(DASHBOARD_MAIN, "space-y-6")}>
        <Skeleton className="h-9 w-64 max-w-full mx-auto" />
        <div className="mx-auto w-full max-w-lg space-y-5">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <div className="flex justify-center gap-2">
            <Skeleton className="h-10 w-32 rounded-md" />
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <PostCardSkeleton />
          <PostCardSkeleton />
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </main>
    </div>
  );
}
