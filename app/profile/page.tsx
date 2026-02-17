"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../src/lib/supabaseClient";

/** =======================
 * Helpers
 * ======================= */
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

function pct(n: number, digits = 0) {
  const x = Number.isFinite(n) ? n : 0;
  return `${x.toFixed(digits)}%`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function outcomeRu(v: string) {
  if (v === "tp") return "Т";
  if (v === "sl") return "С";
  if (v === "be_plus") return "БУ+";
  if (v === "be_minus") return "БУ-";
  return v;
}

function killzoneRu(v: string) {
  const m: Record<string, string> = {
    asia: "Азия",
    frank: "Франкфурт",
    london: "Лондон",
    lunch: "Ланч",
    ny: "Нью-Йорк",
    late_ny: "Поздний НЮ",
  };
  return m[v] ?? v;
}

/** Результаты по "качеству", НЕ по $ */
function scoreByOutcome(outcome: string) {
  // TP > BU+ > BU- > SL
  if (outcome === "tp") return 1;
  if (outcome === "be_plus") return 0.5;
  if (outcome === "be_minus") return -0.5;
  if (outcome === "sl") return -1;
  return 0;
}

function isWinOutcome(outcome: string) {
  return outcome === "tp" || outcome === "be_plus";
}

type TradeRow = {
  id: string;
  user_id?: string;
  account_id: string;
  trade_date: string;
  day_of_week?: number;
  asset: string;
  killzone: string;
  direction: string;
  market_phase: string;
  setup?: string | null;
  risk_pct: number;
  rr: number;
  outcome: string;
  pnl_money: number;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
  created_at?: string;
};

/** =======================
 * UI Components
 * ======================= */
function StatCard({
  title,
  value,
  sub,
  hint,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-4 relative group cursor-help">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-xl font-bold mt-1 text-gray-900">{value}</div>
      {sub ? <div className="text-xs text-gray-500 mt-1">{sub}</div> : null}

      {hint ? (
        <div className="absolute hidden group-hover:block bottom-full left-0 mb-2 w-[280px] rounded-lg border bg-white shadow-lg text-xs p-2 z-20 text-gray-700">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "good" | "bad" | "neutral" }) {
  const cls =
    tone === "good"
      ? "bg-green-50 text-green-700 border-green-200"
      : tone === "bad"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-gray-50 text-gray-700 border-gray-200";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

function StrengthCard({
  title,
  bestLabel,
  bestSub,
  worstLabel,
  worstSub,
}: {
  title: string;
  bestLabel: string;
  bestSub: string;
  worstLabel: string;
  worstSub: string;
}) {
  return (
    <div className="bg-white rounded-2xl border p-5">
      <div className="text-sm font-semibold text-gray-900">{title}</div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        <div className="rounded-xl border p-4 bg-green-50 border-green-200">
          <div className="text-xs text-gray-600">Лучший</div>
          <div className="mt-1 font-semibold text-gray-900">{bestLabel || "—"}</div>
          <div className="mt-1 text-xs text-gray-600">{bestSub || "Нет данных"}</div>
        </div>

        <div className="rounded-xl border p-4 bg-red-50 border-red-200">
          <div className="text-xs text-gray-600">Худший</div>
          <div className="mt-1 font-semibold text-gray-900">{worstLabel || "—"}</div>
          <div className="mt-1 text-xs text-gray-600">{worstSub || "Нет данных"}</div>
        </div>
      </div>
    </div>
  );
}

/** =======================
 * Lvl трейдера (XP)
 * ======================= */
function calcLevelFromTrades(tradesCount: number) {
  // Простая система XP: за каждую сделку 3 XP
  const xp = tradesCount * 3;

  // Требование до след уровня растёт
  // L1: 0..49, L2: 50..119, L3: 120..219, L4: ...
  // Формула требования на уровень: need = 50 + (lvl-2)*20
  let lvl = 1;
  let cur = xp;
  let need = 50;

  while (lvl < 50 && cur >= need) {
    cur -= need;
    lvl += 1;
    need = 50 + Math.max(0, lvl - 2) * 20;
  }

  const nextNeed = need;
  const toNext = Math.max(0, nextNeed - cur);
  const progressPct = nextNeed ? (cur / nextNeed) * 100 : 0;

  let title = "Новичок";
  if (lvl >= 5) title = "Стабильный";
  if (lvl >= 10) title = "Продвинутый";
  if (lvl >= 20) title = "Профи";
  if (lvl >= 35) title = "Элита";

  return { lvl, xp, curXp: cur, nextNeed, toNext, progressPct, title };
}

/** =======================
 * Main Page
 * ======================= */
export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  const [email, setEmail] = useState<string>("");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [usernameDraft, setUsernameDraft] = useState<string>("");
  const [passwordDraft, setPasswordDraft] = useState<string>("");

  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function reload() {
    setErrMsg(null);
    setOkMsg(null);
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
    setEmail(user.email ?? "");

    const { data: p, error: pErr } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (pErr) console.log("PROFILE ERROR:", pErr);
    setProfile((p as ProfileRow) ?? null);
    setUsernameDraft((p as any)?.username ?? user.email ?? "");

    const { data: tr, error: trErr } = await supabase
      .from("trades")
      .select("*")
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (trErr) {
      console.log("TRADES ERROR:", trErr);
      setErrMsg(trErr.message);
      setTrades([]);
    } else {
      setTrades((tr as TradeRow[]) || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computed = useMemo(() => {
    const all = trades;

    const n = all.length;
    const wins = all.filter((t) => isWinOutcome(t.outcome)).length;
    const winRate = n ? (wins / n) * 100 : 0;

    const tpPlus = all.filter((t) => t.outcome === "tp" || t.outcome === "be_plus").length;
    const slMinus = all.filter((t) => t.outcome === "sl" || t.outcome === "be_minus").length;

    const sumProfit = all.filter((t) => t.pnl_money > 0).reduce((s, t) => s + toNum(t.pnl_money), 0);
    const sumLossAbs = Math.abs(all.filter((t) => t.pnl_money < 0).reduce((s, t) => s + toNum(t.pnl_money), 0));
    const profitFactor = sumLossAbs > 0 ? sumProfit / sumLossAbs : sumProfit > 0 ? 99 : 0;

    const avgRR = n ? all.reduce((s, t) => s + toNum(t.rr), 0) / n : 0;
    const avgRisk = n ? all.reduce((s, t) => s + toNum(t.risk_pct), 0) / n : 0;
    const expectancy = n ? all.reduce((s, t) => s + toNum(t.pnl_money), 0) / n : 0;

    const last8 = all.slice(0, 8).map((t) => t.outcome);

    let winStreak = 0;
    for (const t of all) {
      if (isWinOutcome(t.outcome)) winStreak += 1;
      else break;
    }

    // Форма (последние 10)
    const last10 = all.slice(0, 10);
    const scoreSum = last10.reduce((s, t) => s + scoreByOutcome(t.outcome), 0);
    const w10 = last10.filter((t) => isWinOutcome(t.outcome)).length;
    const wr10 = last10.length ? (w10 / last10.length) * 100 : 0;

    const scoreNorm = clamp(((scoreSum + 10) / 20) * 100, 0, 100);
    const formValue = clamp(scoreNorm * 0.6 + wr10 * 0.35 + clamp(winStreak, 0, 5) * 1.0, 0, 100);

    let formLabel: "On Fire" | "Neutral" | "Tilt" = "Neutral";
    if (formValue >= 68) formLabel = "On Fire";
    else if (formValue <= 42) formLabel = "Tilt";

    // Дисциплина / риск
    const lossStreak = (() => {
      let ls = 0;
      for (const t of all) {
        if (!isWinOutcome(t.outcome)) ls += 1;
        else break;
      }
      return ls;
    })();
    const discipline = clamp(winRate * 0.6 + Math.min(profitFactor, 5) * 10 - lossStreak * 4, 0, 100);

    const riskDelta = Math.abs(avgRisk - 1);
    const riskControl = clamp(100 - riskDelta * 120, 0, 100);

    function aggBestWorst(keyFn: (t: TradeRow) => string) {
      const map = new Map<string, { n: number; win: number; scoreSum: number }>();
      for (const t of all) {
        const k = (keyFn(t) || "").trim();
        if (!k) continue;
        const prev = map.get(k) ?? { n: 0, win: 0, scoreSum: 0 };
        prev.n += 1;
        prev.win += isWinOutcome(t.outcome) ? 1 : 0;
        prev.scoreSum += scoreByOutcome(t.outcome);
        map.set(k, prev);
      }

      const items = Array.from(map.entries())
        .map(([k, v]) => ({
          k,
          n: v.n,
          wr: v.n ? (v.win / v.n) * 100 : 0,
          avgScore: v.n ? v.scoreSum / v.n : 0,
        }))
        .filter((x) => x.n >= 2);

      items.sort((a, b) => b.avgScore - a.avgScore);
      const best = items[0] ?? null;
      const worst = items.length ? items[items.length - 1] : null;

      function sub(x: any) {
        if (!x) return "Нет данных (нужно ≥ 2 сделок)";
        return `AVG(score): ${x.avgScore.toFixed(3)} • WR: ${pct(x.wr, 0)} • N: ${x.n}`;
      }

      return {
        bestLabel: best?.k ?? "—",
        bestSub: sub(best),
        worstLabel: worst?.k ?? "—",
        worstSub: sub(worst),
      };
    }

    const setups = aggBestWorst((t) => String(t.setup ?? "").trim());
    const assets = aggBestWorst((t) => String(t.asset ?? "").trim().toLowerCase());
    const killzones = aggBestWorst((t) => killzoneRu(String(t.killzone ?? "")));

    const lvl = calcLevelFromTrades(n);

    return {
      n,
      wins,
      winRate,
      tpPlus,
      slMinus,
      profitFactor,
      avgRR,
      avgRisk,
      expectancy,
      last8,
      winStreak,
      discipline,
      riskControl,
      form: { value: formValue, label: formLabel, wr10, scoreSum },
      setups,
      assets,
      killzones,
      lvl,
    };
  }, [trades]);

  function formTone(label: string) {
    if (label === "On Fire") return "good";
    if (label === "Tilt") return "bad";
    return "neutral";
  }

  async function saveNick() {
    setErrMsg(null);
    setOkMsg(null);

    const nick = usernameDraft.trim();
    if (!nick) return setErrMsg("Ник не может быть пустым.");

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return setErrMsg("Нужно войти.");

    const { error } = await supabase.from("profiles").upsert(
      { id: user.id, username: nick },
      { onConflict: "id" }
    );

    if (error) {
      console.log("SAVE NICK ERROR:", error);
      setErrMsg(error.message);
      return;
    }

    setOkMsg("Ник обновлён.");
    await reload();
  }

  async function updatePassword() {
    setErrMsg(null);
    setOkMsg(null);

    const pass = passwordDraft.trim();
    if (!pass) return setErrMsg("Пароль не может быть пустым.");
    if (pass.length < 6) return setErrMsg("Пароль слишком короткий (минимум 6 символов).");

    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) {
      console.log("UPDATE PASSWORD ERROR:", error);
      setErrMsg(error.message);
      return;
    }

    setPasswordDraft("");
    setOkMsg("Пароль обновлён.");
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
          <h1 className="text-2xl font-bold text-gray-900">Профиль</h1>
          <p className="mt-2 text-gray-600">Войди в аккаунт, чтобы видеть профиль и аналитику.</p>
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
            <h1 className="text-3xl font-bold text-gray-900">Профиль</h1>
            <p className="mt-2 text-sm text-gray-600">Ультра-аналитика трейдера на основе журнала сделок</p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Главная
            </Link>
            <Link href="/trades" className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Журнал сделок
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
        {okMsg ? (
          <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{okMsg}</div>
        ) : null}

        {/* ===== Верхний блок профиля (Ник + пароль (сразу снизу)) + справа: Форма + LVL ===== */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-start">
            <div className="md:col-span-2">
              <div className="text-xs text-gray-500">Email</div>
              <div className="font-semibold text-gray-900">{email}</div>

              {/* Ник + пароль строго вертикально */}
              <div className="mt-4 max-w-xl">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Ник</div>
                  <div className="flex items-center gap-2">
                    <input
                      className="border rounded-lg px-2 py-1.5 text-sm w-full"
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      placeholder="Ник"
                    />
                    <button
                      onClick={saveNick}
                      className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Сохранить
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs text-gray-500 mb-1">Сменить пароль</div>
                  <div className="flex items-center gap-2">
                    <input
                      className="border rounded-lg px-2 py-1.5 text-sm w-full"
                      value={passwordDraft}
                      onChange={(e) => setPasswordDraft(e.target.value)}
                      placeholder="Новый пароль"
                      type="password"
                    />
                    <button
                      onClick={updatePassword}
                      className="rounded-lg bg-black px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Обновить
                    </button>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">Минимум 6 символов</div>
                </div>
              </div>
            </div>

            {/* Правая колонка: Форма + LVL рядом */}
            <div className="grid grid-cols-1 gap-3">
              {/* Форма */}
              <div className="rounded-2xl border bg-white p-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">Форма трейдера</div>
                  <Pill tone={formTone(computed.form.label)}>{computed.form.label}</Pill>
                </div>

                <div className="mt-2 text-xs text-gray-600">
                  Последние 10: score={computed.form.scoreSum.toFixed(1)}, WR10={pct(computed.form.wr10, 0)}
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Индекс формы</span>
                    <span className="font-semibold text-gray-900">{computed.form.value.toFixed(0)}/100</span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full ${
                        computed.form.label === "On Fire"
                          ? "bg-green-600"
                          : computed.form.label === "Tilt"
                          ? "bg-red-600"
                          : "bg-gray-600"
                      }`}
                      style={{ width: `${clamp(computed.form.value, 0, 100)}%` }}
                    />
                  </div>

                  <div className="mt-2 text-[11px] text-gray-500">
                    TP=+1, BU+=+0.5, BU-=-0.5, SL=-1. Серия побед чуть усиливает индекс.
                  </div>
                </div>
              </div>

              {/* LVL */}
              <div className="rounded-2xl border bg-white p-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">Уровень</div>
                  <Pill tone="neutral">{computed.lvl.title}</Pill>
                </div>

                <div className="mt-2">
                  <div className="text-2xl font-bold text-gray-900">Lv {computed.lvl.lvl}</div>
                  <div className="mt-1 text-xs text-gray-600">XP: {computed.lvl.xp}</div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>До следующего</span>
                    <span className="font-semibold text-gray-900">{computed.lvl.toNext} XP</span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-black" style={{ width: `${clamp(computed.lvl.progressPct, 0, 100)}%` }} />
                  </div>
                  <div className="mt-2 text-[11px] text-gray-500">Система XP простая: 3 XP за сделку.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== Метрики ===== */}
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard
            title="Сделок всего"
            value={computed.n}
            sub={`W: ${computed.tpPlus} / L: ${computed.slMinus} (БУ считаем отдельно)`}
            hint="Общее количество сделок в журнале. Win = TP+BU+. Loss = SL+BU-."
          />
          <StatCard
            title="WinRate"
            value={pct(computed.winRate, 0)}
            sub={`TP+BU+ / все сделки`}
            hint="WinRate = (TP + BU+) / все сделки × 100%."
          />
          <StatCard
            title="Profit Factor"
            value={computed.profitFactor.toFixed(2)}
            sub="Profit / |Loss|"
            hint="Profit Factor = сумма прибыльных сделок / модуль суммы убыточных сделок."
          />

          <StatCard title="Средний RR" value={computed.avgRR.toFixed(2)} hint="Средний RR = среднее значение RR по всем сделкам." />
          <StatCard
            title="Средний риск %"
            value={computed.avgRisk.toFixed(2)}
            hint="Средний риск = среднее значение Risk% по всем сделкам."
          />
          <StatCard
            title="Expectancy $"
            value={`$ ${fmtMoney(computed.expectancy)}`}
            sub="Средний результат на сделку"
            hint="Expectancy = (сумма pnl_money по всем сделкам) / N."
          />
        </div>

        {/* ===== Дисциплина / Риск ===== */}
        <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm border">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="relative group cursor-help">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Дисциплина</div>
                <div className="text-sm font-semibold text-gray-900">{computed.discipline.toFixed(0)}/100</div>
              </div>
              <div className="mt-2 h-3 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-black" style={{ width: `${clamp(computed.discipline, 0, 100)}%` }} />
              </div>
              <div className="absolute hidden group-hover:block bottom-full left-0 mb-2 w-[320px] rounded-lg border bg-white shadow-lg text-xs p-2 z-20 text-gray-700">
                Дисциплина (0..100) — условная оценка: WinRate + ProfitFactor (с ограничением) минус штраф за серию минусов.
              </div>
            </div>

            <div className="relative group cursor-help">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Контроль риска</div>
                <div className="text-sm font-semibold text-gray-900">{computed.riskControl.toFixed(0)}/100</div>
              </div>
              <div className="mt-2 h-3 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-black" style={{ width: `${clamp(computed.riskControl, 0, 100)}%` }} />
              </div>
              <div className="absolute hidden group-hover:block bottom-full left-0 mb-2 w-[320px] rounded-lg border bg-white shadow-lg text-xs p-2 z-20 text-gray-700">
                Контроль риска (0..100) — чем ближе средний риск к 1%, тем выше оценка.
              </div>
            </div>
          </div>

          {/* ===== Форма (последние 8 результатов) ===== */}
          <div className="mt-6 rounded-2xl border p-5 bg-white">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Форма</div>
              <div className="text-xs text-gray-500">Последние 8 результатов</div>
            </div>
            <div className="mt-2 text-xs text-gray-600">Серия побед: {computed.winStreak}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {computed.last8.length ? (
                computed.last8.map((o, idx) => {
                  const sc = scoreByOutcome(o);
                  const tone = sc > 0 ? "good" : sc < 0 ? "bad" : "neutral";
                  return (
                    <span
                      key={`${o}-${idx}`}
                      className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-xs font-bold ${
                        tone === "good"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : tone === "bad"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      }`}
                      title={o}
                    >
                      {outcomeRu(o)}
                    </span>
                  );
                })
              ) : (
                <div className="text-sm text-gray-500">Пока нет сделок.</div>
              )}
            </div>
          </div>

          {/* ===== Сильные/слабые стороны ===== */}
          <div className="mt-6 rounded-2xl border p-6 bg-white">
            <div className="text-lg font-semibold text-gray-900">Сильные / слабые стороны (по результатам TP/SL/БУ)</div>
            <div className="mt-1 text-xs text-gray-600">
              Оценка считается по исходам: TP лучше SL, BU влияет слабее. Не по сумме $.
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <StrengthCard
                title="Сетапы"
                bestLabel={computed.setups.bestLabel || "—"}
                bestSub={computed.setups.bestSub}
                worstLabel={computed.setups.worstLabel || "—"}
                worstSub={computed.setups.worstSub}
              />
              <StrengthCard
                title="Активы"
                bestLabel={computed.assets.bestLabel || "—"}
                bestSub={computed.assets.bestSub}
                worstLabel={computed.assets.worstLabel || "—"}
                worstSub={computed.assets.worstSub}
              />
              <StrengthCard
                title="Киллзоны"
                bestLabel={computed.killzones.bestLabel || "—"}
                bestSub={computed.killzones.bestSub}
                worstLabel={computed.killzones.worstLabel || "—"}
                worstSub={computed.killzones.worstSub}
              />
            </div>

            <div className="mt-3 text-[11px] text-gray-500">
              Подсказка: если где-то N &lt; 2 — это “сырая” статистика. Когда добавишь больше сделок — будет точнее.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
