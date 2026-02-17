"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

/**
 * ⚠️ ВАЖНО:
 * Я НЕ МЕНЯЮ твою базу. Я просто читаю.
 * Но названия таблицы/колонок должны совпадать с твоими.
 *
 * Если у тебя таблица/колонки называются иначе — скажи, я подставлю правильно.
 * Сейчас стоит самый логичный вариант:
 * table: trades
 * date: trade_date (YYYY-MM-DD)
 * pnl: result_money (число, где стоп уже хранится как минус)
 */
const TABLE_TRADES = "trades";
const COL_DATE = "trade_date";      // дата сделки (YYYY-MM-DD)
const COL_PNL = "result_money";     // результат в деньгах (число)

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

// Calendar grid starts on Monday
function gridStartMonday(monthStart: Date) {
  const day = monthStart.getDay(); // 0=Sun..6=Sat
  const mondayIndex = (day + 6) % 7; // 0=Mon..6=Sun
  const start = new Date(monthStart);
  start.setDate(monthStart.getDate() - mondayIndex);
  start.setHours(0, 0, 0, 0);
  return start;
}

type DayCell = {
  date: Date;
  key: string; // YYYY-MM-DD
  sum: number;
  hasTrades: boolean;
  inMonth: boolean;
};

export default function TradesCalendar() {
  const [month, setMonth] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState<boolean>(true);
  const [dailyMap, setDailyMap] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const monthStart = useMemo(() => startOfMonth(month), [month]);
  const monthEnd = useMemo(() => endOfMonth(month), [month]);
  const gridStart = useMemo(() => gridStartMonday(monthStart), [monthStart]);

  const monthLabel = useMemo(() => {
    const m = month.toLocaleString("ru-RU", { month: "long" });
    const y = month.getFullYear();
    return `${m[0].toUpperCase()}${m.slice(1)} ${y}`;
  }, [month]);

  const cells: DayCell[] = useMemo(() => {
    const list: DayCell[] = [];
    const cur = new Date(gridStart);

    for (let i = 0; i < 42; i++) {
      const key = toYMD(cur);
      const sum = dailyMap[key] ?? 0;
      const hasTrades = Object.prototype.hasOwnProperty.call(dailyMap, key);

      list.push({
        date: new Date(cur),
        key,
        sum,
        hasTrades,
        inMonth:
          cur.getMonth() === month.getMonth() &&
          cur.getFullYear() === month.getFullYear(),
      });

      cur.setDate(cur.getDate() + 1);
    }

    return list;
  }, [gridStart, dailyMap, month]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const startKey = toYMD(monthStart);
      const endKey = toYMD(monthEnd);

      // Берём только нужные колонки
      const { data, error } = await supabase
        .from(TABLE_TRADES)
        .select(`${COL_DATE},${COL_PNL}`)
        .gte(COL_DATE, startKey)
        .lte(COL_DATE, endKey);

      if (error) {
        setDailyMap({});
        setError(
          `Ошибка чтения сделок: ${error.message}. Проверь TABLE_TRADES / COL_DATE / COL_PNL.`
        );
        setLoading(false);
        return;
      }

      const map: Record<string, number> = {};

      (data || []).forEach((row: any) => {
        const rawDate = row?.[COL_DATE];
        const rawPnl = row?.[COL_PNL];

        if (!rawDate) return;

        // rawDate ожидаем как "YYYY-MM-DD"
        const key = String(rawDate).slice(0, 10);
        const pnl = typeof rawPnl === "number" ? rawPnl : Number(rawPnl ?? 0);
        if (Number.isNaN(pnl)) return;

        map[key] = (map[key] ?? 0) + pnl;
      });

      setDailyMap(map);
      setLoading(false);
    };

    load();
  }, [monthStart, monthEnd]);

  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const todayKey = toYMD(new Date());

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-black/60">Календарь сделок</div>
          <div className="text-xl font-semibold">{monthLabel}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm hover:bg-black/5"
            onClick={() =>
              setMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
            }
          >
            ←
          </button>

          <button
            type="button"
            className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm hover:bg-black/5"
            onClick={() => setMonth(new Date())}
          >
            Сегодня
          </button>

          <button
            type="button"
            className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm hover:bg-black/5"
            onClick={() =>
              setMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
            }
          >
            →
          </button>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-2">
        {weekdays.map((w) => (
          <div key={w} className="text-center text-xs font-medium text-black/60">
            {w}
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {cells.map((c) => {
            const sum = c.sum;

            // Цвет кружка
            const circleCls =
              sum > 0
                ? "bg-green-500/20 text-green-800 border-green-500/30"
                : sum < 0
                ? "bg-red-500/20 text-red-800 border-red-500/30"
                : c.hasTrades
                ? "bg-black/10 text-black/70 border-black/10"
                : "bg-black/5 text-black/40 border-black/5";

            const dayTextCls = c.inMonth ? "text-black" : "text-black/25";
            const isToday = c.key === todayKey;

            const tooltip = `${c.key}: ${sum >= 0 ? "+" : ""}${sum.toFixed(2)}`;

            return (
              <div
                key={c.key}
                className="flex flex-col items-center justify-center"
                title={tooltip}
              >
                <div
                  className={[
                    "relative flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold",
                    circleCls,
                    isToday ? "ring-2 ring-black/20" : "",
                  ].join(" ")}
                >
                  <span className={dayTextCls}>{c.date.getDate()}</span>
                </div>

                <div className="mt-1 h-4 text-[10px] leading-4">
                  {c.hasTrades ? (
                    <span
                      className={
                        sum > 0
                          ? "text-green-700"
                          : sum < 0
                          ? "text-red-700"
                          : "text-black/50"
                      }
                    >
                      {sum > 0 ? "+" : ""}
                      {Math.round(sum)}
                    </span>
                  ) : (
                    <span className="text-black/20">&nbsp;</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="mt-3 text-sm text-black/50">Загрузка…</div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-black/60">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border border-green-500/30 bg-green-500/20" />
          Плюс
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border border-red-500/30 bg-red-500/20" />
          Минус
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border border-black/10 bg-black/10" />
          Ноль (были сделки)
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full border border-black/5 bg-black/5" />
          Нет сделок
        </span>
      </div>
    </div>
  );
}
