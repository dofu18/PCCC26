"use server";

import { redirect } from "next/navigation";
import { clearParticipantCookie, readParticipantCookie, setParticipantCookie } from "@/lib/auth";
import {
  finishParticipant,
  getParticipant,
  joinSession,
  submitAnswer,
  type SubmitResult,
} from "@/lib/quiz";
import type { GivenAnswer } from "@/lib/types";

export type JoinState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "duplicate"; attempts: number; code: string; fullName: string; email: string };

/**
 * Vào phòng thi. Mã số đã dùng trong lượt này thì trả về `duplicate` để UI
 * hỏi lại; thí sinh xác nhận thì gọi lại với force = true.
 */
export async function joinAction(input: {
  code: string;
  fullName: string;
  email: string;
  force?: boolean;
}): Promise<JoinState> {
  const result = await joinSession(input);

  switch (result.status) {
    case "ok":
      await setParticipantCookie(result.participantId);
      redirect("/quiz");
    case "duplicate":
      return {
        status: "duplicate",
        attempts: result.attempts,
        code: input.code,
        fullName: input.fullName,
        email: input.email,
      };
    case "invalid":
      return { status: "error", message: result.message };
    case "no-session":
      return {
        status: "error",
        message: "Chưa có lượt thi nào đang mở. Chờ ban tổ chức mở lượt rồi thử lại.",
      };
    case "empty-set":
      return {
        status: "error",
        message: "Lượt thi chưa có câu hỏi nào. Báo ban tổ chức giúp nhé.",
      };
  }
}

export type SubmitState =
  | { status: "ok"; result: SubmitResult }
  | { status: "error"; message: string };

export async function submitAnswerAction(given: GivenAnswer): Promise<SubmitState> {
  const participantId = await readParticipantCookie();
  if (!participantId) {
    return { status: "error", message: "Phiên làm bài đã hết. Vào lại từ trang chủ." };
  }

  const participant = await getParticipant(participantId);
  if (!participant) {
    return { status: "error", message: "Không tìm thấy lượt làm bài của bạn." };
  }

  try {
    const result = await submitAnswer(participant, given);
    return { status: "ok", result };
  } catch (error) {
    if (error instanceof Error && error.message === "Bài thi đã hết thời gian.") {
      redirect("/result");
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Không lưu được đáp án.",
    };
  }
}

/**
 * Nhường máy cho thí sinh kế tiếp. Sự kiện có thể chỉ có một máy chung nên phải xoá cookie,
 * nếu không người sau mở lên sẽ rơi thẳng vào trang kết quả của người trước.
 */
export async function nextParticipantAction(): Promise<void> {
  await clearParticipantCookie();
  redirect("/");
}

export async function finishAction(): Promise<void> {
  const participantId = await readParticipantCookie();
  if (participantId) await finishParticipant(participantId);
  redirect("/result");
}
