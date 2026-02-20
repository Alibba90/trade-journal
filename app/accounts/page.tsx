"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

type Account = {
  id: string;
  account_number: string | null;
  firm: string | null;
  size: number | null;
  phase: "phase1" | "phase2" | "live" | string | null;
  balance: number | null;
  max_drawdown_percent: number | null;
  profit_target_percent: number | null;
  status?: string | null;
};

function fmtMoney(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtUsd(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$ ${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtPercent(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(2)}%`;
}

function phaseLabel(p: Account["phase"]) {
  if (p === "phase1") return "Фаза 1";
  if (p === "phase2") return "Фаза 2";
  if (p === "live") return "Лайв";
  return p ?? "—";
}

// ✅ слитые: status=blown OR balance <= size*0.9
function isBlown(a: Account) {
  const st = String(a.status || "").toLowerCase().trim();
  if (st === "blown" || st === "slit" || st === "слил") return true;
  const size = Number(a.size) || 0;
  const bal = Number(a.balance) || 0;
  if (!size) return false;
  return bal <= size * 0.9;
}

export default function AccountsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string>("");

  async function load() {
    setLoading(true);
    setError("");

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      setLoading(false);
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("accounts")
      .select("id, account_number, firm, size, phase, balance, max_drawdown_percent, profit_target_percent, status, created_at")
      .order("created_at", { ascending: true });

    if (error) setError(error.message);
    setAccounts((data as Account[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { activeAccounts, blownAccounts, totalAlloc, blownTotalAlloc } = useMemo(() => {
    const blown = accounts.filter((a) => isBlown(a));
    const active = accounts.filter((a) => !isBlown(a));

    const sumSize = (arr: Account[]) => arr.reduce((s, a) => s + (Number(a.size) || 0), 0);

    return {
      activeAccounts: active,
      blownAccounts: blown,
      totalAlloc: sumSize(active),
      blownTotalAlloc: sumSize(blown),
    };
  }, [accounts]);

  async function handleDelete(id: string) {
    const ok = confirm("Удалить этот счёт? Это действие нельзя отменить.");
    if (!ok) return;

    setBusyId(id);
    setError("");

    const { error } = await supabase.from("accounts").delete().eq("id", id);

    setBusyId(null);

    if (error) {
      setError(error.message);
      return;
    }

    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  // ✅ вывод прибыли для LIVE
  async function handlePayout(a: Account) {
    const size = Number(a.size) || 0;
    const bal = Number(a.balance) || 0;
    const profit = bal - size;

    if (a.phase !== "live") return;
    if (profit <= 0) {
      alert("Профита нет — выводить нечего.");
      return;
    }

    const ok = confirm(`Вывести прибыль ${fmtUsd(profit)}?\nПосле вывода баланс лайва станет ${fmtMoney(size)}.`);
    if (!ok) return;

    setBusyId(a.id);
    setError("");

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      setBusyId(null);
      alert("Сессия не найдена. Перезайди в аккаунт.");
      router.push("/login");
      return;
    }

    const userId = authData.user.id;

    // 1) записываем выплату
    const { error: insErr } = await supabase.from("payouts").insert([
      {
        user_id: userId,
        account_id: a.id,
        amount: profit,
      },
    ]);

    if (insErr) {
      setBusyId(null);
      setError(insErr.message);
      return;
    }

    // 2) обнуляем лайв к size
    const { error: updErr } = await supabase.from("accounts").update({ balance: size }).eq("id", a.id);

    setBusyId(null);

    if (updErr) {
      setError(updErr.message);
      return;
    }

    // локально обновим
    setAccounts((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, balance: size } : x))
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-5xl">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Счета</h1>
            <p className="text-gray-600 mt-1">
              Активная аллокация: <span className="font-semibold text-gray-900">{fmtMoney(totalAlloc)}</span>
              {blownAccounts.length > 0 && (
                <>
                  {" "}
                  • Слитые: <span className="font-semibold text-gray-900">{fmtMoney(blownTotalAlloc)}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 border bg-white text-gray-900 hover:bg-gray-100 transition"
              title="На главную"
            >
              ← Главная
            </Link>

            <Link
              href="/accounts/new"
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 border bg-white text-gray-900 hover:bg-gray-100 transition"
              title="Добавить новый счёт"
            >
              + Добавить счёт
            </Link>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {/* Empty */}
        {!loading && accounts.length === 0 && (
          <div className="rounded-2xl border bg-white p-8 text-center">
            <h2 className="text-xl font-semibold text-gray-900">Счетов пока нет</h2>
            <p className="text-gray-600 mt-2">
              Добавь первый счёт — и начнём считать прогресс, лимиты и аналитику.
            </p>
            <Link
              href="/accounts/new"
              className="mt-6 inline-flex items-center justify-center rounded-xl px-5 py-3 bg-black text-white font-semibold hover:opacity-90 transition"
            >
              Добавить счёт
            </Link>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-2xl border bg-white p-8">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 rounded w-48" />
              <div className="h-20 bg-gray-200 rounded" />
              <div className="h-20 bg-gray-200 rounded" />
              <div className="h-20 bg-gray-200 rounded" />
            </div>
          </div>
        )}

        {/* Active list */}
        {!loading && activeAccounts.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Активные счета</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeAccounts.map((a) => {
                const isLive = a.phase === "live";
                const profit = (Number(a.balance) || 0) - (Number(a.size) || 0);
                const canPayout = isLive && profit > 0;

                return (
                  <div key={a.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-bold text-gray-900 truncate">
                          {a.account_number || "Без номера"}{" "}
                          <span className="text-gray-400 font-semibold">•</span>{" "}
                          <span className="text-gray-700 font-semibold">{a.firm || "—"}</span>{" "}
                          <span className="text-gray-400 font-semibold">•</span>{" "}
                          <span className="text-gray-900">{fmtMoney(a.size)}</span>
                        </div>

                        <div className="text-sm text-gray-600 mt-1">
                          Этап: {phaseLabel(a.phase)} •{" "}
                          {!isLive ? (
                            <>
                              Цель: {fmtPercent(a.profit_target_percent)} •{" "}
                            </>
                          ) : (
                            <>
                              Профит:{" "}
                              <span className={profit > 0 ? "font-semibold text-green-700" : profit < 0 ? "font-semibold text-red-700" : "font-semibold text-gray-900"}>
                                {fmtUsd(profit)}
                              </span>{" "}
                              •{" "}
                            </>
                          )}
                          Просадка: {fmtPercent(a.max_drawdown_percent)} • Баланс:{" "}
                          <span className="font-semibold text-gray-900">{fmtMoney(a.balance)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {canPayout ? (
                          <button
                            onClick={() => handlePayout(a)}
                            disabled={busyId === a.id}
                            className="rounded-lg px-3 py-2 border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition disabled:opacity-60"
                            title="Вывести прибыль (лайв обнулится до размера)"
                          >
                            {busyId === a.id ? "…" : "💸"}
                          </button>
                        ) : null}

                        <Link
                          href={`/accounts/edit?id=${a.id}`}
                          className="rounded-lg px-3 py-2 border bg-white text-gray-900 hover:bg-gray-100 transition"
                          title="Редактировать счёт"
                        >
                          ✎
                        </Link>

                        <button
                          onClick={() => handleDelete(a.id)}
                          disabled={busyId === a.id}
                          className="rounded-lg px-3 py-2 border border-red-200 bg-white text-red-600 hover:bg-red-50 transition disabled:opacity-60"
                          title="Удалить счёт"
                        >
                          {busyId === a.id ? "…" : "🗑"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Blown list */}
        {!loading && blownAccounts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Слитые счета{" "}
                <span className="text-gray-500 font-medium">
                  ({blownAccounts.length} • {fmtMoney(blownTotalAlloc)})
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {blownAccounts.map((a) => (
                <div
                  key={a.id}
                  className="rounded-2xl border border-red-200 bg-red-50/40 p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-lg font-bold text-gray-900 truncate">
                        {a.account_number || "Без номера"}{" "}
                        <span className="text-gray-400 font-semibold">•</span>{" "}
                        <span className="text-gray-700 font-semibold">{a.firm || "—"}</span>{" "}
                        <span className="text-gray-400 font-semibold">•</span>{" "}
                        <span className="text-gray-900">{fmtMoney(a.size)}</span>
                      </div>

                      <div className="text-sm text-gray-700 mt-1">
                        Статус: <span className="font-semibold text-red-700">Слит</span> • Этап:{" "}
                        {phaseLabel(a.phase)} • Баланс:{" "}
                        <span className="font-semibold text-gray-900">{fmtMoney(a.balance)}</span>
                      </div>

                      <div className="mt-2 text-xs text-gray-600">
                        Слитые счета нельзя редактировать/удалять.
                      </div>
                    </div>

                    {/* ✅ Никаких кнопок для слитых */}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
