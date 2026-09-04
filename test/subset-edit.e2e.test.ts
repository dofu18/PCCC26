/**
 * Integration test cho hai tính năng thêm ở đợt rà soát 2026-09-04:
 *  - rút ngẫu nhiên N câu từ ngân hàng cho mỗi lượt (`questions_per_attempt`)
 *  - sửa câu hỏi ở admin, chặn sửa khi bộ đề đang được lượt mở dùng
 *
 *   npm run test:e2e
 *
 * Test tự dọn dữ liệu của mình (mọi thứ đặt tên bắt đầu bằng "[e2e-sub]").
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addQuestion,
  closeSession,
  createQuestionSet,
  isSetInActiveSession,
  listQuestions,
  openSession,
  updateQuestion,
  updateSettings,
} from "@/lib/admin-data";
import { getParticipant, getSettings, joinSession } from "@/lib/quiz";
import { db } from "@/lib/supabase";
import type { Settings } from "@/lib/types";

const TAG = "[e2e-sub]";
const BANK_SIZE = 8;
const PER_ATTEMPT = 3;

let setId: string;
let sessionId: string;
let original: Settings;

async function cleanup() {
  const sessions = await db().from("sessions").select("id").like("name", `${TAG}%`);
  for (const row of sessions.data ?? []) await db().from("sessions").delete().eq("id", row.id);
  const sets = await db().from("question_sets").select("id").like("name", `${TAG}%`);
  for (const row of sets.data ?? []) await db().from("question_sets").delete().eq("id", row.id);
}

beforeAll(async () => {
  await cleanup();
  original = await getSettings();

  setId = await createQuestionSet(`${TAG} ngân hàng`);
  for (let i = 1; i <= BANK_SIZE; i++) {
    await addQuestion(setId, {
      type: "single",
      content: `${TAG} câu ${i}`,
      image_url: null,
      options: ["A", "B", "C", "D"],
      correct: [i % 4],
      time_limit_s: 20,
      points: 1000,
      explanation: null,
    });
  }

  await updateSettings({ questions_per_attempt: PER_ATTEMPT });
  sessionId = await openSession(`${TAG} lượt rút đề`, setId);
}, 60_000);

afterAll(async () => {
  await updateSettings({ questions_per_attempt: original.questions_per_attempt });
  await cleanup();
}, 60_000);

describe("rút ngẫu nhiên N câu từ ngân hàng", () => {
  it("mỗi thí sinh chỉ nhận đúng số câu đã cấu hình", async () => {
    const joined = await joinSession({ code: "SE900001", fullName: "Rút đề A" });
    expect(joined.status).toBe("ok");
    const participant = (await getParticipant((joined as { participantId: string }).participantId))!;
    expect(participant.question_order).toHaveLength(PER_ATTEMPT);
    expect(new Set(participant.question_order.map((q) => q.qid)).size).toBe(PER_ATTEMPT);
  });

  it("hai thí sinh rút hai tập câu khác nhau từ cùng ngân hàng", async () => {
    const a = await joinSession({ code: "SE900002", fullName: "Rút đề B" });
    const b = await joinSession({ code: "SE900003", fullName: "Rút đề C" });
    const pa = (await getParticipant((a as { participantId: string }).participantId))!;
    const pb = (await getParticipant((b as { participantId: string }).participantId))!;
    expect(pa.question_order.map((q) => q.qid)).not.toEqual(pb.question_order.map((q) => q.qid));
  });

  it("mọi câu rút ra đều thuộc ngân hàng của bộ đề", async () => {
    const ids = new Set((await listQuestions(setId)).map((q) => q.id));
    const joined = await joinSession({ code: "SE900004", fullName: "Rút đề D" });
    const participant = (await getParticipant((joined as { participantId: string }).participantId))!;
    for (const q of participant.question_order) expect(ids.has(q.qid)).toBe(true);
  });

  it("đổi cấu hình giữa chừng không làm lệch lượt đang chạy", async () => {
    await updateSettings({ questions_per_attempt: 1 });
    try {
      const joined = await joinSession({ code: "SE900005", fullName: "Rút đề E" });
      const participant = (await getParticipant(
        (joined as { participantId: string }).participantId,
      ))!;
      // Lượt dùng snapshot lúc mở nên vẫn là PER_ATTEMPT, không phải 1.
      expect(participant.question_order).toHaveLength(PER_ATTEMPT);
    } finally {
      await updateSettings({ questions_per_attempt: PER_ATTEMPT });
    }
  });
});

describe("sửa câu hỏi", () => {
  it("nhận ra bộ đề đang được lượt mở dùng", async () => {
    expect(await isSetInActiveSession(setId)).toBe(true);
  });

  it("sửa được nội dung và đáp án khi không có lượt nào dùng bộ đề", async () => {
    await closeSession(sessionId);
    expect(await isSetInActiveSession(setId)).toBe(false);

    const target = (await listQuestions(setId))[0];
    await updateQuestion(target.id, {
      content: `${TAG} câu đã sửa`,
      correct: [3],
      explanation: "Giải thích mới",
    });

    const after = (await listQuestions(setId)).find((q) => q.id === target.id)!;
    expect(after.content).toBe(`${TAG} câu đã sửa`);
    expect(after.correct).toEqual([3]);
    expect(after.explanation).toBe("Giải thích mới");
    // Sửa không được đụng vào các trường khác.
    expect(after.order_index).toBe(target.order_index);
    expect(after.options).toEqual(target.options);
  });

  it("để trống số câu mỗi lượt thì thí sinh làm hết ngân hàng", async () => {
    await updateSettings({ questions_per_attempt: 0 });
    const fullSession = await openSession(`${TAG} lượt full`, setId);
    const joined = await joinSession({ code: "SE900006", fullName: "Làm hết đề" });
    const participant = (await getParticipant((joined as { participantId: string }).participantId))!;
    expect(participant.question_order).toHaveLength(BANK_SIZE);
    await closeSession(fullSession);
  });
});
