import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { buildQuestionTemplate } from "@/lib/excel";

/** File Excel mẫu để ban tổ chức điền câu hỏi. */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Cần đăng nhập ban tổ chức." }, { status: 401 });
  }

  const buffer = await buildQuestionTemplate();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="mau-cau-hoi-pccc26.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
