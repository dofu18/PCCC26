import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase dùng service-role key. CHỈ chạy trên server.
 * Client trình duyệt không bao giờ nói chuyện trực tiếp với Supabase —
 * RLS đang bật và không có policy nào, nên anon key cũng không đọc được gì.
 */
let cached: SupabaseClient | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Thiếu biến môi trường ${name}. Xem .env.example và điền vào .env.local (hoặc thêm trên Vercel).`,
    );
  }
  return value;
}

export function db(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return cached;
}

/** Có đủ cấu hình để nói chuyện với DB hay chưa (dùng để hiện thông báo thân thiện). */
export function isConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
