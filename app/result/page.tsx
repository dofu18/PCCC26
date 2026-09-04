import Link from "next/link";
import { redirect } from "next/navigation";
import { ErrorNotice, Footer, Nav, SetupNotice } from "../_components/chrome";
import { CountUp } from "../_components/count-up";
import { LiveLeaderboard } from "../_components/leaderboard";
import { nextParticipantAction } from "../actions";
import { readParticipantCookie } from "@/lib/auth";
import { NOT_ANSWERED } from "@/lib/answer-text";
import { formatDuration } from "@/lib/format";
import { getLeaderboard, getParticipant, getParticipantSummary, getReview } from "@/lib/quiz";
import { isConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ResultPage() {
  if (!isConfigured()) return <SetupNotice />;

  const participantId = await readParticipantCookie();
  if (!participantId) redirect("/");

  const participant = await getParticipant(participantId);
  if (!participant) {
    return (
      <ErrorNotice title="Không tìm thấy bài làm">
        Lượt làm bài này không còn tồn tại. <Link href="/">Vào lại từ trang chủ</Link>.
      </ErrorNotice>
    );
  }

  const [summary, review, board] = await Promise.all([
    getParticipantSummary(participantId),
    getReview(participantId),
    getLeaderboard(participant.session_id, 20),
  ]);

  const mine = board.find((row) => row.participant_id === participantId);
  const totalQuestions = participant.question_order.length;
  const answered = summary?.answered_count ?? 0;
  const skipped = review.filter((row) => row.given_text === NOT_ANSWERED).length;
  const fastest = review.length ? Math.min(...review.map((row) => row.time_ms)) : 0;

  return (
    <>
      <main className="page-in">
        <section className="band band--paper2 band--tight">
          <div className="wrap">
            <Nav meta={participant.finished_at ? "Đã nộp bài" : "Đang làm"} />
          </div>
        </section>

        <section className="band band--paper">
          <div className="wrap">
            <p className="whoami">
              <span className="num">{participant.code}</span> - {participant.full_name}
            </p>
            <p className="score num">
              <CountUp value={summary?.correct_count ?? 0} />
              <span className="score__of">/{totalQuestions}</span>
            </p>
            <p className="lede" style={{ marginTop: "var(--space-sm)" }}>
              {mine
                ? `câu đúng trong ${formatDuration(summary?.total_time_ms ?? 0)} — đang xếp hạng ${mine.rank} trong lượt này.`
                : `câu đúng trong ${formatDuration(summary?.total_time_ms ?? 0)} — chờ bảng xếp hạng cập nhật.`}
            </p>

            <dl className="facts stagger">
              <div>
                <dt className="fact__k">Câu đúng</dt>
                <dd className="fact__v num">
                  {summary?.correct_count ?? 0} / {totalQuestions}
                </dd>
              </div>
              <div>
                <dt className="fact__k">Tổng thời gian</dt>
                <dd className="fact__v num">{formatDuration(summary?.total_time_ms ?? 0)}</dd>
              </div>
              <div>
                <dt className="fact__k">Câu nhanh nhất</dt>
                <dd className="fact__v num">{review.length ? formatDuration(fastest) : "—"}</dd>
              </div>
              <div>
                <dt className="fact__k">Câu đã bỏ qua</dt>
                <dd className="fact__v num">{skipped}</dd>
              </div>
            </dl>

            <div className="btn-row">
              {answered < totalQuestions && !participant.finished_at ? (
                <Link className="btn btn--primary" href="/quiz" style={{ width: "auto" }}>
                  Làm tiếp
                </Link>
              ) : null}
              {/* Sự kiện có thể chỉ có một máy chung — nút này xoá cookie và trả về trang
                  nhập mã để người kế tiếp vào ngay, không phải xoá lịch sử trình duyệt. */}
              <form action={nextParticipantAction} style={{ display: "contents" }}>
                <button className="btn btn--ghost" type="submit">
                  Thí sinh tiếp theo
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="band band--paper2">
          <div className="wrap">
            <h2 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
              Bảng xếp hạng
            </h2>
            <LiveLeaderboard
              sessionId={participant.session_id}
              highlightParticipantId={participantId}
              initialRows={board.map((row) => ({
                participant_id: row.participant_id,
                rank: row.rank,
                code: row.code,
                display_name: row.display_name,
                full_name: row.full_name,
                total_time_ms: row.total_time_ms,
                correct_count: row.correct_count,
                answered_count: row.answered_count,
                finished_at: row.finished_at,
              }))}
            />
            <p className="meta" style={{ marginTop: "var(--space-md)" }}>
              Dòng có viền là bạn. Bảng tự cập nhật.
            </p>
          </div>
        </section>

        {review.length > 0 ? (
          <section className="band band--paper">
            <div className="wrap">
              <h2 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
                Xem lại bài làm
              </h2>
              <div className="stack stagger">
                {review.map((row) => (
                  <div className="panel" key={row.order_index}>
                    <p className="meta">
                      Câu {row.order_index} · {row.is_correct ? "đúng" : "chưa đúng"} ·{" "}
                      {formatDuration(row.time_ms)}
                    </p>
                    <p style={{ fontWeight: 600, marginTop: "var(--space-2xs)" }}>{row.content}</p>
                    <dl className="ans">
                      <dt>Bạn trả lời</dt>
                      <dd
                        className={
                          row.given_text === NOT_ANSWERED
                            ? "is-empty"
                            : row.is_correct
                              ? "is-ok"
                              : "is-no"
                        }
                      >
                        {row.given_text}
                      </dd>
                      {row.is_correct ? null : (
                        <>
                          <dt>Đáp án đúng</dt>
                          <dd className="is-ok">{row.correct_text}</dd>
                        </>
                      )}
                    </dl>
                    {row.explanation ? (
                      <p style={{ color: "var(--color-ink-2)", marginTop: "var(--space-xs)" }}>
                        {row.explanation}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </>
  );
}
