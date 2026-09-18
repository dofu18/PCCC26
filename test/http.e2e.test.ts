/**
 * Integration test ở tầng HTTP: gọi thật vào dev server đang chạy.
 *
 *   npm run dev          (cửa sổ khác)
 *   npm run test:e2e
 *
 * Nếu server không chạy thì cả suite này được skip chứ không báo fail.
 */
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addQuestion, closeSession, createQuestionSet, openSession } from "@/lib/admin-data";
import { joinSession } from "@/lib/quiz";
import { db } from "@/lib/supabase";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const TAG = "[e2e-http]";
const TEST_EMAIL = "e2e-http@example.com";

/** Chuỗi này chỉ được xuất hiện SAU khi thí sinh đã trả lời. */
const SECRET_EXPLANATION = "GIAI-THICH-KHONG-DUOC-RO-TRUOC";

/** Probe ở top-level: `describe` chạy lúc collect, trước cả beforeAll, nên
 *  nếu để cờ này trong beforeAll thì it.skip luôn đọc được giá trị cũ. */
const serverUp = await (async () => {
  try {
    return (await fetch(BASE, { signal: AbortSignal.timeout(4000) })).ok;
  } catch {
    return false;
  }
})();

let setId: string;
let sessionId: string;
let participantCookie: string;
let adminCookie: string;

function sign(payload: string): string {
  return createHmac("sha256", process.env.APP_SECRET!).update(payload).digest("base64url");
}

async function cleanup() {
  const sessions = await db().from("sessions").select("id").like("name", `${TAG}%`);
  for (const row of sessions.data ?? []) await db().from("sessions").delete().eq("id", row.id);
  const sets = await db().from("question_sets").select("id").like("name", `${TAG}%`);
  for (const row of sets.data ?? []) await db().from("question_sets").delete().eq("id", row.id);
}

beforeAll(async () => {
  if (!serverUp) return;

  await cleanup();

  setId = await createQuestionSet(`${TAG} bộ đề`);
  await addQuestion(setId, {
    type: "single",
    content: "Câu hỏi kiểm tra HTTP",
    image_url: null,
    options: ["Alpha", "Beta", "Gamma", "Delta"],
    correct: [1],
    explanation: SECRET_EXPLANATION,
  });

  sessionId = await openSession(`${TAG} lượt`, setId);

  const join = await joinSession({
    code: "HE101010",
    fullName: "Ngô Thanh Vân",
    email: TEST_EMAIL,
    force: true,
  });
  if (join.status !== "ok") throw new Error("join thất bại");
  participantCookie = `pccc_participant=${join.participantId}.${sign(join.participantId)}`;

  const issued = String(Date.now());
  adminCookie = `pccc_admin=${issued}.${sign(issued)}`;
}, 60_000);

afterAll(async () => {
  if (serverUp) {
    await closeSession(sessionId).catch(() => undefined);
    await cleanup();
  }
}, 60_000);

const maybe = () => (serverUp ? it : it.skip);

describe("trang thí sinh qua HTTP", () => {
  maybe()("trang chủ hiện form vào phòng khi có lượt đang mở", async () => {
    const html = await (await fetch(BASE)).text();
    expect(html).toContain("Mã số sinh viên");
    expect(html).toContain("Vào phòng thi");
    expect(html).not.toContain("Chưa có lượt thi nào đang mở");
  });

  maybe()("chưa có cookie thì /quiz đẩy về trang chủ", async () => {
    const response = await fetch(`${BASE}/quiz`, { redirect: "manual" });
    expect([302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.get("location")).toContain("/");
  });

  maybe()("trang làm bài trả về câu hỏi và các đáp án", async () => {
    const html = await (
      await fetch(`${BASE}/quiz`, { headers: { cookie: participantCookie } })
    ).text();
    expect(html).toContain("Câu hỏi kiểm tra HTTP");
    for (const option of ["Alpha", "Beta", "Gamma", "Delta"]) {
      expect(html).toContain(option);
    }
    // React chèn <!-- --> giữa các đoạn text nối nhau, nên bỏ comment trước khi so.
    const text = html.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Câu 1 / 1");
  });

  maybe()("payload KHÔNG chứa đáp án đúng hay giải thích của câu chưa trả lời", async () => {
    const html = await (
      await fetch(`${BASE}/quiz`, { headers: { cookie: participantCookie } })
    ).text();

    // Giải thích chỉ được gửi sau khi trả lời.
    expect(html).not.toContain(SECRET_EXPLANATION);
    // Không có trường đáp án đúng trong payload gửi xuống client.
    expect(html).not.toMatch(/\\?"correct\\?"\s*:/);
    expect(html).not.toMatch(/correctDisplayIndexes/);
    expect(html).not.toMatch(/\\?"correct_?[a-zA-Z]*\\?"\s*:/);
  });

  maybe()("cookie bị sửa chữ ký thì không vào được bài", async () => {
    const [name, value] = participantCookie.split("=");
    const tampered = `${name}=${value.split(".")[0]}.chu-ky-gia`;
    const response = await fetch(`${BASE}/quiz`, {
      headers: { cookie: tampered },
      redirect: "manual",
    });
    expect([302, 303, 307, 308]).toContain(response.status);
  });
});

describe("màn chiếu và API", () => {
  maybe()("trang màn chiếu render được", async () => {
    const html = await (await fetch(`${BASE}/display`)).text();
    expect(html).toContain("Xếp hạng");
    expect(html).toContain(`${TAG} lượt`);
  });

  maybe()("API bảng xếp hạng trả về lượt đang mở, không kèm dữ liệu đề", async () => {
    const response = await fetch(`${BASE}/api/leaderboard`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const body = await response.json();
    expect(body.session.name).toBe(`${TAG} lượt`);
    expect(Array.isArray(body.rows)).toBe(true);
    // correct_count (số câu đúng) là dữ liệu công khai của bảng xếp hạng.
    // Thứ không được có là trường đáp án đúng và nội dung đề.
    const payload = JSON.stringify(body);
    expect(payload).not.toMatch(/"correct"\s*:/);
    expect(payload).not.toMatch(/"options"\s*:/);
    expect(payload).not.toMatch(/"explanation"\s*:/);
    expect(payload).not.toContain(SECRET_EXPLANATION);
    expect(payload).not.toContain("Câu hỏi kiểm tra HTTP");
  });
});

describe("trang quản trị qua HTTP", () => {
  maybe()("chưa đăng nhập thì thấy form đăng nhập, không thấy nội dung quản trị", async () => {
    const html = await (await fetch(`${BASE}/admin`)).text();
    expect(html).toContain("Mật khẩu ban tổ chức");
    expect(html).not.toContain("Reset session");
  });

  maybe()("đăng nhập rồi thấy lượt đang chạy", async () => {
    const html = await (await fetch(`${BASE}/admin`, { headers: { cookie: adminCookie } })).text();
    expect(html).toContain(`${TAG} lượt`);
    expect(html).toContain("Reset session");
    expect(html).toContain("Xuất Excel");
  });

  maybe()("cookie quản trị bị sửa thì vẫn bị chặn", async () => {
    const html = await (
      await fetch(`${BASE}/admin`, { headers: { cookie: "pccc_admin=123.chu-ky-gia" } })
    ).text();
    expect(html).toContain("Mật khẩu ban tổ chức");
  });

  maybe()("tải file mẫu cần đăng nhập", async () => {
    const anonymous = await fetch(`${BASE}/admin/template`);
    expect(anonymous.status).toBe(401);

    const authed = await fetch(`${BASE}/admin/template`, { headers: { cookie: adminCookie } });
    expect(authed.status).toBe(200);
    expect(authed.headers.get("content-type")).toContain("spreadsheetml");
    const size = (await authed.arrayBuffer()).byteLength;
    expect(size).toBeGreaterThan(3000);
  });

  maybe()("xuất Excel bảng xếp hạng cần đăng nhập", async () => {
    const anonymous = await fetch(`${BASE}/admin/export/${sessionId}`);
    expect(anonymous.status).toBe(401);

    const authed = await fetch(`${BASE}/admin/export/${sessionId}`, {
      headers: { cookie: adminCookie },
    });
    expect(authed.status).toBe(200);
    expect(authed.headers.get("content-disposition")).toContain(".xlsx");
    expect((await authed.arrayBuffer()).byteLength).toBeGreaterThan(3000);
  });
});
