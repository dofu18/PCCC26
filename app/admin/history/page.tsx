import Link from "next/link";
import { DeleteSessionButton } from "../_components/admin-forms";
import { listSessions } from "@/lib/admin-data";
import { formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const sessions = await listSessions();
  const past = sessions.filter((s) => s.status === "finished");

  return (
    <section className="band band--paper">
      <div className="wrap wrap--wide">
        <h1 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
          Lịch sử các lượt
        </h1>

        {past.length === 0 ? (
          <p className="notice">Chưa có lượt nào kết thúc.</p>
        ) : (
          <div className="stack">
            {past.map((session) => (
              <div className="panel" key={session.id}>
                <h3>{session.name}</h3>
                <dl className="kv">
                  <dt>Bộ câu hỏi</dt>
                  <dd>{session.set_name ?? "—"}</dd>
                  <dt>Thí sinh</dt>
                  <dd className="num">{session.participant_count}</dd>
                  <dt>Đã nộp bài</dt>
                  <dd className="num">{session.finished_count}</dd>
                  <dt>Thời gian</dt>
                  <dd className="num">
                    {formatTime(session.started_at)} → {formatTime(session.ended_at)}
                  </dd>
                </dl>
                <div className="btn-row" style={{ marginTop: "var(--space-sm)" }}>
                  <Link className="btn btn--ghost" href={`/admin/session/${session.id}`}>
                    Xem bài làm chi tiết
                  </Link>
                  <a className="btn btn--ghost" href={`/admin/export/${session.id}`}>
                    Xuất Excel
                  </a>
                  <DeleteSessionButton sessionId={session.id} name={session.name} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
