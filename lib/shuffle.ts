import type { OrderedQuestion, Question } from "./types";

/** PRNG có seed (mulberry32) — cùng seed cho ra cùng thứ tự, nên reload không đổi đề. */
export function makeRng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let a = h;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, không sửa mảng gốc. */
export function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Dựng đề riêng cho một thí sinh: trộn thứ tự câu và thứ tự đáp án.
 * Câu boolean và text không có options nên chỉ trộn thứ tự câu.
 */
export function buildQuestionOrder(
  questions: readonly Pick<Question, "id" | "options">[],
  seed: string,
): OrderedQuestion[] {
  const rng = makeRng(seed);
  return shuffled(questions, rng).map((q) => ({
    qid: q.id,
    options: q.options ? shuffled(q.options.map((_, i) => i), rng) : [],
  }));
}

/** Đáp án hiển thị theo thứ tự đã trộn. */
export function displayOptions(options: string[] | null, order: number[]): string[] | null {
  if (!options) return null;
  if (order.length !== options.length) return options;
  return order.map((i) => options[i]);
}

/** Vị trí thí sinh chọn (hệ hiển thị) → vị trí gốc trong questions.options. */
export function toOriginalIndex(displayIndex: number, order: number[]): number {
  return order[displayIndex] ?? displayIndex;
}
