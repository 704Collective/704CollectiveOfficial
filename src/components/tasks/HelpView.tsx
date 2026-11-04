'use client';

export function HelpView() {
  return (
    <div data-testid="tm-help" className="space-y-5 text-sm leading-relaxed text-white/70">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C6A664]">Help</p>
      <h1 className="tm-display text-3xl text-[#f4f1ea]">How Tasks works</h1>
      <section>
        <h2 className="mb-1 text-base font-semibold text-[#f4f1ea]">Your work</h2>
        <p>My Tasks is what you own. Board is the same pile in Open / In progress / Done. Calendar puts each task on its due date in Charlotte time.</p>
      </section>
      <section>
        <h2 className="mb-1 text-base font-semibold text-[#f4f1ea]">Due and overdue</h2>
        <p>Yellow means due in two days. Red means it slipped past midnight ET. Fix it: reschedule, done late, miss, park, or cancel. A reason is required when you push a date later.</p>
      </section>
      <section>
        <h2 className="mb-1 text-base font-semibold text-[#f4f1ea]">Bars and History</h2>
        <p>Counted tasks (S/M/L/XL) move the week, month, quarter, and year bars. Exempt tasks never do. History locks 24 hours after a period ends so late check-offs still count during grace.</p>
      </section>
      <section>
        <h2 className="mb-1 text-base font-semibold text-[#f4f1ea]">Helpers</h2>
        <p>Helpers only see their own tasks. No folder names, no company bars, no Manage. New tasks land in Needs a home until a super files them.</p>
      </section>
    </div>
  );
}
