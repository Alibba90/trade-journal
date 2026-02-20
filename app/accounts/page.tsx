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

function phaseLabel(p: Account["phase"]) {
  if (p === "phase1") return "Фаза 1";
  if (p === "phase2") return "Фаза 2";
  if (p === "live") return "Лайв";
  return p ?? "—";
}

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtSignedPct(n: number, digits = 2) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// ✅ blown:
// 1) status='blown' OR
// 2) balance <= size*0.9 (как ты хотел "−10% и ниже")
function isBlown(a: Account) {
  const st = String(a.status || "").toLowerCase().trim();
  if (st === "blown" || st === "slit" || st === "слил") return true;

  const size = toNum(a.size);
  const bal = toNum(a.balance);
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

    const sumSize = (arr: Account[]) => arr.reduce((s, a) => s + toNum(a.size), 0);

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

  // ✅ payout (как раньше)
  async function handlePayout(a: Account) {
    const size = toNum(a.size);
    const bal = toNum(a.balance);
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

    const { error: updErr } = await supabase.from("accounts").update({ balance: size }).eq("id", a.id);

    setBusyId(null);

    if (updErr) {
      setError(updErr.message);
      return;
    }

    setAccounts((prev) => prev.map((x) => (x.id === a.id ? { ...x, balance: size } : x)));
  }

  // ✅ проценты: результат / до слива / до PASS
  function calcPercents(a: Account) {
    const size = toNum(a.size);
    const bal = toNum(a.balance);

    if (!size) {
      return {
        perfPct: 0,
        toBlowPct: null as number | null,
        toPassPct: null as number | null,
        profitMoney: bal - size,
      };
    }

    const perfPct = ((bal - size) / size) * 100;

    // до слива — берём лимит из max_drawdown_percent
    // minBalance = size*(1-dd/100)
    const dd = toNum(a.max_drawdown_percent);
    let toBlowPct: number | null = null;
    if (dd > 0) {
      const minBal = size * (1 - dd / 100);
      toBlowPct = ((bal - minBal) / size) * 100; // сколько % осталось до пробития
      toBlowPct = clamp(toBlowPct, -999, 999);
    }

    // до PASS — только для phase1/phase2
    let toPassPct: number | null = null;
    if (a.phase === "phase1" || a.phase === "phase2") {
      const tgt = toNum(a.profit_target_percent);
      if (tgt > 0) {
        const targetBal = size * (1 + tgt / 100);
        toPassPct = ((targetBal - bal) / size) * 100; // сколько % осталось добрать
        toPassPct = clamp(toPassPct, -999, 999);
      }
    }

    return {
      perfPct,
      toBlowPct,
      toPassPct,
      profitMoney: bal - size,
    };
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
            >
              ← Главная
            </Link>

            <Link
              href="/accounts/new"
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 border bg-white text-gray-900 hover:bg-gray-100 transition"
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
            <p className="text-gray-600 mt-2">Добавь первый счёт — и начнём считать прогресс, лимиты и аналитику.</p>
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
                const { perfPct, toBlowPct, toPassPct, profitMoney } = calcPercents(a);

                const canPayout = isLive && profitMoney > 0;

                const perfCls =
                  perfPct > 0 ? "text-green-700" : perfPct < 0 ? "text-red-700" : "text-gray-900";

                const blowCls =
                  toBlowPct !== null && toBlowPct <= 1
                    ? "text-red-700"
                    : toBlowPct !== null && toBlowPct <= 3
                    ? "text-orange-700"
                    : "text-gray-900";

                const passCls =
                  toPassPct !== null && toPassPct <= 1
                    ? "text-emerald-700"
                    : toPassPct !== null && toPassPct <= 3
                    ? "text-blue-700"
                    : "text-gray-900";

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

                        {/* ✅ ВАЖНО: тут новые показатели */}
                        <div className="text-sm text-gray-600 mt-1 leading-6">
                          Этап: {phaseLabel(a.phase)} •{" "}
                          <span className="text-gray-700">Результат:</span>{" "}
                          <span className={`font-semibold ${perfCls}`}>{fmtSignedPct(perfPct)}</span>{" "}
                          {isLive ? (
                            <>
                              <span className="text-gray-400">•</span>{" "}
                              <span className="text-gray-700">Профит:</span>{" "}
                              <span className={`font-semibold ${profitMoney > 0 ? "text-green-700" : profitMoney < 0 ? "text-red-700" : "text-gray-900"}`}>
                                {fmtUsd(profitMoney)}
                              </span>{" "}
                            </>
                          ) : null}
                          <span className="text-gray-400">•</span>{" "}
                          <span className="text-gray-700">До слива:</span>{" "}
                          <span className={`font-semibold ${blowCls}`}>
                            {toBlowPct === null ? "—" : `${toBlowPct.toFixed(2)}%`}
                          </span>{" "}
                          {a.phase === "phase1" || a.phase === "phase2" ? (
                            <>
                              <span className="text-gray-400">•</span>{" "}
                              <span className="text-gray-700">До PASS:</span>{" "}
                              <span className={`font-semibold ${passCls}`}>
                                {toPassPct === null ? "—" : `${toPassPct.toFixed(2)}%`}
                              </span>
                            </>
                          ) : null}
                          <div className="text-gray-700">
                            Баланс: <span className="font-semibold text-gray-900">{fmtMoney(a.balance)}</span>
                          </div>
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
              {blownAccounts.map((a) => {
                const { perfPct } = calcPercents(a);
                const perfCls = perfPct > 0 ? "text-green-700" : perfPct < 0 ? "text-red-700" : "text-gray-900";

                return (
                  <div key={a.id} className="rounded-2xl border border-red-200 bg-red-50/40 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-bold text-gray-900 truncate">
                          {a.account_number || "Без номера"}{" "}
                          <span className="text-gray-400 font-semibold">•</span>{" "}
                          <span className="text-gray-700 font-semibold">{a.firm || "—"}</span>{" "}
                          <span className="text-gray-400 font-semibold">•</span>{" "}
                          <span className="text-gray-900">{fmtMoney(a.size)}</span>
                        </div>

                        <div className="text-sm text-gray-700 mt-1 leading-6">
                          Статус: <span className="font-semibold text-red-700">Слит</span> • Этап: {phaseLabel(a.phase)}
                          <div>
                            Результат: <span className={`font-semibold ${perfCls}`}>{fmtSignedPct(perfPct)}</span> • Баланс:{" "}
                            <span className="font-semibold text-gray-900">{fmtMoney(a.balance)}</span>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-gray-600">Слитые счета нельзя редактировать/удалять.</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
