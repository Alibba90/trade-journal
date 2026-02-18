"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErr("Введите email.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setErr(error.message);
    } else {
      setMsg("Ссылка для сброса пароля отправлена на почту. Проверьте входящие и «Спам».");
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border">
        <h1 className="text-2xl font-bold text-gray-900">Сброс пароля</h1>
        <p className="mt-2 text-gray-600 text-sm">
          Введите email — мы отправим ссылку для смены пароля.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@mail.com"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {err ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
          ) : null}

          {msg ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>
          ) : null}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-black px-4 py-3 text-white font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Отправляем…" : "Отправить ссылку"}
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-600">
          <Link href="/login" className="underline">Вернуться ко входу</Link>
        </div>
      </div>
    </main>
  );
}
