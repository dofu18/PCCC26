import { SettingsForm } from "../_components/admin-forms";
import { getSettings } from "@/lib/quiz";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <section className="band band--paper">
      <div className="wrap">
        <h1 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
          Cấu hình lượt thi
        </h1>

        <p className="notice" style={{ marginBottom: "var(--space-lg)" }}>
          Mỗi lượt thi ghi lại cấu hình tại thời điểm mở lượt. Sửa ở đây chỉ ảnh hưởng các lượt mở
          sau, không làm lệch điểm của lượt đang chạy hay đã kết thúc.
        </p>

        <SettingsForm settings={settings} />

        <div className="panel" style={{ marginTop: "var(--space-xl)" }}>
          <h3>Cách xếp hạng hiện tại</h3>
          <p style={{ color: "var(--color-ink-2)" }}>
            Không giới hạn thời gian mỗi câu. Xếp hạng theo <strong>số câu đúng</strong>; bằng số
            câu đúng thì ai <strong>tổng thời gian làm bài</strong> ít hơn xếp trên. Thời gian được
            cộng theo từng câu, tính từ lúc câu hiện ra tới lúc bấm trả lời — thời gian đọc giải
            thích giữa các câu không bị tính, nên đọc kỹ không làm mất thành tích. Thí sinh bí một
            câu có thể bấm “Bỏ qua câu này” — tính là sai và chuyển sang câu sau.
          </p>
        </div>
      </div>
    </section>
  );
}
