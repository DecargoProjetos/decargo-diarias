import { queryClient } from './queryClient';

const TOKEN_KEY = "diarias_access_token";
const sessionListeners = new Set<() => void>();

export function subscribeToSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}

function notifySessionChange(): void {
  sessionListeners.forEach(listener => listener());
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  // Invalidation retains data. Clear also cancels requests from the old session.
  queryClient.clear();
  sessionStorage.setItem(TOKEN_KEY, token);
  notifySessionChange();
}

export function clearToken(): void {
  queryClient.clear();
  sessionStorage.removeItem(TOKEN_KEY);
  notifySessionChange();
}

/** URL do portal DECARGO People — usuário faz login lá e é redirecionado de volta. */
export const PEOPLE_PORTAL_URL = "https://app.decargopeople.com.br";
