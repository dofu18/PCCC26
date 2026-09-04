import Link from "next/link";
import { notFound } from "next/navigation";
import { sessionSheet } from "@/lib/admin-data";
import { TIMED_OUT } from "@/lib/answer-text";
import { requireAdmin } from "@/lib/auth";
import { formatDuration, formatScore, formatTime } from "@/lib/format";
import { getSession } from "@/lib/quiz";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  single: "1 đáp án",
  multi: "nhiều đáp án",
  boolean: "đúng/sai",
  text: "điền chữ",
};

export default async function SessionSheetPage({
  params,
}: PageProps<"/admin/session/[sessionId]">) {
  // Trang này hiện đáp án đúng của cả bộ đề — chốt cửa ngay tại đây, không chỉ dựa vào layout.
  await requireAdmin();

  const { sessionId } = await params;
  const session = await getSession(sessionId);
  if (!session) notFound();

  const sheet = await sessionSheet(sessionId);
  const answerCount = sheet.reduce((sum, p) => sum + p.answers.length, 0);

  return (
    <section className="band band--paper">
      <div className="wrap wrap--wide">
        <p className="meta">
          <Link href={session.status === "active" ? "/admin" : "/admin/history"}>← Quay lại</Link>
        </p>
        <h1 className="display-s" style={{ marginBottom: "var(--space-sm)" }}>
          Bài làm chi tiết — {session.name}
        </h1>
        <p className="meta" style={{ marginBottom: "var(--space-lg)" }}>
          {sheet.length} thí sinh · {answerCount} câu trả lời đã lưu ·{" "}
          {session.status === "active" ? "lượt đang chạy" : "đã kết thúc"} · bắt đầu{" "}
          {formatTime(session.started_at)}
        </p>

        <div className="btn-row" style={{ marginBottom: "var(--space-xl)" }}>
          <a className="btn btn--ghost" href={`/admin/export/${sessionId}`}>
            Xuất Excel
          </a>
        </div>

        {sheet.length === 0 ? (
          <p className="notice">Chưa có thí sinh nào vào lượt này.</p>
        ) : (
          <div className="stack">
            {sheet.map((person, index) => (
              <div className="panel" key={person.participant_id}>
                <h3>
                  {index + 1}. {person.display_name}
                  {person.attempt_no > 1 ? ` (lượt làm thứ ${person.attempt_no})` : ""}
                </h3>
                <dl className="kv">
                  <dt>Mã số</dt>
                  <dd className="num">{person.code}</dd>
                  <dt>Họ tên</dt>
                  <dd>{person.full_name}</dd>
                  <dt>Điểm</dt>
                  <dd className="num">{formatScore(person.total_score)}</dd>
                  <dt>Số câu đúng</dt>
                  <dd className="num">
                    {person.correct_count}/{person.answers.length}
                  </dd>
                  <dt>Tổng thời gian</dt>
                  <dd className="num">{formatDuration(person.total_time_ms)}</dd>
                  <dt>Trạng thái</dt>
                  <dd>
                    {person.finished_at
                      ? `đã nộp lúc ${formatTime(person.finished_at)}`
                      : "đang làm bài"}
                  </dd>
                </dl>

                {person.answers.length === 0 ? (
                  <p className="meta" style={{ marginTop: "var(--space-sm)" }}>
                    Chưa trả lời câu nào.
                  </p>
                ) : (
                  <div className="tablewrap" style={{ marginTop: "var(--space-md)" }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Câu hỏi</th>
                          <th>Dạng</th>
                          <th>Thí sinh trả lời</th>
                          <th>Đáp án đúng</th>
                          <th>Kết quả</th>
                          <th>Thời gian</th>
                          <th>Điểm</th>
                        </tr>
                      </thead>
                      <tbody>
                        {person.answers.map((answer) => (
                          <tr key={answer.order_index}>
                            <td className="num">{answer.order_index}</td>
                            <td>{answer.question}</td>
                            <td>
                              <span className="tag">
                                {TYPE_LABEL[answer.question_type] ?? answer.question_type}
                              </span>
                            </td>
                            <td>
                              <span
                                className={
                                  answer.given_text === TIMED_OUT
                                    ? "is-empty"
                                    : answer.is_correct
                                      ? "is-ok"
                                      : "is-no"
                                }
                              >
                                {answer.given_text}
                              </span>
                            </td>
                            <td>{answer.correct_text}</td>
                            <td>{answer.is_correct ? "đúng" : "chưa đúng"}</td>
                            <td className="num">{formatDuration(answer.time_ms)}</td>
                            <td className="num">{formatScore(answer.score)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
