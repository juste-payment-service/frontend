import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/health", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("expose la révision déployée (12 caractères) sans cache", async () => {
    vi.stubEnv("CONSOLE_REVISION", "0123456789abcdef0123456789abcdef01234567");

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok", revision: "0123456789ab" });
  });

  it("renvoie null hors build CI", async () => {
    vi.stubEnv("CONSOLE_REVISION", "");
    await expect(GET().json()).resolves.toEqual({ status: "ok", revision: null });
  });

  it("ignore une valeur qui n'est pas un commit", async () => {
    vi.stubEnv("CONSOLE_REVISION", "<script>");
    await expect(GET().json()).resolves.toEqual({ status: "ok", revision: null });
  });
});
