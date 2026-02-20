"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";

function pick<T = any>(obj: any, keys: string[], fallback: T): T {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k] as T;
  }
  return fallback;
}

function toNum(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  let s = String(v).trim();
  if (!s) return 0;

  s = s.replace(/\s+/g, "");
  s = s.replace(",", ".");
  s = s.replace(/[%$₸€₽]/g, "");
  s = s.replace(/[^0-9.\-]/g, "");

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function fmtUsd(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$ ${fmtMoney(Math.abs(n))}`;
}

function normalizePhase(v: any): "phase1" | "phase2" | "live" | "other" {
  const s = String(v || "").toLowerCase().trim();
  if (s.includes("phase 1") || s.includes("phase1") || s.includes("фаза 1") || s === "phase1") return "phase1";
  if (s.includes("phase 2") || s.includes("phase2") || s.includes("фаза 2") || s === "phase2") return "phase2";
  if (s.includes("live") || s.includes("лайв") || s === "live") return "live";
  return "other";
}

const PHASE_LABEL: Record<string, string> = {
  phase1: "Фаза 1",
  phase2: "Фаза 2",
  live: "Лайв",
};

export default function AccountsPage() {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const getAccountNum = (a: any) =>
    String(pick(a, ["account_number", "account_num", "number", "acc_num"], "") || "").trim();
  const getFirm = (a: any) => String(pick(a, ["firm", "company"], "") || "").trim();
  const getSize = (a: any) => toNum(pick(a, ["size", "account_size"], 0));
  const getBalance = (a: any) => toNum(pick(a, ["balance", "current_balance"], 0));
  const getPhaseRaw = (a: any) => pick(a, ["phase", "stage"], "");
  const getPhase = (a: any) => normalizePhase(getPhaseRaw(a));

  const getAccountLabel = (a: any) => {
    const num = getAccountNum(a);
    const firm = getFirm(a);
    const size = getSize(a);
    const parts = [num || "Счёт", firm ? `• ${firm}` : "", size ? `• $${fmtMoney(size)}` : ""]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return parts || "Счёт";
  };

  // слитый: либо status=blown, либо баланс <= -10% от размера
  const isBlown = (a: any) => {
    const st = String(a?.status || "").toLowerCase().trim();
    if (st === "blown") return true;
    const size = getSize(a);
    const bal = getBalance(a);
    if (!size) return false;
    return bal <= size * 0.9;
  };

  async function loadAccounts() {
    setErrMsg(null);
    setLoading(true);

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setIsAuthed(false);
      setLoading(false);
      return;
    }
    setIsAuthed(true);

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      setErrMsg(error.message);
      setAccounts([]);
    } else {
      setAccounts(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = useMemo(() => {
    const active = accounts.filter((a) => !isBlown(a));
    const blown = accounts.filter((a) => isBlown(a));

    const activeSum = active.reduce((s, a) => s + getSize(a), 0);
    const blownSum = blown.reduce((s, a) => s + getSize(a), 0);

    return { active, blown, activeSum, blownSum };
  }, [accounts]);

  async function deleteAccount(accountId: string) {
    setErrMsg(null);
    const ok = window.confirm("Удалить этот счёт? (Сделки на этом счёте тоже удалятся, если стоит CASCADE)");
    if (!ok) return;

    try {
      setBusyId(accountId);

      const { error } = await supabase.from("accounts").delete().eq("id", accountId);
      if (error) {
        console.log("DELETE ACCOUNT ERROR:", error);
        setErrMsg(error.message);
        return;
      }

      await loadAccounts();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Загрузка…</div>
      </main>
    );
  }

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border">
          <h1 className="text-2xl font-bold text-gray-900">Счета</h1>
          <p className="mt-2 text-gray-600">Войди в аккаунт, чтобы видеть список счетов.</p>
          <Link
            href="/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-black px-4 py-3 text-white font-semibold hover:opacity-90"
          >
            Войти
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="mx-auto max-w-6xl px-6 pt-10 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Счета</h1>
            <p className="mt-2 text-sm text-gray-600">
              Активные: <span className="font-semibold">{view.active.length}</span> • {fmtUsd(view.activeSum)}{" "}
              <span className="mx-2">|</span>
              Слитые: <span className="font-semibold text-red-700">{view.blown.length}</span> •{" "}
              <span className="font-semibold text-red-700">{fmtUsd(view.blownSum)}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Главная
            </Link>

            <Link
              href="/accounts/new"
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              title="Добавить новый счет"
            >
              Добавить счёт
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-10">
        {errMsg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errMsg}</div>
        ) : null}

        {/* ACTIVE */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-gray-900">Активные счета</div>
            <div className="text-xs text-gray-500">Карточки не кликаются (страницы счета пока нет)</div>
          </div>

          {view.active.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">
              Активных счетов нет.{" "}
              <Link href="/accounts/new" className="underline font-semibold">
                Добавить счёт
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3">
              {view.active.map((a) => {
                const ph = getPhase(a);
                const phLabel = PHASE_LABEL[ph] || String(getPhaseRaw(a) || "—");
                const id = String(a.id);

                return (
                  <div key={id} className="rounded-xl border bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900">{getAccountLabel(a)}</div>
                        <div className="mt-1 text-xs text-gray-500">Этап: {phLabel}</div>
                        <div className="mt-2 text-xs text-gray-500">Детальная страница: скоро</div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">{fmtUsd(getBalance(a))}</div>
                          <div className="text-xs text-gray-500">Баланс</div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* EDIT -> same page /accounts/new?id=... */}
                          <Link
                            href={`/accounts/new?id=${encodeURIComponent(id)}`}
                            className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                            title="Редактировать счет"
                          >
                            Редактировать
                          </Link>

                          <button
                            onClick={() => deleteAccount(id)}
                            disabled={busyId === id}
                            className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                            title="Удалить счет"
                          >
                            {busyId === id ? "Удаляю…" : "Удалить"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* BLOWN */}
        <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-gray-900">
              Слитые счета <span className="text-sm text-red-700">(просадка ≥ 10%)</span>
            </div>
            <div className="text-xs text-gray-500">Всегда внизу</div>
          </div>

          {view.blown.length === 0 ? (
            <div className="mt-3 text-sm text-gray-500">Слитых счетов нет.</div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3">
              {view.blown.map((a) => {
                const ph = getPhase(a);
                const phLabel = PHASE_LABEL[ph] || String(getPhaseRaw(a) || "—");
                const id = String(a.id);

                const size = getSize(a);
                const bal = getBalance(a);
                const ddPct = size ? ((size - bal) / size) * 100 : 0;

                return (
                  <div key={id} className="rounded-xl border border-red-200 bg-red-50/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900">{getAccountLabel(a)}</div>
                        <div className="mt-1 text-xs text-gray-600">
                          Этап: {phLabel} • Статус: <span className="font-semibold text-red-700">Слитый</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          Просадка: <span className="font-semibold text-red-700">{ddPct.toFixed(2)}%</span>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">Детальная страница: скоро</div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">{fmtUsd(bal)}</div>
                          <div className="text-xs text-gray-600">Баланс</div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* EDIT -> same page /accounts/new?id=... */}
                          <Link
                            href={`/accounts/new?id=${encodeURIComponent(id)}`}
                            className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                            title="Редактировать счет"
                          >
                            Редактировать
                          </Link>

                          <button
                            onClick={() => deleteAccount(id)}
                            disabled={busyId === id}
                            className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                            title="Удалить счет"
                          >
                            {busyId === id ? "Удаляю…" : "Удалить"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
