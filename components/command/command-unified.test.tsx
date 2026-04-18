import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommandUnified } from "./command-unified";

vi.mock("next/dynamic", () => ({
  default: () => {
    const Mock = () => <div data-testid="flux-command-dialog">unified</div>;
    Mock.displayName = "MockCommandPalette";
    return Mock;
  },
}));

describe("CommandUnified", () => {
  it("renders command surface", async () => {
    render(<CommandUnified />);
    expect(await screen.findByTestId("flux-command-dialog")).toBeTruthy();
  });
});
