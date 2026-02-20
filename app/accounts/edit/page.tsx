"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

type FormState = {
  account_number: string;
  firm: string;
  size: string;
  phase: "phase1" | "phase2" | "live";
  balance: string;
  max_drawdown_percent: string;
  profit_target_percent: string;
};

type AccountRow = {
  id: string;
  user_id: string;
  account_number: string | null;
  firm: string | null;
  size: number | null;
  phase: "phase1" | "phase2" | "live" | null;
  balance: number | null;
  max_drawdown_percent: number | null;
  profit_target_percent: number | null;
};

export default function EditAccountPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const id = sp.get("id") || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>("");

  const [form, setForm] = useState<FormState>({
    account_number: "",
    firm: "",
    size: "",
    phase: "phase1",
    balance: "",
    max_drawdown_percent: "",
    profit_target_percent: "",
  });

  const title = useMemo(() => (id ? "Редактировать счёт" : "Нет ID счёта"), [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  }

  function isValid() {
    return (
      form.account_number.trim() &&
      form.firm.trim() &&
      form.size.trim() &&
      form.balance.trim() &&
      form.max_drawdown_percent.trim() &&
      form.profit_target_percent.trim()
    );
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      if (!id) {
        setLoading(false);
        setErr("Не передан id счёта. Открой редактирование с кнопки ✎.");
        return;
      }

      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData.user) {
        setLoading(false);
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("accounts")
        .select(
          "id,user_id,account_number,firm,size,phase,balance,max_drawdown_percent,profit_target_percent"
        )
        .eq("id", id)
        .single();

      if (error) {
        setLoading(false);
        setErr(error.message);
        return;
      }

      const row = data as AccountRow;

      // Заполняем форму
      setForm({
        account_number: row.account_number ?? "",
        firm: row.firm ?? "",
        size: row.size !== null && row.size !== undefined ? String(row.size) : "",
        phase: (row.phase as any) || "phase1",
        balance: row.balance !== null && row.balance !== undefined ? String(row.balance) : "",
        max_drawdown_percent:
          row.max_drawdown_percent !== null && row.max_drawdown_percent !== undefined
            ? String(row.max_drawdown_percent)
            : "",
        profit_target_percent:
          row.profit_target_percent !== null && row.profit_target_percent !== undefined
            ? String(row.profit_target_percent)
            : "",
      });

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");

    if (!id) {
      setErr("Нет id счёта.");
      return;
    }

    if (!isValid()) {
      alert("Заполни все поля — они обязательные.");
      return;
    }

    setSaving(true);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      setSaving(false);
      alert("Сессия не найдена. Перезайди в аккаунт.");
      router.push("/login");
      return;
    }

    const userId = authData.user.id;

    // Обновляем только свой счёт (RLS) + дополнительная защита по user_id
    const { error } = await supabase
      .from("accounts")
      .update({
        account_number: form.account_number.trim(),
        firm: form.firm.trim(),
        size: Number(form.size),
        phase: form.phase,
        balance: Number(form.balance),
        max_drawdown_percent: Number(form.max_drawdown_percent),
        profit_target_percent: Number(form.profit_target_percent),
      })
      .eq("id", id)
      .eq("user_id", userId);

    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    router.push("/accounts");
    router.refresh();
  }

  function goBack() {
    router.push("/accounts");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white p-8 rounded-2xl shadow border"
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <button
            type="button"
            onClick={goBack}
            className="rounded-xl px-4 py-2 border bg-white text-gray-900 hover:bg-gray-100 transition"
            title="Вернуться к списку счетов"
          >
            Назад
          </button>
        </div>

        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {err}
          </div>
        )}

        {loading ? (
          <div className="text-gray-600">Загрузка...</div>
        ) : (
          <>
            <Field
              label="Номер счёта"
              name="account_number"
              value={form.account_number}
              onChange={handleChange}
              required
              placeholder="Например: FP-25K-01"
              tip="Как ты называешь счёт у пропа/на бирже. Будет отображаться везде."
            />

            <Field
              label="Фирма"
              name="firm"
              value={form.firm}
              onChange={handleChange}
              required
              placeholder="FundingPips / FTMO / ..."
              tip="Название проп-фирмы или брокера."
            />

            <Field
              label="Размер счёта ($)"
              name="size"
              value={form.size}
              onChange={handleChange}
              required
              placeholder="25000"
              inputMode="decimal"
              tip="Стартовый размер счёта. Нужен для расчётов PASS/DD."
            />

            <Field
              label="Текущий баланс ($)"
              name="balance"
              value={form.balance}
              onChange={handleChange}
              required
              placeholder="25000"
              inputMode="decimal"
              tip="Текущий баланс. Если только создал — обычно равен размеру счёта."
            />

            <Field
              label="Максимальная просадка (%)"
              name="max_drawdown_percent"
              value={form.max_drawdown_percent}
              onChange={handleChange}
              required
              placeholder="10"
              inputMode="decimal"
              tip="Лимит по просадке в процентах (например 10)."
            />

            <Field
              label="Цель по прибыли (%)"
              name="profit_target_percent"
              value={form.profit_target_percent}
              onChange={handleChange}
              required
              placeholder="8"
              inputMode="decimal"
              tip="Сколько % нужно заработать для прохождения фазы (например 8)."
            />

            <div className="mt-4">
              <label className="block text-sm mb-1 text-gray-800">
                Этап{" "}
                <span
                  className="text-gray-400 cursor-help"
                  title="Фаза 1 / Фаза 2 / Лайв — влияет на подсказки и блоки аналитики"
                >
                  ⓘ
                </span>
              </label>
              <select
                name="phase"
                value={form.phase}
                onChange={handleChange}
                className="w-full border rounded-lg p-3 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                required
              >
                <option value="phase1">Фаза 1</option>
                <option value="phase2">Фаза 2</option>
                <option value="live">Лайв</option>
              </select>
            </div>

            <button
              disabled={saving}
              className="w-full mt-6 bg-black text-white p-3 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-60"
            >
              {saving ? "Сохранение..." : "Сохранить изменения"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}

function Field(props: {
  label: string;
  name: string;
  value: string;
  onChange: any;
  required?: boolean;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  tip: string;
}) {
  const { label, name, value, onChange, required, placeholder, inputMode, tip } = props;

  return (
    <div className="mb-4">
      <label className="block text-sm mb-1 text-gray-800">
        {label}{" "}
        <span className="text-gray-400 cursor-help" title={tip}>
          ⓘ
        </span>
      </label>
      <input
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full border rounded-lg p-3 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
      />
    </div>
  );
}
