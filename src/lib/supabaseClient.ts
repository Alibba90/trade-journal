import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ⚠️ ВАЖНО: если эти env пустые — сразу увидишь ошибку в консоли.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("SUPABASE ENV MISSING", {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey ? "***" : "",
  });
}

// ✅ “маячок”, чтобы ты видел в браузере, что подхватился именно этот файл:
;(globalThis as any).__SUPABASE_CLIENT_VERSION__ = "V2";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);