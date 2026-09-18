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

/** `redirect()` và `notFound()` báo hiệu bằng cách ném lỗi có `digest` — phải cho đi tiếp. */
function isControlFlowError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}

/**
 * Bọc thân mọi server action của BTC.
 *
 * Hai lỗi cũ mà hàm này chặn:
 *  1. `requireAdmin()` gọi NGOÀI try: cookie 12h hết hạn thì nó ném ra ngoài, `useActionState`
 *     không nhận được state nào → bấm nút im lặng, không báo gì. Giờ chạy trong try nên lỗi
 *     hiện lên UI.
 *  2. `redirect()` gọi TRONG try bị `catch` bắt nhầm → hiện lỗi đỏ "NEXT_REDIRECT" và không
 *     chuyển trang. Giờ được nhận diện và ném tiếp.
 */
async function guard<T>(run: () => Promise<T>): Promise<T | { status: "error"; message: string }> {
  try {
    await requireAdmin();
    return await run();
  } catch (error) {
    if (isControlFlowError(error)) throw error;
    return { status: "error", message: message(error) };
  }
}

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
  return guard(async () => {
    const id = await createQuestionSet(String(formData.get("name") ?? ""));
    revalidatePath("/admin/questions");
    redirect(`/admin/questions/${id}`);
  });
}

export async function deleteSetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guard(async () => {
    await deleteQuestionSet(String(formData.get("setId")));
    revalidatePath("/admin/questions");
    return { status: "ok", message: "Đã xoá bộ đề." };
  });
}

/* ── Câu hỏi ──────────────────────────────────────────────── */

/** Khớp với LETTERS trong lib/excel.ts — câu nhập từ Excel có tới 10 đáp án. */
const OPTION_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;

/** Đọc form câu hỏi (dùng chung cho thêm mới và sửa). Ném lỗi nếu dữ liệu không hợp lệ. */
function readQuestionForm(formData: FormData): QuestionInput {
  const type = String(formData.get("type")) as QuestionType;
  const content = String(formData.get("content") ?? "").trim();
  if (!content) throw new Error("Nhập nội dung câu hỏi.");

  // Checkbox "đáp án đúng" mang value là vị trí GỐC trong dãy a..j, còn `options` đã bị nén
  // để bỏ ô trống. Phải giữ bảng ánh xạ gốc→nén, nếu không thì bỏ trống một ô ở giữa sẽ làm
  // lệch index: hoặc báo "Chọn đáp án đúng" dù đã tick, hoặc tệ hơn là lưu nhầm đáp án khác.
  const options: string[] = [];
  const slotToIndex = new Map<number, number>();
  OPTION_KEYS.forEach((key, slot) => {
    const text = String(formData.get(`option_${key}`) ?? "").trim();
    if (!text) return;
    slotToIndex.set(slot, options.length);
    options.push(text);
  });

  let correct: (number | boolean | string)[] = [];

  if (type === "single" || type === "multi") {
    if (options.length < 2) throw new Error("Câu trắc nghiệm cần ít nhất 2 đáp án.");
    const picked = formData
      .getAll("correct")
      .map((v) => slotToIndex.get(Number(v)))
      .filter((n): n is number => n !== undefined);
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
    explanation: String(formData.get("explanation") ?? "").trim() || null,
  };
}

export async function addQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const setId = String(formData.get("setId"));
  return guard(async () => {
    await addQuestion(setId, readQuestionForm(formData));
    revalidatePath(`/admin/questions/${setId}`);
    return { status: "ok", message: "Đã thêm câu hỏi." };
  });
}

export async function editQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const setId = String(formData.get("setId"));
  const questionId = String(formData.get("questionId"));
  return guard(async () => {
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
  });
}

export async function deleteQuestionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guard(async () => {
    await deleteQuestion(String(formData.get("questionId")));
    revalidatePath(`/admin/questions/${String(formData.get("setId"))}`);
    return { status: "ok", message: "Đã xoá câu hỏi." };
  });
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

  const setId = String(formData.get("setId"));
  const mode = String(formData.get("mode")) === "replace" ? "replace" : "append";
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Chọn file .xlsx trước khi nhập." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { status: "error", message: "File lớn hơn 8 MB — chia nhỏ ra giúp nhé." };
  }

  return guard(async () => {
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
  });
}

/* ── Lượt thi ─────────────────────────────────────────────── */

export async function openSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guard(async () => {
    await openSession(String(formData.get("name") ?? ""), String(formData.get("questionSetId")));
    revalidatePath("/admin");
    return { status: "ok", message: "Đã mở lượt thi." };
  });
}

export async function closeSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guard(async () => {
    await closeSession(String(formData.get("sessionId")));
    revalidatePath("/admin");
    revalidatePath("/admin/history");
    return { status: "ok", message: "Đã kết thúc lượt. Vẫn xuất Excel lại được ở Lịch sử." };
  });
}

export async function resetSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guard(async () => {
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
  });
}

export async function deleteSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guard(async () => {
    await deleteSession(String(formData.get("sessionId")));
    revalidatePath("/admin/history");
    return { status: "ok", message: "Đã xoá lượt và toàn bộ dữ liệu của lượt đó." };
  });
}

/* ── Cấu hình ─────────────────────────────────────────────── */

export async function saveSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guard(async () => {
    // Để trống = 0 = lấy hết bộ đề.
    const raw = String(formData.get("questions_per_attempt") ?? "").trim();
    const perAttempt = raw === "" ? 0 : numberOrNull(raw);
    if (perAttempt === null || perAttempt < 0 || perAttempt > 1000) {
      return {
        status: "error",
        message: "Số câu mỗi lượt phải là số từ 0 đến 1000 (để trống là lấy hết bộ đề).",
      };
    }

    const rawTime = String(formData.get("time_limit_minutes") ?? "").trim();
    const timeLimit = rawTime === "" ? 0 : numberOrNull(rawTime);
    if (timeLimit === null || timeLimit < 0 || timeLimit > 1440) {
      return {
        status: "error",
        message: "Giới hạn thời gian phải là số từ 0 đến 1440 phút (để trống là không giới hạn).",
      };
    }

    await updateSettings({
      questions_per_attempt: perAttempt,
      time_limit_minutes: timeLimit,
      show_feedback: formData.get("show_feedback") === "on",
      multi_all_or_nothing: formData.get("multi_all_or_nothing") === "on",
    });

    revalidatePath("/admin/settings");
    return {
      status: "ok",
      message: "Đã lưu. Cấu hình mới áp dụng cho lượt đang chạy và các lượt mở sau.",
    };
  });
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
