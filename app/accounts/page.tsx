"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

type Account = {
  id: string;
  account_number: string | null;
  firm: string | null;
  size: number | null;
  balance: number | null;
  phase: string | null; // phase1 | phase2 | live
  max_drawdown_percent: number | null;
  profit_target_percent: number | null;
  created_at?: string | null;
};

type Phase = "phase1" | "phase2" | "live";

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  // create form
  const [accountNumber, setAccountNumber] = useState("");
  const [firm, setFirm] = useState("");
  const [phase, setPhase] = useState<Phase>("phase1");
  const [size, setSize] = useState("25000");
  const [balance, setBalance] = useState("25000");
  const [maxDD, setMaxDD] = useState("10");
  const [target, setTarget] = useState("8");

  // edit modal
  const [editing, setEditing] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState({
    account_number: "",
    firm: "",
    phase: "phase1" as Phase,
    size: "",
    balance: "",
    max_drawdown_percent: "",
    profit_target_percent: "",
  });

  const calcPnLPercent = (a: Account) => {
    const s = a.size ?? 0;
    const b = a.balance ?? 0;
    if (!s) return 0;
    return ((b - s) / s) * 100;
  };

  const calcToDD = (a: Account) => {
    const s = a.size ?? 0;
    const b = a.balance ?? 0;
    const ddp = a.max_drawdown_percent ?? 0;
    const minBalance = s - s * (ddp / 100);
    const leftUsd = b - minBalance;
    const leftPct = s ? (leftUsd / s) * 100 : 0;
    return { leftUsd, leftPct };
  };

  const calcToPass = (a: Account) => {
    if (a.phase === "live") return null;
    const s = a.size ?? 0;
    const b = a.balance ?? 0;
    const tp = a.profit_target_percent ?? 0;
    const passBalance = s * (1 + tp / 100);
    const leftUsd = passBalance - b;
    const leftPct = s ? (leftUsd / s) * 100 : 0;
    return { leftUsd, leftPct };
  };

  const nicePhase = (p: string | null) => {
    if (p === "phase1") return "Фаза 1";
    if (p === "phase2") return "Фаза 2";
    if (p === "live") return "Лайв";
    return p ?? "-";
  };

  const load = async () => {
    setLoading(true);
    setErrorText(null);

    const { data: u, error: uErr } = await supabase.auth.getUser();
    if (uErr) {
      setErrorText(uErr.message);
      setLoading(false);
      return;
    }

    const user = u.user;
    if (!user) {
      setUserEmail(null);
      setAccounts([]);
      setLoading(false);
      return;
    }

    setUserEmail(user.email ?? null);

    // ВАЖНО: фильтр по user_id, чтобы даже при кривых policy не было "пусто"
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setErrorText(error.message);
      setAccounts([]);
      setLoading(false);
      return;
    }

    setAccounts((data as Account[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const createAccount = async () => {
    setErrorText(null);
    const { data: u } = await supabase.auth.getUser();
    const user = u.user;
    if (!user) {
      setErrorText("Нужно войти в аккаунт");
      return;
    }

    if (!accountNumber.trim()) {
      setErrorText("Номер счёта обязателен");
      return;
    }

    const payload = {
      user_id: user.id,
      account_number: accountNumber.trim(),
      firm: firm.trim() || null,
      phase,
      size: Number(size),
      balance: Number(balance),
      max_drawdown_percent: Number(maxDD),
      profit_target_percent: phase === "live" ? null : Number(target),
    };

    const { error } = await supabase.from("accounts").insert(payload);
    if (error) {
      setErrorText(error.message);
      return;
    }

    setAccountNumber("");
    setFirm("");
    setPhase("phase1");
    setSize("25000");
    setBalance("25000");
    setMaxDD("10");
    setTarget("8");

    await load();
  };

  const deleteAccount = async (id: string) => {
    if (!confirm("Удалить счёт?")) return;

    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) {
      setErrorText(error.message);
      return;
    }
    await load();
  };

  const openEdit = (a: Account) => {
    setEditing(a);
    setEditForm({
      account_number: a.account_number ?? "",
      firm: a.firm ?? "",
      phase: (a.phase as Phase) ?? "phase1",
      size: String(a.size ?? ""),
      balance: String(a.balance ?? ""),
      max_drawdown_percent: String(a.max_drawdown_percent ?? ""),
      profit_target_percent: String(a.profit_target_percent ?? ""),
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setErrorText(null);

    const updatePayload: any = {
      account_number: editForm.account_number.trim(),
      firm: editForm.firm.trim() || null,
      phase: editForm.phase,
      size: Number(editForm.size),
      balance: Number(editForm.balance),
      max_drawdown_percent: Number(editForm.max_drawdown_percent),
      profit_target_percent: editForm.phase === "live" ? null : Number(editForm.profit_target_percent),
    };

    const { error } = await supabase.from("accounts").update(updatePayload).eq("id", editing.id);
    if (error) {
      setErrorText(error.message);
      return;
    }

    setEditing(null);
    await load();
  };

  const headerStats = useMemo(() => {
    const total = accounts.length;
    const inProfit = accounts.filter((a) => calcPnLPercent(a) > 0).length;
    return { total, inProfit };
  }, [accounts]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-200 p-8 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Счета</h1>
            <div className="text-sm text-gray-600 mt-1">
              {userEmail ? (
                <>
                  Пользователь: <span className="text-gray-900 font-medium">{userEmail}</span> • Счетов:{" "}
                  <span className="text-gray-900 font-medium">{headerStats.total}</span> • В плюсе:{" "}
                  <span className="text-gray-900 font-medium">{headerStats.inProfit}</span>
                </>
              ) : (
                "Не авторизован"
              )}
            </div>
          </div>

          <a className="text-sm text-gray-700 hover:text-black" href="/">
            ← Главная
          </a>
        </div>

        {errorText && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-4">
            {errorText}
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-lg p-6">
          <h2 className="font-semibold text-lg mb-4">Добавить счёт</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Номер счёта</label>
              <input className="input" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
            </div>

            <div>
              <label className="label">Компания</label>
              <input className="input" value={firm} onChange={(e) => setFirm(e.target.value)} />
            </div>

            <div>
              <label className="label">Этап</label>
              <select
                className="input"
                value={phase}
                onChange={(e) => {
                  const v = e.target.value as Phase;
                  setPhase(v);
                  setTarget(v === "phase2" ? "5" : v === "phase1" ? "8" : "0");
                }}
              >
                <option value="phase1">Фаза 1</option>
                <option value="phase2">Фаза 2</option>
                <option value="live">Лайв</option>
              </select>
            </div>

            <div>
              <label className="label">Размер счёта</label>
              <input className="input" value={size} onChange={(e) => setSize(e.target.value)} />
            </div>

            <div>
              <label className="label">Текущий баланс</label>
              <input className="input" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </div>

            <div>
              <label className="label">Лимит просадки (%)</label>
              <input className="input" value={maxDD} onChange={(e) => setMaxDD(e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className="label">Цель прибыли (%)</label>
              <input
                className="input"
                disabled={phase === "live"}
                value={phase === "live" ? "" : target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={createAccount}
                className="btn-primary w-full"
                disabled={loading}
              >
                Добавить
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b">
            <div className="text-sm font-semibold text-gray-700">Список счетов</div>
          </div>

          {loading ? (
            <div className="p-6 text-gray-600">Загрузка...</div>
          ) : accounts.length === 0 ? (
            <div className="p-10 text-center text-gray-500">Пока нет счетов</div>
          ) : (
            <div className="p-6 grid gap-4">
              {accounts.map((a) => {
                const pnl = calcPnLPercent(a);
                const dd = calcToDD(a);
                const pass = calcToPass(a);

                return (
                  <div
                    key={a.id}
                    className="rounded-2xl border border-gray-200 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="text-lg font-semibold">
                        {a.account_number ?? "-"}{" "}
                        <span className="text-gray-400 font-normal">•</span>{" "}
                        <span className="text-gray-700">{a.firm ?? "-"}</span>
                      </div>

                      <div className="text-sm text-gray-600">
                        Этап: <span className="text-gray-900">{nicePhase(a.phase)}</span> • Размер:{" "}
                        <span className="text-gray-900">{a.size ?? 0}$</span> • Баланс:{" "}
                        <span className="text-gray-900">{a.balance ?? 0}$</span>
                      </div>

                      <div className="text-sm text-gray-600">
                        До лимита:{" "}
                        <span className="text-gray-900">
                          {dd.leftUsd.toFixed(2)}$ ({dd.leftPct.toFixed(2)}%)
                        </span>
                        {a.phase !== "live" && pass && (
                          <>
                            {" "}
                            • До цели:{" "}
                            <span className="text-gray-900">
                              {pass.leftUsd.toFixed(2)}$ ({pass.leftPct.toFixed(2)}%)
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 justify-between md:justify-end">
                      <div
                        className={
                          "px-3 py-1 rounded-full text-sm font-semibold " +
                          (pnl >= 0 ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200")
                        }
                      >
                        {pnl.toFixed(2)}%
                      </div>

                      <button className="btn-outline" onClick={() => openEdit(a)}>
                        Редактировать
                      </button>

                      <button className="btn-danger" onClick={() => deleteAccount(a.id)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* EDIT MODAL */}
        {editing && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-xl rounded-3xl shadow-xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-lg font-bold">Редактировать счёт</div>
                  <div className="text-sm text-gray-600">
                    {editing.account_number ?? "-"} • {editing.firm ?? "-"}
                  </div>
                </div>
                <button
                  className="text-gray-500 hover:text-black"
                  onClick={() => setEditing(null)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Номер счёта</label>
                  <input
                    className="input"
                    value={editForm.account_number}
                    onChange={(e) => setEditForm({ ...editForm, account_number: e.target.value })}
                  />
                </div>

                <div>
                  <label className="label">Компания</label>
                  <input
                    className="input"
                    value={editForm.firm}
                    onChange={(e) => setEditForm({ ...editForm, firm: e.target.value })}
                  />
                </div>

                <div>
                  <label className="label">Этап</label>
                  <select
                    className="input"
                    value={editForm.phase}
                    onChange={(e) => {
                      const v = e.target.value as Phase;
                      setEditForm({
                        ...editForm,
                        phase: v,
                        profit_target_percent: v === "phase2" ? "5" : v === "phase1" ? "8" : "",
                      });
                    }}
                  >
                    <option value="phase1">Фаза 1</option>
                    <option value="phase2">Фаза 2</option>
                    <option value="live">Лайв</option>
                  </select>
                </div>

                <div>
                  <label className="label">Размер счёта</label>
                  <input
                    className="input"
                    value={editForm.size}
                    onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                  />
                </div>

                <div>
                  <label className="label">Текущий баланс</label>
                  <input
                    className="input"
                    value={editForm.balance}
                    onChange={(e) => setEditForm({ ...editForm, balance: e.target.value })}
                  />
                </div>

                <div>
                  <label className="label">Лимит просадки (%)</label>
                  <input
                    className="input"
                    value={editForm.max_drawdown_percent}
                    onChange={(e) => setEditForm({ ...editForm, max_drawdown_percent: e.target.value })}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="label">Цель прибыли (%)</label>
                  <input
                    className="input"
                    disabled={editForm.phase === "live"}
                    value={editForm.phase === "live" ? "" : editForm.profit_target_percent}
                    onChange={(e) => setEditForm({ ...editForm, profit_target_percent: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button className="btn-outline w-full" onClick={() => setEditing(null)}>
                  Отмена
                </button>
                <button className="btn-primary w-full" onClick={saveEdit}>
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .label {
          display: block;
          font-size: 12px;
          color: #4b5563;
          margin-bottom: 6px;
        }
        .input {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 10px 12px;
          outline: none;
        }
        .input:focus {
          border-color: #111827;
        }
        .btn-primary {
          background: #000;
          color: #fff;
          border-radius: 14px;
          padding: 10px 12px;
          transition: 0.2s;
        }
        .btn-primary:hover {
          background: #111827;
        }
        .btn-outline {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 10px 12px;
          background: #fff;
          transition: 0.2s;
        }
        .btn-outline:hover {
          background: #f3f4f6;
        }
        .btn-danger {
          border: 1px solid #fecaca;
          color: #b91c1c;
          border-radius: 14px;
          padding: 10px 12px;
          background: #fff;
          transition: 0.2s;
        }
        .btn-danger:hover {
          background: #fef2f2;
        }
      `}</style>
    </div>
  );
}
