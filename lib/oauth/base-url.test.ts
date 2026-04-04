import { describe, expect, it, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { getOAuthPublicBaseUrl } from "./base-url";

describe("getOAuthPublicBaseUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
  });

  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    const req = new NextRequest("http://localhost:3000/foo");
    expect(getOAuthPublicBaseUrl(req)).toBe("https://app.example.com");
  });

  it("falls back to forwarded host and proto", () => {
    const req = new NextRequest("http://internal/any", {
      headers: {
        "x-forwarded-host": "myapp.vercel.app",
        "x-forwarded-proto": "https",
      },
    });
    expect(getOAuthPublicBaseUrl(req)).toBe("https://myapp.vercel.app");
  });
});
