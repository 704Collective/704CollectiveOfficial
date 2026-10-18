"use client";

import { useEffect, useState } from "react";
import { motion, useScroll, useSpring } from "framer-motion";

export default function ScrollProgress() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 200,
    damping: 50,
    restDelta: 0.001,
  });

  return (
    <motion.div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "2px",
        background: "linear-gradient(90deg, rgba(255,255,255,0.6), rgba(255,255,255,0.9))",
        transformOrigin: "0%",
        // Number 0 until after hydrate so SSR HTML matches the first client paint
        // (useScroll/useSpring can disagree with the server on restored scroll).
        scaleX: hydrated ? scaleX : 0,
        zIndex: 100,
      }}
    />
  );
}