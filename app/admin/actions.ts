"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addQuestion,
  closeSession,
  createQuestionSet,
  deleteQuestion,
  deleteQuestionSet,
  deleteSession,
  importQuestions,
  isSetInActiveSession,
  openSession,
  resetSession,
  updateQuestion,
  updateSettings,
} from "@/lib/admin-data";
import type { QuestionInput } from "@/lib/admin-data";
import { adminPasswordMatches, clearAdminCookie, requireAdmin, setAdminCookie } from "@/lib/auth";
import { parseQuestionWorkbook, type RowError } from "@/lib/excel";
import type { QuestionType } from "@/lib/types";

export type ActionState = { status: "idle" } | { status: "error"; message: string } | {
  status: "ok";
  message: string;
};

/* ── Đăng nhập ────────────────────────────────────────────── */

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { status: "error", message: "Nhập mật khẩu." };

  try {
    if (!adminPasswordMatches(password)) {
      return { status: "error", message: "Mật khẩu không đúng." };
    }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Chưa cấu hình mật khẩu.",
    };
  }

  await setAdminCookie();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await clearAdminCookie();
  redirect("/admin");
}

/* ── Bộ đề ────────────────────────────────────────────────── */

export async function createSetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    const id = await createQuestionSet(String(formData.get("name") ?? ""));
    revalidatePath("/admin/questions");
    redirect(`/admin/questions/${id}`);
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function deleteSetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    await deleteQuestionSet(String(formData.get("setId")));
    revalidatePath("/admin/questions");
    return { status: "ok", message: "Đã xoá bộ đề." };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

/* ── Câu hỏi ──────────────────────────────────────────────── */

/** Đọc form câu hỏi (dùng chung cho thêm mới và sửa). Ném lỗi nếu dữ liệu không hợp lệ. */
function readQuestionForm(formData: FormData): QuestionInput {
  const type = String(formData.get("type")) as QuestionType;
  const content = String(formData.get("content") ?? "").trim();
  if (!content) throw new Error("Nhập nội dung câu hỏi.");

  const options = ["a", "b", "c", "d", "e", "f"]
    .map((key) => String(formData.get(`option_${key}`) ?? "").trim())
    .filter(Boolean);

  let correct: (number | boolean | string)[] = [];

  if (type === "single" || type === "multi") {
    if (options.length < 2) throw new Error("Câu trắc nghiệm cần ít nhất 2 đáp án.");
    const picked = formData
      .getAll("correct")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < options.length);
    if (picked.length === 0) throw new Error("Chọn đáp án đúng.");
    if (type === "single" && picked.length > 1) {
      throw new Error("Câu một đáp án chỉ được chọn một đáp án đúng.");
    }
    correct = picked;
  } else if (type === "boolean") {
    correct = [String(formData.get("correctBoolean")) === "true"];
  } else {
    const variants = String(formData.get("correctText") ?? "")
      .split("|")
      .map((v) => v.trim())
      .filter(Boolean);
    if (variants.length === 0) throw new Error("Nhập đáp án đúng.");
    correct = variants;
  }

  return {
    type,
    content,
    image_url: String(formData.get("image_url") ?? "").trim() || null,
    options: type === "single" || type === "multi" ? options : null,
    correct,
    time_limit_s: numberOrNull(formData.get("time_limit_s")),
    points: numberOrNull(formData.get("points")),
    explanation: String(formData.get("explanation") ?? "").trim() || null,
  };
}

export async function addQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const setId = String(formData.get("setId"));
  try {
    await addQuestion(setId, readQuestionForm(formData));
    revalidatePath(`/admin/questions/${setId}`);
    return { status: "ok", message: "Đã thêm câu hỏi." };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function editQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const setId = String(formData.get("setId"));
  const questionId = String(formData.get("questionId"));
  try {
    // Sửa câu của bộ đề đang chạy sẽ lệch với đề đã phát cho thí sinh (question_order
    // được chốt lúc vào phòng thi), nên chặn hẳn thay vì chỉ cảnh báo.
    if (await isSetInActiveSession(setId)) {
      throw new Error(
        "Bộ đề này đang được lượt thi đang mở dùng. Kết thúc lượt rồi hãy sửa câu hỏi.",
      );
    }
    await updateQuestion(questionId, readQuestionForm(formData));
    revalidatePath(`/admin/questions/${setId}`);
    return { status: "ok", message: "Đã lưu câu hỏi." };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function deleteQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    await deleteQuestion(String(formData.get("questionId")));
    revalidatePath(`/admin/questions/${String(formData.get("setId"))}`);
    return { status: "ok", message: "Đã xoá câu hỏi." };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

/* ── Nhập Excel ───────────────────────────────────────────── */

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string; rowErrors?: RowError[] }
  | { status: "ok"; message: string };

export async function importAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireAdmin();

  const setId = String(formData.get("setId"));
  const mode = String(formData.get("mode")) === "replace" ? "replace" : "append";
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Chọn file .xlsx trước khi nhập." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { status: "error", message: "File lớn hơn 8 MB — chia nhỏ ra giúp nhé." };
  }

  try {
    const { questions, errors } = await parseQuestionWorkbook(await file.arrayBuffer());

    // Có lỗi thì không lưu gì cả — tránh nhập nửa vời rồi phải dò lại.
    if (errors.length > 0) {
      return {
        status: "error",
        message: `File có ${errors.length} dòng lỗi. Chưa lưu gì cả — sửa file rồi nhập lại.`,
        rowErrors: errors,
      };
    }

    const count = await importQuestions(setId, questions, mode);
    revalidatePath(`/admin/questions/${setId}`);
    return {
      status: "ok",
      message: `Đã nhập ${count} câu hỏi${mode === "replace" ? " (thay toàn bộ câu cũ)" : ""}.`,
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

/* ── Lượt thi ─────────────────────────────────────────────── */

export async function openSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    await openSession(String(formData.get("name") ?? ""), String(formData.get("questionSetId")));
    revalidatePath("/admin");
    return { status: "ok", message: "Đã mở lượt thi." };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function closeSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    await closeSession(String(formData.get("sessionId")));
    revalidatePath("/admin");
    revalidatePath("/admin/history");
    return { status: "ok", message: "Đã kết thúc lượt. Vẫn xuất Excel lại được ở Lịch sử." };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function resetSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    const sessionId = String(formData.get("sessionId"));
    const nextName = String(formData.get("nextName") ?? "").trim();
    if (!nextName) return { status: "error", message: "Nhập tên lượt tiếp theo." };

    await resetSession(sessionId, nextName);
    revalidatePath("/admin");
    revalidatePath("/admin/history");
    return {
      status: "ok",
      message: `Đã chuyển lượt cũ vào lịch sử và mở “${nextName}”.`,
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function deleteSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    await deleteSession(String(formData.get("sessionId")));
    revalidatePath("/admin/history");
    return { status: "ok", message: "Đã xoá lượt và toàn bộ dữ liệu của lượt đó." };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

/* ── Cấu hình ─────────────────────────────────────────────── */

export async function saveSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  try {
    const timeLimit = numberOrNull(formData.get("default_time_limit_s"));
    const points = numberOrNull(formData.get("default_points"));
    if (timeLimit === null || timeLimit < 5 || timeLimit > 300) {
      return { status: "error", message: "Thời gian mỗi câu phải từ 5 đến 300 giây." };
    }
    if (points === null || points < 1) {
      return { status: "error", message: "Điểm mỗi câu phải là số dương." };
    }

    // Để trống = 0 = lấy hết bộ đề.
    const raw = String(formData.get("questions_per_attempt") ?? "").trim();
    const perAttempt = raw === "" ? 0 : numberOrNull(raw);
    if (perAttempt === null || perAttempt < 0 || perAttempt > 1000) {
      return {
        status: "error",
        message: "Số câu mỗi lượt phải là số từ 0 đến 1000 (để trống là lấy hết bộ đề).",
      };
    }

    await updateSettings({
      default_time_limit_s: timeLimit,
      default_points: points,
      questions_per_attempt: perAttempt,
      speed_bonus: formData.get("speed_bonus") === "on",
      show_feedback: formData.get("show_feedback") === "on",
      multi_all_or_nothing: formData.get("multi_all_or_nothing") === "on",
    });

    revalidatePath("/admin/settings");
    return {
      status: "ok",
      message: "Đã lưu. Cấu hình mới áp dụng cho các lượt mở sau, lượt đang chạy giữ nguyên.",
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

/* ── Helper ───────────────────────────────────────────────── */

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Có lỗi xảy ra.";
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}
