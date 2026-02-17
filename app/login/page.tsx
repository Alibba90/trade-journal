"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoading(false);
      setErrorText(error.message);
      return;
    }

    // на всякий случай: проверим, что сессия реально появилась
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      setLoading(false);
      setErrorText("Сессия не сохранилась. Обнови страницу и попробуй снова.");
      return;
    }

    setLoading(false);
    router.replace("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-200 flex items-center justify-center p-8">
      <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2">Trade Journal</h1>
        <p className="text-gray-600 mb-6">Вход в аккаунт</p>

        <form onSubmit={onLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-gray-300"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Пароль
            </label>
            <input
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:ring-2 focus:ring-gray-300"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {errorText ? (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-3 text-sm">
              {errorText}
            </div>
          ) : null}

          <button
            className="w-full bg-black text-white rounded-xl py-3 font-semibold hover:bg-gray-900 transition disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "Входим..." : "Войти"}
          </button>

          <div className="text-sm text-gray-600 text-center">
            Нет аккаунта?{" "}
            <a className="text-black font-semibold hover:underline" href="/signup">
              Регистрация
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
