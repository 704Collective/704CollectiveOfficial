'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

export type VisualViewportBox = {
  height: number;
  width: number;
  offsetTop: number;
  offsetLeft: number;
};

function readBox(): VisualViewportBox {
  if (typeof window === 'undefined') {
    return { height: 800, width: 390, offsetTop: 0, offsetLeft: 0 };
  }
  const vv = window.visualViewport;
  return {
    height: vv?.height ?? window.innerHeight,
    width: vv?.width ?? window.innerWidth,
    offsetTop: vv?.offsetTop ?? 0,
    offsetLeft: vv?.offsetLeft ?? 0,
  };
}

export function useVisualViewport(active = true): VisualViewportBox {
  const [box, setBox] = useState<VisualViewportBox>(readBox);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const update = () => setBox(readBox());
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [active]);

  return box;
}

export function visualViewportStyle(box: VisualViewportBox): CSSProperties {
  return {
    position: 'fixed',
    top: box.offsetTop,
    left: box.offsetLeft,
    width: box.width,
    height: box.height,
    maxHeight: box.height,
    right: 'auto',
    bottom: 'auto',
    transform: 'none',
    margin: 0,
  };
}

export function usePhoneViewportStyle(active: boolean): CSSProperties | undefined {
  const box = useVisualViewport(active);
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  if (!active || !phone) return undefined;
  return visualViewportStyle(box);
}

export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;
    const prevBodyWidth = body.style.width;
    const scrollY = window.scrollY;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      body.style.width = prevBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
