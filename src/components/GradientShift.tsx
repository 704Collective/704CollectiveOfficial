"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export default function GradientShift({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const opacity = useTransform(scrollYProgress, [0.2, 0.5], [0, 1]);

  return (
    <motion.section ref={ref} className={className} style={{ ...style, position: "relative", overflow: "hidden" }}>
      {/* Warm gold gradient that fades in on scroll */}
      <motion.div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "radial-gradient(ellipse at center, rgba(198, 166, 100, 0.04) 0%, transparent 70%)",
          opacity,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </motion.section>
  );
}