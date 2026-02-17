"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../src/lib/supabaseClient";

// ===== helpers =====
function toNum(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(",", ".").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function dayRu(dow: number) {
  const map = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return map[dow] ?? "-";
}

// ✅ Нормализация знака PnL по результату
function normalizePnlByOutcome(outcome: string, rawPnl: number) {
  const abs = Math.abs(toNum(rawPnl));
  const neg = outcome === "sl" || outcome === "be_minus";
  return neg ? -abs : abs;
}

const KILLZONES = [
  { v: "asia", ru: "Азия" },
  { v: "frank", ru: "Франкфурт" },
  { v: "london", ru: "Лондон" },
  { v: "lunch", ru: "Ланч" },
  { v: "ny", ru: "Нью-Йорк" },
  { v: "late_ny", ru: "Поздний НЮ" },
] as const;

const DIRECTIONS = [
  { v: "long", ru: "Лонг" },
  { v: "short", ru: "Шорт" },
] as const;

const MARKET_PHASES = [
  { v: "reverse", ru: "Реверс" },
  { v: "continuation", ru: "Конт" },
  { v: "range", ru: "Боковик" },
] as const;

const OUTCOMES = [
  { v: "sl", ru: "Стоп" },
  { v: "tp", ru: "Тэйк" },
  { v: "be_plus", ru: "БУ+" },
  { v: "be_minus", ru: "БУ-" },
] as const;

type BacktestTradeRow = {
  id: string;
  user_id: string;
  trade_date: string;
  day_of_week: number;
  asset: string;
  killzone: string;
  direction: string;
  market_phase: string;
  setup: string | null;
  risk_pct: number;
  rr: number;
  outcome: string;
  pnl_money: number;
  htf_screenshot_url: string | null;
  ltf_screenshot_url: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export default function BacktestTradesPage() {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [trades, setTrades] = useState<BacktestTradeRow[]>([]);

  const [form, setForm] = useState({
    trade_date: "",
    asset: "",
    killzone: "asia",
    direction: "long",
    market_phase: "continuation",
    setup: "",
    risk_pct: "1",
    rr: "2",
    outcome: "tp",
    pnl_money: "0",
    htf_screenshot_url: "",
    ltf_screenshot_url: "",
    comment: "",
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<any>({});
  const [editOriginal, setEditOriginal] = useState<BacktestTradeRow | null>(null);

  function setField(k: string, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  // ✅ Когда меняешь результат — сразу нормализуем знак в поле суммы
  function onOutcomeChange(nextOutcome: string) {
    setForm((p) => {
      const raw = toNum(p.pnl_money);
      const norm = normalizePnlByOutcome(nextOutcome, raw);
      return { ...p, outcome: nextOutcome, pnl_money: String(norm === 0 ? 0 : norm) };
    });
  }

  async function reload() {
    setErrMsg(null);
    setLoading(true);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.log("AUTH ERROR:", authErr);
    const user = authData.user;

    if (!user) {
      setIsAuthed(false);
      setLoading(false);
      return;
    }
    setIsAuthed(true);

    const { data: tr, error: trErr } = await supabase
      .from("backtest_trades")
      .select("*")
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (trErr) {
      console.log("BACKTEST TRADES ERROR:", trErr);
      setErrMsg(trErr.message);
      setTrades([]);
    } else {
      setTrades((tr as BacktestTradeRow[]) || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTrade() {
    setErrMsg(null);

    if (!form.trade_date) return setErrMsg("Выбери дату сделки.");
    if (!form.asset.trim()) return setErrMsg("Укажи актив (например XAUUSD).");

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return setErrMsg("Нужно войти.");

    const pnl = normalizePnlByOutcome(form.outcome, toNum(form.pnl_money));

    const payload = {
      user_id: user.id,
      trade_date: form.trade_date,
      day_of_week: new Date(form.trade_date + "T00:00:00").getDay(),
      asset: form.asset.trim(),
      killzone: form.killzone,
      direction: form.direction,
      market_phase: form.market_phase,
      setup: form.setup.trim() || null,
      risk_pct: toNum(form.risk_pct),
      rr: toNum(form.rr),
      outcome: form.outcome,
      pnl_money: pnl,
      htf_screenshot_url: form.htf_screenshot_url.trim() || null,
      ltf_screenshot_url: form.ltf_screenshot_url.trim() || null,
      comment: form.comment.trim() || null,
    };

    const { error } = await supabase.from("backtest_trades").insert(payload);
    if (error) {
      console.log("INSERT BACKTEST TRADE ERROR:", error);
      setErrMsg(error.message);
      return;
    }

    setForm((p) => ({
      ...p,
      asset: "",
      setup: "",
      risk_pct: "1",
      rr: "2",
      outcome: "tp",
      pnl_money: "0",
      htf_screenshot_url: "",
      ltf_screenshot_url: "",
      comment: "",
    }));

    await reload();
  }

  function startEdit(t: BacktestTradeRow) {
    setErrMsg(null);
    setEditId(t.id);
    setEditOriginal(t);
    setEdit({
      trade_date: t.trade_date,
      asset: t.asset,
      killzone: t.killzone,
      direction: t.direction,
      market_phase: t.market_phase,
      setup: t.setup ?? "",
      risk_pct: String(t.risk_pct ?? ""),
      rr: String(t.rr ?? ""),
      outcome: t.outcome,
      pnl_money: String(t.pnl_money ?? ""),
      htf_screenshot_url: t.htf_screenshot_url ?? "",
      ltf_screenshot_url: t.ltf_screenshot_url ?? "",
      comment: t.comment ?? "",
    });
  }

  function cancelEdit() {
    setEditId(null);
    setEdit({});
    setEditOriginal(null);
  }

  function onEditOutcomeChange(nextOutcome: string) {
    setEdit((p: any) => {
      const raw = toNum(p.pnl_money);
      const norm = normalizePnlByOutcome(nextOutcome, raw);
      return { ...p, outcome: nextOutcome, pnl_money: String(norm === 0 ? 0 : norm) };
    });
  }

  async function saveEdit(id: string) {
    setErrMsg(null);

    if (!edit.trade_date) return setErrMsg("В редактировании: выбери дату сделки.");
    if (!String(edit.asset || "").trim()) return setErrMsg("В редактировании: укажи актив.");

    const newPnl = normalizePnlByOutcome(String(edit.outcome), toNum(edit.pnl_money));

    const payload = {
      trade_date: edit.trade_date,
      day_of_week: new Date(String(edit.trade_date) + "T00:00:00").getDay(),
      asset: String(edit.asset || "").trim(),
      killzone: edit.killzone,
      direction: edit.direction,
      market_phase: edit.market_phase,
      setup: String(edit.setup || "").trim() || null,
      risk_pct: toNum(edit.risk_pct),
      rr: toNum(edit.rr),
      outcome: edit.outcome,
      pnl_money: newPnl,
      htf_screenshot_url: String(edit.htf_screenshot_url || "").trim() || null,
      ltf_screenshot_url: String(edit.ltf_screenshot_url || "").trim() || null,
      comment: String(edit.comment || "").trim() || null,
    };

    const { error } = await supabase.from("backtest_trades").update(payload).eq("id", id);
    if (error) {
      console.log("UPDATE BACKTEST TRADE ERROR:", error);
      setErrMsg(error.message);
      return;
    }

    cancelEdit();
    await reload();
  }

  async function deleteTrade(id: string) {
    setErrMsg(null);
    const ok = window.confirm("Удалить сделку бэк-теста?");
    if (!ok) return;

    const { error } = await supabase.from("backtest_trades").delete().eq("id", id);
    if (error) {
      console.log("DELETE BACKTEST TRADE ERROR:", error);
      setErrMsg(error.message);
      return;
    }

    await reload();
  }

  const tradesCount = trades.length;

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
          <h1 className="text-2xl font-bold text-gray-900">БэкТест • Журнал</h1>
          <p className="mt-2 text-gray-600">Войди в аккаунт, чтобы вести бэк-тест.</p>
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
            <h1 className="text-3xl font-bold text-gray-900">БэкТест • Журнал сделок</h1>
            <p className="mt-2 text-sm text-gray-600">
              Отдельный журнал. Не влияет на реальные счета/сделки. Стоп/БУ- делает сумму отрицательной автоматически.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/backtest/dashboard" className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Дашборд
            </Link>
            <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Главная
            </Link>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/";
              }}
              className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-10">
        {errMsg ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errMsg}</div>
        ) : null}

        <div className="rounded-2xl bg-white p-6 shadow-sm border">
          <div className="text-lg font-semibold text-gray-900">Добавить сделку (бэк-тест)</div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Дата сделки">
              <input
                type="date"
                className="w-full rounded-xl border px-3 py-2"
                value={form.trade_date}
                onChange={(e) => setField("trade_date", e.target.value)}
              />
            </Field>

            <Field label="Актив">
              <input
                className="w-full rounded-xl border px-3 py-2"
                placeholder="XAUUSD"
                value={form.asset}
                onChange={(e) => setField("asset", e.target.value)}
              />
            </Field>

            <Field label="Сетап">
              <input
                className="w-full rounded-xl border px-3 py-2"
                placeholder="h1m3 / m15m3 / ..."
                value={form.setup}
                onChange={(e) => setField("setup", e.target.value)}
              />
            </Field>

            <Field label="Киллзона">
              <select className="w-full rounded-xl border px-3 py-2" value={form.killzone} onChange={(e) => setField("killzone", e.target.value)}>
                {KILLZONES.map((k) => (
                  <option key={k.v} value={k.v}>
                    {k.ru}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Направление">
              <select className="w-full rounded-xl border px-3 py-2" value={form.direction} onChange={(e) => setField("direction", e.target.value)}>
                {DIRECTIONS.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.ru}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Фаза рынка">
              <select className="w-full rounded-xl border px-3 py-2" value={form.market_phase} onChange={(e) => setField("market_phase", e.target.value)}>
                {MARKET_PHASES.map((m) => (
                  <option key={m.v} value={m.v}>
                    {m.ru}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Риск %">
              <input className="w-full rounded-xl border px-3 py-2" inputMode="decimal" value={form.risk_pct} onChange={(e) => setField("risk_pct", e.target.value)} />
            </Field>

            <Field label="RR">
              <input className="w-full rounded-xl border px-3 py-2" inputMode="decimal" value={form.rr} onChange={(e) => setField("rr", e.target.value)} />
            </Field>

            <Field label="Результат">
              <select className="w-full rounded-xl border px-3 py-2" value={form.outcome} onChange={(e) => onOutcomeChange(e.target.value)}>
                {OUTCOMES.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.ru}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Результат $ (просто число)">
              <input
                className="w-full rounded-xl border px-3 py-2"
                inputMode="decimal"
                placeholder="200"
                value={form.pnl_money}
                onChange={(e) => setField("pnl_money", e.target.value)}
              />
            </Field>

            <Field label="Скрин ХТФ (URL)">
              <input className="w-full rounded-xl border px-3 py-2" placeholder="https://..." value={form.htf_screenshot_url} onChange={(e) => setField("htf_screenshot_url", e.target.value)} />
            </Field>

            <Field label="Скрин ЛТФ (URL)">
              <input className="w-full rounded-xl border px-3 py-2" placeholder="https://..." value={form.ltf_screenshot_url} onChange={(e) => setField("ltf_screenshot_url", e.target.value)} />
            </Field>
          </div>

          <div className="mt-3">
            <div className="text-sm font-medium text-gray-700 mb-1">Комментарий</div>
            <textarea className="w-full rounded-xl border px-3 py-2 min-h-[90px]" value={form.comment} onChange={(e) => setField("comment", e.target.value)} />
          </div>

          <div className="mt-4 flex items-center justify-end">
            <button onClick={createTrade} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              Сохранить сделку
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm border">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-gray-900">Сделки (бэк-тест): {tradesCount}</div>
            <button onClick={reload} className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Обновить
            </button>
          </div>

          {trades.length === 0 ? (
            <div className="mt-4 text-sm text-gray-500">Пока нет сделок.</div>
          ) : (
            <div className="mt-4 space-y-3">
              {trades.map((t) => {
                const isEditing = editId === t.id;
                const pnl = toNum(t.pnl_money);
                const pnlClass = pnl > 0 ? "text-green-600" : pnl < 0 ? "text-red-600" : "text-gray-800";

                const kzRu = KILLZONES.find((x) => x.v === t.killzone)?.ru ?? t.killzone;
                const dirRu = DIRECTIONS.find((x) => x.v === t.direction)?.ru ?? t.direction;
                const mpRu = MARKET_PHASES.find((x) => x.v === t.market_phase)?.ru ?? t.market_phase;
                const outRu = OUTCOMES.find((x) => x.v === t.outcome)?.ru ?? t.outcome;

                return (
                  <div key={t.id} className="rounded-xl border p-4">
                    {!isEditing ? (
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="font-semibold text-gray-900">
                            {t.trade_date} • {dayRu(t.day_of_week)} • {t.asset}
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {kzRu} • {dirRu} • {mpRu} • Сетап: {t.setup || "—"} • Риск {toNum(t.risk_pct).toFixed(2)}% • RR {toNum(t.rr).toFixed(2)} • {outRu}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-3 text-sm">
                            <div className={`font-semibold ${pnlClass}`}>${fmtMoney(pnl)}</div>
                          </div>

                          {t.comment ? <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{t.comment}</div> : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(t)} className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
                            Редактировать
                          </button>
                          <button onClick={() => deleteTrade(t.id)} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                            Удалить
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold text-gray-900">Редактирование</div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => saveEdit(t.id)} className="rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white hover:opacity-90">
                              Сохранить
                            </button>
                            <button onClick={cancelEdit} className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
                              Отмена
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                          <Field label="Дата сделки">
                            <input className="w-full rounded-xl border px-3 py-2" type="date" value={edit.trade_date} onChange={(e) => setEdit((p: any) => ({ ...p, trade_date: e.target.value }))} />
                          </Field>

                          <Field label="Актив">
                            <input className="w-full rounded-xl border px-3 py-2" value={edit.asset} onChange={(e) => setEdit((p: any) => ({ ...p, asset: e.target.value }))} />
                          </Field>

                          <Field label="Сетап">
                            <input className="w-full rounded-xl border px-3 py-2" value={edit.setup} onChange={(e) => setEdit((p: any) => ({ ...p, setup: e.target.value }))} />
                          </Field>

                          <Field label="Киллзона">
                            <select className="w-full rounded-xl border px-3 py-2" value={edit.killzone} onChange={(e) => setEdit((p: any) => ({ ...p, killzone: e.target.value }))}>
                              {KILLZONES.map((k) => (
                                <option key={k.v} value={k.v}>
                                  {k.ru}
                                </option>
                              ))}
                            </select>
                          </Field>

                          <Field label="Направление">
                            <select className="w-full rounded-xl border px-3 py-2" value={edit.direction} onChange={(e) => setEdit((p: any) => ({ ...p, direction: e.target.value }))}>
                              {DIRECTIONS.map((d) => (
                                <option key={d.v} value={d.v}>
                                  {d.ru}
                                </option>
                              ))}
                            </select>
                          </Field>

                          <Field label="Фаза рынка">
                            <select className="w-full rounded-xl border px-3 py-2" value={edit.market_phase} onChange={(e) => setEdit((p: any) => ({ ...p, market_phase: e.target.value }))}>
                              {MARKET_PHASES.map((m) => (
                                <option key={m.v} value={m.v}>
                                  {m.ru}
                                </option>
                              ))}
                            </select>
                          </Field>

                          <Field label="Риск %">
                            <input className="w-full rounded-xl border px-3 py-2" value={edit.risk_pct} onChange={(e) => setEdit((p: any) => ({ ...p, risk_pct: e.target.value }))} />
                          </Field>

                          <Field label="RR">
                            <input className="w-full rounded-xl border px-3 py-2" value={edit.rr} onChange={(e) => setEdit((p: any) => ({ ...p, rr: e.target.value }))} />
                          </Field>

                          <Field label="Результат">
                            <select className="w-full rounded-xl border px-3 py-2" value={edit.outcome} onChange={(e) => onEditOutcomeChange(e.target.value)}>
                              {OUTCOMES.map((o) => (
                                <option key={o.v} value={o.v}>
                                  {o.ru}
                                </option>
                              ))}
                            </select>
                          </Field>

                          <Field label="Результат $ (просто число)">
                            <input className="w-full rounded-xl border px-3 py-2" value={edit.pnl_money} onChange={(e) => setEdit((p: any) => ({ ...p, pnl_money: e.target.value }))} />
                          </Field>
                        </div>

                        <div className="mt-3">
                          <div className="text-sm font-medium text-gray-700 mb-1">Комментарий</div>
                          <textarea className="w-full rounded-xl border px-3 py-2 min-h-[90px]" value={edit.comment} onChange={(e) => setEdit((p: any) => ({ ...p, comment: e.target.value }))} />
                        </div>
                      </>
                    )}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-700 mb-1">{label}</div>
      {children}
    </div>
  );
}
