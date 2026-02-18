"use client";

import { useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useRouter } from "next/navigation";

type FormState = {
  account_number: string;
  firm: string;
  size: string;
  phase: "phase1" | "phase2" | "live";
  balance: string;
  max_drawdown_percent: string;
  profit_target_percent: string;
};

export default function AddAccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>({
    account_number: "",
    firm: "",
    size: "",
    phase: "phase1",
    balance: "",
    max_drawdown_percent: "",
    profit_target_percent: "",
  });

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isValid()) {
      alert("Заполни все поля — они обязательные.");
      return;
    }

    setLoading(true);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      setLoading(false);
      alert("Сессия не найдена. Перезайди в аккаунт.");
      router.push("/login");
      return;
    }

    const userId = authData.user.id;

    // ВАЖНО: делаем select() чтобы получить id новой строки
    const { data, error } = await supabase
      .from("accounts")
      .insert([
        {
          user_id: userId, // ✅ обязательно для RLS политики
          account_number: form.account_number.trim(),
          firm: form.firm.trim(),
          size: Number(form.size),
          phase: form.phase,
          balance: Number(form.balance),
          max_drawdown_percent: Number(form.max_drawdown_percent),
          profit_target_percent: Number(form.profit_target_percent),
        },
      ])
      .select("id")
      .single();

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    // ✅ переход на страницу счета
    router.push("/accounts");
router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white p-8 rounded-2xl shadow border"
      >
        <h1 className="text-2xl font-bold mb-2 text-center text-gray-900">Добавить счёт</h1>
        <p className="text-center text-sm text-gray-600 mb-6">
          Заполни данные — счёт появится в списке и откроется его страница.
        </p>

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
            <span className="text-gray-400" title="Фаза 1 / Фаза 2 / Лайв — влияет на подсказки и блоки аналитики">
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
          disabled={loading}
          className="w-full mt-6 bg-black text-white p-3 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-60"
        >
          {loading ? "Сохранение..." : "Сохранить счёт"}
        </button>
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
