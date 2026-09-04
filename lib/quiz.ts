import "server-only";
import { describeCorrect, describeGiven } from "./answer-text";
import { elapsedMs, grade } from "./scoring";
import { buildQuestionOrder, displayOptions, toOriginalIndex } from "./shuffle";
import { db } from "./supabase";
import type {
  GivenAnswer,
  LeaderboardRow,
  OrderedQuestion,
  PublicQuestion,
  Question,
  SessionRow,
  Settings,
} from "./types";

export const CODE_PATTERN = /^[A-Z]{2}\d{6}$/;

export type ParticipantRow = {
  id: string;
  session_id: string;
  code: string;
  full_name: string;
  display_name: string;
  attempt_no: number;
  question_order: OrderedQuestion[];
  cursor_index: number;
  served_at: string | null;
  started_at: string;
  finished_at: string | null;
};

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function displayNameFor(code: string, fullName: string): string {
  return `${code} - ${fullName}`;
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db()
    .from("app_settings")
    .select("show_feedback, multi_all_or_nothing, questions_per_attempt")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`Không đọc được cấu hình: ${error.message}`);
  return data as Settings;
}

export async function getActiveSession(): Promise<SessionRow | null> {
  const { data, error } = await db()
    .from("sessions")
    .select("*")
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`Không đọc được lượt đang mở: ${error.message}`);
  return (data as SessionRow) ?? null;
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const { data, error } = await db().from("sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Không đọc được lượt: ${error.message}`);
  return (data as SessionRow) ?? null;
}

async function getQuestionsOfSet(setId: string): Promise<Question[]> {
  const { data, error } = await db()
    .from("questions")
    .select("*")
    .eq("set_id", setId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(`Không đọc được câu hỏi: ${error.message}`);
  return (data ?? []) as Question[];
}

export async function countAttempts(sessionId: string, code: string): Promise<number> {
  const { count, error } = await db()
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("code", code);
  if (error) throw new Error(`Không kiểm tra được mã số: ${error.message}`);
  return count ?? 0;
}

export type JoinResult =
  | { status: "ok"; participantId: string }
  | { status: "duplicate"; attempts: number }
  | { status: "no-session" }
  | { status: "empty-set" }
  | { status: "invalid"; message: string };

/**
 * Vào phòng thi. Mã số trùng không bị chặn — trả về `duplicate` để UI hỏi lại,
 * và nếu thí sinh xác nhận (`force`) thì tạo một lượt làm mới với attempt_no tăng dần.
 * Bảng xếp hạng chỉ tính lượt điểm cao nhất của mỗi mã số.
 */
export async function joinSession(input: {
  code: string;
  fullName: string;
  force?: boolean;
}): Promise<JoinResult> {
  const code = normalizeCode(input.code);
  const fullName = normalizeName(input.fullName);

  if (!CODE_PATTERN.test(code)) {
    return {
      status: "invalid",
      message: "Mã số gồm hai chữ cái và sáu chữ số, ví dụ HE180234.",
    };
  }
  if (fullName.length < 2) {
    return { status: "invalid", message: "Nhập họ và tên của bạn." };
  }

  const session = await getActiveSession();
  if (!session) return { status: "no-session" };

  const attempts = await countAttempts(session.id, code);
  if (attempts > 0 && !input.force) {
    return { status: "duplicate", attempts };
  }

  const questions = await getQuestionsOfSet(session.question_set_id);
  if (questions.length === 0) return { status: "empty-set" };

  // Seed trộn đề: mã số + lần thi + id lượt → cùng người reload ra cùng đề,
  // hai người khác nhau ra thứ tự khác nhau.
  const attemptNo = attempts + 1;
  const seed = `${session.id}:${code}:${attemptNo}`;
  // Số câu lấy từ snapshot settings của lượt, không từ settings hiện tại: BTC đổi
  // cấu hình giữa chừng thì các lượt đang chạy vẫn giữ nguyên số câu.
  const order = buildQuestionOrder(questions, seed, session.settings?.questions_per_attempt ?? 0);

  const { data, error } = await db()
    .from("participants")
    .insert({
      session_id: session.id,
      code,
      full_name: fullName,
      display_name: displayNameFor(code, fullName),
      attempt_no: attemptNo,
      question_order: order,
    })
    .select("id")
    .single();

  if (error) {
    // Hai người bấm cùng lúc cùng mã số → thử lại một lần với attempt_no tiếp theo.
    if (error.code === "23505") {
      return joinSession({ ...input, force: true });
    }
    throw new Error(`Không tạo được lượt làm bài: ${error.message}`);
  }

  return { status: "ok", participantId: data.id as string };
}

export async function getParticipant(id: string): Promise<ParticipantRow | null> {
  const { data, error } = await db().from("participants").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Không đọc được thí sinh: ${error.message}`);
  return (data as ParticipantRow) ?? null;
}

export type QuizStep =
  | { kind: "done" }
  | {
      kind: "question";
      question: PublicQuestion;
      /** lúc câu này được phát, theo đồng hồ server — client đếm LÊN từ mốc này */
      servedAt: string;
      showFeedback: boolean;
    };

/**
 * Câu hiện tại của thí sinh. `served_at` được đặt một lần cho mỗi câu, nên
 * reload trang không làm đồng hồ chạy lại từ đầu.
 * Không còn hạn giờ — `served_at` chỉ dùng để đo thời gian đã dùng.
 */
export async function currentStep(participant: ParticipantRow): Promise<QuizStep> {
  const order = participant.question_order;
  if (participant.finished_at || participant.cursor_index >= order.length) {
    return { kind: "done" };
  }

  const session = await getSession(participant.session_id);
  if (!session) return { kind: "done" };
  const settings = session.settings;

  const step = order[participant.cursor_index];
  const { data, error } = await db()
    .from("questions")
    .select("*")
    .eq("id", step.qid)
    .maybeSingle();
  if (error) throw new Error(`Không đọc được câu hỏi: ${error.message}`);
  if (!data) {
    // Câu đã bị BTC xoá giữa lúc thi — bỏ qua, đi tiếp.
    await db()
      .from("participants")
      .update({ cursor_index: participant.cursor_index + 1, served_at: null })
      .eq("id", participant.id);
    return currentStep({ ...participant, cursor_index: participant.cursor_index + 1 });
  }

  const question = data as Question;

  let servedAt = participant.served_at;
  if (!servedAt) {
    const now = new Date().toISOString();
    const { error: updateError } = await db()
      .from("participants")
      .update({ served_at: now })
      .eq("id", participant.id)
      .is("served_at", null);
    if (updateError) throw new Error(`Không phát được câu hỏi: ${updateError.message}`);
    servedAt = now;
  }

  return {
    kind: "question",
    servedAt,
    showFeedback: settings.show_feedback,
    question: {
      id: question.id,
      type: question.type,
      content: question.content,
      image_url: question.image_url,
      options: displayOptions(question.options, step.options),
      index: participant.cursor_index + 1,
      total: order.length,
    },
  };
}

export type SubmitResult = {
  isCorrect: boolean;
  /** thí sinh bấm "Bỏ qua câu này" */
  skipped: boolean;
  /** vị trí đáp án đúng trong danh sách ĐANG HIỂN THỊ của thí sinh này */
  correctDisplayIndexes: number[];
  correctText: string | null;
  explanation: string | null;
  showFeedback: boolean;
  isLast: boolean;
};

/** Vị trí gốc → vị trí hiển thị (nghịch đảo của order). */
function toDisplayIndex(originalIndex: number, order: number[]): number {
  const at = order.indexOf(originalIndex);
  return at === -1 ? originalIndex : at;
}

/**
 * Nhận đáp án của câu hiện tại. Thời gian do server tính từ `served_at`, không
 * tin đồng hồ client. Mỗi câu chỉ nhận một lần (unique index trong DB).
 */
export async function submitAnswer(
  participant: ParticipantRow,
  raw: GivenAnswer,
): Promise<SubmitResult> {
  const order = participant.question_order;
  if (participant.finished_at || participant.cursor_index >= order.length) {
    throw new Error("Bài làm đã kết thúc.");
  }

  const session = await getSession(participant.session_id);
  if (!session) throw new Error("Lượt thi không còn tồn tại.");
  const settings = session.settings;

  const step = order[participant.cursor_index];
  const { data, error } = await db().from("questions").select("*").eq("id", step.qid).single();
  if (error) throw new Error(`Không đọc được câu hỏi: ${error.message}`);
  const question = data as Question;

  const servedAt = participant.served_at ? new Date(participant.served_at) : new Date();
  const answeredAt = new Date();
  const timeUsedMs = elapsedMs(servedAt, answeredAt);
  const skipped = raw.kind === "skip";

  // Map đáp án từ hệ hiển thị về hệ gốc trước khi chấm.
  let given: GivenAnswer = raw;
  if (raw.kind === "choice") {
    given = { kind: "choice", picked: raw.picked.map((i) => toOriginalIndex(i, step.options)) };
  }

  const isCorrect = grade(question, given, settings);

  const { error: insertError } = await db().from("answers").insert({
    participant_id: participant.id,
    question_id: question.id,
    order_index: participant.cursor_index + 1,
    // given null = không trả lời (bỏ qua) — đây là nguồn duy nhất để nhận ra câu bị bỏ.
    given: skipped ? null : given,
    is_correct: isCorrect,
    time_ms: timeUsedMs,
  });
  // 23505 = đã có đáp án cho câu này (double-submit). Không ghi đè, đi tiếp.
  if (insertError && insertError.code !== "23505") {
    throw new Error(`Không lưu được đáp án: ${insertError.message}`);
  }

  const nextIndex = participant.cursor_index + 1;
  const isLast = nextIndex >= order.length;
  await db()
    .from("participants")
    .update({
      cursor_index: nextIndex,
      served_at: null,
      finished_at: isLast ? answeredAt.toISOString() : null,
    })
    .eq("id", participant.id);

  const correctDisplayIndexes =
    question.type === "single" || question.type === "multi"
      ? question.correct.map((c) => toDisplayIndex(Number(c), step.options))
      : [];

  const correctText =
    question.type === "boolean"
      ? Boolean(question.correct[0])
        ? "Đúng"
        : "Sai"
      : question.type === "text"
        ? String(question.correct[0])
        : null;

  return {
    isCorrect,
    skipped,
    correctDisplayIndexes,
    correctText,
    explanation: question.explanation,
    showFeedback: settings.show_feedback,
    isLast,
  };
}

export async function finishParticipant(participantId: string): Promise<void> {
  await db()
    .from("participants")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", participantId)
    .is("finished_at", null);
}

/**
 * Tổng số thí sinh trên bảng xếp hạng của lượt — đếm không giới hạn.
 * `getLeaderboard` bị cắt theo `limit` (màn chiếu chỉ lấy top 10) nên không dùng
 * độ dài mảng đó để hiển thị sĩ số được.
 */
export async function countLeaderboard(sessionId: string): Promise<number> {
  const { count, error } = await db()
    .from("leaderboard")
    .select("participant_id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw new Error(`Không đếm được thí sinh: ${error.message}`);
  return count ?? 0;
}

export async function getLeaderboard(sessionId: string, limit = 100): Promise<LeaderboardRow[]> {
  const { data, error } = await db()
    .from("leaderboard")
    .select("*")
    .eq("session_id", sessionId)
    .order("rank", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Không đọc được bảng xếp hạng: ${error.message}`);
  return (data ?? []) as LeaderboardRow[];
}

export type ReviewRow = {
  order_index: number;
  content: string;
  is_correct: boolean;
  time_ms: number;
  explanation: string | null;
  /** Đáp án thí sinh đã chọn, dạng chữ. */
  given_text: string;
  /** Đáp án đúng, dạng chữ. */
  correct_text: string;
};

export async function getReview(participantId: string): Promise<ReviewRow[]> {
  const { data, error } = await db()
    .from("answers")
    .select(
      "order_index, given, is_correct, time_ms, questions(content, explanation, type, options, correct)",
    )
    .eq("participant_id", participantId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(`Không đọc được bài làm: ${error.message}`);

  type Joined = {
    order_index: number;
    given: unknown;
    is_correct: boolean;
    time_ms: number;
    questions: Pick<Question, "content" | "explanation" | "type" | "options" | "correct"> | null;
  };

  return ((data ?? []) as unknown as Joined[]).map((row) => ({
    order_index: row.order_index,
    content: row.questions?.content ?? "(câu hỏi đã bị xoá)",
    explanation: row.questions?.explanation ?? null,
    is_correct: row.is_correct,
    time_ms: row.time_ms,
    given_text: describeGiven(row.given, row.questions?.options ?? null),
    correct_text: row.questions ? describeCorrect(row.questions) : "—",
  }));
}

export async function getParticipantSummary(participantId: string) {
  const { data, error } = await db()
    .from("participant_scores")
    .select("*")
    .eq("participant_id", participantId)
    .maybeSingle();
  if (error) throw new Error(`Không đọc được điểm: ${error.message}`);
  return data as
    | {
        participant_id: string;
        session_id: string;
        code: string;
        full_name: string;
        display_name: string;
        total_time_ms: number;
        answered_count: number;
        correct_count: number;
        finished_at: string | null;
      }
    | null;
}
