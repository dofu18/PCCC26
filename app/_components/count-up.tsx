"use client";

import { useEffect, useRef } from "react";
import { formatScore } from "@/lib/format";

/**
 * Đếm số điểm từ 0 lên giá trị thật.
 * Render sẵn giá trị cuối (SSR) rồi mới đếm bằng cách ghi trực tiếp vào DOM —
 * nếu JS chưa chạy hoặc lỗi, thí sinh vẫn thấy đúng số điểm, không nhấp nháy.
 */
export function CountUp({
  value,
  durationMs = 900,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || value <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const start = performance.now();
    el.textContent = formatScore(0);

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out mạnh: chạy nhanh lúc đầu, dừng dứt khoát
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatScore(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      el.textContent = formatScore(value);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {formatScore(value)}
    </span>
  );
}
