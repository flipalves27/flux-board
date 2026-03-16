"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading, isChecked } = useAuth();

  useEffect(() => {
    if (!isChecked || isLoading) return;
    if (user) {
      router.replace("/boards");
    } else {
      router.replace("/login");
    }
  }, [user, isLoading, isChecked, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--off)]">
      <p className="text-[var(--g600)] font-medium">Redirecionando...</p>
    </div>
  );
}
