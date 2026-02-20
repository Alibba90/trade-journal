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

function phaseLabel(p: Account["phase"]) {
  if (p === "phase1") return "Фаза 1";
  if (p === "phase2") return "Фаза 2";
  if (p === "live") return "Лайв";
  return p ?? "—";
}

function pct(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
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

  const computed = useMemo(() => {
    // слитые: как у тебя сейчас
    const blown = accounts.filter((a) => a.status === "blown" || a.status === "slit" || a.status === "слил");
    const active = accounts.filter((a) => !blown.includes(a));

    const sumSize = (arr: Account[]) => arr.reduce((s, a) => s + (Number(a.size) || 0), 0);

    // ✅ суммы аллокации по активным фазам
    const p1 = sumSize(active.filter((a) => a.phase === "phase1"));
    const p2 = sumSize(active.filter((a) => a.phase === "phase2"));
    const lv = sumSize(active.filter((a) => a.phase === "live"));
    const blownSum = sumSize(blown);

    return {
      activeAccounts: active,
      blownAccounts: blown,
      allocPhase1: p1,
      allocPhase2: p2,
      allocLive: lv,
      allocTotalActive: p1 + p2 + lv,
      allocBlown: blownSum,
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

  // расчет результата % от размера, до слива, до pass (как у тебя уже сделано по сути)
  function calcMetrics(a: Account) {
    const size = Number(a.size) || 0;
    const bal = Number(a.balance) || 0;

    const ddLimit = Number(a.max_drawdown_percent) || 0; // 10
    const target = Number(a.profit_target_percent) || 0; // 8

    const resultPct = size > 0 ? ((bal - size) / size) * 100 : 0;

    // до слива (%): насколько можно упасть до minBalance
    const minBal = size > 0 ? size * (1 - ddLimit / 100) : 0;
    const toBlowPct = size > 0 ? ((bal - minBal) / size) * 100 : 0;

    // до PASS (%): только фазы, лайв тоже покажем как 0 (но можно скрывать при желании)
    const targetBal = size > 0 ? size * (1 + target / 100) : 0;
    const toPassPct = size > 0 ? ((targetBal - bal) / size) * 100 : 0;

    return {
      size,
      bal,
      resultPct,
      toBlowPct,
      toPassPct,
    };
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-5xl">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Счета</h1>

            {/* ✅ Разбивка аллокации по фазам + слитые */}
            <p className="text-gray-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span>
                Фаза 1: <span className="font-semibold text-gray-900">{fmtMoney(computed.allocPhase1)}</span>
              </span>
              <span>
                Фаза 2: <span className="font-semibold text-gray-900">{fmtMoney(computed.allocPhase2)}</span>
              </span>
              <span>
                Лайв: <span className="font-semibold text-gray-900">{fmtMoney(computed.allocLive)}</span>
              </span>
              <span>
                Слитые: <span className="font-semibold text-gray-900">{fmtMoney(computed.allocBlown)}</span>
              </span>
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
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">{error}</div>
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
        {!loading && computed.activeAccounts.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Активные счета</h2>

            {/* ✅ ОДНА КОЛОНКА: карточки один за другим */}
            <div className="space-y-4">
              {computed.activeAccounts.map((a) => {
                const m = calcMetrics(a);

                const resultCls = m.resultPct > 0 ? "text-green-700" : m.resultPct < 0 ? "text-red-700" : "text-gray-700";
                const blowCls = m.toBlowPct <= 2 ? "text-red-700" : "text-gray-900";
                const showPass = a.phase === "phase1" || a.phase === "phase2";

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
                          <span className={resultCls}>
                            Результат: <span className="font-semibold">{pct(m.resultPct)}</span>
                          </span>{" "}
                          •{" "}
                          <span className={blowCls}>
                            До слива: <span className="font-semibold">{pct(Math.max(0, m.toBlowPct))}</span>
                          </span>
                          {showPass ? (
                            <>
                              {" "}
                              • До PASS: <span className="font-semibold text-gray-900">{pct(Math.max(0, m.toPassPct))}</span>
                            </>
                          ) : null}
                        </div>

                        <div className="text-sm text-gray-600 mt-1">
                          Баланс: <span className="font-semibold text-gray-900">{fmtMoney(a.balance)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
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
        {!loading && computed.blownAccounts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Слитые счета{" "}
                <span className="text-gray-500 font-medium">
                  ({computed.blownAccounts.length} • {fmtMoney(computed.allocBlown)})
                </span>
              </h2>
            </div>

            {/* ✅ ОДНА КОЛОНКА */}
            <div className="space-y-4">
              {computed.blownAccounts.map((a) => {
                const m = calcMetrics(a);
                return (
                  <div
                    key={a.id}
                    className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm"
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
                          Статус: <span className="font-semibold text-red-700">Слит</span> • Этап: {phaseLabel(a.phase)}
                        </div>

                        <div className="text-sm text-gray-700 mt-1">
                          Результат: <span className="font-semibold text-red-700">{pct(m.resultPct)}</span> • Баланс:{" "}
                          <span className="font-semibold text-gray-900">{fmtMoney(a.balance)}</span>
                        </div>

                        <div className="text-xs text-red-700 mt-2">Слитые счета нельзя редактировать/удалять.</div>
                      </div>

                      {/* ✅ НЕТ кнопок */}
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
