import type { GivenAnswer, Question, Settings } from "./types";

/**
 * Chuẩn hoá đáp án dạng chữ trước khi so khớp.
 * Bỏ qua: hoa/thường, dấu cách thừa, dấu câu, và dấu tiếng Việt.
 * Bỏ dấu là chủ ý — thí sinh gõ trên điện thoại rất dễ thiếu dấu, và
 * hai đáp án của một câu đố hiếm khi chỉ khác nhau ở dấu.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu thanh + dấu phụ
    .replace(/đ/gi, (m) => (m === "đ" ? "d" : "D"))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // dấu câu → khoảng trắng
    .replace(/\s+/g, " ")
    .trim();
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...new Set(a)].sort((x, y) => x - y);
  const sb = [...new Set(b)].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

export type Grade = {
  isCorrect: boolean;
  /** 0..1 — dùng cho luật điểm từng phần của câu nhiều đáp án */
  ratio: number;
};

/**
 * Chấm một câu. `given` đã được map về hệ toạ độ GỐC của questions.options.
 */
export function grade(
  question: Pick<Question, "type" | "correct">,
  given: GivenAnswer,
  settings: Pick<Settings, "multi_all_or_nothing">,
): Grade {
  if (given.kind === "timeout") return { isCorrect: false, ratio: 0 };

  switch (question.type) {
    case "single": {
      if (given.kind !== "choice" || given.picked.length !== 1) {
        return { isCorrect: false, ratio: 0 };
      }
      const ok = given.picked[0] === Number(question.correct[0]);
      return { isCorrect: ok, ratio: ok ? 1 : 0 };
    }

    case "multi": {
      if (given.kind !== "choice") return { isCorrect: false, ratio: 0 };
      const correct = question.correct.map(Number);
      const picked = [...new Set(given.picked)];
      const hits = picked.filter((p) => correct.includes(p)).length;
      const misses = picked.filter((p) => !correct.includes(p)).length;
      const exact = sameSet(picked, correct);

      if (settings.multi_all_or_nothing) {
        return { isCorrect: exact, ratio: exact ? 1 : 0 };
      }
      // Điểm từng phần: chọn sai trừ lại phần đã đúng, không xuống dưới 0.
      const ratio = correct.length === 0 ? 0 : Math.max(0, (hits - misses) / correct.length);
      return { isCorrect: ratio > 0, ratio };
    }

    case "boolean": {
      if (given.kind !== "boolean") return { isCorrect: false, ratio: 0 };
      const ok = given.value === Boolean(question.correct[0]);
      return { isCorrect: ok, ratio: ok ? 1 : 0 };
    }

    case "text": {
      if (given.kind !== "text") return { isCorrect: false, ratio: 0 };
      const needle = normalizeText(given.value);
      if (!needle) return { isCorrect: false, ratio: 0 };
      const ok = question.correct.some((c) => normalizeText(String(c)) === needle);
      return { isCorrect: ok, ratio: ok ? 1 : 0 };
    }
  }
}

export type ScoreInput = {
  points: number;
  timeLimitMs: number;
  timeUsedMs: number;
  grade: Grade;
  speedBonus: boolean;
};

/**
 * Điểm kiểu Kahoot: trả lời càng nhanh càng nhiều điểm, sai không bị trừ.
 *
 *   sai / hết giờ → 0
 *   đúng          → round(points * ratio * (1 - (timeUsed / timeLimit) / 2))
 *
 * Trả lời tức thì ≈ points đầy đủ; trả lời sát giờ ≈ points/2.
 */
export function scoreFor({
  points,
  timeLimitMs,
  timeUsedMs,
  grade,
  speedBonus,
}: ScoreInput): number {
  if (grade.ratio <= 0) return 0;

  const base = points * grade.ratio;
  if (!speedBonus) return Math.round(base);

  const limit = Math.max(1, timeLimitMs);
  const used = Math.min(Math.max(0, timeUsedMs), limit);
  return Math.round(base * (1 - used / limit / 2));
}

/** Thời gian đã dùng, luôn nằm trong [0, timeLimit]. Chống đồng hồ client. */
export function clampTimeUsed(servedAt: Date, answeredAt: Date, timeLimitMs: number): number {
  const raw = answeredAt.getTime() - servedAt.getTime();
  if (!Number.isFinite(raw) || raw < 0) return timeLimitMs;
  return Math.min(raw, timeLimitMs);
}

export function timeLimitMsFor(
  question: Pick<Question, "time_limit_s">,
  settings: Pick<Settings, "default_time_limit_s">,
): number {
  return (question.time_limit_s ?? settings.default_time_limit_s) * 1000;
}

export function pointsFor(
  question: Pick<Question, "points">,
  settings: Pick<Settings, "default_points">,
): number {
  return question.points ?? settings.default_points;
}
