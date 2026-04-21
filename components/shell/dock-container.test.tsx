import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DockContainer } from "./dock-container";

describe("DockContainer", () => {
  it("renders when open", () => {
    render(
      <DockContainer title="Test dock" open onClose={() => {}}>
        <p>Inside</p>
      </DockContainer>
    );
    expect(screen.getByText("Inside")).toBeTruthy();
  });
});
