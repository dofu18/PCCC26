import { describe, expect, it } from "vitest";
import {
  buildQuestionOrder,
  displayOptions,
  makeRng,
  shuffled,
  toOriginalIndex,
} from "./shuffle";

const questions = [
  { id: "q1", options: ["a", "b", "c", "d"] },
  { id: "q2", options: null },
  { id: "q3", options: ["x", "y"] },
  { id: "q4", options: ["1", "2", "3"] },
  { id: "q5", options: null },
];

describe("makeRng", () => {
  it("cùng seed cho cùng dãy số", () => {
    const a = makeRng("HE180234");
    const b = makeRng("HE180234");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("seed khác cho dãy khác", () => {
    expect(makeRng("a")()).not.toBe(makeRng("b")());
  });

  it("trả về số trong [0, 1)", () => {
    const rng = makeRng("seed");
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("shuffled", () => {
  it("không sửa mảng gốc và giữ nguyên các phần tử", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffled(input, makeRng("s"));
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("buildQuestionOrder", () => {
  it("giữ đủ số câu, không mất không lặp", () => {
    const order = buildQuestionOrder(questions, "p1");
    expect(order).toHaveLength(5);
    expect(new Set(order.map((o) => o.qid)).size).toBe(5);
  });

  it("cùng thí sinh reload vẫn ra đúng đề cũ", () => {
    expect(buildQuestionOrder(questions, "p1")).toEqual(buildQuestionOrder(questions, "p1"));
  });

  it("hai thí sinh khác nhau nhận thứ tự khác nhau", () => {
    const a = buildQuestionOrder(questions, "participant-a");
    const b = buildQuestionOrder(questions, "participant-b");
    expect(a.map((o) => o.qid)).not.toEqual(b.map((o) => o.qid));
  });

  it("trộn đáp án là một phép hoán vị hợp lệ", () => {
    const order = buildQuestionOrder(questions, "p2");
    const q1 = order.find((o) => o.qid === "q1")!;
    expect([...q1.options].sort()).toEqual([0, 1, 2, 3]);
  });

  it("câu boolean/text không có đáp án để trộn", () => {
    const order = buildQuestionOrder(questions, "p3");
    expect(order.find((o) => o.qid === "q2")!.options).toEqual([]);
  });
});

describe("displayOptions + toOriginalIndex", () => {
  it("hiển thị theo thứ tự đã trộn", () => {
    expect(displayOptions(["a", "b", "c"], [2, 0, 1])).toEqual(["c", "a", "b"]);
  });

  it("map ngược về đúng vị trí gốc", () => {
    const options = ["113", "114", "115", "116"];
    const order = [3, 1, 0, 2];
    const shown = displayOptions(options, order)!;
    const clickedAt = shown.indexOf("114");
    expect(options[toOriginalIndex(clickedAt, order)]).toBe("114");
  });

  it("map ngược đúng với mọi vị trí", () => {
    const options = ["a", "b", "c", "d"];
    const order = buildQuestionOrder([{ id: "q", options }], "seed")[0].options;
    const shown = displayOptions(options, order)!;
    shown.forEach((text, i) => {
      expect(options[toOriginalIndex(i, order)]).toBe(text);
    });
  });

  it("không có đáp án thì trả về null", () => {
    expect(displayOptions(null, [])).toBeNull();
  });
});
