"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { loginAction, registerAction } from "@/app/actions/auth";

export default function LoginPage() {
  const router = useRouter();
  const { user, login, isChecked } = useAuth();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isChecked && user) router.replace("/boards");
  }, [isChecked, user, router]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const userInput = (form.elements.namedItem("user") as HTMLInputElement).value.trim();
    const pwd = (form.elements.namedItem("password") as HTMLInputElement).value;
    const remember = (form.elements.namedItem("remember") as HTMLInputElement)?.checked ?? true;
    if (!userInput || !pwd) {
      setError("Preencha usuário e senha.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await loginAction(userInput, pwd);
      if (result.ok) {
        login(result.token, result.user, remember);
        router.replace("/boards");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const pwd = (form.elements.namedItem("password") as HTMLInputElement).value;
    const remember = (form.elements.namedItem("remember") as HTMLInputElement)?.checked ?? true;
    if (!name || !email || !pwd) {
      setError("Preencha todos os campos.");
      return;
    }
    if (pwd.length < 4) {
      setError("Senha deve ter pelo menos 4 caracteres.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await registerAction(name, email, pwd);
      if (result.ok) {
        login(result.token, result.user, remember);
        router.replace("/boards");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab: "login" | "register") => {
    setActiveTab(tab);
    setError("");
  };

  if (!isChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8fafc] to-[#eef2f6]">
        <p className="text-[var(--g600)]">Carregando...</p>
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2.5 border border-[var(--g200)] rounded-lg text-[var(--g700)] focus:border-[var(--teal)] outline-none";
  const labelClass =
    "block text-xs font-semibold text-[var(--g600)] mb-1 uppercase tracking-wide";
  const btnClass =
    "w-full py-2.5 rounded-lg font-semibold bg-[var(--teal)] text-[var(--navy)] hover:bg-[var(--lime)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#f8fafc] to-[#eef2f6]">
      <div className="bg-white rounded-xl shadow-[0_8px_32px_rgba(10,31,63,0.12)] w-full max-w-[400px] p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-7 bg-[var(--teal)] rounded-sm" />
          <h1 className="font-display font-extrabold text-lg text-[var(--navy)]">
            AUSTRAL <span className="text-[var(--teal)]">SEGURADORA</span>
          </h1>
        </div>

        <div className="flex gap-1 mb-6 bg-[var(--g100)] rounded-lg p-1">
          <button
            type="button"
            onClick={() => switchTab("login")}
            className={`flex-1 py-2 rounded-md font-semibold text-sm transition-all ${
              activeTab === "login"
                ? "bg-white text-[var(--navy)] shadow-sm"
                : "text-[var(--g600)] hover:text-[var(--navy)]"
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => switchTab("register")}
            className={`flex-1 py-2 rounded-md font-semibold text-sm transition-all ${
              activeTab === "register"
                ? "bg-white text-[var(--navy)] shadow-sm"
                : "text-[var(--g600)] hover:text-[var(--navy)]"
            }`}
          >
            Cadastrar
          </button>
        </div>

        {error && (
          <div className="bg-[#FEF2F2] text-[#B91C1C] p-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {activeTab === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={labelClass}>Usuário ou E-mail</label>
              <input
                name="user"
                type="text"
                placeholder="Usuário ou e-mail"
                autoComplete="username"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Senha</label>
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                className={inputClass}
              />
            </div>
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input name="remember" type="checkbox" defaultChecked className="w-4 h-4 accent-[var(--teal)]" />
              <span className="text-sm text-[var(--g600)]">Manter conectado (gravar no navegador)</span>
            </label>
            <button type="submit" disabled={loading} className={btnClass}>
              Entrar
            </button>
          </form>
        )}

        {activeTab === "register" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className={labelClass}>Nome</label>
              <input
                name="name"
                type="text"
                placeholder="Seu nome completo"
                autoComplete="name"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>E-mail</label>
              <input
                name="email"
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Senha</label>
              <input
                name="password"
                type="password"
                placeholder="Mínimo 4 caracteres"
                autoComplete="new-password"
                className={inputClass}
              />
            </div>
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input name="remember" type="checkbox" defaultChecked className="w-4 h-4 accent-[var(--teal)]" />
              <span className="text-sm text-[var(--g600)]">Manter conectado após cadastro</span>
            </label>
            <button type="submit" disabled={loading} className={btnClass}>
              Cadastrar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
