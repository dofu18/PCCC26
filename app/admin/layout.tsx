import Link from "next/link";
import { Nav, SetupNotice } from "../_components/chrome";
import { LoginForm } from "./_components/admin-forms";
import { logoutAction } from "./actions";
import { isAdmin } from "@/lib/auth";
import { isConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "PCCC26 · Ban tổ chức",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  if (!isConfigured()) return <SetupNotice />;

  if (!(await isAdmin())) {
    return (
      <main className="page-in">
        <section className="band band--ink band--tight">
          <div className="wrap">
            <Nav meta="Ban tổ chức" />
          </div>
        </section>
        <section className="band band--paper">
          <div className="wrap">
            <h1 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
              Đăng nhập
            </h1>
            <LoginForm />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-in">
      <section className="band band--paper2 band--tight">
        <div className="wrap wrap--wide">
          <Nav meta="Ban tổ chức" />
          <div
            className="btn-row"
            style={{ marginTop: "var(--space-sm)", gap: "var(--space-xs)" }}
          >
            <Link className="btn btn--ghost" href="/admin">
              Lượt thi
            </Link>
            <Link className="btn btn--ghost" href="/admin/questions">
              Câu hỏi
            </Link>
            <Link className="btn btn--ghost" href="/admin/history">
              Lịch sử
            </Link>
            <Link className="btn btn--ghost" href="/admin/settings">
              Cấu hình
            </Link>
            <Link className="btn btn--ghost" href="/display" target="_blank">
              Màn chiếu
            </Link>
            <form action={logoutAction} style={{ display: "contents" }}>
              <button className="btn btn--ghost" type="submit">
                Đăng xuất
              </button>
            </form>
          </div>
        </div>
      </section>
      {children}
    </main>
  );
}
