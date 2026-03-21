import { describe, expect, it } from "vitest";
import { isEditableTarget } from "./editable-target";

describe("isEditableTarget", () => {
  it("returns false for null and non-Element targets", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(document)).toBe(false);
  });

  it("returns true for textarea and contenteditable", () => {
    const ta = document.createElement("textarea");
    expect(isEditableTarget(ta)).toBe(true);
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    expect(isEditableTarget(div)).toBe(true);
  });

  it("returns true for text-like inputs", () => {
    const text = document.createElement("input");
    text.type = "text";
    expect(isEditableTarget(text)).toBe(true);
  });

  it("returns false for button and checkbox inputs", () => {
    const btn = document.createElement("input");
    btn.type = "button";
    expect(isEditableTarget(btn)).toBe(false);
    const cb = document.createElement("input");
    cb.type = "checkbox";
    expect(isEditableTarget(cb)).toBe(false);
  });

  it("returns true for combobox role", () => {
    const el = document.createElement("div");
    el.setAttribute("role", "combobox");
    expect(isEditableTarget(el)).toBe(true);
  });
});
