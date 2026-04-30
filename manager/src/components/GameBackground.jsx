import React, { useEffect, useRef } from "react";

// Animated canvas background — floating game icons + particle trail
export default function GameBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;

    const ICONS = ["🎮","🕹️","⚔️","🏆","💎","🔫","🚗","⭐","🎯","🔥","💥","🎲","👾","🤖","🦅"];
    const particles = [];
    const icons     = [];

    // Create floating icon objects
    for (let i = 0; i < 18; i++) {
      icons.push({
        x: Math.random() * W,
        y: Math.random() * H,
        icon: ICONS[Math.floor(Math.random() * ICONS.length)],
        size: 14 + Math.random() * 22,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        opacity: 0.04 + Math.random() * 0.08,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.008,
      });
    }

    // Particle class
    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x  = Math.random() * W;
        this.y  = H + 10;
        this.vx = (Math.random() - 0.5) * 1.2;
        this.vy = -(0.5 + Math.random() * 1.5);
        this.r  = 1 + Math.random() * 2.5;
        this.life = 1;
        this.decay = 0.003 + Math.random() * 0.005;
        const hue = Math.random() * 60 + 200; // blue-purple range
        this.color = `hsla(${hue},80%,65%,`;
      }
      update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= this.decay;
        if (this.life <= 0 || this.y < -10) this.reset();
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = this.color + this.life + ")";
        ctx.fill();
      }
    }

    for (let i = 0; i < 60; i++) {
      const p = new Particle();
      p.y = Math.random() * H; // scatter initially
      particles.push(p);
    }

    let raf;
    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Draw floating icons
      icons.forEach(ic => {
        ic.x += ic.vx; ic.y += ic.vy; ic.rotation += ic.rotSpeed;
        if (ic.x < -50) ic.x = W + 50;
        if (ic.x > W + 50) ic.x = -50;
        if (ic.y < -50) ic.y = H + 50;
        if (ic.y > H + 50) ic.y = -50;
        ctx.save();
        ctx.globalAlpha = ic.opacity;
        ctx.translate(ic.x, ic.y);
        ctx.rotate(ic.rotation);
        ctx.font = `${ic.size}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ic.icon, 0, 0);
        ctx.restore();
      });

      // Draw particles
      particles.forEach(p => { p.update(); p.draw(); });

      raf = requestAnimationFrame(draw);
    }

    draw();

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W; canvas.height = H;
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", top: 0, left: 0,
        width: "100vw", height: "100vh",
        pointerEvents: "none", zIndex: 0,
        opacity: 0.6,
      }}
    />
  );
}
