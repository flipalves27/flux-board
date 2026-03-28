import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FaqItem } from "./landing-primitives";

describe("FaqItem", () => {
  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(<FaqItem question="Test Q?" answer="Test A." open={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: /test q/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("shows answer when open and sets aria-expanded", () => {
    render(<FaqItem question="Q" answer="Hidden text" open onToggle={() => {}} />);
    expect(screen.getByText("Hidden text")).toBeTruthy();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  });
});
