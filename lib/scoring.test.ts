import { describe, expect, it } from "vitest";
import { clampTimeUsed, grade, normalizeText, scoreFor } from "./scoring";
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
    expect(grade(q, { kind: "choice", picked: [1] }, strict)).toEqual({ isCorrect: true, ratio: 1 });
  });

  it("chọn sai", () => {
    expect(grade(q, { kind: "choice", picked: [0] }, strict).isCorrect).toBe(false);
  });

  it("chọn nhiều đáp án cho câu single là sai", () => {
    expect(grade(q, { kind: "choice", picked: [0, 1] }, strict).isCorrect).toBe(false);
  });

  it("gửi sai loại đáp án là sai, không crash", () => {
    expect(grade(q, { kind: "text", value: "114" }, strict).isCorrect).toBe(false);
  });
});

describe("grade · multi", () => {
  const q = { type: "multi" as const, correct: [0, 1, 2] };

  it("đúng hết mới được điểm khi bật all-or-nothing", () => {
    expect(grade(q, { kind: "choice", picked: [2, 0, 1] }, strict)).toEqual({
      isCorrect: true,
      ratio: 1,
    });
    expect(grade(q, { kind: "choice", picked: [0, 1] }, strict)).toEqual({
      isCorrect: false,
      ratio: 0,
    });
  });

  it("chọn thừa một đáp án sai là sai", () => {
    expect(grade(q, { kind: "choice", picked: [0, 1, 2, 3] }, strict).isCorrect).toBe(false);
  });

  it("điểm từng phần khi tắt all-or-nothing", () => {
    expect(grade(q, { kind: "choice", picked: [0, 1] }, partial).ratio).toBeCloseTo(2 / 3);
    // 2 đúng - 1 sai = 1/3
    expect(grade(q, { kind: "choice", picked: [0, 1, 3] }, partial).ratio).toBeCloseTo(1 / 3);
  });

  it("điểm từng phần không xuống dưới 0", () => {
    expect(grade(q, { kind: "choice", picked: [3] }, partial).ratio).toBe(0);
  });

  it("chọn lặp không cộng thêm", () => {
    expect(grade(q, { kind: "choice", picked: [0, 0, 1, 2] }, strict).isCorrect).toBe(true);
  });
});

describe("grade · boolean", () => {
  it("so khớp đúng giá trị", () => {
    const q = { type: "boolean" as const, correct: [false] };
    expect(grade(q, { kind: "boolean", value: false }, strict).isCorrect).toBe(true);
    expect(grade(q, { kind: "boolean", value: true }, strict).isCorrect).toBe(false);
  });
});

describe("grade · text", () => {
  const q = { type: "text" as const, correct: ["ABC", "abc"] };

  it("khớp bất kể hoa thường và khoảng trắng", () => {
    expect(grade(q, { kind: "text", value: "  aBc " }, strict).isCorrect).toBe(true);
  });

  it("đáp án trống là sai", () => {
    expect(grade(q, { kind: "text", value: "   " }, strict).isCorrect).toBe(false);
  });

  it("chấp nhận biến thể có dấu", () => {
    const vn = { type: "text" as const, correct: ["một trăm mười bốn"] };
    expect(grade(vn, { kind: "text", value: "Mot tram muoi bon" }, strict).isCorrect).toBe(true);
  });
});

describe("grade · hết giờ", () => {
  it("luôn sai bất kể loại câu", () => {
    for (const type of ["single", "multi", "boolean", "text"] as const) {
      expect(grade({ type, correct: [0] }, { kind: "timeout" }, strict)).toEqual({
        isCorrect: false,
        ratio: 0,
      });
    }
  });
});

describe("scoreFor", () => {
  const base = { points: 1000, timeLimitMs: 20000, speedBonus: true };
  const right = { isCorrect: true, ratio: 1 };
  const wrong = { isCorrect: false, ratio: 0 };

  it("sai được 0 điểm, không bị trừ", () => {
    expect(scoreFor({ ...base, timeUsedMs: 1000, grade: wrong })).toBe(0);
  });

  it("trả lời tức thì được gần trọn điểm", () => {
    expect(scoreFor({ ...base, timeUsedMs: 0, grade: right })).toBe(1000);
  });

  it("trả lời sát giờ được khoảng nửa điểm", () => {
    expect(scoreFor({ ...base, timeUsedMs: 20000, grade: right })).toBe(500);
  });

  it("càng nhanh điểm càng cao", () => {
    const fast = scoreFor({ ...base, timeUsedMs: 2000, grade: right });
    const slow = scoreFor({ ...base, timeUsedMs: 15000, grade: right });
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBe(950);
    expect(slow).toBe(625);
  });

  it("quá giờ không bị tính âm", () => {
    expect(scoreFor({ ...base, timeUsedMs: 999999, grade: right })).toBe(500);
  });

  it("tắt speed bonus thì mọi câu đúng bằng điểm nhau", () => {
    const a = scoreFor({ ...base, speedBonus: false, timeUsedMs: 500, grade: right });
    const b = scoreFor({ ...base, speedBonus: false, timeUsedMs: 19000, grade: right });
    expect(a).toBe(1000);
    expect(b).toBe(1000);
  });

  it("điểm từng phần được nhân theo tỉ lệ", () => {
    expect(scoreFor({ ...base, timeUsedMs: 0, grade: { isCorrect: true, ratio: 0.5 } })).toBe(500);
  });
});

describe("clampTimeUsed", () => {
  const limit = 20000;

  it("tính đúng thời gian bình thường", () => {
    const served = new Date("2026-08-31T10:00:00Z");
    const answered = new Date("2026-08-31T10:00:04.300Z");
    expect(clampTimeUsed(served, answered, limit)).toBe(4300);
  });

  it("chặn trên bằng giới hạn của câu", () => {
    const served = new Date("2026-08-31T10:00:00Z");
    const answered = new Date("2026-08-31T10:05:00Z");
    expect(clampTimeUsed(served, answered, limit)).toBe(limit);
  });

  it("đồng hồ chạy lùi bị tính là hết giờ, không thành 0 giây", () => {
    const served = new Date("2026-08-31T10:00:10Z");
    const answered = new Date("2026-08-31T10:00:00Z");
    expect(clampTimeUsed(served, answered, limit)).toBe(limit);
  });
});
