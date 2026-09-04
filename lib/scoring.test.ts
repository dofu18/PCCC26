import { describe, expect, it } from "vitest";
import { elapsedMs, grade, normalizeText } from "./scoring";
import type { Settings } from "./types";

const strict: Pick<Settings, "multi_all_or_nothing"> = { multi_all_or_nothing: true };
const partial: Pick<Settings, "multi_all_or_nothing"> = { multi_all_or_nothing: false };

describe("normalizeText", () => {
  it("bỏ qua hoa/thường, dấu câu và khoảng trắng thừa", () => {
    expect(normalizeText("  Bình  chữa CHÁY! ")).toBe("binh chua chay");
  });

  it("bỏ dấu tiếng Việt để thí sinh gõ thiếu dấu vẫn đúng", () => {
    expect(normalizeText("an toàn")).toBe(normalizeText("an toan"));
    expect(normalizeText("Đường")).toBe("duong");
  });

  it("không nhập nhằng hai đáp án khác nhau", () => {
    expect(normalizeText("114")).not.toBe(normalizeText("115"));
  });
});

describe("grade · single", () => {
  const q = { type: "single" as const, correct: [1] };

  it("chọn đúng", () => {
    expect(grade(q, { kind: "choice", picked: [1] }, strict)).toBe(true);
  });

  it("chọn sai", () => {
    expect(grade(q, { kind: "choice", picked: [0] }, strict)).toBe(false);
  });

  it("chọn nhiều đáp án cho câu single là sai", () => {
    expect(grade(q, { kind: "choice", picked: [0, 1] }, strict)).toBe(false);
  });

  it("gửi sai loại đáp án là sai, không crash", () => {
    expect(grade(q, { kind: "text", value: "114" }, strict)).toBe(false);
  });
});

describe("grade · multi", () => {
  const q = { type: "multi" as const, correct: [0, 1, 2] };

  it("đúng hết mới được điểm khi bật all-or-nothing", () => {
    expect(grade(q, { kind: "choice", picked: [2, 0, 1] }, strict)).toBe(true);
    expect(grade(q, { kind: "choice", picked: [0, 1] }, strict)).toBe(false);
  });

  it("chọn thừa một đáp án sai là sai", () => {
    expect(grade(q, { kind: "choice", picked: [0, 1, 2, 3] }, strict)).toBe(false);
  });

  it("tắt all-or-nothing: chọn đúng nhiều hơn sai là được tính đúng", () => {
    // 2 đúng, 0 sai
    expect(grade(q, { kind: "choice", picked: [0, 1] }, partial)).toBe(true);
    // 2 đúng - 1 sai = còn dư
    expect(grade(q, { kind: "choice", picked: [0, 1, 3] }, partial)).toBe(true);
  });

  it("tắt all-or-nothing: sai nhiều hơn hoặc bằng đúng thì vẫn sai", () => {
    expect(grade(q, { kind: "choice", picked: [3] }, partial)).toBe(false);
    // 1 đúng - 1 sai = 0, không dư
    expect(grade(q, { kind: "choice", picked: [0, 3] }, partial)).toBe(false);
  });

  it("chọn lặp không cộng thêm", () => {
    expect(grade(q, { kind: "choice", picked: [0, 0, 1, 2] }, strict)).toBe(true);
  });
});

describe("grade · boolean", () => {
  it("so khớp đúng giá trị", () => {
    const q = { type: "boolean" as const, correct: [false] };
    expect(grade(q, { kind: "boolean", value: false }, strict)).toBe(true);
    expect(grade(q, { kind: "boolean", value: true }, strict)).toBe(false);
  });
});

describe("grade · text", () => {
  const q = { type: "text" as const, correct: ["ABC", "abc"] };

  it("khớp bất kể hoa thường và khoảng trắng", () => {
    expect(grade(q, { kind: "text", value: "  aBc " }, strict)).toBe(true);
  });

  it("đáp án trống là sai", () => {
    expect(grade(q, { kind: "text", value: "   " }, strict)).toBe(false);
  });

  it("chấp nhận biến thể có dấu", () => {
    const vn = { type: "text" as const, correct: ["một trăm mười bốn"] };
    expect(grade(vn, { kind: "text", value: "Mot tram muoi bon" }, strict)).toBe(true);
  });
});

describe("grade · bỏ qua câu", () => {
  it("luôn sai bất kể loại câu", () => {
    for (const type of ["single", "multi", "boolean", "text"] as const) {
      expect(grade({ type, correct: [0] }, { kind: "skip" }, strict)).toBe(false);
    }
  });
});

describe("elapsedMs", () => {
  it("tính đúng thời gian bình thường", () => {
    const served = new Date("2026-08-31T10:00:00Z");
    const answered = new Date("2026-08-31T10:00:04.300Z");
    expect(elapsedMs(served, answered)).toBe(4300);
  });

  it("không còn trần — bỏ giới hạn giờ nên ngồi lâu bao nhiêu tính bấy nhiêu", () => {
    const served = new Date("2026-08-31T10:00:00Z");
    const answered = new Date("2026-08-31T10:05:00Z");
    expect(elapsedMs(served, answered)).toBe(300_000);
  });

  it("đồng hồ chạy lùi tính 0, không ra số âm", () => {
    const served = new Date("2026-08-31T10:00:10Z");
    const answered = new Date("2026-08-31T10:00:00Z");
    expect(elapsedMs(served, answered)).toBe(0);
  });
});
