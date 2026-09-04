import { Nav, SetupNotice } from "../_components/chrome";
import { LiveLeaderboard, LiveParticipantCount } from "../_components/leaderboard";
import { countLeaderboard, getActiveSession, getLeaderboard } from "@/lib/quiz";
import { isConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "PCCC26 · Bảng xếp hạng",
};

export default async function DisplayPage() {
  if (!isConfigured()) return <SetupNotice />;

  const session = await getActiveSession();
  const [board, participantCount] = session
    ? await Promise.all([getLeaderboard(session.id, 10), countLeaderboard(session.id)])
    : [[], 0];

  return (
    <main className="stage">
      <section className="band band--ink" style={{ minHeight: "100dvh" }}>
        <div className="wrap wrap--wide">
          <Nav
            meta={
              <span className="live">
                <span className="live__dot" aria-hidden="true" />
                {session ? (
                  <>
                    {session.name} ·{" "}
                    <LiveParticipantCount
                      sessionId={session.id}
                      limit={10}
                      initial={participantCount}
                    />{" "}
                    thí sinh
                  </>
                ) : (
                  "Chưa mở lượt"
                )}
              </span>
            }
          />

          <h1
            className="display anim-slam"
            style={{ margin: "var(--space-xl) 0 var(--space-lg)" }}
          >
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

        {/* Người đến muộn quét thẳng từ màn chiếu, không cần đi hỏi bàn tiếp đón.
            SVG nên phóng to bao nhiêu cũng nét. */}
        <aside className="stage-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/qr-pccc26.svg" alt="" width={148} height={148} />
          <p>
            Quét để vào thi
            <br />
            <span className="num">pccc26.vercel.app</span>
          </p>
        </aside>
      </section>
    </main>
  );
}
