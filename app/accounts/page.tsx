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
  status?: string | null; // blown/active/etc
};

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtMoney(nv: number | null | undefined) {
  if (nv === null || nv === undefined || Number.isNaN(nv)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(nv);
}

function fmtPctSigned(x: number) {
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(2)}%`;
}

function phaseLabel(p: Account["phase"]) {
  if (p === "phase1") return "Фаза 1";
  if (p === "phase2") return "Фаза 2";
  if (p === "live") return "Лайв";
  return p ?? "—";
}

function phaseColorClass(p: Account["phase"]) {
  // Цветим только верхнюю “шапку” (номер/фирма/размер)
  if (p === "live") return "bg-green-50 border-green-200 text-green-900";
  if (p === "phase2") return "bg-blue-50 border-blue-200 text-blue-900";
  return "bg-orange-50 border-orange-200 text-orange-900"; // phase1 и всё остальное
}

function isBlownAccount(a: Account) {
  const st = String(a.status || "").toLowerCase().trim();
  return st === "blown" || st === "slit" || st === "слил";
}

/**
 * Результат: (balance-size)/size * 100
 * До слива:   (minBalance-balance)/size*100  -> всегда отрицательное или 0
 * До прохождения фазы: (targetBalance-balance)/size*100 -> всегда положительное или 0 (только для phase1/phase2)
 */
function calcMetrics(a: Account) {
  const size = n(a.size);
  const balance = n(a.balance);

  const ddPct = n(a.max_drawdown_percent);
  const targetPct = n(a.profit_target_percent);

  const resultPct = size > 0 ? ((balance - size) / size) * 100 : 0;

  const minBalance = size > 0 ? size * (1 - ddPct / 100) : 0;
  const toBlowPct = size > 0 ? ((minBalance - balance) / size) * 100 : 0; // <= 0

  const targetBalance = size > 0 ? size * (1 + targetPct / 100) : 0;
  const toPassPct = size > 0 ? ((targetBalance - balance) / size) * 100 : 0; // >= 0

  const profitMoney = balance - size;

  return {
    size,
    balance,
    ddPct,
    targetPct,
    resultPct,
    toBlowPct: Math.min(0, toBlowPct),
    toPassPct: Math.max(0, toPassPct),
    profitMoney,
  };
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
      .select("id, account_number, firm, size, phase, balance, max_drawdown_percent, profit_target_percent, status")
      .order("created_at", { ascending: true });

    if (error) setError(error.message);
    setAccounts((data as Account[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Группируем + считаем суммы + сортируем активные по порядку: live -> phase2 -> phase1
  const {
    activeAccounts,
    blownAccounts,
    totalAlloc,
    phase1Alloc,
    phase2Alloc,
    liveAlloc,
    blownTotalAlloc,
  } = useMemo(() => {
    const blown = accounts.filter((a) => isBlownAccount(a));
    const active = accounts.filter((a) => !isBlownAccount(a));

    const sumSize = (arr: Account[]) => arr.reduce((s, a) => s + (n(a.size) || 0), 0);

    let p1 = 0;
    let p2 = 0;
    let lv = 0;

    for (const a of active) {
      if (a.phase === "phase1") p1 += n(a.size);
      else if (a.phase === "phase2") p2 += n(a.size);
      else if (a.phase === "live") lv += n(a.size);
    }

    const orderRank = (a: Account) => {
      if (a.phase === "live") return 0;
      if (a.phase === "phase2") return 1;
      if (a.phase === "phase1") return 2;
      return 3;
    };

    const activeSorted = [...active].sort((a, b) => {
      const ra = orderRank(a);
      const rb = orderRank(b);
      if (ra !== rb) return ra - rb;
      // дальше просто по size (большие выше) — чтобы красиво
      return n(b.size) - n(a.size);
    });

    return {
      activeAccounts: activeSorted,
      blownAccounts: blown,
      totalAlloc: sumSize(active),
      phase1Alloc: p1,
      phase2Alloc: p2,
      liveAlloc: lv,
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

  // ✅ ВЫВЕСТИ ПРИБЫЛЬ: только для лайвов с профитом > 0
  async function handleWithdrawProfit(a: Account) {
    const size = n(a.size);
    const balance = n(a.balance);
    if (size <= 0) return;

    const profit = balance - size;
    if (profit <= 0) return;

    const ok = confirm(
      `Вывести прибыль ${fmtMoney(profit)}?\nПосле вывода баланс лайва станет ${fmtMoney(size)}.`
    );
    if (!ok) return;

    setBusyId(a.id);
    setError("");

    const { error } = await supabase.from("accounts").update({ balance: size }).eq("id", a.id);

    setBusyId(null);

    if (error) {
      setError(error.message);
      return;
    }

    // обновим локально, чтобы сразу было видно
    setAccounts((prev) => prev.map((x) => (x.id === a.id ? { ...x, balance: size } : x)));
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-5xl">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Счета</h1>

            <p className="text-gray-600 mt-1">
              Всего: <span className="font-semibold text-gray-900">{fmtMoney(totalAlloc)}</span>
              {" • "}
              Фаза 1: <span className="font-semibold text-gray-900">{fmtMoney(phase1Alloc)}</span>
              {" • "}
              Фаза 2: <span className="font-semibold text-gray-900">{fmtMoney(phase2Alloc)}</span>
              {" • "}
              Лайв: <span className="font-semibold text-gray-900">{fmtMoney(liveAlloc)}</span>
              {blownAccounts.length > 0 && (
                <>
                  {" • "}
                  Слитые: <span className="font-semibold text-gray-900">{fmtMoney(blownTotalAlloc)}</span>
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

            {/* Карточки один за другим */}
            <div className="space-y-4">
              {activeAccounts.map((a) => {
                const m = calcMetrics(a);
                const topCls = phaseColorClass(a.phase);

                const resultCls =
                  m.resultPct > 0 ? "text-green-700" : m.resultPct < 0 ? "text-red-700" : "text-gray-800";

                const toBlowCls = m.toBlowPct < 0 ? "text-red-700" : "text-gray-800";

                const showPass = a.phase === "phase1" || a.phase === "phase2";

                const canWithdraw = a.phase === "live" && m.profitMoney > 0;

                return (
                  <div key={a.id} className="rounded-2xl border bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* Цветная шапка */}
                        <div className={`inline-flex items-center rounded-xl border px-3 py-2 font-bold ${topCls}`}>
                          {a.account_number || "Без номера"} <span className="opacity-60">•</span> {a.firm || "—"}{" "}
                          <span className="opacity-60">•</span> {fmtMoney(a.size)}
                        </div>

                        <div className="text-sm text-gray-600 mt-2">
                          Этап: {phaseLabel(a.phase)} •{" "}
                          <span className={`${resultCls} font-semibold`}>Результат: {fmtPctSigned(m.resultPct)}</span> •{" "}
                          <span className={`${toBlowCls} font-semibold`}>До слива: {fmtPctSigned(m.toBlowPct)}</span>
                          {showPass ? (
                            <>
                              {" "}
                              •{" "}
                              <span className="text-blue-700 font-semibold">
                                До прохождения: {fmtPctSigned(m.toPassPct)}
                              </span>
                            </>
                          ) : null}
                          {a.phase === "live" ? (
                            <>
                              {" "}
                              •{" "}
                              <span
                                className={`${m.profitMoney >= 0 ? "text-green-700" : "text-red-700"} font-semibold`}
                              >
                                Профит: {fmtMoney(m.profitMoney)}
                              </span>
                            </>
                          ) : null}
                        </div>

                        <div className="text-sm text-gray-600 mt-1">
                          Баланс: <span className="font-semibold text-gray-900">{fmtMoney(a.balance)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* ✅ КНОПКА "ВЫВЕСТИ ПРИБЫЛЬ" (как у тебя было): только лайв + профит > 0 */}
                        {canWithdraw ? (
                          <button
                            onClick={() => handleWithdrawProfit(a)}
                            disabled={busyId === a.id}
                            className="rounded-lg px-3 py-2 border bg-green-50 text-green-800 hover:bg-green-100 transition disabled:opacity-60"
                            title="Вывести прибыль (лайв обнулится до размера)"
                          >
                            💵
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

            <div className="space-y-4">
              {blownAccounts.map((a) => {
                const m = calcMetrics(a);
                return (
                  <div key={a.id} className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm opacity-95">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-bold text-gray-900 truncate">
                          {a.account_number || "Без номера"}{" "}
                          <span className="text-gray-400 font-semibold">•</span>{" "}
                          <span className="text-gray-700 font-semibold">{a.firm || "—"}</span>{" "}
                          <span className="text-gray-400 font-semibold">•</span>{" "}
                          <span className="text-gray-900">{fmtMoney(a.size)}</span>
                        </div>

                        <div className="text-sm text-gray-700 mt-2">
                          Статус: <span className="font-semibold text-red-700">Слит</span> • Этап: {phaseLabel(a.phase)}
                        </div>

                        <div className="text-sm text-gray-700 mt-1">
                          <span className="font-semibold text-red-700">Результат: {fmtPctSigned(m.resultPct)}</span> •
                          Баланс: <span className="font-semibold text-gray-900">{fmtMoney(a.balance)}</span>
                        </div>

                        <div className="text-xs text-gray-600 mt-2">Слитые счета нельзя редактировать/удалять.</div>
                      </div>

                      {/* Никаких кнопок для слитых */}
                      <div />
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
