import { APP_CONFIG } from "../config/app";

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

interface AuthResponse {
  user: User | null;
}

export interface AccountExport {
  exportedAt: string;
  user: User;
  truncated: boolean;
  reviews: Array<{
    id: string;
    language: string;
    code: string;
    result: unknown;
    createdAt: string;
  }>;
}

async function authRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${APP_CONFIG.api.auth}/${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Authentication request failed.");
  }

  return (payload ?? {}) as T;
}

export async function getSession(): Promise<User | null> {
  return (await authRequest<AuthResponse>("session")).user ?? null;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  const { user } = await authRequest<AuthResponse>("register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!user) throw new Error("The account was created without a session.");
  return user;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<User> {
  const { user } = await authRequest<AuthResponse>("login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!user) throw new Error("Sign in did not create a session.");
  return user;
}

export async function logout(): Promise<void> {
  await authRequest<{ signedOut: boolean }>("logout", { method: "POST" });
}

export async function exportAccount(): Promise<AccountExport> {
  return authRequest<AccountExport>("export", { method: "POST" });
}

export async function deleteAccount(password: string): Promise<void> {
  await authRequest<{ deleted: boolean }>("delete", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}
