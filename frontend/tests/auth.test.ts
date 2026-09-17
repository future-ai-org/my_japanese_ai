import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteAccount,
  exportAccount,
  getSession,
  login,
  logout,
  register,
} from "../src/services/auth";

const user = {
  id: "user-id",
  name: "M",
  email: "m@example.com",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("auth service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the current session user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSession()).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("returns null when the session payload omits a user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    await expect(getSession()).resolves.toBeNull();
  });

  it("treats a successful empty body as a signed-out session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })),
    );
    await expect(getSession()).resolves.toBeNull();
  });

  it("registers and returns the created user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      register({ name: "M", email: "m@example.com", password: "password1" }),
    ).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/register", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "M",
        email: "m@example.com",
        password: "password1",
      }),
    });
  });

  it("rejects registration when the API omits a session user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ user: null }, 201)));
    await expect(
      register({ name: "M", email: "m@example.com", password: "password1" }),
    ).rejects.toThrow("The account was created without a session.");
  });

  it("logs in and returns the authenticated user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ user })));
    await expect(
      login({ email: "m@example.com", password: "password1" }),
    ).resolves.toEqual(user);
  });

  it("rejects sign-in when the API omits a session user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ user: null })));
    await expect(
      login({ email: "m@example.com", password: "password1" }),
    ).rejects.toThrow("Sign in did not create a session.");
  });

  it("posts a logout request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ signedOut: true }));
    vi.stubGlobal("fetch", fetchMock);
    await logout();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("surfaces API error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: "Invalid email or password." }, 401),
      ),
    );
    await expect(
      login({ email: "m@example.com", password: "wrong" }),
    ).rejects.toThrow("Invalid email or password.");
  });

  it("falls back when an error response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    );
    await expect(getSession()).rejects.toThrow("Authentication request failed.");
  });

  it("exports and deletes the account", async () => {
    const exported = {
      exportedAt: "2026-01-01T00:00:00.000Z",
      user,
      truncated: false,
      reviews: [],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(exported)));
    await expect(exportAccount()).resolves.toEqual(exported);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ deleted: true })));
    await deleteAccount("password1");
  });
});
