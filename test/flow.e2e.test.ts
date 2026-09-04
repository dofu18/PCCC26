/**
 * Integration test: chạy toàn bộ luồng thật trên Supabase.
 *
 *   npm run test:e2e
 *
 * Cần .env.local có SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Test tự dọn dữ liệu của mình (mọi thứ đặt tên bắt đầu bằng "[e2e]").
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addQuestion,
  answerDetails,
  closeSession,
  createQuestionSet,
  importQuestions,
  leaderboardForExport,
  listQuestions,
  listSessions,
  openSession,
  resetSession,
  updateSettings,
} from "@/lib/admin-data";
import { buildLeaderboardWorkbook, buildQuestionTemplate, parseQuestionWorkbook } from "@/lib/excel";
import {
  countAttempts,
  currentStep,
  getActiveSession,
  getLeaderboard,
  getParticipant,
  getParticipantSummary,
  joinSession,
  submitAnswer,
} from "@/lib/quiz";
import { db } from "@/lib/supabase";
import type { GivenAnswer } from "@/lib/types";

const TAG = "[e2e]";
let setId: string;
let sessionId: string;

/** Xoá sạch dữ liệu của các lần chạy trước (kể cả lần bị ngắt giữa chừng). */
async function cleanup() {
  const sessions = await db().from("sessions").select("id, name").like("name", `${TAG}%`);
  for (const row of sessions.data ?? []) {
    await db().from("sessions").delete().eq("id", row.id);
  }
  const sets = await db().from("question_sets").select("id, name").like("name", `${TAG}%`);
  for (const row of sets.data ?? []) {
    await db().from("question_sets").delete().eq("id", row.id);
  }
}

beforeAll(async () => {
  await cleanup();

  setId = await createQuestionSet(`${TAG} bộ đề`);

  await addQuestion(setId, {
    type: "single",
    content: "E2E một đáp án",
    image_url: null,
    options: ["Alpha", "Beta", "Gamma", "Delta"],
    correct: [1], // Beta
    explanation: "Giải thích một đáp án.",
  });
  await addQuestion(setId, {
    type: "multi",
    content: "E2E nhiều đáp án",
    image_url: null,
    options: ["Một", "Hai", "Ba", "Bốn"],
    correct: [0, 2], // Một + Ba
    explanation: null,
  });
  await addQuestion(setId, {
    type: "boolean",
    content: "E2E đúng sai",
    image_url: null,
    options: null,
    correct: [true],
    explanation: null,
  });
  await addQuestion(setId, {
    type: "text",
    content: "E2E điền chữ",
    image_url: null,
    options: null,
    correct: ["Cứu hoả"],
    explanation: null,
  });

  // Bộ test này giả định thí sinh làm HẾT bộ đề, nên chốt số câu mỗi lượt về 0
  // thay vì phụ thuộc vào cấu hình đang có trong DB.
  await updateSettings({ questions_per_attempt: 0 });

  sessionId = await openSession(`${TAG} lượt 1`, setId);
}, 60_000);

afterAll(async () => {
  await cleanup();
}, 60_000);

/** Giả lập thí sinh đã suy nghĩ `delayMs` trước khi bấm: kéo served_at về quá khứ. */
async function backdateServedAt(participantId: string, delayMs: number) {
  const { data } = await db()
    .from("participants")
    .select("served_at")
    .eq("id", participantId)
    .single();
  const servedAt = new Date(new Date(data!.served_at as string).getTime() - delayMs);
  await db()
    .from("participants")
    .update({ served_at: servedAt.toISOString() })
    .eq("id", participantId);
}

type Behaviour = "correct" | "wrong";

/** Trả lời hết bài. Trả về danh sách kết quả từng câu. */
async function playThrough(participantId: string, delayMs: number, behaviour: Behaviour) {
  const results: { isCorrect: boolean; skipped: boolean }[] = [];

  for (;;) {
    const participant = (await getParticipant(participantId))!;
    const step = await currentStep(participant);
    if (step.kind === "done") break;

    await backdateServedAt(participantId, delayMs);
    const fresh = (await getParticipant(participantId))!;
    const question = step.question;

    let given: GivenAnswer;
    if (question.type === "single") {
      const target = behaviour === "correct" ? "Beta" : "Gamma";
      given = { kind: "choice", picked: [question.options!.indexOf(target)] };
    } else if (question.type === "multi") {
      const wanted = behaviour === "correct" ? ["Một", "Ba"] : ["Hai"];
      given = { kind: "choice", picked: wanted.map((t) => question.options!.indexOf(t)) };
    } else if (question.type === "boolean") {
      given = { kind: "boolean", value: behaviour === "correct" };
    } else {
      given = { kind: "text", value: behaviour === "correct" ? "cuu hoa" : "sai bet" };
    }

    const result = await submitAnswer(fresh, given);
    results.push({ isCorrect: result.isCorrect, skipped: result.skipped });
  }

  return results;
}

describe("luồng thí sinh", () => {
  it("mã số sai định dạng bị chặn", async () => {
    expect(await joinSession({ code: "HE12345", fullName: "Sai định dạng" })).toEqual({
      status: "invalid",
      message: "Mã số gồm hai chữ cái và sáu chữ số, ví dụ HE180234.",
    });
    expect((await joinSession({ code: "HE111111", fullName: "A" })).status).toBe("invalid");
  });

  it("vào phòng và nhận đề đã trộn", async () => {
    const join = await joinSession({ code: "HE111111", fullName: "Lê Thu Hà" });
    expect(join.status).toBe("ok");
    if (join.status !== "ok") return;

    const participant = (await getParticipant(join.participantId))!;
    expect(participant.display_name).toBe("HE111111 - Lê Thu Hà");
    expect(participant.question_order).toHaveLength(4);

    const step = await currentStep(participant);
    expect(step.kind).toBe("question");
    if (step.kind !== "question") return;
    expect(step.question.total).toBe(4);
    expect(step.question.index).toBe(1);
    expect(Date.parse(step.servedAt)).toBeLessThanOrEqual(Date.now());
  });

  it("hai thí sinh nhận thứ tự câu khác nhau", async () => {
    const a = await joinSession({ code: "HE222222", fullName: "Trần Minh Khôi" });
    const b = await joinSession({ code: "HE333333", fullName: "Phạm Quốc Đạt" });
    if (a.status !== "ok" || b.status !== "ok") throw new Error("join thất bại");

    const pa = (await getParticipant(a.participantId))!;
    const pb = (await getParticipant(b.participantId))!;
    expect(pa.question_order.map((q) => q.qid)).not.toEqual(pb.question_order.map((q) => q.qid));
  });

  it("mã số trùng phải hỏi lại trước khi cho vào", async () => {
    const dup = await joinSession({ code: "HE111111", fullName: "Lê Thu Hà" });
    expect(dup).toEqual({ status: "duplicate", attempts: 1 });

    const forced = await joinSession({ code: "HE111111", fullName: "Lê Thu Hà", force: true });
    expect(forced.status).toBe("ok");
    expect(await countAttempts(sessionId, "HE111111")).toBe(2);
  });
});

describe("chấm điểm trên DB thật", () => {
  it("làm nhanh và làm chậm đều đúng hết, nhưng người nhanh có tổng thời gian ít hơn", async () => {
    const fast = await joinSession({ code: "HE444444", fullName: "Võ Ngọc Ánh", force: true });
    const slow = await joinSession({ code: "HE555555", fullName: "Bùi Thanh Trúc", force: true });
    if (fast.status !== "ok" || slow.status !== "ok") throw new Error("join thất bại");

    const fastResults = await playThrough(fast.participantId, 1_000, "correct");
    const slowResults = await playThrough(slow.participantId, 16_000, "correct");

    expect(fastResults).toHaveLength(4);
    expect(fastResults.every((r) => r.isCorrect)).toBe(true);
    expect(slowResults.every((r) => r.isCorrect)).toBe(true);

    const fastSummary = await getParticipantSummary(fast.participantId);
    const slowSummary = await getParticipantSummary(slow.participantId);
    expect(fastSummary!.correct_count).toBe(4);
    expect(slowSummary!.correct_count).toBe(4);
    expect(fastSummary!.finished_at).not.toBeNull();

    // Không còn trần thời gian: ngồi 16 giây/câu vẫn được tính đủ 16 giây.
    expect(slowSummary!.total_time_ms).toBeGreaterThan(fastSummary!.total_time_ms);
  }, 60_000);

  it("trả lời sai vẫn được ghi nhận, chỉ là không tính đúng", async () => {
    const join = await joinSession({ code: "HE666666", fullName: "Đặng Hải Long", force: true });
    if (join.status !== "ok") throw new Error("join thất bại");

    const results = await playThrough(join.participantId, 500, "wrong");
    expect(results.every((r) => !r.isCorrect)).toBe(true);

    const summary = await getParticipantSummary(join.participantId);
    expect(summary!.correct_count).toBe(0);
    expect(summary!.answered_count).toBe(4);
  }, 60_000);

  it("ngồi rất lâu không còn bị tính hết giờ — đáp án đúng vẫn được công nhận", async () => {
    const join = await joinSession({ code: "HE777777", fullName: "Ngô Bảo Châu", force: true });
    if (join.status !== "ok") throw new Error("join thất bại");

    const participant = (await getParticipant(join.participantId))!;
    const step = await currentStep(participant);
    if (step.kind !== "question") throw new Error("không có câu hỏi");

    // 40 giây — trước đây quá hạn 20 giây thì bị tính là hết giờ và mất câu.
    await backdateServedAt(join.participantId, 40_000);
    const fresh = (await getParticipant(join.participantId))!;

    const given: GivenAnswer =
      step.question.type === "single"
        ? { kind: "choice", picked: [step.question.options!.indexOf("Beta")] }
        : step.question.type === "multi"
          ? {
              kind: "choice",
              picked: ["Một", "Ba"].map((t) => step.question.options!.indexOf(t)),
            }
          : step.question.type === "boolean"
            ? { kind: "boolean", value: true }
            : { kind: "text", value: "cuu hoa" };

    const result = await submitAnswer(fresh, given);
    expect(result.isCorrect).toBe(true);
    expect(result.skipped).toBe(false);

    const { data } = await db()
      .from("answers")
      .select("time_ms")
      .eq("participant_id", join.participantId)
      .single();
    expect(data!.time_ms).toBeGreaterThan(39_000);
  }, 60_000);

  it("bỏ qua câu: tính sai, không lưu đáp án, vẫn đi tiếp", async () => {
    const join = await joinSession({ code: "HE999999", fullName: "Lý Gia Bảo", force: true });
    if (join.status !== "ok") throw new Error("join thất bại");

    const participant = (await getParticipant(join.participantId))!;
    const before = (await currentStep(participant)).kind;
    expect(before).toBe("question");

    const result = await submitAnswer((await getParticipant(join.participantId))!, {
      kind: "skip",
    });
    expect(result.isCorrect).toBe(false);
    expect(result.skipped).toBe(true);

    const { data } = await db()
      .from("answers")
      .select("given, is_correct")
      .eq("participant_id", join.participantId)
      .single();
    expect(data!.given).toBeNull();
    expect(data!.is_correct).toBe(false);

    // Con trỏ đã nhảy sang câu sau.
    const after = (await getParticipant(join.participantId))!;
    expect(after.cursor_index).toBe(1);
  }, 60_000);

  it("gửi lại đáp án cho cùng một câu không ghi thêm dòng thứ hai", async () => {
    const join = await joinSession({ code: "HE888888", fullName: "Hoàng Thị Mai", force: true });
    if (join.status !== "ok") throw new Error("join thất bại");

    const participant = (await getParticipant(join.participantId))!;
    const step = await currentStep(participant);
    if (step.kind !== "question") throw new Error("không có câu hỏi");

    const first = await submitAnswer(participant, { kind: "skip" });
    expect(first.isCorrect).toBe(false);

    // participant cũ vẫn trỏ vào câu 1 (cursor chưa cập nhật trong biến local)
    await submitAnswer(participant, { kind: "skip" }).catch(() => undefined);

    const { count } = await db()
      .from("answers")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", join.participantId);
    expect(count).toBe(1);
  }, 60_000);
});

describe("bảng xếp hạng", () => {
  it("mỗi mã số chỉ xuất hiện một lần, lấy lượt làm tốt nhất", async () => {
    // HE111111 có 2 lượt: lượt 1 chưa trả lời gì, lượt 2 trả lời đúng hết.
    const attempts = await db()
      .from("participants")
      .select("id, attempt_no")
      .eq("session_id", sessionId)
      .eq("code", "HE111111")
      .order("attempt_no");
    expect(attempts.data).toHaveLength(2);

    await playThrough(attempts.data![1].id as string, 2_000, "correct");

    const board = await getLeaderboard(sessionId, 100);
    const rowsForCode = board.filter((r) => r.code === "HE111111");
    expect(rowsForCode).toHaveLength(1);
    expect(rowsForCode[0].attempt_no).toBe(2);
    expect(rowsForCode[0].correct_count).toBeGreaterThan(0);
  }, 60_000);

  it("xếp theo số câu đúng giảm dần, bằng nhau thì ai nhanh hơn xếp trên", async () => {
    const board = await getLeaderboard(sessionId, 100);
    expect(board.length).toBeGreaterThan(2);
    expect(board[0].rank).toBe(1);

    for (let i = 1; i < board.length; i++) {
      expect(board[i - 1].correct_count).toBeGreaterThanOrEqual(board[i].correct_count);
      // bằng số câu đúng thì ai tổng thời gian ít hơn xếp trên
      if (board[i - 1].correct_count === board[i].correct_count) {
        expect(board[i - 1].total_time_ms).toBeLessThanOrEqual(board[i].total_time_ms);
      }
    }

    // HE444444 đúng hết 4 câu và nhanh nhất → phải đứng đầu
    expect(board[0].code).toBe("HE444444");
    expect(board[0].correct_count).toBe(4);
  }, 60_000);
});

describe("xuất Excel", () => {
  it("file xuất ra đọc lại được, giữ tiếng Việt và khớp số liệu", async () => {
    const [rows, details] = await Promise.all([
      leaderboardForExport(sessionId),
      answerDetails(sessionId),
    ]);
    expect(rows.length).toBeGreaterThan(0);
    expect(details.length).toBeGreaterThan(0);

    const buffer = await buildLeaderboardWorkbook(`${TAG} lượt 1`, rows, details);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const board = wb.getWorksheet("Bảng xếp hạng")!;
    expect(board.getRow(2).getCell(2).value).toBe(rows[0].code);
    expect(board.getRow(2).getCell(3).value).toBe(rows[0].full_name);
    expect(board.getRow(2).getCell(5).value).toBe(rows[0].correct_count);
    expect(board.getRow(1).values).not.toContain("Điểm");

    // tiếng Việt có dấu phải nguyên vẹn
    const names = rows.map((r) => r.full_name);
    expect(names).toContain("Võ Ngọc Ánh");

    const detail = wb.getWorksheet("Chi tiết trả lời")!;
    expect(detail.rowCount).toBe(details.length + 1);
    // cột "Đã chọn" phải là chữ người đọc được, không phải JSON
    const given = String(detail.getRow(2).getCell(5).value ?? "");
    expect(given).not.toContain("{");
  }, 60_000);
});

describe("nhập câu hỏi từ Excel", () => {
  it("nhập file mẫu vào bộ đề thật", async () => {
    const template = await buildQuestionTemplate();
    const { questions, errors } = await parseQuestionWorkbook(template);
    expect(errors).toEqual([]);

    const importSetId = await createQuestionSet(`${TAG} bộ đề nhập`);
    const count = await importQuestions(importSetId, questions, "append");
    expect(count).toBe(4);

    const saved = await listQuestions(importSetId);
    expect(saved).toHaveLength(4);
    expect(saved.map((q) => q.type)).toEqual(["single", "multi", "boolean", "text"]);
    // đáp án đúng lưu đúng dạng cho từng loại câu
    expect(saved[0].correct).toEqual([1]);
    expect(saved[1].correct).toEqual([0, 1, 2]);
    expect(saved[2].correct).toEqual([false]);
    expect(saved[3].correct).toEqual(["ABC"]);
    // câu có ảnh giữ được URL
    expect(saved[3].image_url).toBe("https://example.com/anh-binh-chua-chay.jpg");
  }, 60_000);

  it("nhập kiểu replace thay toàn bộ câu cũ, không nhân đôi", async () => {
    const template = await buildQuestionTemplate();
    const { questions } = await parseQuestionWorkbook(template);

    const replaceSetId = await createQuestionSet(`${TAG} bộ đề replace`);
    await importQuestions(replaceSetId, questions, "append");
    await importQuestions(replaceSetId, questions, "replace");

    const saved = await listQuestions(replaceSetId);
    expect(saved).toHaveLength(4);
    expect(saved.map((q) => q.order_index)).toEqual([1, 2, 3, 4]);
  }, 60_000);
});

describe("reset lượt", () => {
  it("lượt cũ vào lịch sử và vẫn xuất lại được, lượt mới sẵn sàng nhận thí sinh", async () => {
    const beforeRows = await leaderboardForExport(sessionId);
    expect(beforeRows.length).toBeGreaterThan(0);

    const { nextSessionId } = await resetSession(sessionId, `${TAG} lượt 2`);

    const active = await getActiveSession();
    expect(active!.id).toBe(nextSessionId);
    expect(active!.name).toBe(`${TAG} lượt 2`);

    // lượt cũ đã kết thúc nhưng dữ liệu còn nguyên
    const sessions = await listSessions();
    const old = sessions.find((s) => s.id === sessionId)!;
    expect(old.status).toBe("finished");
    expect(old.ended_at).not.toBeNull();
    expect(old.participant_count).toBeGreaterThan(0);

    const afterRows = await leaderboardForExport(sessionId);
    expect(afterRows.map((r) => r.code)).toEqual(beforeRows.map((r) => r.code));

    // lượt mới trống và nhận được thí sinh
    expect(await getLeaderboard(nextSessionId, 10)).toEqual([]);
    const join = await joinSession({ code: "HE999999", fullName: "Nguyễn Hải Yến" });
    expect(join.status).toBe("ok");

    // dọn: đóng lượt mới để không chặn lượt thật của BTC
    await closeSession(nextSessionId);
  }, 90_000);

  it("không mở được hai lượt cùng lúc", async () => {
    const firstId = await openSession(`${TAG} lượt 3`, setId);
    await expect(openSession(`${TAG} lượt 4`, setId)).rejects.toThrow(/Đang có một lượt mở/);
    await closeSession(firstId);
  }, 60_000);

  it("không mở được lượt với bộ đề rỗng", async () => {
    const emptySetId = await createQuestionSet(`${TAG} bộ đề rỗng`);
    await expect(openSession(`${TAG} lượt rỗng`, emptySetId)).rejects.toThrow(
      /chưa có câu hỏi nào/,
    );
  }, 60_000);
});
