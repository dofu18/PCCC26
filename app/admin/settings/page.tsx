import { SettingsForm } from "../_components/admin-forms";
import { getSettings } from "@/lib/quiz";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <section className="band band--paper">
      <div className="wrap">
        <h1 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
          Cấu hình chấm điểm
        </h1>

        <p className="notice" style={{ marginBottom: "var(--space-lg)" }}>
          Mỗi lượt thi ghi lại cấu hình tại thời điểm mở lượt. Sửa ở đây chỉ ảnh hưởng các lượt mở
          sau, không làm lệch điểm của lượt đang chạy hay đã kết thúc.
        </p>

        <SettingsForm settings={settings} />

        <div className="panel" style={{ marginTop: "var(--space-xl)" }}>
          <h3>Cách tính điểm hiện tại</h3>
          <p style={{ color: "var(--color-ink-2)" }}>
            Sai hoặc hết giờ được 0 điểm, không bị trừ. Trả lời đúng được{" "}
            <strong className="num">{settings.default_points}</strong> điểm nếu bấm gần như tức thì,
            giảm dần còn khoảng một nửa nếu trả lời sát hết giờ
            {settings.speed_bonus ? "" : " (đang tắt — mọi câu đúng bằng điểm nhau)"}. Đồng điểm thì
            ai tổng thời gian ít hơn xếp trên.
          </p>
        </div>
      </div>
    </section>
  );
}
