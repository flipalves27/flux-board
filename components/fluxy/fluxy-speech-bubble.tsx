import type { ReactNode } from "react";

type FluxySpeechBubbleProps = {
  children: ReactNode;
  className?: string;
};

/** Speech-bubble chrome aligned with Fluxy prototype (glass + purple border). */
export function FluxySpeechBubble({ children, className = "" }: FluxySpeechBubbleProps) {
  return (
    <div
      className={`fluxy-ui-bounce-in rounded-[20px] rounded-bl-md border-[1.5px] border-[var(--flux-primary-alpha-35)] bg-[color-mix(in_srgb,var(--flux-surface-card)_80%,transparent)] px-[22px] py-3.5 text-center text-[var(--flux-text)] shadow-[0_8px_32px_rgba(13,10,26,0.53)] backdrop-blur-[12px] [line-height:1.6] font-fluxy text-sm ${className}`}
    >
      {children}
    </div>
  );
}
