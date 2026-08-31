import { Footer, Nav, SetupNotice } from "./_components/chrome";
import { JoinForm } from "./_components/join-form";
import { getActiveSession } from "@/lib/quiz";
import { isConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  if (!isConfigured()) return <SetupNotice />;

  const session = await getActiveSession();

  return (
    <>
      <main>
        <section className="band band--ink band--tight">
          <div className="wrap">
            <Nav meta={session ? `${session.name} · đang mở` : "Chưa mở lượt"} />
          </div>
        </section>

        <section className="band band--ink band--hero">
          <div className="wrap">
            <h1 className="display">
              An toàn là <span className="hl">thói quen</span>.
            </h1>
            <p className="lede" style={{ marginTop: "var(--space-lg)" }}>
              Trả lời bộ câu hỏi phòng cháy chữa cháy. Trả lời nhanh hơn thì được nhiều điểm hơn.
            </p>
          </div>
        </section>

        <section className="band band--paper">
          <div className="wrap">
            {session ? (
              <JoinForm />
            ) : (
              <p className="notice">
                Chưa có lượt thi nào đang mở. Chờ ban tổ chức mở lượt rồi tải lại trang này.
              </p>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
