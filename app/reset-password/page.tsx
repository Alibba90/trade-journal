"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";

function parseHashTokens() {
  // Supabase часто редиректит на redirectTo с #access_token=...&refresh_token=...&type=recovery
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const s = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(s);

  const access_token = params.get("access_token") || "";
  const refresh_token = params.get("refresh_token") || "";
  const type = params.get("type") || "";
  return { access_token, refresh_token, type };
}

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      setOk(null);

      // 1) если в hash пришли токены — ставим сессию
      const { access_token, refresh_token } = parseHashTokens();
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          setErr("Не удалось открыть страницу сброса. Попробуйте запросить ссылку ещё раз.");
          setReady(true);
          return;
        }
      }

      // 2) проверяем есть ли пользователь
      const { data } = await supabase.auth.getUser();
      setAuthed(!!data.user);
      setReady(true);
    })();
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    if (!password || !password2) {
      setErr("Заполните оба поля.");
      return;
    }
    if (password.length < 8) {
      setErr("Пароль должен быть минимум 8 символов.");
      return;
    }
    if (password !== password2) {
      setErr("Пароли не совпадают.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErr(error.message);
    } else {
      setOk("Пароль обновлён. Теперь можно войти.");
      // чтобы не держать recovery-сессию
      await supabase.auth.signOut();
    }
    setLoading(false);
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-gray-600">Загрузка…</div>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border">
          <h1 className="text-2xl font-bold text-gray-900">Ссылка недействительна</h1>
          <p className="mt-2 text-sm text-gray-600">
            Ссылка могла устареть. Запросите сброс пароля заново.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/forgot-password"
              className="inline-flex w-full items-center justify-center rounded-xl bg-black px-4 py-3 text-white font-semibold hover:opacity-90"
            >
              Запросить новую ссылку
            </Link>
            <Link href="/login" className="text-center text-sm underline text-gray-700">
              Вернуться ко входу
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border">
        <h1 className="text-2xl font-bold text-gray-900">Новый пароль</h1>
        <p className="mt-2 text-sm text-gray-600">Придумайте новый пароль для аккаунта.</p>

        <form onSubmit={onSave} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Новый пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 8 символов"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Повторите пароль</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="Повторите пароль"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {err ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
          ) : null}

          {ok ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{ok}</div>
          ) : null}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-black px-4 py-3 text-white font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Сохраняем…" : "Сохранить пароль"}
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-600">
          <Link href="/login" className="underline">Перейти ко входу</Link>
        </div>
      </div>
    </main>
  );
}
