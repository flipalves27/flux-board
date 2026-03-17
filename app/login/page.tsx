"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { loginAction, registerAction } from "@/app/actions/auth";

function FluxLogoIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <path d="M8 32L16 20L24 26L36 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 10H36V16" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="20" r="2.5" fill="rgba(253,167,223,0.8)" />
      <circle cx="24" cy="26" r="2.5" fill="rgba(0,210,211,0.8)" />
      <path d="M8 36H36" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

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
      <div className="min-h-screen flex items-center justify-center bg-[var(--flux-surface-dark)]">
        <p className="text-[var(--flux-text-muted)]">Carregando...</p>
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-[var(--flux-rad)] border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none transition-colors";
  const labelClass =
    "block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 uppercase tracking-wide font-display";
  const btnClass =
    "w-full py-2.5 rounded-[var(--flux-rad)] font-semibold bg-[var(--flux-primary)] text-white hover:bg-[var(--flux-primary-light)] disabled:opacity-60 disabled:cursor-not-allowed transition-all font-display";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--flux-surface-dark)]">
      <div className="bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-[var(--flux-rad-xl)] shadow-[0_8px_32px_rgba(0,0,0,0.4)] w-full max-w-[400px] p-8">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
              boxShadow: "0 8px 32px rgba(108,92,231,0.4)",
            }}
          >
            <FluxLogoIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-[var(--flux-text)] tracking-tight">
              Flux-Board
            </h1>
            <p className="text-xs text-[var(--flux-text-muted)] font-medium tracking-wide mt-0.5">
              Organize the flow. Ship what matters.
            </p>
          </div>
        </div>

        <div className="flex gap-1 mb-6 bg-[var(--flux-surface-elevated)] rounded-[var(--flux-rad)] p-1">
          <button
            type="button"
            onClick={() => switchTab("login")}
            className={`flex-1 py-2 rounded-[var(--flux-rad-sm)] font-semibold text-sm transition-all font-display ${
              activeTab === "login"
                ? "bg-[var(--flux-primary)] text-white shadow-sm"
                : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => switchTab("register")}
            className={`flex-1 py-2 rounded-[var(--flux-rad-sm)] font-semibold text-sm transition-all font-display ${
              activeTab === "register"
                ? "bg-[var(--flux-primary)] text-white shadow-sm"
                : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            }`}
          >
            Cadastrar
          </button>
        </div>

        {error && (
          <div className="bg-[rgba(255,107,107,0.12)] border border-[rgba(255,107,107,0.3)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm mb-4">
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
              <input name="remember" type="checkbox" defaultChecked className="w-4 h-4 accent-[var(--flux-primary)]" />
              <span className="text-sm text-[var(--flux-text-muted)]">Manter conectado (gravar no navegador)</span>
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
              <input name="remember" type="checkbox" defaultChecked className="w-4 h-4 accent-[var(--flux-primary)]" />
              <span className="text-sm text-[var(--flux-text-muted)]">Manter conectado após cadastro</span>
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
