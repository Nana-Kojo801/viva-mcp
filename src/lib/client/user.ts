"use client";

const COOKIE = "viva_user";

/** Anonymous per-browser user id, kept in the viva_user cookie for a year. */
export function getUserId(): string {
  const match = document.cookie.match(/(?:^|;\s*)viva_user=([A-Za-z0-9_-]{1,64})/);
  if (match) return match[1];
  const id = crypto.randomUUID();
  document.cookie = `${COOKIE}=${id}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  return id;
}
