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
  /** thời gian còn lại tính bởi server lúc render — client chỉ đếm tiếp */
  remainingMs: number;
  timeLimitMs: number;
};

export function QuizRunner({ question, remainingMs, timeLimitMs }: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(Math.max(0, remainingMs));
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

  // Đồng hồ: đếm ngược từ thời gian server đưa xuống, không đọc đồng hồ máy thí sinh.
  useEffect(() => {
    if (feedback) return;
    const deadline = Date.now() + Math.max(0, remainingMs);
    const tick = () => {
      const left = deadline - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) send({ kind: "timeout" });
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [remainingMs, feedback, send]);

  // Không cần dọn state khi sang câu mới: trang truyền `key={question.id}`
  // nên React tự dựng lại component với state ban đầu.

  const seconds = Math.ceil(remaining / 1000);
  const fill = timeLimitMs > 0 ? Math.max(0, Math.min(1, remaining / timeLimitMs)) : 0;
  // 5 giây cuối: số nhịp mạnh lên và thanh thời gian sáng hơn — nhìn là biết phải nhanh.
  const low = !feedback && remaining > 0 && remaining <= 5000;
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

  return (
    <>
      <section className="band band--paper2 band--tight">
        <div className="wrap">
          <div className="qbar">
            <span className="qbar__count num">
              Câu {question.index} / {question.total}
            </span>
            <span className={`qbar__timer num${low ? " qbar__timer--low" : ""}`} aria-hidden="true">
              {feedback ? "—" : seconds}
            </span>
          </div>
        </div>
        <div className="timer-track">
          <div
            className={`timer-fill${low ? " timer-fill--low" : ""}`}
            style={{ ["--fill" as string]: String(fill) }}
          />
        </div>
        <p className="sr-only" role="status">
          {feedback ? "Đã trả lời." : `Còn khoảng ${Math.max(0, seconds)} giây.`}
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
                  {feedback.isCorrect ? "Chính xác" : feedback.timedOut ? "Hết giờ" : "Chưa đúng"}
                </p>
                <p className="verdict__points num">
                  {feedback.isCorrect ? `+${feedback.score} điểm` : "0 điểm"}
                  {feedback.correctText && !feedback.isCorrect
                    ? ` · đáp án đúng: ${feedback.correctText}`
                    : ""}
                </p>
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
