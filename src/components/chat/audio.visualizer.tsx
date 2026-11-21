"use client";

import { useEffect, useRef } from "react";

const BAR_COUNT = 48;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Live microphone equalizer bars, drawn without React state updates. */
export function AudioVisualizer({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef(new Float32Array(BAR_COUNT));

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!stream || !wrap || !canvas) return;

    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let frame = 0;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      context = new AudioContextClass();
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
    } catch {
      return;
    }

    const levels = new Uint8Array(analyser.frequencyBinCount);
    const color = getComputedStyle(canvas).color;

    const draw = () => {
      const width = wrap.clientWidth;
      const height = wrap.clientHeight;
      if (width <= 0 || height <= 0) {
        frame = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      if (
        canvas.width !== Math.round(width * dpr) ||
        canvas.height !== Math.round(height * dpr)
      ) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);
      analyser!.getByteFrequencyData(levels);

      const bins = Math.min(levels.length, 48);
      const step = bins / BAR_COUNT;
      const display = displayRef.current;
      const center = height / 2;
      const barWidth = 2;
      const gap = 2;
      const totalWidth = barWidth * BAR_COUNT + gap * (BAR_COUNT - 1);
      const startX = Math.max(0, (width - totalWidth) / 2);
      const minHalf = 2;
      const maxHalf = Math.max(minHalf, (height / 2) * 0.9);

      ctx.fillStyle = color;
      for (let i = 0; i < BAR_COUNT; i++) {
        const from = Math.floor(i * step);
        const to = Math.min(bins - 1, Math.floor((i + 1) * step));
        let sum = 0;
        for (let bin = from; bin <= to; bin++) sum += levels[bin] ?? 0;
        const target = Math.pow(sum / (to - from + 1) / 255, 1.25);
        const current = display[i] ?? 0;
        display[i] = lerp(current, target, target > current ? 0.45 : 0.2);

        const half = minHalf + (display[i] ?? 0) * (maxHalf - minHalf);
        const x = startX + i * (barWidth + gap);
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, center - half, barWidth, half * 2, barWidth / 2);
        } else {
          ctx.rect(x, center - half, barWidth, half * 2);
        }
        ctx.fill();
      }

      ctx.restore();
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      try {
        source?.disconnect();
        analyser?.disconnect();
        if (context && context.state !== "closed") void context.close();
      } catch {
        // Teardown errors must not surface in the composer.
      }
    };
  }, [stream]);

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label="Voice input level"
      className="relative flex h-9 min-w-0 flex-1 items-center justify-center overflow-hidden px-2"
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none block h-full w-full text-accent"
      />
    </div>
  );
}
