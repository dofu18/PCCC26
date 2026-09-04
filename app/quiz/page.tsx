import Link from "next/link";
import { redirect } from "next/navigation";
import { ErrorNotice, Nav, SetupNotice } from "../_components/chrome";
import { QuizRunner } from "../_components/quiz-runner";
import { readParticipantCookie } from "@/lib/auth";
import { currentStep, getParticipant } from "@/lib/quiz";
import { isConfigured } from "@/lib/supabase";

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

  return (
    <main>
      <section className="band band--paper2 band--tight">
        <div className="wrap">
          <Nav meta={<span className="num">{participant.code}</span>} />
        </div>
      </section>

      <QuizRunner
        key={step.question.id}
        question={step.question}
        servedAt={step.servedAt}
      />
    </main>
  );
}
