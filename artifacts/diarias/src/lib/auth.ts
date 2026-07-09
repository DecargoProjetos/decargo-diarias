const TOKEN_KEY = "diarias_access_token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** URL do portal DECARGO People — usuário faz login lá e é redirecionado de volta. */
export const PEOPLE_PORTAL_URL = "https://app.decargopeople.com.br";
