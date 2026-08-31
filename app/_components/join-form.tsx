"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { joinAction, type JoinState } from "../actions";

const CODE_PATTERN = /^[A-Z]{2}\d{6}$/;

export function JoinForm() {
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState<JoinState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const normalizedCode = code.trim().toUpperCase();
  const codeInvalid = touched && normalizedCode.length > 0 && !CODE_PATTERN.test(normalizedCode);

  useEffect(() => {
    if (state.status === "duplicate") dialogRef.current?.showModal();
  }, [state]);

  function submit(force: boolean) {
    setTouched(true);
    startTransition(async () => {
      const next = await joinAction({ code: normalizedCode, fullName, force });
      setState(next);
    });
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
        noValidate
      >
        <label className="field">
          <span className="field__label">Mã số sinh viên</span>
          <input
            className="field__input field__input--code"
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="HE180234"
            maxLength={8}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={codeInvalid || undefined}
            aria-describedby="code-hint"
            required
          />
          <span className={`field__hint${codeInvalid ? " field__hint--error" : ""}`} id="code-hint">
            {codeInvalid
              ? "Mã số gồm hai chữ cái và sáu chữ số, ví dụ HE180234."
              : "Hai chữ cái, sáu chữ số — ví dụ HE180234."}
          </span>
        </label>

        <label className="field">
          <span className="field__label">Họ và tên</span>
          <input
            className="field__input"
            name="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Trần Minh Khôi"
            autoComplete="name"
            aria-describedby="name-hint"
            required
          />
          <span className="field__hint" id="name-hint">
            {normalizedCode && fullName.trim()
              ? `Tên hiển thị trên bảng xếp hạng: ${normalizedCode} - ${fullName.trim()}`
              : "Tên hiển thị trên bảng xếp hạng sẽ là “mã số - họ và tên”."}
          </span>
        </label>

        {state.status === "error" ? (
          <p className="notice" style={{ marginBottom: "var(--space-md)" }} role="alert">
            {state.message}
          </p>
        ) : null}

        <button
          className="btn btn--primary"
          type="submit"
          disabled={pending || !normalizedCode || !fullName.trim()}
        >
          {pending ? "Đang vào…" : "Vào phòng thi"}
        </button>
      </form>

      <dialog ref={dialogRef} aria-labelledby="dup-title">
        <div className="dlg">
          <h2 id="dup-title">MSSV này đã tham gia</h2>
          <p>
            Mã số <strong className="num">{normalizedCode}</strong> đã có{" "}
            {state.status === "duplicate" ? state.attempts : 1} lượt làm trong lượt thi này. Bạn có
            chắc muốn dùng MSSV này để tiếp tục? Bảng xếp hạng sẽ lấy lượt có điểm cao nhất.
          </p>
          <div className="btn-row">
            <button
              className="btn btn--primary"
              type="button"
              style={{ width: "auto" }}
              disabled={pending}
              onClick={() => {
                dialogRef.current?.close();
                submit(true);
              }}
            >
              Tiếp tục
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => {
                dialogRef.current?.close();
                setState({ status: "idle" });
              }}
            >
              Đổi mã số
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
