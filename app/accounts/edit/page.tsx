export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import EditAccountClient from "./EditAccountClient";

export default function EditAccountPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-gray-50" />}>
      <EditAccountClient />
    </Suspense>
  );
}