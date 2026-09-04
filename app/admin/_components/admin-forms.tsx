"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ActionState, ImportState } from "../actions";
import {
  addQuestionAction,
  closeSessionAction,
  createSetAction,
  deleteQuestionAction,
  deleteSessionAction,
  deleteSetAction,
  editQuestionAction,
  importAction,
  loginAction,
  openSessionAction,
  resetSessionAction,
  saveSettingsAction,
} from "../actions";
import type { Question, QuestionType, Settings } from "@/lib/types";

const idle: ActionState = { status: "idle" };

function Feedback({ state }: { state: ActionState | ImportState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className="notice"
      role={state.status === "error" ? "alert" : "status"}
      style={{ marginBottom: "var(--space-md)" }}
    >
      {state.message}
      {"rowErrors" in state && state.rowErrors?.length ? (
        <span style={{ display: "block", marginTop: "var(--space-xs)" }}>
          {state.rowErrors.slice(0, 12).map((row) => (
            <span key={row.row} style={{ display: "block" }}>
              Dòng {row.row}: {row.message}
            </span>
          ))}
          {state.rowErrors.length > 12 ? (
            <span style={{ display: "block" }}>
              …và {state.rowErrors.length - 12} dòng nữa.
            </span>
          ) : null}
        </span>
      ) : null}
    </p>
  );
}

/* ── Đăng nhập ────────────────────────────────────────────── */

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, idle);
  return (
    <form action={action}>
      <Feedback state={state} />
      <label className="field">
        <span className="field__label">Mật khẩu ban tổ chức</span>
        <input
          className="field__input"
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </label>
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? "Đang kiểm tra…" : "Vào trang quản trị"}
      </button>
    </form>
  );
}

/* ── Mở lượt ──────────────────────────────────────────────── */

export function OpenSessionForm({
  sets,
  questionsPerAttempt,
}: {
  sets: { id: string; name: string; question_count: number }[];
  questionsPerAttempt: number;
}) {
  const [state, action, pending] = useActionState(openSessionAction, idle);
  const [setId, setSetId] = useState(sets[0]?.id ?? "");
  const chosen = sets.find((s) => s.id === setId) ?? sets[0];

  // Rút nhiều hơn số câu có thì thực tế chỉ lấy được từng đó câu — báo trước để BTC
  // không tưởng thí sinh sẽ làm đủ số đã đặt.
  const short =
    questionsPerAttempt > 0 && chosen ? questionsPerAttempt > chosen.question_count : false;

  return (
    <form action={action}>
      <Feedback state={state} />
      <label className="field">
        <span className="field__label">Tên lượt thi</span>
        <input className="field__input" name="name" placeholder="Lượt 1 — Khoa Công nghệ" required />
      </label>
      <label className="field">
        <span className="field__label">Bộ câu hỏi</span>
        <select
          className="field__select"
          name="questionSetId"
          required
          value={setId}
          onChange={(event) => setSetId(event.target.value)}
        >
          {sets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name} ({set.question_count} câu)
            </option>
          ))}
        </select>
        <span className={short ? "field__hint field__hint--error" : "field__hint"}>
          {questionsPerAttempt > 0
            ? short
              ? `Cấu hình đang rút ${questionsPerAttempt} câu mỗi lượt nhưng bộ đề chỉ có ${chosen?.question_count ?? 0} câu — thí sinh sẽ làm hết bộ đề.`
              : `Mỗi thí sinh làm ${questionsPerAttempt} câu rút ngẫu nhiên từ bộ đề này.`
            : "Mỗi thí sinh làm hết bộ đề, thứ tự câu và đáp án được trộn riêng."}
        </span>
      </label>
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? "Đang mở…" : "Mở lượt thi"}
      </button>
    </form>
  );
}

/* ── Kết thúc lượt ────────────────────────────────────────── */

export function CloseSessionButton({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(closeSessionAction, idle);
  return (
    <form action={action} style={{ display: "contents" }}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <button className="btn btn--ghost" type="submit" disabled={pending}>
        {pending ? "Đang kết thúc…" : "Kết thúc lượt"}
      </button>
      {state.status === "error" ? (
        <p className="notice" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/* ── Reset lượt ───────────────────────────────────────────── */

export function ResetSessionForm({
  sessionId,
  sessionName,
  participantCount,
  finishedCount,
  suggestedName,
}: {
  sessionId: string;
  sessionName: string;
  participantCount: number;
  finishedCount: number;
  suggestedName: string;
}) {
  const [state, action, pending] = useActionState(resetSessionAction, idle);
  const [exported, setExported] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Chỉ tác động lên DOM (đóng dialog) — không setState trong effect.
  useEffect(() => {
    if (state.status === "ok") dialogRef.current?.close();
  }, [state]);

  return (
    <>
      <Feedback state={state} />
      <button
        className="btn btn--danger"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        Reset session
      </button>

      <dialog ref={dialogRef} aria-labelledby="reset-title">
        <div className="dlg">
          <h2 id="reset-title">Reset session?</h2>
          <p>
            “{sessionName}” ({participantCount} thí sinh, {finishedCount} bài đã nộp) sẽ được đóng
            và chuyển vào Lịch sử. Thí sinh đang làm bài sẽ bị ngắt. Dữ liệu không bị xoá — vẫn xuất
            lại Excel được.
          </p>

          <label className="dlg__check">
            <input
              type="checkbox"
              checked={exported}
              onChange={(event) => setExported(event.target.checked)}
            />
            <span>Tôi đã xuất file Excel bảng xếp hạng của lượt này.</span>
          </label>

          <form action={action}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <label className="field">
              <span className="field__label">Tên lượt tiếp theo</span>
              <input
                className="field__input"
                name="nextName"
                defaultValue={suggestedName}
                required
              />
            </label>
            <div className="btn-row">
              <button className="btn btn--danger" type="submit" disabled={!exported || pending}>
                {pending ? "Đang reset…" : "Reset session"}
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => dialogRef.current?.close()}
              >
                Huỷ
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

/* ── Xoá lượt trong lịch sử ───────────────────────────────── */

export function DeleteSessionButton({ sessionId, name }: { sessionId: string; name: string }) {
  const [state, action, pending] = useActionState(deleteSessionAction, idle);
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="btn btn--danger"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        Xoá lượt
      </button>
      {state.status === "error" ? (
        <p className="notice" role="alert">
          {state.message}
        </p>
      ) : null}

      <dialog ref={dialogRef}>
        <div className="dlg">
          <h2>Xoá “{name}”?</h2>
          <p>
            Xoá vĩnh viễn lượt này cùng toàn bộ thí sinh và câu trả lời. Không lấy lại được. Nếu chỉ
            muốn dừng lượt thì dùng “Kết thúc lượt”.
          </p>
          <form action={action}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <div className="btn-row">
              <button className="btn btn--danger" type="submit" disabled={pending}>
                {pending ? "Đang xoá…" : "Xoá vĩnh viễn"}
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => dialogRef.current?.close()}
              >
                Huỷ
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

/* ── Bộ đề ────────────────────────────────────────────────── */

export function CreateSetForm() {
  const [state, action, pending] = useActionState(createSetAction, idle);
  return (
    <form action={action}>
      <Feedback state={state} />
      <label className="field">
        <span className="field__label">Tên bộ đề mới</span>
        <input className="field__input" name="name" placeholder="PCCC cơ bản" required />
      </label>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Đang tạo…" : "Tạo bộ đề"}
      </button>
    </form>
  );
}

export function DeleteSetButton({ setId }: { setId: string }) {
  const [state, action, pending] = useActionState(deleteSetAction, idle);
  return (
    <form action={action} style={{ display: "contents" }}>
      <input type="hidden" name="setId" value={setId} />
      <button className="btn btn--ghost" type="submit" disabled={pending}>
        Xoá
      </button>
      {state.status === "error" ? (
        <p className="notice" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/* ── Hướng dẫn cấu trúc file Excel ────────────────────────── */

/** Đúng theo `QUESTION_HEADERS` và `parseQuestionWorkbook` trong `lib/excel.ts`. */
const EXCEL_COLUMNS: { name: string; required: string; how: ReactNode }[] = [
  {
    name: "type",
    required: "Bắt buộc",
    how: (
      <>
        Dạng câu: <code>single</code> (1 đáp án) · <code>multi</code> (nhiều đáp án) ·{" "}
        <code>boolean</code> (Đúng/Sai) · <code>text</code> (thí sinh gõ chữ).
      </>
    ),
  },
  { name: "question", required: "Bắt buộc", how: <>Nội dung câu hỏi.</> },
  {
    name: "correct",
    required: "Bắt buộc",
    how: <>Đáp án đúng — điền theo từng dạng câu, xem bảng bên dưới.</>,
  },
  {
    name: "option_a → option_d",
    required: "Với single / multi",
    how: (
      <>
        Nội dung từng đáp án. Bỏ trống với <code>boolean</code> và <code>text</code>. Cần nhiều hơn 4
        đáp án thì thêm cột <code>option_e</code>, <code>option_f</code>… tối đa tới{" "}
        <code>option_j</code>.
      </>
    ),
  },
  {
    name: "image",
    required: "Không",
    how: (
      <>
        URL ảnh <strong>công khai</strong> cho câu hỏi. Link Google Drive dạng chia sẻ sẽ được tự
        chuyển sang dạng xem trực tiếp.
      </>
    ),
  },
  {
    name: "time_limit",
    required: "Không",
    how: <>Số giây riêng cho câu này. Bỏ trống = dùng mặc định của lượt (đặt ở trang Cấu hình).</>,
  },
  {
    name: "points",
    required: "Không",
    how: <>Điểm tối đa của câu. Bỏ trống = dùng mặc định của lượt.</>,
  },
  {
    name: "explanation",
    required: "Không",
    how: <>Giải thích hiện ra ngay sau khi thí sinh trả lời. Nên có.</>,
  },
];

const CORRECT_BY_TYPE: { type: string; value: string; note: string }[] = [
  { type: "single", value: "B", note: "Một chữ cái đáp án. Dùng số cũng được: 2 = đáp án thứ hai." },
  {
    type: "multi",
    value: "A,B,C",
    note: "Nhiều chữ cái cách nhau bởi dấu phẩy. Thí sinh phải chọn đúng hết mới được điểm.",
  },
  { type: "boolean", value: "FALSE", note: "TRUE / FALSE, hoặc Đúng / Sai, hoặc 1 / 0." },
  {
    type: "text",
    value: "bình ABC|ABC",
    note: "Đáp án chữ. Nhiều cách viết đều được tính đúng thì cách nhau bởi dấu |",
  },
];

/** Nút "?" mở bảng giải thích cấu trúc file Excel. */
export function ExcelFormatHelp() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="help"
        type="button"
        aria-label="Cấu trúc file Excel cần như thế nào?"
        title="Cấu trúc file Excel cần như thế nào?"
        onClick={() => dialogRef.current?.showModal()}
      >
        ?
      </button>

      <dialog ref={dialogRef} className="dialog--wide" aria-labelledby="xlsx-help-title">
        <div className="dlg dlg--scroll">
          <h2 id="xlsx-help-title">Cấu trúc file Excel</h2>
          <p>
            Mỗi <strong>một dòng là một câu hỏi</strong>. Dòng đầu tiên phải là dòng tên cột — thứ tự
            cột không quan trọng vì hệ thống đọc theo tên. Chỉ sheet đầu tiên được đọc, dòng trống bị
            bỏ qua.
          </p>

          <h3>Các cột</h3>
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tên cột</th>
                  <th>Bắt buộc</th>
                  <th>Cách điền</th>
                </tr>
              </thead>
              <tbody>
                {EXCEL_COLUMNS.map((column) => (
                  <tr key={column.name}>
                    <td>
                      <code>{column.name}</code>
                    </td>
                    <td className={column.required === "Bắt buộc" ? "req" : undefined}>
                      {column.required}
                    </td>
                    <td>{column.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>
            Cột <code>correct</code> điền theo dạng câu
          </h3>
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>type</th>
                  <th>Ví dụ correct</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {CORRECT_BY_TYPE.map((row) => (
                  <tr key={row.type}>
                    <td>
                      <code>{row.type}</code>
                    </td>
                    <td>
                      <code>{row.value}</code>
                    </td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Ví dụ một dòng hoàn chỉnh</h3>
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>type</th>
                  <th>question</th>
                  <th>option_a</th>
                  <th>option_b</th>
                  <th>option_c</th>
                  <th>option_d</th>
                  <th>correct</th>
                  <th>time_limit</th>
                  <th>points</th>
                  <th>explanation</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>single</td>
                  <td>Số điện thoại gọi Cảnh sát phòng cháy chữa cháy là số nào?</td>
                  <td>113</td>
                  <td>114</td>
                  <td>115</td>
                  <td>116</td>
                  <td>B</td>
                  <td>20</td>
                  <td>1000</td>
                  <td>114 là số của Cảnh sát PCCC và cứu nạn cứu hộ.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>Lưu ý khi soạn đề</h3>
          <ul>
            <li>
              Đáp án <code>text</code> được so khớp{" "}
              <strong>bỏ qua hoa/thường, dấu câu và dấu tiếng Việt</strong> — “Bình ABC” và “binh
              abc” đều tính đúng.
            </li>
            <li>
              Thứ tự câu và thứ tự đáp án được <strong>trộn riêng cho từng thí sinh</strong>, nên
              đừng soạn câu kiểu “cả A và B đều đúng”.
            </li>
            <li>Trả lời càng nhanh thì càng nhiều điểm. Trả lời sai không bị trừ điểm.</li>
            <li>
              Nếu file có dòng sai định dạng, hệ thống <strong>không lưu gì cả</strong> và báo rõ sai
              ở dòng nào — sửa rồi nhập lại là được.
            </li>
            <li>
              File tối đa 8 MB, định dạng <code>.xlsx</code> (không nhận <code>.xls</code> hay{" "}
              <code>.csv</code>).
            </li>
          </ul>

          <div className="dlg__foot btn-row">
            <a className="btn" href="/admin/template">
              Tải file mẫu
            </a>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => dialogRef.current?.close()}
            >
              Đóng
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/* ── Nhập Excel ───────────────────────────────────────────── */

export function ImportForm({ setId }: { setId: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importAction, {
    status: "idle",
  });

  return (
    <form action={action}>
      <Feedback state={state} />
      <input type="hidden" name="setId" value={setId} />

      {/* Không bọc cả khối trong <label>: nút "?" nằm trong label sẽ bị click lây sang input file. */}
      <div className="field">
        <div className="field__labelrow">
          <span className="field__label" id="xlsx-file-label">
            File Excel (.xlsx)
          </span>
          <ExcelFormatHelp />
        </div>
        <input
          className="field__input"
          type="file"
          name="file"
          aria-labelledby="xlsx-file-label"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
        />
        <span className="field__hint">
          Chưa có file? <a href="/admin/template">Tải file mẫu</a> rồi điền theo cột có sẵn — bấm{" "}
          <strong>?</strong> ở trên để xem cần những cột gì.
        </span>
      </div>

      <label className="field">
        <span className="field__label">Cách nhập</span>
        <select className="field__select" name="mode" defaultValue="append">
          <option value="append">Thêm vào cuối bộ đề</option>
          <option value="replace">Thay toàn bộ câu hỏi cũ</option>
        </select>
      </label>

      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? "Đang đọc file…" : "Nhập câu hỏi"}
      </button>
    </form>
  );
}

/* ── Thêm / sửa câu hỏi thủ công ──────────────────────────── */

/**
 * Một form dùng cho cả thêm mới và sửa: truyền `question` là vào chế độ sửa.
 * Giữ chung một bản để hai luồng không lệch nhau khi thêm dạng câu mới.
 */
export function QuestionForm({
  setId,
  question,
  onDone,
}: {
  setId: string;
  question?: Question;
  onDone?: () => void;
}) {
  const editing = Boolean(question);
  const [state, action, pending] = useActionState(
    editing ? editQuestionAction : addQuestionAction,
    idle,
  );
  const [type, setType] = useState<QuestionType>(question?.type ?? "single");
  const isChoice = type === "single" || type === "multi";

  const options = question?.options ?? [];
  const correctIndexes = new Set(
    question && (question.type === "single" || question.type === "multi")
      ? question.correct.map((c) => Number(c))
      : [],
  );
  const correctBoolean =
    question?.type === "boolean" ? String(question.correct[0] === true) : "true";
  const correctText = question?.type === "text" ? question.correct.map(String).join(" | ") : "";

  // Đóng form sửa ngay khi lưu xong để danh sách hiện lại nội dung mới.
  useEffect(() => {
    if (editing && state.status === "ok") onDone?.();
  }, [editing, state, onDone]);

  return (
    <form action={action}>
      <Feedback state={state} />
      <input type="hidden" name="setId" value={setId} />
      {question ? <input type="hidden" name="questionId" value={question.id} /> : null}

      <label className="field">
        <span className="field__label">Dạng câu</span>
        <select
          className="field__select"
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value as QuestionType)}
        >
          <option value="single">Trắc nghiệm một đáp án</option>
          <option value="multi">Trắc nghiệm nhiều đáp án</option>
          <option value="boolean">Đúng / Sai</option>
          <option value="text">Điền đáp án ngắn</option>
        </select>
      </label>

      <label className="field">
        <span className="field__label">Nội dung câu hỏi</span>
        <textarea
          className="field__input"
          name="content"
          rows={3}
          defaultValue={question?.content ?? ""}
          required
        />
      </label>

      <label className="field">
        <span className="field__label">URL ảnh (không bắt buộc)</span>
        <input
          className="field__input"
          name="image_url"
          placeholder="https://…"
          defaultValue={question?.image_url ?? ""}
        />
      </label>

      {isChoice ? (
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 var(--space-md)" }}>
          <legend className="field__label">Đáp án — tick vào ô đúng</legend>
          {["a", "b", "c", "d", "e", "f"].map((key, index) => (
            <div
              key={key}
              style={{ display: "flex", gap: "var(--space-xs)", marginBottom: "var(--space-xs)" }}
            >
              <label
                className="dlg__check"
                style={{ margin: 0, padding: "var(--space-xs)", flex: "0 0 auto" }}
              >
                <input
                  type="checkbox"
                  name="correct"
                  value={index}
                  defaultChecked={correctIndexes.has(index)}
                />
                <span className="sr-only">Đáp án {key.toUpperCase()} là đúng</span>
              </label>
              <input
                className="field__input"
                name={`option_${key}`}
                placeholder={`Đáp án ${key.toUpperCase()}`}
                defaultValue={options[index] ?? ""}
              />
            </div>
          ))}
        </fieldset>
      ) : null}

      {type === "boolean" ? (
        <label className="field">
          <span className="field__label">Đáp án đúng</span>
          <select className="field__select" name="correctBoolean" defaultValue={correctBoolean}>
            <option value="true">Đúng</option>
            <option value="false">Sai</option>
          </select>
        </label>
      ) : null}

      {type === "text" ? (
        <label className="field">
          <span className="field__label">Đáp án đúng</span>
          <input
            className="field__input"
            name="correctText"
            placeholder="ABC"
            defaultValue={correctText}
          />
          <span className="field__hint">
            Nhiều cách viết thì cách nhau bằng dấu | — ví dụ <code>114 | một một bốn</code>. So khớp
            bỏ qua hoa thường và dấu.
          </span>
        </label>
      ) : null}

      <div style={{ display: "grid", gap: "var(--space-md)", gridTemplateColumns: "1fr 1fr" }}>
        <label className="field">
          <span className="field__label">Giây (trống = mặc định)</span>
          <input
            className="field__input num"
            name="time_limit_s"
            inputMode="numeric"
            defaultValue={question?.time_limit_s ?? ""}
          />
        </label>
        <label className="field">
          <span className="field__label">Điểm (trống = mặc định)</span>
          <input
            className="field__input num"
            name="points"
            inputMode="numeric"
            defaultValue={question?.points ?? ""}
          />
        </label>
      </div>

      <label className="field">
        <span className="field__label">Giải thích hiện sau khi trả lời</span>
        <textarea
          className="field__input"
          name="explanation"
          rows={2}
          defaultValue={question?.explanation ?? ""}
        />
      </label>

      <div className="btn-row">
        <button className="btn btn--primary" type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : editing ? "Lưu câu hỏi" : "Thêm câu hỏi"}
        </button>
        {editing ? (
          <button className="btn btn--ghost" type="button" onClick={onDone}>
            Huỷ
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function AddQuestionForm({ setId }: { setId: string }) {
  return <QuestionForm setId={setId} />;
}

/** Nút "Sửa" mở form câu hỏi trong dialog — danh sách là bảng nên không chèn form inline được. */
export function EditQuestionButton({ setId, question }: { setId: string; question: Question }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="btn btn--ghost"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        Sửa
      </button>

      <dialog ref={dialogRef} className="dialog--wide" aria-labelledby={`edit-${question.id}`}>
        <div className="dlg dlg--scroll">
          <h2 id={`edit-${question.id}`}>Sửa câu {question.order_index}</h2>
          <QuestionForm
            setId={setId}
            question={question}
            onDone={() => dialogRef.current?.close()}
          />
        </div>
      </dialog>
    </>
  );
}

export function DeleteQuestionButton({
  questionId,
  setId,
}: {
  questionId: string;
  setId: string;
}) {
  const [, action, pending] = useActionState(deleteQuestionAction, idle);
  return (
    <form action={action} style={{ display: "contents" }}>
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="setId" value={setId} />
      <button className="btn btn--ghost" type="submit" disabled={pending}>
        Xoá
      </button>
    </form>
  );
}

/* ── Cấu hình ─────────────────────────────────────────────── */

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, idle);
  return (
    <form action={action}>
      <Feedback state={state} />

      <div style={{ display: "grid", gap: "var(--space-md)", gridTemplateColumns: "1fr 1fr" }}>
        <label className="field">
          <span className="field__label">Giây mỗi câu</span>
          <input
            className="field__input num"
            name="default_time_limit_s"
            inputMode="numeric"
            defaultValue={settings.default_time_limit_s}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">Điểm mỗi câu</span>
          <input
            className="field__input num"
            name="default_points"
            inputMode="numeric"
            defaultValue={settings.default_points}
            required
          />
        </label>
      </div>

      <label className="field">
        <span className="field__label">Số câu mỗi lượt</span>
        <input
          className="field__input num"
          name="questions_per_attempt"
          inputMode="numeric"
          placeholder="Để trống = lấy hết bộ đề"
          defaultValue={settings.questions_per_attempt > 0 ? settings.questions_per_attempt : ""}
        />
        <span className="field__hint">
          Rút ngẫu nhiên từng đó câu từ bộ đề cho mỗi thí sinh. Để trống (hoặc 0) thì ai cũng làm
          hết bộ đề, chỉ khác thứ tự.
        </span>
      </label>

      <label className="dlg__check">
        <input type="checkbox" name="speed_bonus" defaultChecked={settings.speed_bonus} />
        <span>
          Trả lời càng nhanh càng nhiều điểm. Tắt thì mọi câu đúng được điểm bằng nhau.
        </span>
      </label>

      <label className="dlg__check">
        <input type="checkbox" name="show_feedback" defaultChecked={settings.show_feedback} />
        <span>Hiện đúng/sai và giải thích ngay sau mỗi câu.</span>
      </label>

      <label className="dlg__check">
        <input
          type="checkbox"
          name="multi_all_or_nothing"
          defaultChecked={settings.multi_all_or_nothing}
        />
        <span>
          Câu nhiều đáp án: phải đúng hết mới được điểm. Tắt thì tính điểm từng phần.
        </span>
      </label>

      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? "Đang lưu…" : "Lưu cấu hình"}
      </button>
    </form>
  );
}
