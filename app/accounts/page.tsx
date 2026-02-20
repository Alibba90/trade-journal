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
  if (p === "live") return "bg-green-50 border-green-200 text-green-900";
  if (p === "phase2") return "bg-blue-50 border-blue-200 text-blue-900";
  return "bg-orange-50 border-orange-200 text-orange-900";
}

function isBlownAccount(a: Account) {
  const st = String(a.status || "").toLowerCase().trim();
  return st === "blown" || st === "slit" || st === "слил";
}

function calcMetrics(a: Account) {
  const size = n(a.size);
  const balance = n(a.balance);
  const ddPct = n(a.max_drawdown_percent);
  const targetPct = n(a.profit_target_percent);

  const resultPct = size > 0 ? ((balance - size) / size) * 100 : 0;
  const minBalance = size > 0 ? size * (1 - ddPct / 100) : 0;
  const toBlowPct = size > 0 ? ((minBalance - balance) / size) * 100 : 0;
  const targetBalance = size > 0 ? size * (1 + targetPct / 100) : 0;
  const toPassPct = size > 0 ? ((targetBalance - balance) / size) * 100 : 0;
  const profitMoney = balance - size;

  return {
    size,
    balance,
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
  const [error, setError] = useState("");

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
  }, []);

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

    const sumSize = (arr: Account[]) => arr.reduce((s, a) => s + n(a.size), 0);

    let p1 = 0, p2 = 0, lv = 0;

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
    const ok = confirm("Удалить этот счёт?");
    if (!ok) return;

    setBusyId(id);

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

        {/* HEADER */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Счета</h1>
            <p className="text-gray-600 mt-1">
              Всего: <b>{fmtMoney(totalAlloc)}</b> •
              Фаза1: <b>{fmtMoney(phase1Alloc)}</b> •
              Фаза2: <b>{fmtMoney(phase2Alloc)}</b> •
              Лайв: <b>{fmtMoney(liveAlloc)}</b>
              {blownAccounts.length > 0 && <> • Слитые: <b>{fmtMoney(blownTotalAlloc)}</b></>}
            </p>
          </div>

          <div className="flex gap-2">
            <Link href="/" className="rounded-xl px-4 py-2 border bg-white hover:bg-gray-100">← Главная</Link>
            <Link href="/accounts/new" className="rounded-xl px-4 py-2 border bg-white hover:bg-gray-100">+ Добавить</Link>
          </div>
        </div>

        {error && <div className="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-red-700 rounded-xl">{error}</div>}

        {/* АКТИВНЫЕ */}
        {!loading && activeAccounts.length > 0 && (
          <section className="mb-10 space-y-4">

            {activeAccounts.map((a) => {
              const m = calcMetrics(a);
              const topCls = phaseColorClass(a.phase);

              return (
                <div key={a.id} className="rounded-2xl border bg-white p-5 shadow-sm">

                  <div className="flex items-start justify-between">

                    <div>

                      <div className={`inline-flex rounded-xl border px-3 py-2 font-bold ${topCls}`}>
                        {a.account_number} • {a.firm} • {fmtMoney(a.size)}
                      </div>

                      <div className="text-sm mt-2 text-gray-600">
                        Результат: <b>{fmtPctSigned(m.resultPct)}</b> •
                        До слива: <b className="text-red-700">{fmtPctSigned(m.toBlowPct)}</b>
                        {(a.phase === "phase1" || a.phase === "phase2") && (
                          <> • До прохождения: <b className="text-blue-700">{fmtPctSigned(m.toPassPct)}</b></>
                        )}
                      </div>

                      <div className="text-sm mt-1">
                        Баланс: <b>{fmtMoney(a.balance)}</b>
                      </div>

                    </div>

                    {/* ACTIONS */}
                    <div className="flex gap-2">

                      <Link href={`/accounts/edit?id=${a.id}`} className="px-3 py-2 border rounded-lg">✎</Link>

                      <button
                        onClick={() => handleDelete(a.id)}
                        disabled={busyId === a.id}
                        className="px-3 py-2 border border-red-200 rounded-lg text-red-600"
                      >
                        {busyId === a.id ? "…" : "🗑"}
                      </button>

                      {/* КНОПКА ВЫВОДА */}
                      {a.phase === "live" && m.profitMoney > 0 && (
                        <button
                          onClick={async () => {
                            setBusyId(a.id);

                            await supabase
                              .from("accounts")
                              .update({ balance: m.size })
                              .eq("id", a.id);

                            setBusyId(null);
                            router.refresh();
                          }}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg"
                        >
                          💰
                        </button>
                      )}

                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* СЛИТЫЕ */}
        {blownAccounts.length > 0 && (
          <section className="space-y-4">
            {blownAccounts.map((a) => {
              const m = calcMetrics(a);
              return (
                <div key={a.id} className="rounded-2xl border border-red-200 bg-red-50 p-5">
                  <b>{a.account_number}</b> • {a.firm} • {fmtMoney(a.size)}
                  <div className="text-sm mt-1 text-red-700">
                    Слит • Результат: {fmtPctSigned(m.resultPct)}
                  </div>
                </div>
              );
            })}
          </section>
        )}

      </div>
    </main>
  );
}
