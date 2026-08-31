import { NextResponse } from "next/server";
import { getActiveSession, getLeaderboard, getSession } from "@/lib/quiz";
import { isConfigured } from "@/lib/supabase";

/**
 * Bảng xếp hạng cho các trang tự cập nhật (màn chiếu, trang kết quả).
 * Chỉ trả về thông tin công khai: hạng, mã số, tên hiển thị, điểm, thời gian.
 * Không trả về đáp án hay bất cứ thứ gì liên quan tới đề.
 */
export async function GET(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Chưa cấu hình database." }, { status: 503 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 200);

  try {
    const session = sessionId ? await getSession(sessionId) : await getActiveSession();
    if (!session) {
      return NextResponse.json({ session: null, rows: [] }, { headers: noStore });
    }

    const rows = await getLeaderboard(session.id, limit);

    return NextResponse.json(
      {
        session: { id: session.id, name: session.name, status: session.status },
        rows: rows.map((r) => ({
          participant_id: r.participant_id,
          rank: r.rank,
          code: r.code,
          display_name: r.display_name,
          full_name: r.full_name,
          total_score: r.total_score,
          total_time_ms: r.total_time_ms,
          correct_count: r.correct_count,
          answered_count: r.answered_count,
          finished_at: r.finished_at,
        })),
      },
      { headers: noStore },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lỗi không xác định." },
      { status: 500 },
    );
  }
}

const noStore = { "Cache-Control": "no-store" };
