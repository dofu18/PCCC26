import { NextResponse } from "next/server";
import { answerDetails, leaderboardForExport } from "@/lib/admin-data";
import { isAdmin } from "@/lib/auth";
import { buildLeaderboardWorkbook, leaderboardFilename } from "@/lib/excel";
import { getSession } from "@/lib/quiz";

/** Tải bảng xếp hạng dạng .xlsx. Chỉ ban tổ chức đã đăng nhập tải được. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/export/[sessionId]">,
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Cần đăng nhập ban tổ chức." }, { status: 401 });
  }

  const { sessionId } = await params;
  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Không tìm thấy lượt thi." }, { status: 404 });
  }

  const [rows, details] = await Promise.all([
    leaderboardForExport(sessionId),
    answerDetails(sessionId),
  ]);

  const buffer = await buildLeaderboardWorkbook(session.name, rows, details);

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${leaderboardFilename(session.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
