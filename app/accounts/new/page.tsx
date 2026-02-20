"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

type FormState = {
  account_number: string;
  firm: string;
  size: string;
  phase: "phase1" | "phase2" | "live";
  balance: string;
  max_drawdown_percent: string;
  profit_target_percent: string;
};

function toNumberSafe(v: string) {
  const s = (v || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export default function AddOrEditAccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id"); // если есть -> редактируем

  const isEdit = useMemo(() => Boolean(editId), [editId]);

  const [loading, setLoading] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(false);

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

  // 🔥 если edit — загрузим данные счёта
  useEffect(() => {
    async function loadAccount() {
      if (!editId) return;

      setLoadingAccount(true);

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setLoadingAccount(false);
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("accounts")
        .select("id, account_number, firm, size, phase, balance, max_drawdown_percent, profit_target_percent")
        .eq("id", editId)
        .single();

      if (error || !data) {
        setLoadingAccount(false);
        alert(error?.message || "Счёт не найден");
        router.replace("/accounts");
        return;
      }

      setForm({
        account_number: String(data.account_number ?? ""),
        firm: String(data.firm ?? ""),
        size: String(data.size ?? ""),
        phase: (data.phase ?? "phase1") as any,
        balance: String(data.balance ?? ""),
        max_drawdown_percent: String(data.max_drawdown_percent ?? ""),
        profit_target_percent: String(data.profit_target_percent ?? ""),
      });

      setLoadingAccount(false);
    }

    loadAccount();
  }, [editId, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isValid()) {
      alert("Заполни все поля — они обязательные.");
      return;
    }

    const size = toNumberSafe(form.size);
    const balance = toNumberSafe(form.balance);
    const maxDD = toNumberSafe(form.max_drawdown_percent);
    const target = toNumberSafe(form.profit_target_percent);

    if ([size, balance, maxDD, target].some((n) => Number.isNaN(n))) {
      alert("Проверь числовые поля — там должны быть числа (можно с точкой/запятой).");
      return;
    }

    setLoading(true);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      setLoading(false);
      alert("Сессия не найдена. Перезайди в аккаунт.");
      router.replace("/login");
      return;
    }

    const userId = authData.user.id;

    if (!isEdit) {
      // ✅ ADD
      const { data, error } = await supabase
        .from("accounts")
        .insert([
          {
            user_id: userId,
            account_number: form.account_number.trim(),
            firm: form.firm.trim(),
            size,
            phase: form.phase,
            balance,
            max_drawdown_percent: maxDD,
            profit_target_percent: target,
          },
        ])
        .select("id")
        .single();

      setLoading(false);

      if (error) {
        alert(error.message);
        return;
      }

      // после добавления -> в список счетов
      router.replace("/accounts");
      router.refresh();
      return;
    }

    // ✅ EDIT
    const { error: updErr } = await supabase
      .from("accounts")
      .update({
        account_number: form.account_number.trim(),
        firm: form.firm.trim(),
        size,
        phase: form.phase,
        balance,
        max_drawdown_percent: maxDD,
        profit_target_percent: target,
      })
      .eq("id", editId);

    setLoading(false);

    if (updErr) {
      alert(updErr.message);
      return;
    }

    router.replace("/accounts");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-lg bg-white p-8 rounded-2xl shadow border">
        <h1 className="text-2xl font-bold mb-2 text-center text-gray-900">
          {isEdit ? "Редактировать счёт" : "Добавить счёт"}
        </h1>
        <p className="text-center text-sm text-gray-600 mb-6">
          {isEdit
            ? "Измени поля и сохрани — счёт обновится."
            : "Заполни данные — счёт появится в списке."}
        </p>

        {loadingAccount ? (
          <div className="text-center text-gray-600 py-10">Загрузка счёта…</div>
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
                  className="text-gray-400"
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
              disabled={loading}
              className="w-full mt-6 bg-black text-white p-3 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? "Сохранение..." : isEdit ? "Сохранить изменения" : "Сохранить счёт"}
            </button>

            <button
              type="button"
              onClick={() => router.replace("/accounts")}
              className="w-full mt-3 bg-white text-gray-900 p-3 rounded-xl font-semibold border hover:bg-gray-50 transition"
            >
              Отмена
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
