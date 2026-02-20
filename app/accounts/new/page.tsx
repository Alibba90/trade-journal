"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Phase = "phase1" | "phase2" | "live";

type FormState = {
  account_number: string;
  firm: string;
  size: string;
  phase: Phase;
  balance: string;
  max_drawdown_percent: string;
  profit_target_percent: string; // для live будет игнорироваться
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

  useEffect(() => {
    // если лайв — не требуем цель
    if (form.phase === "live") {
      setForm((p) => ({ ...p, profit_target_percent: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.phase]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  }

  function isValid() {
    const base =
      form.account_number.trim() &&
      form.firm.trim() &&
      form.size.trim() &&
      form.balance.trim() &&
      form.max_drawdown_percent.trim();

    if (!base) return false;

    // ✅ цель обязательна только для phase1/phase2
    if (form.phase !== "live") {
      return !!form.profit_target_percent.trim();
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isValid()) {
      alert("Заполни все обязательные поля.");
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

    const payload: any = {
      user_id: userId,
      account_number: form.account_number.trim(),
      firm: form.firm.trim(),
      size: Number(form.size),
      phase: form.phase,
      balance: Number(form.balance),
      max_drawdown_percent: Number(form.max_drawdown_percent),
    };

    if (form.phase !== "live") {
      payload.profit_target_percent = Number(form.profit_target_percent);
    } else {
      // чтобы не портить схему — можно поставить 0
      payload.profit_target_percent = 0;
    }

    const { error } = await supabase.from("accounts").insert([payload]);

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/accounts");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-lg">
        <div className="mb-4 flex items-center justify-between">
          <LinkHome />
          <button
            type="button"
            onClick={() => router.push("/accounts")}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            ← Счета
          </button>
        </div>

        <form onSubmit={handleSubmit} className="w-full bg-white p-8 rounded-2xl shadow border">
          <h1 className="text-2xl font-bold mb-2 text-center text-gray-900">Добавить счёт</h1>
          <p className="text-center text-sm text-gray-600 mb-6">Заполни данные — счёт появится в списке.</p>

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

          {form.phase !== "live" ? (
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
          ) : (
            <div className="mb-4 rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
              Для <span className="font-semibold">Лайв</span> счёта цель по прибыли не нужна.
            </div>
          )}

          <div className="mt-4">
            <label className="block text-sm mb-1 text-gray-800">
              Этап{" "}
              <span className="text-gray-400 cursor-help" title="Фаза 1 / Фаза 2 / Лайв">
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
      </div>
    </main>
  );
}

function LinkHome() {
  return (
    <a href="/" className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50">
      ← Главная
    </a>
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
