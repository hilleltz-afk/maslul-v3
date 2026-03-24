/**
 * getTenantId — reads tenant_id from the JWT stored in localStorage.
 * Falls back to the known dev/prod tenant if the token is missing or malformed.
 */
const FALLBACK_TENANT_ID = "f7d67cb1-3414-47a4-8ddb-2845d11d32ff";

export function getTenantId(): string {
  if (typeof window === "undefined") return FALLBACK_TENANT_ID;
  try {
    const token = localStorage.getItem("token");
    if (!token) return FALLBACK_TENANT_ID;
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.tenant_id || FALLBACK_TENANT_ID;
  } catch {
    return FALLBACK_TENANT_ID;
  }
}
