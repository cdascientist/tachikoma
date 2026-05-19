// Central API base URL — uses Vite's BASE_URL so the same build
// works at / (root deploy) or /tachikoma/ (subpath deploy).
// Set via vite.config.ts → process.env.VITE_BASE

export const API_BASE = (import.meta as any).env.BASE_URL || "/";

export function apiUrl(path: string): string {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return `${API_BASE}${clean}`;
}
