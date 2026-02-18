'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
// import { createClient } from '@/utils/supabase/client'; // если у тебя так
// const supabase = createClient();

export default function RegisterPage() {
  const router = useRouter();
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const nickname = String(form.get('nickname') || '').trim();

    try {
      // ✅ ЗАМЕНИ НА СВОЙ supabase client
      // const { data, error } = await supabase.auth.signUp({
      //   email,
      //   password,
      //   options: {
      //     data: { nickname },
      //     emailRedirectTo: 'https://traderjournal.kz/login',
      //   },
      // });

      // Заглушка — убери:
      const error = null;

      if (error) throw error;

      // ✅ Сообщение + редирект на /login
      setInfo('Регистрация прошла успешно. Письмо для подтверждения отправлено на вашу почту. Проверьте входящие.');
      router.push('/login?from=register');
    } catch (e: any) {
      setErr(e?.message || 'Ошибка регистрации.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>Создать аккаунт</h1>

        {info && <div style={styles.info}>{info}</div>}
        {err && <div style={styles.error}>{err}</div>}

        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input name="email" type="email" placeholder="you@example.com" autoComplete="email" style={styles.input} />

          <label style={styles.label}>Ник</label>
          <input name="nickname" type="text" placeholder="Alibek" autoComplete="nickname" style={styles.input} />

          <label style={styles.label}>Пароль</label>
          <input name="password" type="password" placeholder="••••••••" autoComplete="new-password" style={styles.input} />

          <button disabled={loading} type="submit" style={styles.primaryBtn}>
            {loading ? 'Создаю...' : 'Зарегистрироваться'}
          </button>

          <a href="/login" style={styles.linkBtn}>
            Уже есть аккаунт? Войти
          </a>
        </form>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#F6F7F9' },
  card: {
    width: '100%',
    maxWidth: 420,
    background: '#fff',
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: 14,
    padding: 18,
    boxShadow: '0 8px 28px rgba(0,0,0,0.06)',
  },
  h1: { margin: 0, fontSize: 22, color: '#0B1220' },
  form: { marginTop: 14, display: 'grid', gap: 10 },
  label: { fontSize: 13, color: '#495469', marginTop: 6 },
  input: {
    width: '100%',
    padding: '12px 12px',
    borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.12)',
    background: '#FFFFFF',
    color: '#0B1220', // ✅ фикс белого текста
    outline: 'none',
    fontSize: 16,
  },
  primaryBtn: {
    marginTop: 10,
    width: '100%',
    padding: '12px 12px',
    borderRadius: 10,
    border: '1px solid #0B1220',
    background: '#0B1220',
    color: '#FFFFFF',
    fontWeight: 600,
    fontSize: 16,
    cursor: 'pointer',
    opacity: 1,
  },
  linkBtn: {
    marginTop: 6,
    display: 'inline-block',
    textAlign: 'center',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(0,0,0,0.12)',
    background: '#fff',
    color: '#0B1220',
    textDecoration: 'none',
    fontWeight: 600,
  },
  info: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    background: 'rgba(34, 197, 94, 0.12)',
    color: '#0B1220',
    border: '1px solid rgba(34, 197, 94, 0.25)',
    fontSize: 14,
    lineHeight: 1.4,
  },
  error: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    background: 'rgba(239, 68, 68, 0.10)',
    color: '#0B1220',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    fontSize: 14,
    lineHeight: 1.4,
  },
};
