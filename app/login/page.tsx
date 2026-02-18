"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // после логина на главную (у тебя там дашборд)
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 px-4">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center py-10">
        <div className="w-full">
          {/* Brand */}
          <div className="mb-6 flex items-center justify-center">
            <div className="inline-flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-black text-white flex items-center justify-center font-extrabold tracking-tight">
                TJ
              </div>
              <div className="leading-tight">
                <div className="text-base font-semibold text-gray-900">Trade Journal</div>
                <div className="text-xs text-gray-500">Вход в аккаунт</div>
              </div>
            </div>
          </div>

          {/* Card */}
          <div className="rounded-3xl border bg-white shadow-sm">
            <div className="p-7 sm:p-8">
              <h1 className="text-xl font-bold text-gray-900">Войти</h1>
              <p className="mt-1 text-sm text-gray-600">
                Войди в систему, чтобы управлять процессом и улучшать результат.
              </p>

              {error ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="text-sm font-semibold text-gray-800">Email</label>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-[16px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-900 focus:ring-4 focus:ring-gray-200"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-800">Пароль</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-[16px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-900 focus:ring-4 focus:ring-gray-200"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-black px-4 py-3 font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? "Входим…" : "Войти"}
                </button>
                <Link href="/forgot-password" className="text-sm underline text-gray-700">
  Забыли пароль?
</Link>

                <div className="pt-2 text-center text-sm text-gray-600">
                  Нет аккаунта?{" "}
                  <Link href="/register" className="font-semibold text-gray-900 underline underline-offset-4">
                    Зарегистрироваться
                  </Link>
                </div>
              </form>
            </div>

            <div className="border-t bg-gray-50 px-7 py-4 text-center text-xs text-gray-500 rounded-b-3xl">
              © {new Date().getFullYear()} Trade Journal
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
