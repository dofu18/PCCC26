import Link from "next/link";
import { LiveLeaderboard } from "../_components/leaderboard";
import {
  CloseSessionButton,
  OpenSessionForm,
  ResetSessionForm,
} from "./_components/admin-forms";
import { listQuestionSets, listSessions } from "@/lib/admin-data";
import { formatTime } from "@/lib/format";
import { getLeaderboard, getSettings } from "@/lib/quiz";

export const dynamic = "force-dynamic";

/** Gợi ý tên lượt kế tiếp: "Lượt 3" → "Lượt 4". */
function suggestNextName(current: string): string {
  const match = current.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return `${current} (tiếp)`;
  return `${match[1]}${Number(match[2]) + 1}${match[3]}`;
}

export default async function AdminSessionPage() {
  const [sessions, sets, settings] = await Promise.all([
    listSessions(),
    listQuestionSets(),
    getSettings(),
  ]);
  const active = sessions.find((s) => s.status === "active");
  const board = active ? await getLeaderboard(active.id, 50) : [];

  return (
    <>
      <section className="band band--paper">
        <div className="wrap wrap--wide">
          <h1 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
            {active ? "Lượt đang chạy" : "Chưa có lượt nào mở"}
          </h1>

          {active ? (
            <>
              <div className="panel">
                <h3>{active.name}</h3>
                <dl className="kv">
                  <dt>Bộ câu hỏi</dt>
                  <dd>{active.set_name ?? "—"}</dd>
                  <dt>Số câu mỗi thí sinh</dt>
                  <dd className="num">
                    {active.settings?.questions_per_attempt
                      ? `${active.settings.questions_per_attempt} câu rút ngẫu nhiên`
                      : "hết bộ đề"}
                  </dd>
                  <dt>Thí sinh đã vào</dt>
                  <dd className="num">{active.participant_count}</dd>
                  <dt>Đã nộp bài</dt>
                  <dd className="num">{active.finished_count}</dd>
                  <dt>Bắt đầu</dt>
                  <dd className="num">{formatTime(active.started_at)}</dd>
                </dl>
              </div>

              <div className="btn-row" style={{ marginBottom: "var(--space-xl)" }}>
                <Link className="btn btn--ghost" href={`/admin/session/${active.id}`}>
                  Xem bài làm chi tiết
                </Link>
                <a className="btn btn--ghost" href={`/admin/export/${active.id}`}>
                  Xuất Excel
                </a>
                <CloseSessionButton sessionId={active.id} />
              </div>

              <div className="panel panel--danger">
                <h3>Reset để chạy nhóm kế tiếp</h3>
                <p style={{ color: "var(--color-ink-2)", marginBottom: "var(--space-md)" }}>
                  Lượt hiện tại chuyển vào Lịch sử — vẫn xuất lại Excel được bất kỳ lúc nào. Bộ câu
                  hỏi giữ nguyên và một lượt mới được mở ngay.
                </p>
                <ResetSessionForm
                  sessionId={active.id}
                  sessionName={active.name}
                  participantCount={active.participant_count}
                  finishedCount={active.finished_count}
                  suggestedName={suggestNextName(active.name)}
                />
              </div>
            </>
          ) : sets.length === 0 ? (
            <p className="notice">
              Chưa có bộ câu hỏi nào. <Link href="/admin/questions">Tạo bộ đề</Link> trước khi mở
              lượt.
            </p>
          ) : (
            <OpenSessionForm
              sets={sets.map((s) => ({
                id: s.id,
                name: s.name,
                question_count: s.question_count,
              }))}
              questionsPerAttempt={settings.questions_per_attempt}
            />
          )}
        </div>
      </section>

      {active ? (
        <section className="band band--paper2">
          <div className="wrap wrap--wide">
            <h2 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
              Bảng xếp hạng
            </h2>
            <LiveLeaderboard
              sessionId={active.id}
              limit={50}
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
              Mỗi mã số chỉ tính lượt làm có điểm cao nhất.
            </p>
          </div>
        </section>
      ) : null}
    </>
  );
}
