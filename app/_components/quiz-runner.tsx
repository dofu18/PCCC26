"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { submitAnswerAction } from "../actions";
import { CheckIcon, CrossIcon } from "./chrome";
import type { GivenAnswer, PublicQuestion } from "@/lib/types";
import type { SubmitResult } from "@/lib/quiz";

const LETTERS = "ABCDEFGHIJ";

type Props = {
  question: PublicQuestion;
  startedAt: string;
  timeLimitMinutes: number;
};

export function QuizRunner({ question, startedAt, timeLimitMinutes }: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() =>
    timeLimitMinutes > 0
      ? Math.max(0, Math.ceil((new Date(startedAt).getTime() + timeLimitMinutes * 60000 - Date.now()) / 1000))
      : null,
  );
  const [pending, startTransition] = useTransition();
  const sentRef = useRef(false);

  const send = useCallback(
    (given: GivenAnswer) => {
      if (sentRef.current) return;
      sentRef.current = true;
      startTransition(async () => {
        const state = await submitAnswerAction(given);
        if (state.status === "error") {
          setError(state.message);
          sentRef.current = false;
          return;
        }
        if (!state.result.showFeedback) {
          if (state.result.isLast) router.push("/result");
          else router.refresh();
          return;
        }
        setFeedback(state.result);
      });
    },
    [router],
  );

  // Đồng hồ đếm ngược theo toàn bài; việc hết giờ vẫn được chốt ở server và page client.
  useEffect(() => {
    if (timeLimitMinutes <= 0) return;

    const end = new Date(startedAt).getTime() + timeLimitMinutes * 60000;
    const tick = () => setRemainingSeconds(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt, timeLimitMinutes]);

  // Không cần dọn state khi sang câu mới: trang truyền `key={question.id}`
  // nên React tự dựng lại component với state ban đầu.
  const clock =
    remainingSeconds === null
      ? "—"
      : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const locked = Boolean(feedback) || pending;

  function next() {
    if (feedback?.isLast) router.push("/result");
    else router.refresh();
  }

  function optionClass(index: number): string {
    if (!feedback) return `opt${picked.includes(index) ? " opt--picked" : ""}`;
    if (feedback.correctDisplayIndexes.includes(index)) return "opt opt--ok";
    if (picked.includes(index)) return "opt opt--no";
    return "opt";
  }

  const accessibleClock =
    remainingSeconds === null ? "Bài thi không giới hạn thời gian." : `Còn lại ${clock} cho toàn bài.`;

  return (
    <>
      <section className="band band--paper2 band--tight">
        <div className="wrap">
          <div className="qbar">
            <span className="qbar__count num">
              Câu {question.index} / {question.total}
            </span>
            <span className="qbar__timer num" aria-hidden="true">
              {clock}
            </span>
          </div>
        </div>
        <p className="sr-only" role="status">
          {feedback ? "Đã trả lời." : accessibleClock}
        </p>
      </section>

      <section className="band band--paper">
        <div className="wrap">
          <h2 className="qtext anim-slam">{question.content}</h2>

          {question.image_url ? (
            <figure className="qfig">
              {/* Ảnh do BTC dán URL nên không biết trước kích thước; dùng img thường
                  thay vì next/image để không phải khai báo remote host cho từng nguồn. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={question.image_url} alt="" loading="eager" fetchPriority="high" />
            </figure>
          ) : null}

          {feedback ? (
            <div className={`verdict ${feedback.isCorrect ? "verdict--ok" : "verdict--no"}`}>
              {feedback.isCorrect ? <CheckIcon /> : <CrossIcon />}
              <div>
                <p className="verdict__title">
                  {feedback.isCorrect ? "Chính xác" : feedback.skipped ? "Đã bỏ qua" : "Chưa đúng"}
                </p>
                {feedback.correctText && !feedback.isCorrect ? (
                  <p className="verdict__points">Đáp án đúng: {feedback.correctText}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="notice" role="alert" style={{ marginBottom: "var(--space-md)" }}>
              {error}
            </p>
          ) : null}

          {question.type === "single" || question.type === "multi" ? (
            <div className="opts stagger">
              {(question.options ?? []).map((option, index) => (
                <button
                  key={index}
                  type="button"
                  className={optionClass(index)}
                  disabled={locked}
                  aria-pressed={question.type === "multi" ? picked.includes(index) : undefined}
                  onClick={() => {
                    if (question.type === "single") {
                      setPicked([index]);
                      send({ kind: "choice", picked: [index] });
                    } else {
                      setPicked((prev) =>
                        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
                      );
                    }
                  }}
                >
                  <span className="opt__key">{LETTERS[index]}</span>
                  <span className="opt__text">{option}</span>
                </button>
              ))}
            </div>
          ) : null}

          {question.type === "boolean" ? (
            <div className="opts stagger">
              {[
                { label: "Đúng", value: true },
                { label: "Sai", value: false },
              ].map((choice, index) => (
                <button
                  key={choice.label}
                  type="button"
                  className={
                    !feedback
                      ? `opt${picked.includes(index) ? " opt--picked" : ""}`
                      : (feedback.correctText === choice.label
                          ? "opt opt--ok"
                          : picked.includes(index)
                            ? "opt opt--no"
                            : "opt")
                  }
                  disabled={locked}
                  onClick={() => {
                    setPicked([index]);
                    send({ kind: "boolean", value: choice.value });
                  }}
                >
                  <span className="opt__key">{index === 0 ? "Đ" : "S"}</span>
                  <span className="opt__text">{choice.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          {question.type === "text" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (text.trim()) send({ kind: "text", value: text });
              }}
            >
              <label className="field">
                <span className="field__label">Đáp án của bạn</span>
                <input
                  className="field__input"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  disabled={locked}
                  autoComplete="off"
                  autoFocus
                />
                <span className="field__hint">
                  Không cần đúng hoa thường hay dấu — gõ sát nghĩa là được.
                </span>
              </label>
              {!feedback ? (
                <button className="btn btn--primary" type="submit" disabled={!text.trim() || locked}>
                  Trả lời
                </button>
              ) : null}
            </form>
          ) : null}

          {question.type === "multi" && !feedback ? (
            <div style={{ marginTop: "var(--space-md)" }}>
              <button
                className="btn btn--primary"
                type="button"
                disabled={picked.length === 0 || locked}
                onClick={() => send({ kind: "choice", picked })}
              >
                Xác nhận {picked.length > 0 ? `(${picked.length} đáp án)` : ""}
              </button>
              <p className="field__hint">Câu này có nhiều đáp án đúng. Chọn hết rồi xác nhận.</p>
            </div>
          ) : null}

          {!feedback ? (
            <div style={{ marginTop: "var(--space-lg)" }}>
              {/* Không còn hạn giờ nên phải có lối thoát cho câu bí, nếu không thí sinh
                  ngồi lỳ giữa sự kiện mà đồng hồ vẫn chạy. Bỏ qua = tính sai. */}
              <button
                className="btn btn--ghost"
                type="button"
                disabled={locked}
                onClick={() => send({ kind: "skip" })}
              >
                Bỏ qua câu này
              </button>
              <p className="field__hint">Bỏ qua sẽ tính là trả lời sai và chuyển sang câu sau.</p>
            </div>
          ) : null}

          {feedback?.explanation ? (
            <p className="explain" style={{ marginTop: "var(--space-md)" }}>
              {feedback.explanation}
            </p>
          ) : null}

          {feedback ? (
            <div style={{ marginTop: "var(--space-lg)" }}>
              <button className="btn btn--primary" type="button" onClick={next}>
                {feedback.isLast ? "Xem kết quả" : "Câu tiếp theo"}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
