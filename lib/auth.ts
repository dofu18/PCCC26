import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const PARTICIPANT_COOKIE = "pccc_participant";
const ADMIN_COOKIE = "pccc_admin";
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000; // 12 tiếng — đủ cho một ngày sự kiện

function secret(): string {
  const value = process.env.APP_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "Thiếu APP_SECRET (tối thiểu 16 ký tự). Đây là chuỗi ngẫu nhiên dùng để ký cookie — xem .env.example.",
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function verify(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/* ── Thí sinh ─────────────────────────────────────────────── */

/**
 * Cookie định danh thí sinh được ký HMAC. Không ký thì bất kỳ ai đoán được
 * id cũng trả lời hộ người khác được.
 */
export async function setParticipantCookie(participantId: string): Promise<void> {
  const jar = await cookies();
  jar.set(PARTICIPANT_COOKIE, `${participantId}.${sign(participantId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 6,
  });
}

export async function readParticipantCookie(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(PARTICIPANT_COOKIE)?.value;
  if (!raw) return null;
  const at = raw.lastIndexOf(".");
  if (at <= 0) return null;
  const id = raw.slice(0, at);
  return verify(id, raw.slice(at + 1)) ? id : null;
}

export async function clearParticipantCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(PARTICIPANT_COOKIE);
}

/* ── Ban tổ chức ──────────────────────────────────────────── */

export function adminPasswordMatches(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    throw new Error("Thiếu ADMIN_PASSWORD. Xem .env.example.");
  }
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function setAdminCookie(): Promise<void> {
  const jar = await cookies();
  const payload = String(Date.now());
  jar.set(ADMIN_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_TTL_MS / 1000,
  });
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(ADMIN_COOKIE)?.value;
  if (!raw) return false;
  const at = raw.lastIndexOf(".");
  if (at <= 0) return false;
  const issued = raw.slice(0, at);
  if (!verify(issued, raw.slice(at + 1))) return false;
  const age = Date.now() - Number(issued);
  return Number.isFinite(age) && age >= 0 && age < ADMIN_TTL_MS;
}

export async function clearAdminCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

/**
 * Chặn cửa mọi server action của BTC. Server action gọi được bằng POST trực tiếp
 * nên phải kiểm tra ngay trong từng action, không dựa vào layout.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new Error("Cần đăng nhập ban tổ chức.");
  }
}
