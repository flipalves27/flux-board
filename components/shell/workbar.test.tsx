import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkbarProvider, useWorkbarContext } from "./workbar-context-provider";
import { Workbar } from "./workbar";
import { useEffect, type ReactNode } from "react";

function SlotProbe({ children }: { children: ReactNode }) {
  const { setSlot } = useWorkbarContext();
  useEffect(() => {
    setSlot("a", children);
    return () => setSlot("a", null);
  }, [children, setSlot]);
  return null;
}

describe("Workbar", () => {
  it("renders slotted children", () => {
    render(
      <WorkbarProvider>
        <SlotProbe>
          <span>Hello workbar</span>
        </SlotProbe>
        <Workbar />
      </WorkbarProvider>
    );
    expect(screen.getByText("Hello workbar")).toBeTruthy();
  });
});
