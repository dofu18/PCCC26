"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { finishAction } from "@/app/actions";
import type { PublicQuestion } from "@/lib/types";
import { Nav } from "@/app/_components/chrome";
import { QuizRunner } from "@/app/_components/quiz-runner";

type QuizPageClientProps = {
  participant: { code: string };
  question: PublicQuestion;
  timeLimitMinutes: number;
  startedAt: string;
};

export function QuizPageClient({
  participant,
  question,
  timeLimitMinutes,
  startedAt,
}: QuizPageClientProps) {
  const router = useRouter();

  useEffect(() => {
    if (timeLimitMinutes <= 0) return;

    const startTime = new Date(startedAt);
    const endTime = new Date(startTime.getTime() + timeLimitMinutes * 60000);
    const checkTime = () => {
      if (new Date() > endTime) {
        finishAction().then(() => router.push("/result"));
      }
    };

    const interval = setInterval(checkTime, 1000);
    return () => clearInterval(interval);
  }, [router, startedAt, timeLimitMinutes]);

  return (
    <main>
      <section className="band band--paper2 band--tight">
        <div className="wrap">
          <Nav meta={<span className="num">{participant.code}</span>} />
        </div>
      </section>

      <QuizRunner
        key={question.id}
        question={question}
        startedAt={startedAt}
        timeLimitMinutes={timeLimitMinutes}
      />
    </main>
  );
}
