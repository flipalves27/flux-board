"use client";

import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
import type { FluxyAvatarState } from "@/components/fluxy/fluxy-types";

type FluxyDockRestoreButtonProps = {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  avatarState: FluxyAvatarState;
  buttonClassName: string;
  iconWrapperClassName: string;
};

export function FluxyDockRestoreButton({
  label,
  ariaLabel,
  onClick,
  avatarState,
  buttonClassName,
  iconWrapperClassName,
}: FluxyDockRestoreButtonProps) {
  return (
    <button type="button" onClick={onClick} className={buttonClassName} aria-label={ariaLabel}>
      <span className={iconWrapperClassName}>
        <FluxyAvatar state={avatarState} size="fab" />
      </span>
      {label}
    </button>
  );
}

type FluxyDockLauncherProps = {
  onOpen: () => void;
  onHide: () => void;
  openAriaLabel: string;
  hideAriaLabel: string;
  hideTitle?: string;
  avatarState: FluxyAvatarState;
  avatarSize?: "compact" | "fab";
  containerClassName: string;
  openButtonClassName: string;
  avatarWrapperClassName: string;
  title: string;
  subtitle: string;
  titleClassName?: string;
  subtitleClassName?: string;
  openAriaExpanded?: boolean;
};

export function FluxyDockLauncher({
  onOpen,
  onHide,
  openAriaLabel,
  hideAriaLabel,
  hideTitle,
  avatarState,
  avatarSize = "compact",
  containerClassName,
  openButtonClassName,
  avatarWrapperClassName,
  title,
  subtitle,
  titleClassName = "block font-display text-sm font-bold text-[var(--flux-text)] leading-tight",
  subtitleClassName = "block text-[10px] text-[var(--flux-text-muted)] leading-snug",
  openAriaExpanded,
}: FluxyDockLauncherProps) {
  return (
    <div className={containerClassName}>
      <button
        type="button"
        onClick={onOpen}
        className={openButtonClassName}
        aria-label={openAriaLabel}
        aria-expanded={openAriaExpanded}
      >
        <span className={avatarWrapperClassName}>
          <FluxyAvatar state={avatarState} size={avatarSize} />
        </span>
        <span className="min-w-0">
          <span className={titleClassName}>{title}</span>
          <span className={subtitleClassName}>{subtitle}</span>
        </span>
      </button>
      <button type="button" onClick={onHide} className="btn-secondary shrink-0 px-2.5 py-2 text-[10px]" aria-label={hideAriaLabel} title={hideTitle ?? hideAriaLabel}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      </button>
    </div>
  );
}

