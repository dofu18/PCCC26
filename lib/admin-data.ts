import "server-only";
import { describeCorrect, describeGiven } from "./answer-text";
import type { AnswerDetail, ParsedQuestion } from "./excel";
import { getSettings } from "./quiz";
import { db } from "./supabase";
import type { LeaderboardRow, Question, SessionRow, Settings } from "./types";

export type QuestionSetRow = {
  id: string;
  name: string;
  created_at: string;
  question_count: number;
};

export async function listQuestionSets(): Promise<QuestionSetRow[]> {
  const { data, error } = await db()
    .from("question_sets")
    .select("id, name, created_at, questions(count)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Không đọc được danh sách bộ đề: ${error.message}`);

  type Joined = {
    id: string;
    name: string;
    created_at: string;
    questions: { count: number }[] | null;
  };

  return ((data ?? []) as unknown as Joined[]).map((row) => ({
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    question_count: row.questions?.[0]?.count ?? 0,
  }));
}

export async function createQuestionSet(name: string): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error("Nhập tên bộ đề.");
  const { data, error } = await db()
    .from("question_sets")
    .insert({ name: clean })
    .select("id")
    .single();
  if (error) throw new Error(`Không tạo được bộ đề: ${error.message}`);
  return data.id as string;
}

export async function deleteQuestionSet(id: string): Promise<void> {
  const { error } = await db().from("question_sets").delete().eq("id", id);
  if (error) {
    throw new Error(
      error.code === "23503"
        ? "Bộ đề này đang được một lượt thi dùng nên không xoá được. Xoá lượt trong Lịch sử trước."
        : `Không xoá được bộ đề: ${error.message}`,
    );
  }
}

export async function listQuestions(setId: string): Promise<Question[]> {
  const { data, error } = await db()
    .from("questions")
    .select("*")
    .eq("set_id", setId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(`Không đọc được câu hỏi: ${error.message}`);
  return (data ?? []) as Question[];
}

export async function getQuestionSetName(setId: string): Promise<string | null> {
  const { data, error } = await db()
    .from("question_sets")
    .select("name")
    .eq("id", setId)
    .maybeSingle();
  if (error) throw new Error(`Không đọc được bộ đề: ${error.message}`);
  return (data?.name as string) ?? null;
}

async function nextOrderIndex(setId: string): Promise<number> {
  const { data, error } = await db()
    .from("questions")
    .select("order_index")
    .eq("set_id", setId)
    .order("order_index", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Không đọc được thứ tự câu: ${error.message}`);
  return (data?.[0]?.order_index ?? 0) + 1;
}

export type QuestionInput = Omit<ParsedQuestion, "order_index">;

export async function addQuestion(setId: string, input: QuestionInput): Promise<void> {
  const { error } = await db()
    .from("questions")
    .insert({ ...input, set_id: setId, order_index: await nextOrderIndex(setId) });
  if (error) throw new Error(`Không thêm được câu hỏi: ${error.message}`);
}

export async function updateQuestion(id: string, input: Partial<QuestionInput>): Promise<void> {
  const { error } = await db().from("questions").update(input).eq("id", id);
  if (error) throw new Error(`Không sửa được câu hỏi: ${error.message}`);
}

/** Bộ đề có đang được một lượt thi đang mở dùng không. */
export async function isSetInActiveSession(setId: string): Promise<boolean> {
  const { count, error } = await db()
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("question_set_id", setId)
    .eq("status", "active");
  if (error) throw new Error(`Không kiểm tra được lượt đang mở: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await db().from("questions").delete().eq("id", id);
  if (error) throw new Error(`Không xoá được câu hỏi: ${error.message}`);
}

/**
 * Nhập câu hỏi từ Excel. `replace` xoá hết câu cũ trong bộ đề trước khi thêm —
 * làm trong một lượt để không rơi vào trạng thái nửa vời.
 */
export async function importQuestions(
  setId: string,
  questions: ParsedQuestion[],
  mode: "append" | "replace",
): Promise<number> {
  if (questions.length === 0) throw new Error("Không có câu hỏi nào để nhập.");

  if (mode === "replace") {
    const { error } = await db().from("questions").delete().eq("set_id", setId);
    if (error) throw new Error(`Không xoá được câu hỏi cũ: ${error.message}`);
  }

  const offset = mode === "append" ? (await nextOrderIndex(setId)) - 1 : 0;
  const rows = questions.map((q) => ({ ...q, set_id: setId, order_index: q.order_index + offset }));

  const { error } = await db().from("questions").insert(rows);
  if (error) throw new Error(`Không lưu được câu hỏi: ${error.message}`);
  return rows.length;
}

/* ── Lượt thi ─────────────────────────────────────────────── */

export type SessionWithStats = SessionRow & {
  participant_count: number;
  finished_count: number;
  set_name: string | null;
};

export async function listSessions(): Promise<SessionWithStats[]> {
  const { data, error } = await db()
    .from("sessions")
    .select("*, question_sets(name), participants(id, finished_at)")
    .order("started_at", { ascending: false });
  if (error) throw new Error(`Không đọc được danh sách lượt: ${error.message}`);

  type Joined = SessionRow & {
    question_sets: { name: string } | null;
    participants: { id: string; finished_at: string | null }[] | null;
  };

  return ((data ?? []) as unknown as Joined[]).map((row) => ({
    ...row,
    set_name: row.question_sets?.name ?? null,
    participant_count: row.participants?.length ?? 0,
    finished_count: row.participants?.filter((p) => p.finished_at).length ?? 0,
  }));
}

export async function openSession(name: string, questionSetId: string): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error("Nhập tên lượt thi.");

  const questions = await listQuestions(questionSetId);
  if (questions.length === 0) {
    throw new Error("Bộ đề này chưa có câu hỏi nào. Nhập câu hỏi trước khi mở lượt.");
  }

  // Snapshot cấu hình: đổi settings sau đó không làm lệch điểm đã chấm.
  const settings: Settings = await getSettings();

  const { data, error } = await db()
    .from("sessions")
    .insert({ name: clean, question_set_id: questionSetId, settings })
    .select("id")
    .single();

  if (error) {
    throw new Error(
      error.code === "23505"
        ? "Đang có một lượt mở. Kết thúc hoặc reset lượt đó trước khi mở lượt mới."
        : `Không mở được lượt: ${error.message}`,
    );
  }
  return data.id as string;
}

/** Đóng lượt: giữ toàn bộ dữ liệu, chỉ chuyển sang trạng thái đã kết thúc. */
export async function closeSession(sessionId: string): Promise<void> {
  const { error } = await db()
    .from("sessions")
    .update({ status: "finished", ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "active");
  if (error) throw new Error(`Không kết thúc được lượt: ${error.message}`);
}

/**
 * Reset để chạy nhóm kế tiếp: lượt hiện tại được đóng và chuyển vào lịch sử
 * (vẫn xuất Excel lại được), rồi mở một lượt mới cùng bộ đề.
 * Không xoá dữ liệu — bấm nhầm vẫn lấy lại được.
 */
export async function resetSession(
  sessionId: string,
  nextName: string,
): Promise<{ nextSessionId: string }> {
  const { data, error } = await db()
    .from("sessions")
    .select("question_set_id")
    .eq("id", sessionId)
    .single();
  if (error) throw new Error(`Không đọc được lượt hiện tại: ${error.message}`);

  await closeSession(sessionId);
  const nextSessionId = await openSession(nextName, data.question_set_id as string);
  return { nextSessionId };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await db().from("sessions").delete().eq("id", sessionId);
  if (error) throw new Error(`Không xoá được lượt: ${error.message}`);
}

/* ── Cấu hình ─────────────────────────────────────────────── */

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const { error } = await db()
    .from("app_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(`Không lưu được cấu hình: ${error.message}`);
}

/* ── Dữ liệu xuất Excel ───────────────────────────────────── */

export async function answerDetails(sessionId: string): Promise<AnswerDetail[]> {
  const { data, error } = await db()
    .from("answers")
    .select(
      "order_index, given, is_correct, time_ms, participants!inner(code, full_name, session_id), questions(content, options, type)",
    )
    .eq("participants.session_id", sessionId)
    .order("order_index", { ascending: true });
  if (error) throw new Error(`Không đọc được chi tiết trả lời: ${error.message}`);

  type Joined = {
    order_index: number;
    given: unknown;
    is_correct: boolean;
    time_ms: number;
    participants: { code: string; full_name: string } | null;
    questions: { content: string; options: string[] | null; type: string } | null;
  };

  return ((data ?? []) as unknown as Joined[])
    .map((row) => ({
      code: row.participants?.code ?? "?",
      full_name: row.participants?.full_name ?? "?",
      order_index: row.order_index,
      question: row.questions?.content ?? "(câu hỏi đã bị xoá)",
      given_text: describeGiven(row.given, row.questions?.options ?? null),
      is_correct: row.is_correct,
      time_ms: row.time_ms,
    }))
    .sort((a, b) => a.code.localeCompare(b.code) || a.order_index - b.order_index);
}

/* ── Bài làm chi tiết của cả lượt ─────────────────────────── */

export type ParticipantAnswer = {
  order_index: number;
  question: string;
  question_type: Question["type"];
  given_text: string;
  correct_text: string;
  is_correct: boolean;
  time_ms: number;
};

export type ParticipantSheet = {
  participant_id: string;
  code: string;
  full_name: string;
  display_name: string;
  attempt_no: number;
  started_at: string;
  finished_at: string | null;
  total_time_ms: number;
  correct_count: number;
  answers: ParticipantAnswer[];
};

/**
 * Toàn bộ dữ liệu một lượt gom theo từng thí sinh: thông tin người chơi, từng câu hỏi
 * đã nhận, đáp án đã chọn, đúng/sai, thời gian và điểm. Dùng cho trang xem chi tiết ở admin.
 * Sắp theo điểm giảm dần để khớp thứ tự bảng xếp hạng.
 */
export async function sessionSheet(sessionId: string): Promise<ParticipantSheet[]> {
  const { data, error } = await db()
    .from("participants")
    .select(
      "id, code, full_name, display_name, attempt_no, started_at, finished_at, answers(order_index, given, is_correct, time_ms, questions(content, type, options, correct))",
    )
    .eq("session_id", sessionId);
  if (error) throw new Error(`Không đọc được bài làm của lượt: ${error.message}`);

  type JoinedAnswer = {
    order_index: number;
    given: unknown;
    is_correct: boolean;
    time_ms: number;
    questions: Pick<Question, "content" | "type" | "options" | "correct"> | null;
  };
  type Joined = {
    id: string;
    code: string;
    full_name: string;
    display_name: string;
    attempt_no: number;
    started_at: string;
    finished_at: string | null;
    answers: JoinedAnswer[] | null;
  };

  return ((data ?? []) as unknown as Joined[])
    .map((row) => {
      const answers = [...(row.answers ?? [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map((answer) => ({
          order_index: answer.order_index,
          question: answer.questions?.content ?? "(câu hỏi đã bị xoá)",
          question_type: answer.questions?.type ?? "single",
          given_text: describeGiven(answer.given, answer.questions?.options ?? null),
          correct_text: answer.questions ? describeCorrect(answer.questions) : "—",
          is_correct: answer.is_correct,
          time_ms: answer.time_ms,
        }));

      return {
        participant_id: row.id,
        code: row.code,
        full_name: row.full_name,
        display_name: row.display_name,
        attempt_no: row.attempt_no,
        started_at: row.started_at,
        finished_at: row.finished_at,
        // Tổng thời gian suy nghĩ từng câu — khớp với view participant_scores trong SQL.
        // Không tính thời gian đọc giải thích giữa các câu.
        total_time_ms: answers.reduce((sum, a) => sum + a.time_ms, 0),
        correct_count: answers.filter((a) => a.is_correct).length,
        answers,
      };
    })
    .sort(
      (a, b) =>
        b.correct_count - a.correct_count ||
        a.total_time_ms - b.total_time_ms ||
        a.code.localeCompare(b.code),
    );
}

export async function leaderboardForExport(sessionId: string): Promise<LeaderboardRow[]> {
  const { data, error } = await db()
    .from("leaderboard")
    .select("*")
    .eq("session_id", sessionId)
    .order("rank", { ascending: true });
  if (error) throw new Error(`Không đọc được bảng xếp hạng: ${error.message}`);
  return (data ?? []) as LeaderboardRow[];
}
