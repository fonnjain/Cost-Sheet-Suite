import { setAuthTokenGetter } from "@workspace/api-client-react";

const TOKEN_KEY = "vt_session_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  initAuthTokenGetter();
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  setAuthTokenGetter(null);
}

export function initAuthTokenGetter(): void {
  setAuthTokenGetter(() => getStoredToken());
}
