import type { Question } from "./types";

/** Chữ hiển thị khi thí sinh bỏ qua câu. Dùng để nhận ra trường hợp này ở UI. */
export const NOT_ANSWERED = "bỏ qua, không trả lời";

/**
 * Diễn giải đáp án thí sinh đã chọn thành chữ đọc được.
 * `options` là mảng đáp án GỐC của câu hỏi — `answers.given` đã được map về hệ toạ độ gốc
 * lúc chấm, nên ở đây không cần biết thứ tự đã trộn của từng người.
 * Dùng chung cho trang kết quả của thí sinh, bảng bài làm ở admin và file Excel.
 */
export function describeGiven(given: unknown, options: string[] | null): string {
  if (given === null || given === undefined) return NOT_ANSWERED;
  if (typeof given !== "object") return String(given);

  const value = given as { kind?: string; picked?: number[]; value?: unknown };
  switch (value.kind) {
    case "choice":
      return (value.picked ?? []).map((i) => options?.[i] ?? `đáp án ${i + 1}`).join(" · ");
    case "boolean":
      return value.value ? "Đúng" : "Sai";
    case "text":
      return String(value.value ?? "");
    case "skip":
      return NOT_ANSWERED;
    default:
      return JSON.stringify(given);
  }
}

/** Đáp án đúng của một câu, dạng chữ. Câu điền chữ liệt kê mọi cách viết được chấp nhận. */
export function describeCorrect(question: Pick<Question, "type" | "options" | "correct">): string {
  switch (question.type) {
    case "single":
    case "multi":
      return question.correct
        .map((c) => question.options?.[Number(c)] ?? `#${Number(c) + 1}`)
        .join(" · ");
    case "boolean":
      return question.correct[0] === true ? "Đúng" : "Sai";
    case "text":
      return question.correct.map(String).join(" | ");
  }
}
