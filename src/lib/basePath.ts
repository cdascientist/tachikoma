// Base path helper — uses Vite's BASE_URL so the same code
// builds for / (root deploy) or /tachikoma/ (subpath deploy).
// Set via vite.config.ts → process.env.VITE_BASE

export const BASE = (import.meta as any).env.BASE_URL || "/";

export const apiPath = (p: string) => {
  const clean = p.startsWith("/") ? p.slice(1) : p;
  return `${BASE}api/${clean}`;
};

export const wsUrl = () => {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${BASE}ws`;
};
