"use client";

import { useEffect, useRef } from "react";

export default function HeroDots() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const dots: { x: number; y: number; baseAlpha: number; speed: number }[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
    }

    function initDots() {
      dots.length = 0;
      const spacing = 60;
      const cols = Math.ceil(canvas!.width / spacing);
      const rows = Math.ceil(canvas!.height / spacing);

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          dots.push({
            x: i * spacing + spacing / 2,
            y: j * spacing + spacing / 2,
            baseAlpha: Math.random() * 0.3 + 0.05,
            speed: Math.random() * 0.5 + 0.5,
          });
        }
      }
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      time += 0.01;

      dots.forEach((dot) => {
        const pulse = Math.sin(time * dot.speed + dot.x * 0.01 + dot.y * 0.01) * 0.5 + 0.5;
        const alpha = dot.baseAlpha * pulse;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      });

      animationId = requestAnimationFrame(draw);
    }

    resize();
    initDots();
    draw();

    window.addEventListener("resize", () => {
      resize();
      initDots();
    });

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.4,
      }}
    />
  );
}