import { Nav, SetupNotice } from "../_components/chrome";
import { LiveLeaderboard } from "../_components/leaderboard";
import { getActiveSession, getLeaderboard } from "@/lib/quiz";
import { isConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "PCCC26 · Bảng xếp hạng",
};

export default async function DisplayPage() {
  if (!isConfigured()) return <SetupNotice />;

  const session = await getActiveSession();
  const board = session ? await getLeaderboard(session.id, 10) : [];

  return (
    <main className="stage">
      <section className="band band--ink" style={{ minHeight: "100dvh" }}>
        <div className="wrap wrap--wide">
          <Nav
            meta={
              <span className="live">
                <span className="live__dot" aria-hidden="true" />
                {session ? `${session.name} · ${board.length} thí sinh` : "Chưa mở lượt"}
              </span>
            }
          />

          <h1 className="display" style={{ margin: "var(--space-xl) 0 var(--space-lg)" }}>
            Xếp hạng
          </h1>

          {session ? (
            <LiveLeaderboard
              sessionId={session.id}
              limit={10}
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
          ) : (
            <p className="lede">Chưa có lượt thi nào đang mở.</p>
          )}
        </div>
      </section>
    </main>
  );
}
