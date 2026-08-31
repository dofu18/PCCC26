"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { ActionState, ImportState } from "../actions";
import {
  addQuestionAction,
  closeSessionAction,
  createSetAction,
  deleteQuestionAction,
  deleteSessionAction,
  deleteSetAction,
  importAction,
  loginAction,
  openSessionAction,
  resetSessionAction,
  saveSettingsAction,
} from "../actions";
import type { QuestionType, Settings } from "@/lib/types";

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

export function OpenSessionForm({ sets }: { sets: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(openSessionAction, idle);
  return (
    <form action={action}>
      <Feedback state={state} />
      <label className="field">
        <span className="field__label">Tên lượt thi</span>
        <input className="field__input" name="name" placeholder="Lượt 1 — Khoa Công nghệ" required />
      </label>
      <label className="field">
        <span className="field__label">Bộ câu hỏi</span>
        <select className="field__select" name="questionSetId" required>
          {sets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name}
            </option>
          ))}
        </select>
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

/* ── Nhập Excel ───────────────────────────────────────────── */

export function ImportForm({ setId }: { setId: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importAction, {
    status: "idle",
  });

  return (
    <form action={action}>
      <Feedback state={state} />
      <input type="hidden" name="setId" value={setId} />

      <label className="field">
        <span className="field__label">File Excel (.xlsx)</span>
        <input
          className="field__input"
          type="file"
          name="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
        />
        <span className="field__hint">
          Chưa có file? <a href="/admin/template">Tải file mẫu</a> rồi điền theo cột có sẵn.
        </span>
      </label>

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

/* ── Thêm câu hỏi thủ công ────────────────────────────────── */

export function AddQuestionForm({ setId }: { setId: string }) {
  const [state, action, pending] = useActionState(addQuestionAction, idle);
  const [type, setType] = useState<QuestionType>("single");
  const isChoice = type === "single" || type === "multi";

  return (
    <form action={action}>
      <Feedback state={state} />
      <input type="hidden" name="setId" value={setId} />

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
        <textarea className="field__input" name="content" rows={3} required />
      </label>

      <label className="field">
        <span className="field__label">URL ảnh (không bắt buộc)</span>
        <input className="field__input" name="image_url" placeholder="https://…" />
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
                <input type="checkbox" name="correct" value={index} />
                <span className="sr-only">Đáp án {key.toUpperCase()} là đúng</span>
              </label>
              <input
                className="field__input"
                name={`option_${key}`}
                placeholder={`Đáp án ${key.toUpperCase()}`}
              />
            </div>
          ))}
        </fieldset>
      ) : null}

      {type === "boolean" ? (
        <label className="field">
          <span className="field__label">Đáp án đúng</span>
          <select className="field__select" name="correctBoolean" defaultValue="true">
            <option value="true">Đúng</option>
            <option value="false">Sai</option>
          </select>
        </label>
      ) : null}

      {type === "text" ? (
        <label className="field">
          <span className="field__label">Đáp án đúng</span>
          <input className="field__input" name="correctText" placeholder="ABC" />
          <span className="field__hint">
            Nhiều cách viết thì cách nhau bằng dấu | — ví dụ <code>114 | một một bốn</code>. So khớp
            bỏ qua hoa thường và dấu.
          </span>
        </label>
      ) : null}

      <div style={{ display: "grid", gap: "var(--space-md)", gridTemplateColumns: "1fr 1fr" }}>
        <label className="field">
          <span className="field__label">Giây (trống = mặc định)</span>
          <input className="field__input num" name="time_limit_s" inputMode="numeric" />
        </label>
        <label className="field">
          <span className="field__label">Điểm (trống = mặc định)</span>
          <input className="field__input num" name="points" inputMode="numeric" />
        </label>
      </div>

      <label className="field">
        <span className="field__label">Giải thích hiện sau khi trả lời</span>
        <textarea className="field__input" name="explanation" rows={2} />
      </label>

      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? "Đang lưu…" : "Thêm câu hỏi"}
      </button>
    </form>
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
