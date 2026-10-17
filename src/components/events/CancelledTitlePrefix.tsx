import { CANCELLED_PREFIX_COLOR, showCancelledPrefix } from '@/lib/events/eventVisibility';

export function CancelledTitlePrefix({
  status,
  cancelMode,
}: {
  status?: string | null;
  cancelMode?: string | null;
}) {
  if (!showCancelledPrefix({ status, cancel_mode: cancelMode })) return null;
  return (
    <span data-testid="cancelled-prefix" style={{ color: CANCELLED_PREFIX_COLOR, fontWeight: 700 }}>
      CANCELLED{' '}
    </span>
  );
}
