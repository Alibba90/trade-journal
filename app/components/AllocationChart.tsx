"use client";

type Props = {
  phase1: number; // сумма аллокации фаза 1
  phase2: number; // сумма аллокации фаза 2
  live: number;   // сумма аллокации лайв
};

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return (part / total) * 100;
}

export default function AllocationChart({ phase1, phase2, live }: Props) {
  const total = (phase1 || 0) + (phase2 || 0) + (live || 0);

  const p1 = pct(phase1, total);
  const p2 = pct(phase2, total);
  const pl = pct(live, total);

  // Цвета по твоему ТЗ:
  const C_PHASE1 = "#3B82F6"; // синий (фаза 1)
  const C_PHASE2 = "#F59E0B"; // оранжевый (фаза 2)
  const C_LIVE  = "#22C55E";  // мягкий зелёный (лайв)
  const C_EMPTY = "#E5E7EB";  // серый (если total = 0)

  const bg =
    total > 0
      ? `conic-gradient(
          ${C_PHASE1} 0% ${p1}%,
          ${C_PHASE2} ${p1}% ${p1 + p2}%,
          ${C_LIVE} ${p1 + p2}% 100%
        )`
      : `conic-gradient(${C_EMPTY} 0% 100%)`;

  return (
    <div className="flex items-center gap-4">
      {/* Donut */}
      <div className="relative w-[86px] h-[86px] shrink-0">
        <div
          className="w-full h-full rounded-full"
          style={{ background: bg }}
        />
        {/* hole */}
        <div className="absolute inset-[10px] rounded-full bg-white shadow-inner" />
      </div>

      {/* Numbers */}
      <div className="flex-1 text-sm">
        <div className="font-semibold mb-2">
          $ {fmtMoney(total)}
        </div>

        <div className="space-y-1">
          <Row label="Фаза 1" color={C_PHASE1} value={phase1} total={total} />
          <Row label="Фаза 2" color={C_PHASE2} value={phase2} total={total} />
          <Row label="Лайв"   color={C_LIVE}  value={live}  total={total} />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  color,
  value,
  total,
}: {
  label: string;
  color: string;
  value: number;
  total: number;
}) {
  const p = total ? (value / total) * 100 : 0;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-[70px]">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-gray-600">{label}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-gray-900">$ {value.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
        <span className="text-gray-400 text-xs w-[60px] text-right">
          {p.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
