"use client";

import { useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AddAccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    account_number: "",
    firm: "",
    size: "",
    phase: "phase1",
    balance: "",
    max_drawdown_percent: "",
    profit_target_percent: ""
  });

  function handleChange(e: any) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: any) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from("accounts").insert([
      {
        account_number: form.account_number,
        firm: form.firm,
        size: Number(form.size),
        phase: form.phase,
        balance: Number(form.balance),
        max_drawdown_percent: Number(form.max_drawdown_percent),
        profit_target_percent: Number(form.profit_target_percent)
      }
    ]);

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-white p-8 rounded-2xl shadow border"
      >
        <h1 className="text-2xl font-bold mb-6 text-center">
          Добавить счёт
        </h1>

        <Input label="Номер счёта" name="account_number" onChange={handleChange} />
        <Input label="Фирма" name="firm" onChange={handleChange} />
        <Input label="Размер счёта $" name="size" onChange={handleChange} />
        <Input label="Баланс $" name="balance" onChange={handleChange} />
        <Input label="Макс просадка %" name="max_drawdown_percent" onChange={handleChange} />
        <Input label="Цель прибыли %" name="profit_target_percent" onChange={handleChange} />

        <select
          name="phase"
          onChange={handleChange}
          className="w-full border rounded-lg p-3 mt-4"
        >
          <option value="phase1">Фаза 1</option>
          <option value="phase2">Фаза 2</option>
          <option value="live">Лайв</option>
        </select>

        <button
          disabled={loading}
          className="w-full mt-6 bg-black text-white p-3 rounded-xl font-semibold hover:opacity-90 transition"
        >
          {loading ? "Сохранение..." : "Сохранить счёт"}
        </button>
      </form>
    </main>
  );
}

function Input({ label, name, onChange }: any) {
  return (
    <div className="mb-4">
      <label className="block text-sm mb-1">{label}</label>
      <input
        name={name}
        onChange={onChange}
        className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-black"
      />
    </div>
  );
}
