"use client";

import type { CSSProperties, ReactNode } from "react";
import type { FluxyAvatarState } from "@/components/fluxy/fluxy-types";
import { FluxyDockLauncher, FluxyDockRestoreButton } from "@/components/fluxy/fluxy-dock-primitives";

type FluxyDockProps = {
  show: boolean;
  hydrated: boolean;
  dockVisible: boolean;
  setDockVisible: (visible: boolean) => void;
  restoreContainerClassName: string;
  launcherContainerClassName: string;
  positionStyle: CSSProperties;
  restore: {
    label: string;
    ariaLabel: string;
    avatarState: FluxyAvatarState;
    buttonClassName: string;
    iconWrapperClassName: string;
  };
  launcher: {
    onOpen: () => void;
    openAriaLabel: string;
    openAriaExpanded?: boolean;
    hideAriaLabel: string;
    hideTitle?: string;
    avatarState: FluxyAvatarState;
    containerClassName: string;
    openButtonClassName: string;
    avatarWrapperClassName: string;
    title: string;
    subtitle: string;
    titleClassName?: string;
    subtitleClassName?: string;
  };
  onRestoreDock?: () => void;
  onHideDock?: () => void;
  children?: ReactNode;
};

export function FluxyDock({
  show,
  hydrated,
  dockVisible,
  setDockVisible,
  restoreContainerClassName,
  launcherContainerClassName,
  positionStyle,
  restore,
  launcher,
  onRestoreDock,
  onHideDock,
  children,
}: FluxyDockProps) {
  if (!show || !hydrated) return null;

  if (!dockVisible) {
    return (
      <div className={restoreContainerClassName} style={positionStyle}>
        <FluxyDockRestoreButton
          label={restore.label}
          ariaLabel={restore.ariaLabel}
          onClick={() => {
            setDockVisible(true);
            onRestoreDock?.();
          }}
          avatarState={restore.avatarState}
          buttonClassName={restore.buttonClassName}
          iconWrapperClassName={restore.iconWrapperClassName}
        />
      </div>
    );
  }

  return (
    <>
      <div className={launcherContainerClassName} style={positionStyle}>
        <FluxyDockLauncher
          onOpen={launcher.onOpen}
          onHide={() => {
            setDockVisible(false);
            onHideDock?.();
          }}
          openAriaLabel={launcher.openAriaLabel}
          openAriaExpanded={launcher.openAriaExpanded}
          hideAriaLabel={launcher.hideAriaLabel}
          hideTitle={launcher.hideTitle}
          avatarState={launcher.avatarState}
          containerClassName={launcher.containerClassName}
          openButtonClassName={launcher.openButtonClassName}
          avatarWrapperClassName={launcher.avatarWrapperClassName}
          title={launcher.title}
          subtitle={launcher.subtitle}
          titleClassName={launcher.titleClassName}
          subtitleClassName={launcher.subtitleClassName}
        />
      </div>
      {children}
    </>
  );
}

