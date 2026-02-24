"use client";

import { useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";

/* ─── Fade up on scroll ─── */
export function FadeUp({
  children,
  delay = 0,
  duration = 0.6,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ─── Fade in (no vertical movement) ─── */
export function FadeIn({
  children,
  delay = 0,
  duration = 0.6,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/* ─── Slide in from left or right ─── */
export function SlideIn({
  children,
  direction = "left",
  delay = 0,
  duration = 0.7,
  className = "",
}: {
  children: React.ReactNode;
  direction?: "left" | "right";
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const xStart = direction === "left" ? -60 : 60;

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, x: xStart }}
      animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: xStart }}
      transition={{ duration, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ─── Stagger children (wrap around a group) ─── */
export function StaggerContainer({
  children,
  staggerDelay = 0.1,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/* ─── Stagger child (use inside StaggerContainer) ─── */
export function StaggerItem({
  children,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={{
        hidden: { opacity: 0, y: 25 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/* ─── Scale up on scroll ─── */
export function ScaleUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ─── Draw line on scroll ─── */
export function DrawLine({
  direction = "horizontal",
  color = "rgba(255, 255, 255, 0.1)",
  className = "",
}: {
  direction?: "horizontal" | "vertical";
  color?: string;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });

  const isHorizontal = direction === "horizontal";

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        height: isHorizontal ? "1px" : "100%",
        width: isHorizontal ? "100%" : "1px",
        background: color,
        transformOrigin: isHorizontal ? "left center" : "top center",
      }}
      initial={{ scaleX: isHorizontal ? 0 : 1, scaleY: isHorizontal ? 1 : 0 }}
      animate={
        isInView
          ? { scaleX: 1, scaleY: 1 }
          : { scaleX: isHorizontal ? 0 : 1, scaleY: isHorizontal ? 1 : 0 }
      }
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
    />
  );
}

/* ─── Parallax wrapper ─── */
export function Parallax({
  children,
  speed = 0.9,
  className = "",
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", `${(1 - speed) * 100}%`]);

  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}

/* ─── Word-by-word text reveal ─── */
export function WordReveal({
  text,
  className = "",
  style = {},
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const words = text.split(" ");

  return (
    <motion.span
      ref={ref}
      className={className}
      style={{ display: "inline-block", ...style }}
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          style={{ display: "inline-block", marginRight: "0.3em" }}
          initial={{ opacity: 0, y: 15 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{
            duration: 0.4,
            delay: i * 0.08,
            ease: [0.25, 0.1, 0.25, 1],
          }}
        >
          {word}
        </motion.span>
      ))}
    </motion.span>
  );
}

/* ─── Counter animation ─── */
export function CountUp({
  from = 0,
  to,
  suffix = "",
  duration = 1.5,
  className = "",
  style = {},
}: {
  from?: number;
  to: number;
  suffix?: string;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const count = useTransform(
    useScroll({ target: ref, offset: ["start end", "center center"] }).scrollYProgress,
    [0, 1],
    [from, to]
  );

  return (
    <motion.span
      ref={ref}
      className={className}
      style={style}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : { opacity: 0 }}
    >
      <motion.span>{isInView ? to : from}</motion.span>
      {suffix}
    </motion.span>
  );
}