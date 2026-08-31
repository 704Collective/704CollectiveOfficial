'use client';

import { format } from 'date-fns';
import { orDash, type ExchangeRegistration } from '@/lib/admin/exchange';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

const DOOR_LABEL: Record<string, string> = {
  public: 'Public',
  commonwealth: 'Commonwealth',
  invited: 'Invited',
  member_rsvp: 'Member RSVP',
};

const MEMBER_BADGE: Record<string, string> = {
  member: 'bg-green-500/15 text-green-400',
  guest: 'bg-purple-500/15 text-purple-400',
  lead: 'bg-blue-500/15 text-blue-400',
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-normal">{label}</p>
      <p className="text-sm text-foreground mt-0.5 break-words">{value}</p>
    </div>
  );
}

/**
 * The one place a person's full intake answers are readable.
 *
 * The answers used to live in a colSpan row inside the roster table, which
 * meant they were laid out at the table's width — wider than the box the table
 * sits in — so their right-hand side fell off the edge on desktop and roughly
 * two thirds of every answer was lost on a phone. Here they are laid out
 * against the sheet, which is sized to the viewport, so length stops mattering.
 *
 * The name lives in the header, outside the scrolling body, because the old
 * failure mode on mobile was recovering the text by scrolling sideways until
 * you could no longer see whose text it was.
 */
export function ExchangePersonSheet({
  person,
  open,
  onOpenChange,
}: {
  person: ExchangeRegistration | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Full width on a phone, a readable column on desktop. p-0 so the
        // header can stay put while only the body scrolls.
        className="w-full sm:max-w-xl flex flex-col p-0 gap-0"
        data-testid="person-sheet"
      >
        {person && (
          <>
            <SheetHeader className="shrink-0 border-b border-border px-6 pt-6 pb-4 pr-12 text-left space-y-1">
              <SheetTitle className="break-words" data-testid="person-sheet-name">
                {orDash(person.name)}
              </SheetTitle>
              <SheetDescription className="break-words">{orDash(person.email)}</SheetDescription>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className={`text-[11px] capitalize font-normal rounded-md px-1.5 py-0.5 ${MEMBER_BADGE[person.memberStatus]}`}>
                  {person.memberStatus}
                </span>
                <span className="text-[11px] rounded-md bg-muted text-muted-foreground px-1.5 py-0.5 capitalize">
                  {person.participation === 'social_only' ? 'Hang only' : 'Mixer'}
                </span>
                {person.isFounder && (
                  <span className="text-[10px] rounded-md bg-amber-500/15 text-amber-400 px-1.5 py-0.5 font-normal">Host</span>
                )}
                {person.credentialStatus === 'voided' && (
                  <span className="text-[10px] rounded-md bg-red-500/15 text-red-400 px-1.5 py-0.5 font-normal">Voided</span>
                )}
              </div>
            </SheetHeader>

            {/* Cap and overflow on the same element, per the bell fix. */}
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5 space-y-6"
              data-testid="person-sheet-body"
            >
              <div className="grid grid-cols-2 gap-4">
                <Fact
                  label="Checked in"
                  value={person.checkedInAt ? format(new Date(person.checkedInAt), 'h:mm a') : 'Not yet'}
                />
                <Fact
                  label="Registered"
                  value={person.registeredAt ? format(new Date(person.registeredAt), 'MMM d, h:mm a') : '-'}
                />
                <Fact label="Door" value={DOOR_LABEL[person.door] ?? person.door} />
                <Fact label="Tier" value={orDash(person.tier)} />
              </div>

              <div className="space-y-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-normal">
                  Intake answers
                </p>
                {person.answers.length > 0 ? (
                  person.answers.map((a) => (
                    <div key={a.label} data-testid={`answer-${a.label}`}>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-normal">{a.label}</p>
                      {/* Full width of the sheet, wrapping, honouring newlines. */}
                      <p className="text-sm text-foreground mt-1 whitespace-pre-wrap break-words">{a.value}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground italic">{person.skipReason}</p>
                )}
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <Fact label="Phone" value={orDash(person.phone)} />
                <Fact label="Source" value={person.sourceLabel} />
                <Fact label="Pool" value={person.pool} />
                <Fact label="Credential" value={orDash(person.credentialToken)} />
                <Fact
                  label="UTM"
                  value={[person.utm.utm_source, person.utm.utm_medium, person.utm.utm_campaign, person.utm.utm_content]
                    .map((v) => v ?? '-').join(' / ')}
                />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
