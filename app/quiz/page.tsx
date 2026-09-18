import Link from "next/link";
import { redirect } from "next/navigation";
import { ErrorNotice, SetupNotice } from "../_components/chrome";
import { readParticipantCookie } from "@/lib/auth";
import { currentStep, getParticipant } from "@/lib/quiz";
import { isConfigured } from "@/lib/supabase";
import { QuizPageClient } from "./_components/quiz-page-client";

export const dynamic = "force-dynamic";

export default async function QuizPage() {
  if (!isConfigured()) return <SetupNotice />;

  const participantId = await readParticipantCookie();
  if (!participantId) redirect("/");

  const participant = await getParticipant(participantId);
  if (!participant) {
    return (
      <ErrorNotice title="Không tìm thấy bài làm">
        Lượt làm bài này không còn tồn tại — có thể ban tổ chức đã reset lượt.{" "}
        <Link href="/">Vào lại từ trang chủ</Link>.
      </ErrorNotice>
    );
  }

  const step = await currentStep(participant);
  if (step.kind === "done") redirect("/result");

  const session = await import("@/lib/quiz").then(q => q.getSession(participant.session_id));
  const timeLimitMinutes = session?.settings.time_limit_minutes ?? 0;

  return (
    <QuizPageClient
      participant={participant}
      question={step.question}
      timeLimitMinutes={timeLimitMinutes}
      startedAt={participant.started_at}
    />
  );
}
