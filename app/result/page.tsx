import Link from "next/link";
import { redirect } from "next/navigation";
import { ErrorNotice, Footer, Nav, SetupNotice } from "../_components/chrome";
import { LiveLeaderboard } from "../_components/leaderboard";
import { readParticipantCookie } from "@/lib/auth";
import { formatDuration, formatScore } from "@/lib/format";
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
  const timedOut = review.filter((row) => row.score === 0 && !row.is_correct).length;
  const fastest = review.length ? Math.min(...review.map((row) => row.time_ms)) : 0;

  return (
    <>
      <main>
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
            <p className="score num">{formatScore(summary?.total_score ?? 0)}</p>
            <p className="lede" style={{ marginTop: "var(--space-sm)" }}>
              {mine
                ? `điểm — đang xếp hạng ${mine.rank} trong lượt này.`
                : "điểm — chờ bảng xếp hạng cập nhật."}
            </p>

            <dl className="facts">
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
                <dt className="fact__k">Nhanh nhất</dt>
                <dd className="fact__v num">{review.length ? formatDuration(fastest) : "—"}</dd>
              </div>
              <div>
                <dt className="fact__k">Câu chưa có điểm</dt>
                <dd className="fact__v num">{timedOut}</dd>
              </div>
            </dl>

            {answered < totalQuestions && !participant.finished_at ? (
              <div className="btn-row">
                <Link className="btn btn--primary" href="/quiz" style={{ width: "auto" }}>
                  Làm tiếp
                </Link>
              </div>
            ) : null}
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
                total_score: row.total_score,
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
              <div className="stack">
                {review.map((row) => (
                  <div className="panel" key={row.order_index}>
                    <p className="meta">
                      Câu {row.order_index} · {row.is_correct ? "đúng" : "chưa đúng"} ·{" "}
                      {formatScore(row.score)} điểm · {formatDuration(row.time_ms)}
                    </p>
                    <p style={{ fontWeight: 600, marginTop: "var(--space-2xs)" }}>{row.content}</p>
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
