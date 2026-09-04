import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AddQuestionForm,
  DeleteQuestionButton,
  EditQuestionButton,
  ImportForm,
} from "../../_components/admin-forms";
import { getQuestionSetName, listQuestions } from "@/lib/admin-data";
import { describeCorrect } from "@/lib/answer-text";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<Question["type"], string> = {
  single: "1 đáp án",
  multi: "nhiều đáp án",
  boolean: "đúng/sai",
  text: "điền chữ",
};

export default async function QuestionSetPage({ params }: PageProps<"/admin/questions/[setId]">) {
  const { setId } = await params;
  const name = await getQuestionSetName(setId);
  if (!name) notFound();

  const questions = await listQuestions(setId);

  return (
    <>
      <section className="band band--paper">
        <div className="wrap wrap--wide">
          <p className="meta">
            <Link href="/admin/questions">← Tất cả bộ đề</Link>
          </p>
          <h1 className="display-s" style={{ marginBlock: "var(--space-sm) var(--space-lg)" }}>
            {name}
          </h1>
          <p className="lede">{questions.length} câu hỏi trong bộ đề này.</p>
        </div>
      </section>

      <section className="band band--paper2">
        <div className="wrap wrap--wide">
          <h2 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
            Nhập từ Excel
          </h2>
          <ImportForm setId={setId} />
        </div>
      </section>

      {questions.length > 0 ? (
        <section className="band band--paper">
          <div className="wrap wrap--wide">
            <h2 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
              Danh sách câu hỏi
            </h2>
            <div className="tablewrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Dạng</th>
                    <th>Câu hỏi</th>
                    <th>Đáp án đúng</th>
                    <th>Ảnh</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {questions.map((question) => (
                    <tr key={question.id}>
                      <td className="num">{question.order_index}</td>
                      <td>
                        <span className="tag">{TYPE_LABEL[question.type]}</span>
                      </td>
                      <td>{question.content}</td>
                      <td>{describeCorrect(question)}</td>
                      <td>{question.image_url ? "có" : "—"}</td>
                      <td>
                        <div className="btn-row">
                          <EditQuestionButton setId={setId} question={question} />
                          <DeleteQuestionButton questionId={question.id} setId={setId} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      <section className="band band--paper2">
        <div className="wrap wrap--wide">
          <h2 className="display-s" style={{ marginBottom: "var(--space-lg)" }}>
            Thêm câu hỏi thủ công
          </h2>
          <AddQuestionForm setId={setId} />
        </div>
      </section>
    </>
  );
}
