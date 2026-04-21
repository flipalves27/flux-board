"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function PushNotificationsSettings() {
  const { getHeaders } = useAuth();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);

  const vapidPublicKey = useMemo(
    () => (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim(),
    []
  );

  async function enablePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      pushToast({ kind: "warning", title: "Push não suportado neste navegador." });
      return;
    }
    if (!vapidPublicKey) {
      pushToast({ kind: "warning", title: "VAPID público não configurado." });
      return;
    }

    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        pushToast({ kind: "warning", title: "Permissão de notificação negada." });
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      await fetch("/api/users/me/push-subscriptions", {
        method: "POST",
        headers: {
          ...getHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(subscription.toJSON()),
      });

      pushToast({ kind: "success", title: "Push notifications ativadas." });
    } catch {
      pushToast({ kind: "error", title: "Não foi possível ativar notificações push." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flux-glass-surface rounded-[var(--flux-rad-lg)] p-4">
      <p className="font-display text-sm font-semibold text-[var(--flux-text)]">Push notifications</p>
      <p className="mt-1 text-xs text-[var(--flux-text-muted)]">
        Receba alertas de menções, prazos e bloqueios.
      </p>
      <button type="button" className="btn-primary mt-3 px-3 py-2 text-xs" disabled={busy} onClick={() => void enablePush()}>
        {busy ? "Ativando..." : "Ativar push"}
      </button>
    </div>
  );
}

