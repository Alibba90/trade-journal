"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/src/lib/supabaseClient";

/* ===========================
   Helpers
=========================== */
function pick<T = any>(obj: any, keys: string[], fallback: T): T {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k] as T;
  }
  return fallback;
}

// ✅ понимает "10%", "$ 200", "1 000", "10,5"
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

// если пришло 0.1 => 10%
function normalizePctMaybe(x: number) {
  const n = toNum(x);
  if (n > 0 && n <= 1) return n * 100;
  return n;
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtUsd(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$ ${fmtMoney(Math.abs(n))}`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function dayRu(dow: number) {
  const map = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return map[dow] ?? "-";
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeekSunday(d: Date) {
  const s = startOfWeekMonday(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function monthRange(d: Date) {
  const s = new Date(d.getFullYear(), d.getMonth(), 1);
  s.setHours(0, 0, 0, 0);
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  e.setHours(23, 59, 59, 999);
  return { s, e };
}

function isSameYMD(a: string, b: string) {
  return String(a).slice(0, 10) === String(b).slice(0, 10);
}

/* ===========================
   Dictionaries
=========================== */
const KILLZONES: Record<string, string> = {
  asia: "Азия",
  frank: "Франкфурт",
  london: "Лондон",
  lunch: "Ланч",
  ny: "Нью-Йорк",
  late_ny: "Поздний НЮ",
};

const DIRECTIONS: Record<string, string> = {
  long: "Лонг",
  short: "Шорт",
};

const MARKET_PHASES: Record<string, string> = {
  reverse: "Реверс",
  continuation: "Конт",
  range: "Боковик",
};

const OUTCOMES_RU: Record<string, string> = {
  sl: "Стоп",
  tp: "Тэйк",
  be_plus: "БУ+",
  be_minus: "БУ-",
};

/* ===========================
   Phase mapping
=========================== */
const PHASE_LABEL: Record<string, string> = {
  phase1: "Фаза 1",
  phase2: "Фаза 2",
  live: "Лайв",
  "Фаза 1": "Фаза 1",
  "Фаза 2": "Фаза 2",
  "Лайв": "Лайв",
};

function normalizePhase(v: any): "phase1" | "phase2" | "live" | "other" {
  const s = String(v || "").toLowerCase().trim();
  if (s.includes("phase 1") || s.includes("phase1") || s.includes("фаза 1") || s === "phase1") return "phase1";
  if (s.includes("phase 2") || s.includes("phase2") || s.includes("фаза 2") || s === "phase2") return "phase2";
  if (s.includes("live") || s.includes("лайв") || s === "live") return "live";
  return "other";
}

function outcomeChip(outcome: string) {
  const o = String(outcome || "").trim();
  if (o === "tp") return { t: "Т", cls: "bg-green-50 text-green-700 border-green-200" };
  if (o === "sl") return { t: "С", cls: "bg-red-50 text-red-700 border-red-200" };
  if (o === "be_plus") return { t: "Б+", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (o === "be_minus") return { t: "Б-", cls: "bg-orange-50 text-orange-700 border-orange-200" };
  return { t: "?", cls: "bg-gray-50 text-gray-700 border-gray-200" };
}

/* ===========================
   Types
=========================== */
type AccountRow = any;

type TradeRow = {
  id: string;
  account_id: string;
  trade_date: string;
  day_of_week?: number;
  asset?: string;

  killzone?: string;
  direction?: string;
  market_phase?: string;
  risk_pct?: number;
  rr?: number;

  outcome?: string;
  pnl_money: number;

  setup?: string | null;
  comment?: string | null;

  htf_screenshot_url?: string | null;
  ltf_screenshot_url?: string | null;

  created_at?: string;
};

/* ===========================
   Page
=========================== */
export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [username, setUsername] = useState<string>("");

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [tradesMonth, setTradesMonth] = useState<TradeRow[]>([]);
  const [tradesLast5, setTradesLast5] = useState<TradeRow[]>([]);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // calendar UI
  const [calCursor, setCalCursor] = useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { monthStart, monthEnd } = useMemo(() => {
    const { s, e } = monthRange(calCursor);
    return { monthStart: s, monthEnd: e };
  }, [calCursor]);

  const weekStart = useMemo(() => startOfWeekMonday(new Date()), []);
  const weekEnd = useMemo(() => endOfWeekSunday(new Date()), []);

  // ---- account getters (ВАЖНО: под твою схему Supabase) ----
  const getAccountNum = (a: any) =>
    String(pick(a, ["account_number", "account_num", "account_number", "number", "acc_num"], "") || "").trim();

  const getFirm = (a: any) => String(pick(a, ["firm", "company"], "") || "").trim();

  const getSize = (a: any) => toNum(pick(a, ["size", "account_size"], 0));

  const getBalance = (a: any) => toNum(pick(a, ["balance", "current_balance"], 0));

  const getPhaseRaw = (a: any) => pick(a, ["phase", "stage"], "");
  const getPhase = (a: any) => normalizePhase(getPhaseRaw(a));

  // ✅ ТВОИ КОЛОНКИ:
  // max_drawdown_percent
  const getMaxDDPct = (a: any) =>
    normalizePctMaybe(
      pick(
        a,
        [
          "max_drawdown_percent", // ✅ твое
          "max_drawdown",
          "max_drawdown_pct",
          "max_dd",
          "max_dd_pct",
          "dd_limit",
          "dd_limit_pct",
          "drawdown",
          "drawdown_pct",
          "max_loss",
          "max_loss_pct",
          "loss_limit",
          "loss_limit_pct",
        ],
        0
      )
    );

  // profit_target_percent
  const getProfitTargetPct = (a: any) =>
    normalizePctMaybe(
      pick(
        a,
        [
          "profit_target_percent", // ✅ твое
          "profit_target",
          "profit_target_pct",
          "target",
          "target_pct",
          "target_profit",
          "target_profit_pct",
          "profit_goal",
          "profit_goal_pct",
          "goal",
          "goal_pct",
        ],
        0
      )
    );

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

  // blown logic:
  // 1) если в базе есть status='blown' — используем
  // 2) иначе считаем blown по формуле >=10% DD: balance <= size*0.9
  const isBlown = (a: any) => {
    const st = String(a?.status || "").toLowerCase().trim();
    if (st === "blown") return true;
    const size = getSize(a);
    const bal = getBalance(a);
    if (!size) return false;
    return bal <= size * 0.9;
  };

  const accountMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const a of accounts) m.set(String(a.id), a);
    return m;
  }, [accounts]);

  async function loadAll() {
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
    setUserEmail(user.email || "");

    // username from profiles (если есть)
    try {
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (prof) setUsername(String(pick(prof, ["username"], "") || ""));
    } catch {}

    // accounts (active сверху, blown снизу)
    const { data: acc, error: accErr } = await supabase
      .from("accounts")
      .select("*")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false });

    if (accErr) {
      console.log("ACCOUNTS ERROR:", accErr);
      setErrMsg(accErr.message);
      setAccounts([]);
    } else {
      setAccounts(acc || []);
    }

    // trades for current calendar month
    const ms = ymd(monthStart);
    const me = ymd(monthEnd);

    const { data: trM, error: trMErr } = await supabase
      .from("trades")
      .select(
        "id,account_id,trade_date,day_of_week,asset,killzone,direction,market_phase,risk_pct,rr,outcome,pnl_money,setup,comment,htf_screenshot_url,ltf_screenshot_url,created_at"
      )
      .gte("trade_date", ms)
      .lte("trade_date", me)
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (trMErr) {
      console.log("TRADES MONTH ERROR:", trMErr);
      setErrMsg(trMErr.message);
      setTradesMonth([]);
    } else {
      setTradesMonth((trM as any) || []);
    }

    // last 5 trades overall
    const { data: tr5 } = await supabase
      .from("trades")
      .select("id,account_id,trade_date,outcome,pnl_money,created_at")
      .order("trade_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);

    setTradesLast5((tr5 as any) || []);

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calCursor]);

  // ---- computed: account analytics ----
  const accStats = useMemo(() => {
    const active = accounts.filter((a) => !isBlown(a));
    const blown = accounts.filter((a) => isBlown(a));

    const totalActive = active.length;

    let phase1 = 0,
      phase2 = 0,
      live = 0;

    let totalSize = 0;
    let totalBalance = 0;

    // payout ready: only live, profit >= 1% of size
    let payoutReady = 0;

    for (const a of active) {
      const ph = getPhase(a);
      if (ph === "phase1") phase1++;
      else if (ph === "phase2") phase2++;
      else if (ph === "live") live++;

      const size = getSize(a);
      const bal = getBalance(a);

      totalSize += size;
      totalBalance += bal;

      if (ph === "live" && size > 0) {
        const profit = bal - size;
        const pct = (profit / size) * 100;
        if (pct >= 1) payoutReady += Math.max(0, profit);
      }
    }

    const blownSum = blown.reduce((s, a) => s + getSize(a), 0);

    // ✅ ТОП-3 closest to DD (by remaining %)
    const ddList = active
      .map((a) => {
        const size = getSize(a);
        const bal = getBalance(a);
        const ddPct = getMaxDDPct(a);

        if (!size) return null;
        if (ddPct <= 0) return null;

        const minBal = size * (1 - ddPct / 100);
        const remaining$ = bal - minBal;
        const remainingPct = (remaining$ / size) * 100;

        return {
          a,
          remaining$,
          remainingPct: Math.max(0, remainingPct),
        };
      })
      .filter(Boolean) as any[];

    ddList.sort((x, y) => x.remainingPct - y.remainingPct);

    // ✅ ТОП-3 closest to PASS (by remaining %)
    const passList = active
      .map((a) => {
        const ph = getPhase(a);
        if (!(ph === "phase1" || ph === "phase2")) return null;

        const size = getSize(a);
        const bal = getBalance(a);
        const targetPct = getProfitTargetPct(a);

        if (!size) return null;
        if (targetPct <= 0) return null;

        const targetBal = size * (1 + targetPct / 100);
        const remaining$ = targetBal - bal;
        const remainingPct = (remaining$ / size) * 100;

        return {
          a,
          remaining$,
          remainingPct: Math.max(0, remainingPct),
        };
      })
      .filter(Boolean) as any[];

    passList.sort((x, y) => x.remainingPct - y.remainingPct);

    return {
      totalActive,
      phase1,
      phase2,
      live,
      totalSize,
      totalBalance,
      payoutReady,
      ddTop: ddList.slice(0, 3),
      passTop: passList.slice(0, 3),

      blownCount: blown.length,
      blownSum,
      blownList: blown,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  // ---- trade analytics (outcomes-based best/worst) ----
  const tradeStats = useMemo(() => {
    const now = new Date();

    const monthTrades = tradesMonth;

    const ws = ymd(weekStart);
    const we = ymd(weekEnd);

    const weekTrades = monthTrades.filter((t) => t.trade_date >= ws && t.trade_date <= we);

    function winrate(list: TradeRow[]) {
      const wins = list.filter((t) => String(t.outcome) === "tp").length;
      const losses = list.filter((t) => String(t.outcome) === "sl").length;
      const denom = wins + losses; // БУ не участвует
      const pct = denom === 0 ? 0 : (wins / denom) * 100;
      return { pct, wins, losses, denom };
    }

    const wrM = winrate(monthTrades);
    const wrW = winrate(weekTrades);

    const streak = tradesLast5
      .slice(0, 5)
      .map((t) => outcomeChip(String(t.outcome || "")))
      .reverse();

    type GroupAgg = { key: string; count: number; w: number; l: number; be: number; wr: number };

    function groupOutcomeAgg(list: TradeRow[], keyFn: (t: TradeRow) => string, normalizeLabel?: (k: string) => string) {
      const m = new Map<string, { count: number; w: number; l: number; be: number }>();

      for (const t of list) {
        const k0 = (keyFn(t) || "").trim();
        if (!k0) continue;

        const prev = m.get(k0) || { count: 0, w: 0, l: 0, be: 0 };
        prev.count += 1;

        const o = String(t.outcome || "");
        if (o === "tp") prev.w += 1;
        else if (o === "sl") prev.l += 1;
        else if (o === "be_plus" || o === "be_minus") prev.be += 1;

        m.set(k0, prev);
      }

      const arr: GroupAgg[] = Array.from(m.entries()).map(([k, v]) => {
        const denom = v.w + v.l;
        const wr = denom === 0 ? -1 : v.w / denom; // -1 = только БУ
        return {
          key: normalizeLabel ? normalizeLabel(k) : k,
          count: v.count,
          w: v.w,
          l: v.l,
          be: v.be,
          wr,
        };
      });

      const ranked = arr.filter((x) => x.wr >= 0);
      if (ranked.length === 0) return { best: null as GroupAgg | null, worst: null as GroupAgg | null };

      const best = [...ranked].sort((a, b) => b.wr - a.wr || b.count - a.count)[0];
      const worst = [...ranked].sort((a, b) => a.wr - b.wr || b.count - a.count)[0];

      return { best, worst };
    }

    const setupBW = groupOutcomeAgg(monthTrades, (t) => String(t.setup || ""));
    const assetBW = groupOutcomeAgg(monthTrades, (t) => String(t.asset || "").toUpperCase());
    const kzBW = groupOutcomeAgg(monthTrades, (t) => String(t.killzone || ""), (k) => KILLZONES[k] || k);

    return {
      monthCount: monthTrades.length,
      weekCount: weekTrades.length,
      wrMonth: wrM,
      wrWeek: wrW,
      streak,
      ws,
      we,
      monthLabel: `${now.toLocaleString("ru-RU", { month: "long" })} ${now.getFullYear()}`,

      bestSetup: setupBW.best,
      worstSetup: setupBW.worst,
      bestAsset: assetBW.best,
      worstAsset: assetBW.worst,
      bestKillzone: kzBW.best,
      worstKillzone: kzBW.worst,
    };
  }, [tradesMonth, tradesLast5, weekStart, weekEnd]);

  // ---- calendar computations ----
  const calDays = useMemo(() => {
    const first = new Date(monthStart);
    const last = new Date(monthEnd);

    const gridStart = startOfWeekMonday(first);
    const gridEnd = endOfWeekSunday(last);

    const days: { date: Date; key: string; inMonth: boolean }[] = [];
    const cur = new Date(gridStart);

    while (cur <= gridEnd) {
      const key = ymd(cur);
      days.push({ date: new Date(cur), key, inMonth: cur.getMonth() === first.getMonth() });
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [monthStart, monthEnd]);

  const pnlByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tradesMonth) {
      const k = String(t.trade_date).slice(0, 10);
      const prev = m.get(k) || 0;
      m.set(k, prev + toNum(t.pnl_money));
    }
    return m;
  }, [tradesMonth]);

  const tradesForSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    return tradesMonth.filter((t) => isSameYMD(t.trade_date, selectedDay));
  }, [tradesMonth, selectedDay]);

  // donut: allocation by phases (ТОЛЬКО активные)
  const allocation = useMemo(() => {
    let p1 = 0,
      p2 = 0,
      lv = 0;

    for (const a of accounts) {
      if (isBlown(a)) continue;

      const ph = getPhase(a);
      const size = getSize(a);
      if (ph === "phase1") p1 += size;
      else if (ph === "phase2") p2 += size;
      else if (ph === "live") lv += size;
    }

    const total = p1 + p2 + lv;
    return { p1, p2, lv, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  // colors requested
  const C_PHASE1 = "#3B82F6";
  const C_PHASE2 = "#F59E0B";
  const C_LIVE = "#22C55E";
  const C_EMPTY = "#E5E7EB";

  function donutStyle(p1: number, p2: number, lv: number) {
    const total = p1 + p2 + lv;
    if (total <= 0) return { background: `conic-gradient(${C_EMPTY} 0% 100%)` };

    const a = (p1 / total) * 100;
    const b = (p2 / total) * 100;

    const p1End = a;
    const p2End = a + b;

    return {
      background: `conic-gradient(
        ${C_PHASE1} 0% ${p1End}%,
        ${C_PHASE2} ${p1End}% ${p2End}%,
        ${C_LIVE} ${p2End}% 100%
      )`,
    };
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
          <h1 className="text-2xl font-bold text-gray-900">Trade Journal</h1>
          <p className="mt-2 text-gray-600">Войди в аккаунт, чтобы видеть аналитику по счетам и сделкам.</p>
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

  // если нет активных счетов — мягкий онбординг
  const hasActiveAccounts = accStats.totalActive > 0;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="mx-auto max-w-6xl px-6 pt-10 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Главная</h1>
            <p className="mt-2 text-sm text-gray-600">
              Пользователь: <span className="font-medium">{userEmail || "-"}</span>
              {username ? (
                <>
                  {" "}
                  • Ник: <span className="font-medium">{username}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/accounts" className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Счета
            </Link>
            <Link
              href="/backtest"
              className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              title="Отдельный режим: не влияет на основные счета и сделки"
            >
              Режим бэкТеста
            </Link>
            <Link href="/profile" className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
              Профиль
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

        {/* ONBOARDING: если нет активных счетов */}
        {!hasActiveAccounts ? (
          <div className="mb-4 rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-lg font-semibold text-gray-900">Начнём с первого счёта</div>
            <div className="mt-1 text-sm text-gray-600">
              Чтобы считать аллокацию, лимиты и аналитику — добавь хотя бы один счёт.
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/accounts"
                className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Добавить счёт
              </Link>
              <Link
                href="/trades"
                className="inline-flex items-center justify-center rounded-xl border bg-white px-4 py-3 text-sm font-semibold hover:bg-gray-50"
              >
                Перейти в журнал сделок
              </Link>
            </div>
          </div>
        ) : null}

        {/* ACCOUNTS */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <Card title="Активные счета">
            <div className="text-3xl font-bold text-gray-900">{accStats.totalActive}</div>
            <div className="mt-2 text-xs text-gray-600">
              Фаза1: {accStats.phase1} • Фаза2: {accStats.phase2} • Лайв: {accStats.live}
            </div>
          </Card>

          <Card title="Слитые счета (−10% и ниже)">
            <div className="text-3xl font-bold text-gray-900">{accStats.blownCount}</div>
            <div className="mt-2 text-xs text-gray-600">
              Сумма: <span className="font-semibold">{fmtUsd(accStats.blownSum)}</span>
            </div>
          </Card>

          <Card title="Аллокация (активные)" className="md:col-span-2">
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 rounded-full" style={donutStyle(allocation.p1, allocation.p2, allocation.lv)} />
              <div className="text-sm">
                <div className="font-semibold text-gray-900">{fmtUsd(allocation.total)}</div>
                <div className="mt-2 space-y-1 text-xs text-gray-700">
                  <LegendDot color={C_PHASE1} label="Фаза 1" value={fmtUsd(allocation.p1)} />
                  <LegendDot color={C_PHASE2} label="Фаза 2" value={fmtUsd(allocation.p2)} />
                  <LegendDot color={C_LIVE} label="Лайв" value={fmtUsd(allocation.lv)} />
                </div>
              </div>
            </div>
          </Card>

          <Card title="Текущий баланс (активные)">
            <div className="text-2xl font-bold text-gray-900">{fmtUsd(accStats.totalBalance)}</div>
            <div className="mt-2 text-xs text-gray-600">Сумма балансов активных счетов</div>
          </Card>

          <Card title="Готово на выплату (лайвы)">
            <div className="text-2xl font-bold text-gray-900">{fmtUsd(accStats.payoutReady)}</div>
            <div className="mt-2 text-xs text-gray-600">Сумма профита на лайвах, если профит ≥ 1%</div>
          </Card>
        </div>

        {/* DD / PASS */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Box title="Ближе всего к лимиту (DD) — по % (активные)">
            {accStats.ddTop.length === 0 ? (
              <div className="text-sm text-gray-500">Нет данных (проверь, что max_drawdown_percent заполнен в accounts)</div>
            ) : (
              <div className="space-y-3">
                {accStats.ddTop.map((x: any) => {
                  const a = x.a;
                  const ph = getPhase(a);
                  const phLabel = PHASE_LABEL[ph] || String(getPhaseRaw(a) || "—");
                  const size = getSize(a);
                  const bal = getBalance(a);

                  const remPct = clamp(toNum(x.remainingPct), 0, 999);
                  const rem$ = toNum(x.remaining$);

                  const badge =
                    remPct <= 1
                      ? "bg-red-50 text-red-700 border-red-200"
                      : remPct <= 3
                      ? "bg-orange-50 text-orange-700 border-orange-200"
                      : "bg-gray-50 text-gray-700 border-gray-200";

                  return (
                    <MiniRow key={String(pick(a, ["id"], ""))}>
                      <div className="font-semibold text-gray-900">{getAccountLabel(a)}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        Этап: {phLabel} • Размер: {fmtUsd(size)} • Баланс: {fmtUsd(bal)}
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badge}`}>
                          Осталось: {remPct.toFixed(2)}% • {fmtUsd(rem$)}
                        </span>
                      </div>
                    </MiniRow>
                  );
                })}
              </div>
            )}
          </Box>

          <Box title="Ближе всего к прохождению (PASS) — по % (активные)">
            {accStats.passTop.length === 0 ? (
              <div className="text-sm text-gray-500">Нет данных (проверь, что profit_target_percent заполнен в accounts)</div>
            ) : (
              <div className="space-y-3">
                {accStats.passTop.map((x: any) => {
                  const a = x.a;
                  const ph = getPhase(a);
                  const phLabel = PHASE_LABEL[ph] || String(getPhaseRaw(a) || "—");
                  const bal = getBalance(a);
                  const targetPct = getProfitTargetPct(a);

                  const remPct = clamp(toNum(x.remainingPct), 0, 999);
                  const rem$ = toNum(x.remaining$);

                  const badge =
                    remPct <= 1
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : remPct <= 3
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-gray-50 text-gray-700 border-gray-200";

                  return (
                    <MiniRow key={String(pick(a, ["id"], ""))}>
                      <div className="font-semibold text-gray-900">{getAccountLabel(a)}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        Этап: {phLabel} • Цель: {targetPct}% • Баланс: {fmtUsd(bal)}
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badge}`}>
                          Осталось: {remPct.toFixed(2)}% • {fmtUsd(rem$)}
                        </span>
                      </div>
                    </MiniRow>
                  );
                })}
              </div>
            )}
          </Box>
        </div>

        {/* Слитые счета списком (всегда внизу на главной) */}
        <div className="mt-4">
          <Box title={`Слитые счета (внизу): ${accStats.blownCount} • ${fmtUsd(accStats.blownSum)}`}>
            {accStats.blownCount === 0 ? (
              <div className="text-sm text-gray-500">Слитых счетов нет.</div>
            ) : (
              <div className="space-y-3">
                {accStats.blownList.map((a: any) => (
                  <MiniRow key={String(a.id)}>
                    <div className="font-semibold text-gray-900">{getAccountLabel(a)}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      Размер: {fmtUsd(getSize(a))} • Баланс: {fmtUsd(getBalance(a))} • Статус:{" "}
                      <span className="font-semibold text-red-700">Слитый</span>
                    </div>
                  </MiniRow>
                ))}
              </div>
            )}
          </Box>
        </div>

        {/* TRADES ANALYTICS */}
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm border">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold text-gray-900">Аналитика по сделкам</div>
              <div className="mt-1 text-xs text-gray-500">
                Месяц: {tradeStats.monthLabel} • Неделя: {tradeStats.ws} — {tradeStats.we}
              </div>
            </div>

            <Link
              href="/trades"
              className="inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Перейти в журнал сделок
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
            <CardSm title="Сделок за месяц">
              <div className="text-2xl font-bold text-gray-900">{tradeStats.monthCount}</div>
            </CardSm>

            <CardSm title="Сделок за неделю">
              <div className="text-2xl font-bold text-gray-900">{tradeStats.weekCount}</div>
            </CardSm>

            <CardSm title="WinRate (месяц)">
              <div className="text-2xl font-bold text-gray-900">{tradeStats.wrMonth.pct.toFixed(0)}%</div>
              <div className="mt-1 text-xs text-gray-600">
                W:{tradeStats.wrMonth.wins} / L:{tradeStats.wrMonth.losses} (без БУ)
              </div>
            </CardSm>

            <CardSm title="WinRate (неделя)">
              <div className="text-2xl font-bold text-gray-900">{tradeStats.wrWeek.pct.toFixed(0)}%</div>
              <div className="mt-1 text-xs text-gray-600">
                W:{tradeStats.wrWeek.wins} / L:{tradeStats.wrWeek.losses} (без БУ)
              </div>
            </CardSm>
          </div>

          <div className="mt-4 rounded-xl border bg-gray-50 p-4">
            <div className="text-sm font-semibold text-gray-900">Серия (последние 5 сделок)</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {tradeStats.streak.length === 0 ? (
                <div className="text-sm text-gray-500">Нет сделок</div>
              ) : (
                tradeStats.streak.map((x, idx) => (
                  <span
                    key={idx}
                    className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-sm font-semibold ${x.cls}`}
                  >
                    {x.t}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <PerfCardOutcomes title="Сетапы" best={tradeStats.bestSetup} worst={tradeStats.worstSetup} />
            <PerfCardOutcomes title="Активы" best={tradeStats.bestAsset} worst={tradeStats.worstAsset} />
            <PerfCardOutcomes title="Килл зоны" best={tradeStats.bestKillzone} worst={tradeStats.worstKillzone} />
          </div>
        </div>

        {/* CALENDAR */}
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm border">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold text-gray-900">Календарь сделок</div>
              <div className="mt-1 text-xs text-gray-500">Нажми на день — покажет все сделки за этот день</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const d = new Date(calCursor);
                  d.setMonth(d.getMonth() - 1);
                  setCalCursor(d);
                  setSelectedDay(null);
                }}
                className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
              >
                ←
              </button>
              <div className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold">
                {calCursor.toLocaleString("ru-RU", { month: "long", year: "numeric" })}
              </div>
              <button
                onClick={() => {
                  const d = new Date(calCursor);
                  d.setMonth(d.getMonth() + 1);
                  setCalCursor(d);
                  setSelectedDay(null);
                }}
                className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
              >
                →
              </button>

              <button
                onClick={() => {
                  setCalCursor(new Date());
                  setSelectedDay(null);
                }}
                className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Сегодня
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-gray-600">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((x) => (
              <div key={x} className="py-1 font-semibold">
                {x}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2">
            {calDays.map((d) => {
              const sum = pnlByDay.get(d.key) || 0;
              const inMonth = d.inMonth;
              const isSel = selectedDay === d.key;

              const dot = sum > 0 ? "bg-green-500" : sum < 0 ? "bg-red-500" : "bg-gray-300";
              const ring = isSel ? "ring-2 ring-black" : "ring-1 ring-gray-200";

              return (
                <button
                  key={d.key}
                  onClick={() => setSelectedDay(d.key)}
                  className={`rounded-xl border bg-white p-2 text-left hover:bg-gray-50 ${inMonth ? "" : "opacity-40"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`h-2 w-2 rounded-full ${dot}`} />
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold ${ring}`}>
                      {d.date.getDate()}
                    </div>
                  </div>

                  <div
                    className={`mt-2 text-xs font-semibold ${
                      sum > 0 ? "text-green-700" : sum < 0 ? "text-red-700" : "text-gray-600"
                    }`}
                  >
                    {sum === 0 ? "0" : fmtUsd(sum)}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 border-t pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-900">
                {selectedDay ? `Сделки за ${selectedDay}` : "Выбери день в календаре"}
              </div>
              {selectedDay ? (
                <Link href="/trades" className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
                  Открыть журнал
                </Link>
              ) : null}
            </div>

            {!selectedDay ? (
              <div className="mt-2 text-sm text-gray-500">Нажми на любой день, чтобы увидеть сделки этого дня.</div>
            ) : tradesForSelectedDay.length === 0 ? (
              <div className="mt-2 text-sm text-gray-500">В этот день сделок нет.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {tradesForSelectedDay.map((t) => {
                  const pnl = toNum(t.pnl_money);
                  const pnlClass = pnl > 0 ? "text-green-700" : pnl < 0 ? "text-red-700" : "text-gray-700";

                  const o = outcomeChip(String(t.outcome || ""));
                  const outRu = OUTCOMES_RU[String(t.outcome || "")] || String(t.outcome || "");

                  const kzRu = KILLZONES[String(t.killzone || "")] || String(t.killzone || "");
                  const dirRu = DIRECTIONS[String(t.direction || "")] || String(t.direction || "");
                  const mpRu = MARKET_PHASES[String(t.market_phase || "")] || String(t.market_phase || "");

                  const risk = toNum(t.risk_pct);
                  const rr = toNum(t.rr);

                  const acc = accountMap.get(String(t.account_id));
                  const accLabel = acc ? getAccountLabel(acc) : "Счёт";

                  const setup = String(t.setup || "").trim();
                  const comment = String(t.comment || "").trim();

                  const htf = String(t.htf_screenshot_url || "").trim();
                  const ltf = String(t.ltf_screenshot_url || "").trim();

                  return (
                    <div key={t.id} className="rounded-xl border bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {(t.asset || "—").toUpperCase()} • {dayRu(toNum(t.day_of_week))}
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {accLabel}
                            {kzRu ? ` • ${kzRu}` : ""}
                            {dirRu ? ` • ${dirRu}` : ""}
                            {mpRu ? ` • ${mpRu}` : ""}
                            {Number.isFinite(risk) && risk ? ` • Риск ${risk.toFixed(2)}%` : ""}
                            {Number.isFinite(rr) && rr ? ` • RR ${rr.toFixed(2)}` : ""}
                            {outRu ? ` • ${outRu}` : ""}
                          </div>

                          {setup ? (
                            <div className="mt-2 text-xs">
                              <span className="font-semibold text-gray-700">Сетап:</span>{" "}
                              <span className="text-gray-700">{setup}</span>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${o.cls}`}>
                            {o.t}
                          </span>
                          <div className={`text-sm font-bold ${pnlClass}`}>{fmtUsd(pnl)}</div>
                        </div>
                      </div>

                      {htf || ltf ? (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {htf ? (
                            <a
                              href={htf}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border bg-white px-2 py-1 hover:bg-gray-50"
                            >
                              Скрин ХТФ
                            </a>
                          ) : null}
                          {ltf ? (
                            <a
                              href={ltf}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border bg-white px-2 py-1 hover:bg-gray-50"
                            >
                              Скрин ЛТФ
                            </a>
                          ) : null}
                        </div>
                      ) : null}

                      {comment ? <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{comment}</div> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-gray-500">
          Таблица счетов доступна на странице{" "}
          <Link href="/accounts" className="underline">
            Счета
          </Link>
        </div>
      </section>
    </main>
  );
}

/* ===========================
   UI Components
=========================== */
function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm border ${className}`}>
      <div className="text-sm font-semibold text-gray-700">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function CardSm({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs font-semibold text-gray-600">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm border">
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MiniRow({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-white p-4">{children}</div>;
}

function LegendDot({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="w-14">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function PerfCardOutcomes({
  title,
  best,
  worst,
}: {
  title: string;
  best: { key: string; count: number; w: number; l: number; be: number; wr: number } | null;
  worst: { key: string; count: number; w: number; l: number; be: number; wr: number } | null;
}) {
  const empty = !best && !worst;
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-sm font-semibold text-gray-900">{title}</div>

      {empty ? (
        <div className="mt-2 text-sm text-gray-500">Пока недостаточно данных (нужны тэйки/стопы)</div>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          {best ? (
            <div>
              <div className="text-xs font-semibold text-gray-600">Лучший</div>
              <div className="mt-1 font-semibold text-gray-900">{best.key}</div>
              <div className="mt-1 text-xs text-gray-600">
                WR: {(best.wr * 100).toFixed(0)}% • W:{best.w} / L:{best.l} / BE:{best.be} • N:{best.count}
              </div>
            </div>
          ) : null}

          {worst ? (
            <div>
              <div className="text-xs font-semibold text-gray-600">Худший</div>
              <div className="mt-1 font-semibold text-gray-900">{worst.key}</div>
              <div className="mt-1 text-xs text-gray-600">
                WR: {(worst.wr * 100).toFixed(0)}% • W:{worst.w} / L:{worst.l} / BE:{worst.be} • N:{worst.count}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
