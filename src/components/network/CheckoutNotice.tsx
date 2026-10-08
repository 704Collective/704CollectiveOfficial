'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Wave H4: /get-listed is the Stripe Checkout success + cancel URL for listing
 * payments. This reads ?paid=1 / ?canceled=1 client-side so the page itself
 * stays static.
 */
function Notice() {
  const sp = useSearchParams();
  const paid = sp.get('paid') === '1';
  const canceled = sp.get('canceled') === '1';
  if (!paid && !canceled) return null;
  return (
    <div className="nw-wrap" style={{ paddingTop: 20 }}>
      <div className="nw-note" role="status" data-testid={paid ? 'checkout-paid' : 'checkout-canceled'} style={{ borderColor: paid ? 'var(--nw-accent, #3F7159)' : undefined }}>
        {paid ? (
          <><strong>Payment received — you&apos;re in.</strong> Your listing is being created in draft. Watch your inbox: a confirmation is on its way, and we&apos;ll finish the listing with you before it goes live.</>
        ) : (
          <><strong>Checkout canceled.</strong> Nothing was charged. Your payment link stays valid for 24 hours from when it was sent; reply to the approval email if you need a fresh one.</>
        )}
      </div>
    </div>
  );
}

export function CheckoutNotice() {
  return <Suspense fallback={null}><Notice /></Suspense>;
}
