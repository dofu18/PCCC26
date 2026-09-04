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

/**
 * Chấm một câu: đúng hay sai, không có điểm.
 * `given` đã được map về hệ toạ độ GỐC của questions.options.
 */
export function grade(
  question: Pick<Question, "type" | "correct">,
  given: GivenAnswer,
  settings: Pick<Settings, "multi_all_or_nothing">,
): boolean {
  // Bỏ qua câu = không trả lời = sai.
  if (given.kind === "skip") return false;

  switch (question.type) {
    case "single": {
      if (given.kind !== "choice" || given.picked.length !== 1) return false;
      return given.picked[0] === Number(question.correct[0]);
    }

    case "multi": {
      if (given.kind !== "choice") return false;
      const correct = question.correct.map(Number);
      const picked = [...new Set(given.picked)];
      if (settings.multi_all_or_nothing) return sameSet(picked, correct);

      // Chấm lỏng: chọn sai trừ lại phần đã đúng, còn dư mới tính là đúng.
      const hits = picked.filter((p) => correct.includes(p)).length;
      const misses = picked.filter((p) => !correct.includes(p)).length;
      return correct.length > 0 && hits - misses > 0;
    }

    case "boolean": {
      if (given.kind !== "boolean") return false;
      return given.value === Boolean(question.correct[0]);
    }

    case "text": {
      if (given.kind !== "text") return false;
      const needle = normalizeText(given.value);
      if (!needle) return false;
      return question.correct.some((c) => normalizeText(String(c)) === needle);
    }
  }
}

/**
 * Thời gian thí sinh dùng cho một câu, tính từ lúc câu được phát tới lúc nhận đáp án.
 * Không còn trần vì đã bỏ giới hạn thời gian. Đồng hồ chạy lùi thì tính 0.
 */
export function elapsedMs(servedAt: Date, answeredAt: Date): number {
  const raw = answeredAt.getTime() - servedAt.getTime();
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}
