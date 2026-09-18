/**
 * Integration test cho trang xem bài làm chi tiết ở admin và phần "bạn đã trả lời"
 * ở trang kết quả của thí sinh.
 *
 *   npm run test:e2e
 *
 * Tự dọn dữ liệu của mình (tên bắt đầu bằng "[e2e-sheet]").
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addQuestion,
  closeSession,
  createQuestionSet,
  openSession,
  sessionSheet,
  updateSettings,
} from "@/lib/admin-data";
import { NOT_ANSWERED } from "@/lib/answer-text";
import {
  currentStep,
  getParticipant,
  getReview,
  joinSession,
  submitAnswer,
} from "@/lib/quiz";
import { db } from "@/lib/supabase";
import type { GivenAnswer } from "@/lib/types";

const TAG = "[e2e-sheet]";
const TEST_EMAIL = "e2e-sheet@example.com";
let setId: string;
let sessionId: string;

async function cleanup() {
  const sessions = await db().from("sessions").select("id").like("name", `${TAG}%`);
  for (const row of sessions.data ?? []) await db().from("sessions").delete().eq("id", row.id);
  const sets = await db().from("question_sets").select("id").like("name", `${TAG}%`);
  for (const row of sets.data ?? []) await db().from("question_sets").delete().eq("id", row.id);
}

beforeAll(async () => {
  await cleanup();
  setId = await createQuestionSet(`${TAG} bộ đề`);

  await addQuestion(setId, {
    type: "single",
    content: `${TAG} gọi số nào khi cháy?`,
    image_url: null,
    options: ["113", "114", "115", "116"],
    correct: [1],
    explanation: "114 là số của cảnh sát PCCC.",
  });
  await addQuestion(setId, {
    type: "boolean",
    content: `${TAG} bình CO2 dùng được cho đám cháy điện?`,
    image_url: null,
    options: null,
    correct: [true],
    explanation: null,
  });

  // Test này đếm đúng 2 câu mỗi thí sinh nên phải chốt cấu hình, không dựa vào DB.
  await updateSettings({ questions_per_attempt: 0 });

  sessionId = await openSession(`${TAG} lượt`, setId);
}, 60_000);

afterAll(async () => {
  await cleanup();
}, 60_000);

/** Trả lời hết bài: câu đầu theo `first`, các câu sau chọn đáp án đầu tiên. */
async function play(participantId: string, first: GivenAnswer) {
  let isFirst = true;
  for (;;) {
    const participant = (await getParticipant(participantId))!;
    const step = await currentStep(participant);
    if (step.kind === "done") break;
    const fallback: GivenAnswer =
      step.question.type === "boolean"
        ? { kind: "boolean", value: true }
        : { kind: "choice", picked: [0] };
    await submitAnswer(participant, isFirst ? first : fallback);
    isFirst = false;
  }
}

describe("trang kết quả của thí sinh", () => {
  it("hiện đáp án đã chọn và đáp án đúng của câu trả lời sai", async () => {
    const joined = await joinSession({
      code: "SE910001",
      fullName: "Xem lại bài",
      email: TEST_EMAIL,
    });
    const id = (joined as { participantId: string }).participantId;

    // Cố tình trả lời sai câu đầu tiên nếu nó là câu trắc nghiệm.
    const step = await currentStep((await getParticipant(id))!);
    const wrong: GivenAnswer =
      step.kind === "question" && step.question.type === "boolean"
        ? { kind: "boolean", value: false }
        : { kind: "choice", picked: [0] };
    await play(id, wrong);

    const review = await getReview(id);
    expect(review.length).toBeGreaterThan(0);
    for (const row of review) {
      expect(row.given_text.length).toBeGreaterThan(0);
      expect(row.correct_text.length).toBeGreaterThan(0);
    }

    const missed = review.find((row) => !row.is_correct);
    expect(missed).toBeDefined();
    // Đáp án đã chọn phải khác đáp án đúng ở câu sai — nếu bằng nhau là format sai chỗ nào đó.
    expect(missed!.given_text).not.toBe(missed!.correct_text);
  });

  it("câu bỏ qua ghi rõ là không trả lời", async () => {
    const joined = await joinSession({ code: "SE910002", fullName: "Hết giờ", email: TEST_EMAIL });
    const id = (joined as { participantId: string }).participantId;
    await play(id, { kind: "skip" });

    const review = await getReview(id);
    expect(review[0].given_text).toBe(NOT_ANSWERED);
    expect(review[0].is_correct).toBe(false);
  });
});

describe("trang bài làm chi tiết ở admin", () => {
  it("gom đủ mọi thí sinh của lượt kèm từng câu trả lời", async () => {
    const sheet = await sessionSheet(sessionId);
    expect(sheet.length).toBeGreaterThanOrEqual(2);

    const codes = sheet.map((p) => p.code);
    expect(codes).toContain("SE910001");
    expect(codes).toContain("SE910002");

    for (const person of sheet) {
      expect(person.full_name.length).toBeGreaterThan(0);
      expect(person.answers).toHaveLength(2);
      for (const answer of person.answers) {
        expect(answer.question).toContain(TAG);
        expect(answer.correct_text.length).toBeGreaterThan(0);
        expect(answer.given_text.length).toBeGreaterThan(0);
        expect(typeof answer.time_ms).toBe("number");
      }
    }
  });

  it("số câu đúng khớp với từng câu trả lời", async () => {
    const sheet = await sessionSheet(sessionId);
    for (const person of sheet) {
      expect(person.correct_count).toBe(person.answers.filter((a) => a.is_correct).length);
      // Trả lời hoặc bỏ qua ngay có thể có thời gian 0; không được âm.
      expect(person.total_time_ms).toBeGreaterThanOrEqual(0);
    }
  });

  it("xếp theo số câu đúng giảm dần", async () => {
    const sheet = await sessionSheet(sessionId);
    const correct = sheet.map((p) => p.correct_count);
    expect([...correct].sort((a, b) => b - a)).toEqual(correct);
  });

  it("lượt đã kết thúc vẫn xem lại được", async () => {
    await closeSession(sessionId);
    const sheet = await sessionSheet(sessionId);
    expect(sheet.length).toBeGreaterThanOrEqual(2);
  });
});
