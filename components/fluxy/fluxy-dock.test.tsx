import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FluxyDock } from "./fluxy-dock";

vi.mock("@/components/fluxy/fluxy-dock-primitives", () => ({
  FluxyDockRestoreButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>{label}</button>
  ),
  FluxyDockLauncher: ({ title, onOpen, onHide }: { title: string; onOpen: () => void; onHide: () => void }) => (
    <div>
      <button type="button" onClick={onOpen}>open</button>
      <button type="button" onClick={onHide}>hide</button>
      <span>{title}</span>
    </div>
  ),
}));

const baseProps = {
  show: true,
  hydrated: true,
  setDockVisible: vi.fn(),
  restoreContainerClassName: "restore-wrap",
  launcherContainerClassName: "launcher-wrap",
  positionStyle: { bottom: "1rem" },
  restore: {
    label: "Restore",
    ariaLabel: "Restore dock",
    avatarState: "idle" as const,
    buttonClassName: "btn",
    iconWrapperClassName: "icon",
  },
  launcher: {
    onOpen: vi.fn(),
    openAriaLabel: "Open dock",
    hideAriaLabel: "Hide dock",
    avatarState: "talking" as const,
    containerClassName: "container",
    openButtonClassName: "open-btn",
    avatarWrapperClassName: "avatar",
    title: "Fluxy",
    subtitle: "Hint",
  },
};

describe("FluxyDock", () => {
  it("renders restore button when dock is hidden", () => {
    render(<FluxyDock {...baseProps} dockVisible={false} />);
    expect(screen.getByText("Restore")).toBeTruthy();
  });

  it("renders launcher and children when dock is visible", () => {
    render(
      <FluxyDock {...baseProps} dockVisible>
        <div>panel</div>
      </FluxyDock>
    );
    expect(screen.getByText("Fluxy")).toBeTruthy();
    expect(screen.getByText("panel")).toBeTruthy();
  });
});

