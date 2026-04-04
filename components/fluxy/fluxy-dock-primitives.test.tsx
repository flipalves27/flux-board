import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FluxyDockLauncher, FluxyDockRestoreButton } from "./fluxy-dock-primitives";

vi.mock("@/components/fluxy/fluxy-avatar", () => ({
  FluxyAvatar: () => <div>fluxy-avatar</div>,
}));

describe("FluxyDockRestoreButton", () => {
  it("renders label and triggers click", () => {
    const onClick = vi.fn();
    render(
      <FluxyDockRestoreButton
        label="Restaurar"
        ariaLabel="Restaurar dock"
        onClick={onClick}
        avatarState="idle"
        buttonClassName="btn"
        iconWrapperClassName="icon"
      />
    );
    expect(screen.getByText("Restaurar")).toBeTruthy();
    expect(screen.getByText("fluxy-avatar")).toBeTruthy();
    screen.getByRole("button", { name: "Restaurar dock" }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("FluxyDockLauncher", () => {
  it("renders title/subtitle and handles open/hide actions", () => {
    const onOpen = vi.fn();
    const onHide = vi.fn();
    render(
      <FluxyDockLauncher
        onOpen={onOpen}
        onHide={onHide}
        openAriaLabel="Abrir painel"
        hideAriaLabel="Ocultar dock"
        avatarState="talking"
        containerClassName="container"
        openButtonClassName="open-btn"
        avatarWrapperClassName="avatar-wrap"
        title="Fluxy"
        subtitle="Atalho"
      />
    );
    expect(screen.getByText("Fluxy")).toBeTruthy();
    expect(screen.getByText("Atalho")).toBeTruthy();
    expect(screen.getAllByText("fluxy-avatar").length).toBeGreaterThan(0);
    screen.getByRole("button", { name: "Abrir painel" }).click();
    screen.getByRole("button", { name: "Ocultar dock" }).click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

