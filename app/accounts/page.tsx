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
  created_at?: string | null;
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

function fmtPctSigned(val: number, sign: "+" | "-") {
  const x = Math.max(0, Math.abs(val));
  return `${sign}${x.toFixed(2)}%`;
}

function fmtPctValue(val: number) {
  // для "Результат: -5.27%" (знак сам)
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

function phaseLabel(p: Account["phase"]) {
  if (p === "phase1") return "Фаза 1";
  if (p === "phase2") return "Фаза 2";
  if (p === "live") return "Лайв";
  return p ?? "—";
}

function normalizePhase(p: any): "live" | "phase2" | "phase1" | "other" {
  const s = String(p || "").toLowerCase().trim();
  if (s === "live" || s.includes("лайв")) return "live";
  if (s === "phase2" || s.includes("phase 2") || s.includes("фаза 2")) return "phase2";
  if (s === "phase1" || s.includes("phase 1") || s.includes("фаза 1")) return "phase1";
  return "other";
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
      .select(
        "id, account_number, firm, size, phase, balance, max_drawdown_percent, profit_target_percent, status, created_at"
      )
      .order("created_at", { ascending: true });

    if (error) setError(error.message);
    setAccounts((data as Account[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- blown logic (как у тебя): по статусу ИЛИ по -10% от размера
  const isBlown = (a: Account) => {
    const st = String(a.status || "").toLowerCase().trim();
    if (st === "blown" || st === "slit" || st === "слил") return true;

    const size = n(a.size);
    const bal = n(a.balance);
    if (!size) return false;
    return bal <= size * 0.9; // 10% DD по умолчанию
  };

  // --- расчет процентов/дистанций
  function calcMetrics(a: Account) {
    const size = n(a.size);
    const bal = n(a.balance);
    const ddPct = n(a.max_drawdown_percent); // например 10
    const targetPct = n(a.profit_target_percent); // например 8

    const resultPct = size > 0 ? ((bal - size) / size) * 100 : 0; // текущий результат от размера

    // До слива (в % от размера): сколько осталось до minBalance, но показываем ВСЕГДА со знаком "-"
    // minBal = size*(1 - ddPct/100)
    // remaining = (bal - minBal)/size*100
    const minBal = size > 0 ? size * (1 - ddPct / 100) : 0;
    const remainingToSlipPct = size > 0 ? ((bal - minBal) / size) * 100 : 0; // сколько осталось
    const toSlipDisplay = fmtPctSigned(remainingToSlipPct, "-"); // всегда "-"

    // До прохождения фазы (всегда "+"): targetPct - resultPct (если отрицательно -> 0)
    const toPassPct = Math.max(0, targetPct - resultPct);
    const toPassDisplay = fmtPctSigned(toPassPct, "+");

    // Профит в $ для лайва
    const profitMoney = size > 0 ? bal - size : 0;

    return {
      size,
      bal,
      ddPct,
      targetPct,
      resultPct,
      toSlipDisplay,
      toPassDisplay,
      profitMoney,
    };
  }

  const computed = useMemo(() => {
    const blown = accounts.filter((a) => isBlown(a));
    const active = accounts.filter((a) => !isBlown(a));

    // сортировка активных: live -> phase2 -> phase1
    const phaseRank = (a: Account) => {
      const ph = normalizePhase(a.phase);
      if (ph === "live") return 0;
      if (ph === "phase2") return 1;
      if (ph === "phase1") return 2;
      return 3;
    };

    const byCreated = (a: Account, b: Account) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    };

    const activeSorted = [...active].sort((a, b) => {
      const ra = phaseRank(a);
      const rb = phaseRank(b);
      if (ra !== rb) return ra - rb;
      // внутри группы — старые выше (как было у тебя по created_at asc)
      return byCreated(a, b);
    });

    const sumSize = (arr: Account[]) => arr.reduce((s, a) => s + n(a.size), 0);

    const phase1Sum = activeSorted.filter((a) => normalizePhase(a.phase) === "phase1").reduce((s, a) => s + n(a.size), 0);
    const phase2Sum = activeSorted.filter((a) => normalizePhase(a.phase) === "phase2").reduce((s, a) => s + n(a.size), 0);
    const liveSum = activeSorted.filter((a) => normalizePhase(a.phase) === "live").reduce((s, a) => s + n(a.size), 0);

    return {
      activeAccounts: activeSorted,
      blownAccounts: blown, // слитые всегда отдельным блоком внизу
      phase1Sum,
      phase2Sum,
      liveSum,
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

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-5xl">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Счета</h1>
            <p className="text-gray-600 mt-1">
              Фаза 1: <span className="font-semibold text-gray-900">{fmtMoney(computed.phase1Sum)}</span> •{" "}
              Фаза 2: <span className="font-semibold text-gray-900">{fmtMoney(computed.phase2Sum)}</span> •{" "}
              Лайв: <span className="font-semibold text-gray-900">{fmtMoney(computed.liveSum)}</span> •{" "}
              Слитые: <span className="font-semibold text-gray-900">{fmtMoney(computed.blownTotalAlloc)}</span>
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
        {!loading && computed.activeAccounts.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Активные счета</h2>

            {/* ВАЖНО: 1 колонка (один за другим) */}
            <div className="grid grid-cols-1 gap-4">
              {computed.activeAccounts.map((a) => {
                const ph = normalizePhase(a.phase);
                const m = calcMetrics(a);

                const resultCls =
                  m.resultPct > 0 ? "text-green-700" : m.resultPct < 0 ? "text-red-700" : "text-gray-700";

                const profitCls =
                  m.profitMoney > 0 ? "text-green-700" : m.profitMoney < 0 ? "text-red-700" : "text-gray-700";

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
                          <span>
                            Результат: <span className={`font-semibold ${resultCls}`}>{fmtPctValue(m.resultPct)}</span>
                          </span>{" "}
                          •{" "}
                          <span>
                            До слива: <span className="font-semibold text-gray-900">{m.toSlipDisplay}</span>
                          </span>
                          {ph === "phase1" || ph === "phase2" ? (
                            <>
                              {" "}
                              •{" "}
                              <span>
                                До прохождения:{" "}
                                <span className="font-semibold text-gray-900">{m.toPassDisplay}</span>
                              </span>
                            </>
                          ) : null}
                          {ph === "live" ? (
                            <>
                              {" "}
                              •{" "}
                              <span>
                                Профит:{" "}
                                <span className={`font-semibold ${profitCls}`}>{fmtMoney(m.profitMoney)}</span>
                              </span>
                            </>
                          ) : null}
                        </div>

                        <div className="text-sm text-gray-600 mt-1">
                          Баланс:{" "}
                          <span className="font-semibold text-gray-900">{fmtMoney(a.balance)}</span>
                        </div>
                      </div>

                      {/* Actions (карточка НЕ кликабельна) */}
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

        {/* Blown list (всегда внизу) */}
        {!loading && computed.blownAccounts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">
                Слитые счета{" "}
                <span className="text-gray-500 font-medium">
                  ({computed.blownAccounts.length} • {fmtMoney(computed.blownTotalAlloc)})
                </span>
              </h2>
            </div>

            {/* тоже 1 колонка */}
            <div className="grid grid-cols-1 gap-4">
              {computed.blownAccounts.map((a) => {
                const m = calcMetrics(a);
                const resultCls =
                  m.resultPct > 0 ? "text-green-700" : m.resultPct < 0 ? "text-red-700" : "text-gray-700";

                return (
                  <div
                    key={a.id}
                    className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm opacity-95"
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
                          {phaseLabel(a.phase)}
                        </div>

                        <div className="text-sm text-gray-700 mt-1">
                          Результат: <span className={`font-semibold ${resultCls}`}>{fmtPctValue(m.resultPct)}</span> •{" "}
                          Баланс: <span className="font-semibold text-gray-900">{fmtMoney(a.balance)}</span>
                        </div>

                        <div className="mt-2 text-xs text-gray-600">
                          Слитые счета нельзя редактировать/удалять.
                        </div>
                      </div>

                      {/* НЕТ кнопок */}
                      <div className="shrink-0" />
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
