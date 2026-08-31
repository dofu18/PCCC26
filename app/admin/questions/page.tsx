import Link from "next/link";
import { CreateSetForm, DeleteSetButton } from "../_components/admin-forms";
import { listQuestionSets } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export default async function QuestionSetsPage() {
  const sets = await listQuestionSets();

  return (
    <>
      <section className="band band--paper">
        <div className="wrap wrap--wide">
          <h1 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
            Bộ câu hỏi
          </h1>

          {sets.length === 0 ? (
            <p className="notice" style={{ marginBottom: "var(--space-lg)" }}>
              Chưa có bộ đề nào. Tạo một bộ rồi nhập câu hỏi từ Excel hoặc thêm tay.
            </p>
          ) : (
            <div className="stack" style={{ marginBottom: "var(--space-xl)" }}>
              {sets.map((set) => (
                <div className="panel" key={set.id}>
                  <h3>{set.name}</h3>
                  <p className="meta">{set.question_count} câu hỏi</p>
                  <div className="btn-row" style={{ marginTop: "var(--space-sm)" }}>
                    <Link className="btn btn--ghost" href={`/admin/questions/${set.id}`}>
                      Mở bộ đề
                    </Link>
                    <DeleteSetButton setId={set.id} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <CreateSetForm />

          <p className="field__hint" style={{ marginTop: "var(--space-md)" }}>
            <a href="/admin/template">Tải file Excel mẫu</a> — có sẵn cột và sheet hướng dẫn.
          </p>
        </div>
      </section>
    </>
  );
}
