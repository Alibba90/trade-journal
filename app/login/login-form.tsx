"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

export default function LoginForm() {
  const sp = useSearchParams();
  const checkEmail = sp.get("checkEmail");
  const emailParam = sp.get("email");

  const [email, setEmail] = useState(emailParam ?? "");
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

    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-50 px-4">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center py-10">
        <div className="w-full">

          {checkEmail && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Проверь почту{emailParam ? ` (${emailParam})` : ""}: мы отправили письмо для подтверждения.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              className="w-full border p-3 rounded-xl"
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="пароль"
              className="w-full border p-3 rounded-xl"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white p-3 rounded-xl"
            >
              {loading ? "Входим…" : "Войти"}
            </button>

            <div className="text-center text-sm">
              Нет аккаунта? <Link href="/register" className="underline">Регистрация</Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
