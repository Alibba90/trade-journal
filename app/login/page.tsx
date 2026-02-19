"use client";

import { Suspense } from "react";
import LoginForm from "./login-form";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Загрузка...</div>}>
      <LoginForm />
    </Suspense>
  );
}