import Image from "next/image";
import type { ReactNode } from "react";

/** Nav N7 Brutal slab — huy hiệu BTC + wordmark + một dòng trạng thái, không có dãy link. */
export function Nav({ meta }: { meta?: ReactNode }) {
  return (
    <nav className="nav" aria-label="Chính">
      <span className="nav__brand">
        {/* Huy hiệu chi tiết: dưới 48px là phù hiệu nát thành vệt đỏ, 64px mới đọc rõ cánh. */}
        <Image
          className="nav__logo"
          src="/phoenix26.png"
          alt="Phoenix — ban tổ chức"
          width={321}
          height={384}
          priority
        />
        <span className="nav__mark">
          PCCC<span>26</span>
        </span>
      </span>
      {meta ? <span className="nav__meta">{meta}</span> : null}
    </nav>
  );
}

/** Footer Ft5 Statement. */
export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <p className="foot__say">Biết cách xử lý trước khi cần đến nó.</p>
        <div className="foot__meta">
          <span>Sự kiện PCCC26</span>
          <span>Đại học FPT</span>
          <span>Hỗ trợ tại bàn tiếp đón</span>
        </div>
      </div>
    </footer>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <path
        d="M8 24 l10 10 l18 -24"
        stroke="currentColor"
        strokeWidth="6"
        fill="none"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function CrossIcon() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <path
        d="M11 11 L33 33 M33 11 L11 33"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="square"
      />
    </svg>
  );
}

/** Thông báo khi thiếu biến môi trường — thà nói rõ hơn là trang trắng. */
export function SetupNotice() {
  return (
    <main className="band band--paper">
      <div className="wrap">
        <h1 className="display-s">Chưa cấu hình</h1>
        <p className="notice" style={{ marginTop: "var(--space-md)" }}>
          Web chưa có kết nối database. Tạo file <code>.env.local</code> theo{" "}
          <code>.env.example</code> rồi khởi động lại. Cần <code>SUPABASE_URL</code>,{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>, <code>ADMIN_PASSWORD</code> và{" "}
          <code>APP_SECRET</code>.
        </p>
      </div>
    </main>
  );
}

export function ErrorNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="band band--paper">
      <div className="wrap">
        <h1 className="display-s">{title}</h1>
        <div className="notice" style={{ marginTop: "var(--space-md)" }}>
          {children}
        </div>
      </div>
    </main>
  );
}
