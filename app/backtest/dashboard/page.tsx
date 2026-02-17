"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../src/lib/supabaseClient";

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
function pct(n: number, d = 0) {
  return `${(Number.isFinite(n) ? n : 0).toFixed(d)}%`;
}

const KILLZONES: Record<string, string> = {
  asia: "Азия",
  frank: "Франкфурт",
  london: "Лондон",
  lunch: "Ланч",
  ny: "Нью-Йорк",
  late_ny: "Поздний НЮ",
};
const DIRECTIONS: Record<string, string> = { long: "Лонг", short: "Шорт" };
const MARKET_PHASES: Record<string, string> = { reverse: "Реверс", continuation: "Конт", range: "Боковик" };
const OUTCOMES: Record<string, string> = { sl: "Стоп", tp: "Тэйк", be_plus: "БУ+", be_minus: "БУ-" };

function outcomeBadge(outcome: string) {
  if (outcome === "tp") return { t: "Т", cls: "bg-green-50 text-green-700 border-green-200" };
  if (outcome === "sl") return { t: "С", cls: "bg-red-50 text-red-700 border-red-200" };
  if (outcome === "be_plus") return { t: "БУ+", cls: "bg-green-50 text-green-700 border-green-200" };
  if (outcome === "be_minus") return { t: "БУ-", cls: "bg-red-50 text-red-700 border-red-200" };
  return { t: outcome, cls: "bg-gray-50 text-gray-700 border-gray-200" };
}

// для "лучший/худший" — по исходам, НЕ по $
function scoreByOutcome(outcome: string) {
  if (outcome === "tp") return 1;
  if (outcome === "be_plus") return 0.5;
  if (outcome === "be_minus") return -0.5;
  if (outcome === "sl") return -1;
  return 0;
}
function isWin(outcome: string) {
  return outcome === "tp" || outcome === "be_plus";
}

type BT = {
  id: string;
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
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function fmtDateISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}
function ruMonthTitle(d: Date) {
  const ru = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  return `${ru[d.getMonth()]} ${d.getFullYear()} г.`;
}
const DOW_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export default function BacktestDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [trades, setTrades] = useState<BT[]>([]);

  // календарь
  const [cursorMonth, setCursorMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
      .order("created_at", { ascending: false })
      .limit(2000);

    if (trErr) {
      console.log("BACKTEST DASH TRADES ERROR:", trErr);
      setErrMsg(trErr.message);
      setTrades([]);
    } else {
      setTrades((tr as BT[]) || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computed = useMemo(() => {
    const all = trades;

    // неделя: последние 7 дней от сегодня
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    const weekStartISO = fmtDateISO(weekStart);
    const todayISO = fmtDateISO(today);

    const monthStart = fmtDateISO(startOfMonth(cursorMonth));
    const monthEnd = fmtDateISO(endOfMonth(cursorMonth));

    const monthTrades = all.filter((t) => t.trade_date >= monthStart && t.trade_date <= monthEnd);
    const weekTrades = all.filter((t) => t.trade_date >= weekStartISO && t.trade_date <= todayISO);

    function winrate(arr: BT[]) {
      const n = arr.length;
      const w = arr.filter((t) => isWin(t.outcome)).length;
      return { n, w, l: n - w, wr: n ? (w / n) * 100 : 0 };
    }

    const mWR = winrate(monthTrades);
    const wWR = winrate(weekTrades);

    const last5 = all.slice(0, 5).map((t) => t.outcome);

    // best/worst по исходам
    function aggBestWorst(arr: BT[], keyFn: (t: BT) => string) {
      const map = new Map<string, { n: number; scoreSum: number; win: number }>();
      for (const t of arr) {
        const k = (keyFn(t) || "").trim();
        if (!k) continue;
        const prev = map.get(k) ?? { n: 0, scoreSum: 0, win: 0 };
        prev.n += 1;
        prev.scoreSum += scoreByOutcome(t.outcome);
        prev.win += isWin(t.outcome) ? 1 : 0;
        map.set(k, prev);
      }
      const items = Array.from(map.entries())
        .map(([k, v]) => ({
          k,
          n: v.n,
          avgScore: v.n ? v.scoreSum / v.n : 0,
          wr: v.n ? (v.win / v.n) * 100 : 0,
        }))
        .filter((x) => x.n >= 2);

      items.sort((a, b) => b.avgScore - a.avgScore);
      const best = items[0] ?? null;
      const worst = items.length ? items[items.length - 1] : null;

      const sub = (x: any) => (x ? `AVG(score): ${x.avgScore.toFixed(3)} • WR: ${pct(x.wr, 0)} • N: ${x.n}` : "Нет данных (нужно ≥2)");

      return {
        best: best?.k ?? "—",
        bestSub: sub(best),
        worst: worst?.k ?? "—",
        worstSub: sub(worst),
      };
    }

    const setups = aggBestWorst(monthTrades, (t) => String(t.setup ?? "").trim());
    const assets = aggBestWorst(monthTrades, (t) => String(t.asset ?? "").toLowerCase().trim());
    const killzones = aggBestWorst(monthTrades, (t) => KILLZONES[t.killzone] ?? t.killzone);

    // календарь суммы по дням (внутри текущего cursorMonth)
    const daySum = new Map<string, number>();
    const dayCount = new Map<string, number>();
    for (const t of monthTrades) {
      const d = t.trade_date;
      daySum.set(d, (daySum.get(d) ?? 0) + toNum(t.pnl_money));
      dayCount.set(d, (dayCount.get(d) ?? 0) + 1);
    }

    return { monthTrades, weekTrades, mWR, wWR, last5, setups, assets, killzones, daySum, dayCount, monthStart, monthEnd };
  }, [trades, cursorMonth]);

  const calendarDays = useMemo(() => {
    const first = startOfMonth(cursorMonth);
    const last = endOfMonth(cursorMonth);

    // сдвиг чтобы Пн был первым
    const jsDow = first.getDay(); // 0..6 (Вс..Сб)
    const mondayFirstOffset = (jsDow + 6) % 7; // сколько пустых клеток до 1 числа

    const totalDays = last.getDate();
    const cells: { type: "empty" | "day"; date?: Date }[] = [];
    for (let i = 0; i < mondayFirstOffset; i++) cells.push({ type: "empty" });

    for (let d = 1; d <= totalDays; d++) {
      cells.push({ type: "day", date: new Date(first.getFullYear(), first.getMonth(), d) });
    }

    // добьём до 6 недель (42 клетки) чтобы красиво
    while (cells.length < 42) cells.push({ type: "empty" });

    return cells;
  }, [cursorMonth]);

  const selectedTrades = useMemo(() => {
    if (!selectedDay) return [];
    return trades.filter((t) => t.trade_date === selectedDay).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [selectedDay, trades]);

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
          <h1 className="text-2xl font-bold text-gray-900">БэкТест • Дашборд</h1>
          <p className="mt-2 text-gray-600">Войди в аккаунт, чтобы видеть бэк-тест аналитику.</p>
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
            <h1 className="text-3xl font-bold text-gray-900">БэкТест • Дашборд</h1>
            <p className="mt-2 text-sm text-gray-600">Аналитика и календарь по backtest_trades</p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/backtest" className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Журнал бэк-теста
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

        {/* Метрики */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-gray-900">Аналитика бэк-теста</div>
            <Link href="/backtest" className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Перейти в журнал
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <Card title="Сделок за месяц" value={computed.mWR.n} sub={`Период: ${computed.monthStart} — ${computed.monthEnd}`} />
            <Card title="Сделок за неделю" value={computed.wWR.n} sub="Последние 7 дней" />
            <Card title="WinRate (месяц)" value={pct(computed.mWR.wr, 0)} sub={`W:${computed.mWR.w} / L:${computed.mWR.l} (БУ как win/loss)`} />
            <Card title="WinRate (неделя)" value={pct(computed.wWR.wr, 0)} sub={`W:${computed.wWR.w} / L:${computed.wWR.l}`} />
          </div>

          <div className="mt-4 rounded-xl border p-4">
            <div className="text-sm font-semibold text-gray-900">Серия (последние 5 сделок)</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {computed.last5.length ? (
                computed.last5.map((o, idx) => {
                  const b = outcomeBadge(o);
                  return (
                    <span key={`${o}-${idx}`} className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-bold ${b.cls}`}>
                      {b.t}
                    </span>
                  );
                })
              ) : (
                <div className="text-sm text-gray-500">Нет сделок</div>
              )}
            </div>
          </div>

          {/* Лучший/худший (по исходам) */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <BW title="Сетапы" best={computed.setups.best} bestSub={computed.setups.bestSub} worst={computed.setups.worst} worstSub={computed.setups.worstSub} />
            <BW title="Активы" best={computed.assets.best} bestSub={computed.assets.bestSub} worst={computed.assets.worst} worstSub={computed.assets.worstSub} />
            <BW title="Киллзоны" best={computed.killzones.best} bestSub={computed.killzones.bestSub} worst={computed.killzones.worst} worstSub={computed.killzones.worstSub} />
          </div>

          <div className="mt-2 text-[11px] text-gray-500">Важно: “лучший/худший” считается по исходам TP/SL/БУ (score), не по сумме $.</div>
        </div>

        {/* Календарь */}
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm border">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-gray-900">Календарь бэк-теста</div>
              <div className="mt-1 text-sm text-gray-600">Нажми на день — покажет все сделки за этот день</div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setCursorMonth((d) => addMonths(d, -1))} className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
                ←
              </button>
              <div className="rounded-xl border bg-white px-4 py-2 text-sm font-medium">{ruMonthTitle(cursorMonth)}</div>
              <button onClick={() => setCursorMonth((d) => addMonths(d, 1))} className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
                →
              </button>
              <button
                onClick={() => {
                  setCursorMonth(startOfMonth(new Date()));
                  setSelectedDay(null);
                }}
                className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Сегодня
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2">
            {DOW_RU.map((d) => (
              <div key={d} className="text-xs text-gray-500 px-1">
                {d}
              </div>
            ))}

            {calendarDays.map((c, idx) => {
              if (c.type === "empty") {
                return <div key={idx} className="h-[64px] rounded-xl border bg-gray-50 opacity-40" />;
              }

              const iso = fmtDateISO(c.date!);
              const sum = computed.daySum.get(iso) ?? 0;
              const cnt = computed.dayCount.get(iso) ?? 0;

              const ring =
                sum > 0 ? "border-green-300" : sum < 0 ? "border-red-300" : selectedDay === iso ? "border-black" : "border-gray-200";
              const dot = sum > 0 ? "bg-green-600" : sum < 0 ? "bg-red-600" : "bg-gray-300";
              const moneyCls = sum > 0 ? "text-green-700" : sum < 0 ? "text-red-700" : "text-gray-500";

              return (
                <button
                  key={iso}
                  onClick={() => setSelectedDay(iso)}
                  className={`h-[64px] rounded-xl border ${ring} bg-white p-2 text-left hover:bg-gray-50 transition`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`h-2 w-2 rounded-full ${dot}`} />
                    <div className={`text-xs font-semibold ${selectedDay === iso ? "text-black" : "text-gray-700"}`}>{c.date!.getDate()}</div>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">Сделок: {cnt}</div>
                  <div className={`mt-1 text-xs font-semibold ${moneyCls}`}>{sum === 0 ? "0" : `$ ${fmtMoney(sum)}`}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 border-t pt-4">
            {!selectedDay ? (
              <div className="text-sm text-gray-600">Выбери день в календаре</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">Сделки за {selectedDay}</div>
                  <Link href="/backtest" className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
                    Открыть журнал
                  </Link>
                </div>

                {selectedTrades.length === 0 ? (
                  <div className="mt-3 text-sm text-gray-500">Нет сделок в этот день.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {selectedTrades.map((t) => {
                      const b = outcomeBadge(t.outcome);
                      const pnl = toNum(t.pnl_money);
                      const pnlCls = pnl > 0 ? "text-green-700" : pnl < 0 ? "text-red-700" : "text-gray-600";

                      return (
                        <div key={t.id} className="rounded-xl border p-4 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-gray-900">
                                {t.asset.toUpperCase()} • {KILLZONES[t.killzone] ?? t.killzone}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {DIRECTIONS[t.direction] ?? t.direction} • {MARKET_PHASES[t.market_phase] ?? t.market_phase} • Сетап: {t.setup || "—"} • Риск{" "}
                                {toNum(t.risk_pct).toFixed(2)}% • RR {toNum(t.rr).toFixed(2)} • {OUTCOMES[t.outcome] ?? t.outcome}
                              </div>

                              {t.comment ? <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{t.comment}</div> : null}

                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                {t.htf_screenshot_url ? (
                                  <a href={t.htf_screenshot_url} target="_blank" className="underline text-gray-700">
                                    Скрин ХТФ
                                  </a>
                                ) : null}
                                {t.ltf_screenshot_url ? (
                                  <a href={t.ltf_screenshot_url} target="_blank" className="underline text-gray-700">
                                    Скрин ЛТФ
                                  </a>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <span className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-bold ${b.cls}`}>{b.t}</span>
                              <div className={`text-sm font-bold ${pnlCls}`}>{pnl === 0 ? "$ 0" : `${pnl > 0 ? "+" : ""}$ ${fmtMoney(pnl)}`}</div>
                              <div className="text-[11px] text-gray-400">{t.id}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Card({ title, value, sub }: { title: string; value: any; sub?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}

function BW({ title, best, bestSub, worst, worstSub }: { title: string; best: string; bestSub: string; worst: string; worstSub: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="text-sm font-semibold text-gray-900">{title}</div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <div className="rounded-xl border p-4 bg-green-50 border-green-200">
          <div className="text-xs text-gray-600">Лучший</div>
          <div className="mt-1 font-semibold text-gray-900">{best}</div>
          <div className="mt-1 text-xs text-gray-600">{bestSub}</div>
        </div>

        <div className="rounded-xl border p-4 bg-red-50 border-red-200">
          <div className="text-xs text-gray-600">Худший</div>
          <div className="mt-1 font-semibold text-gray-900">{worst}</div>
          <div className="mt-1 text-xs text-gray-600">{worstSub}</div>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-gray-500">Считаем по исходам (score), не по $.</div>
    </div>
  );
}
