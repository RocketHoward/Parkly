import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  ""
).trim();

function hasPublicKey(key: string): boolean {
  if (key.startsWith("sb_publishable_") && key.length > 24) return true;
  // Legacy anon keys are public JWTs. Never initialize a browser client with an
  // admin/service-role key, which would bypass database RLS.
  try {
    const payload = JSON.parse(
      atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return payload.role === "anon";
  } catch {
    return false;
  }
}

function hasValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

export const isSupabaseConfigured =
  hasValidUrl(supabaseUrl) && hasPublicKey(supabaseKey);
export const configurationMessage =
  "Authentication is not configured yet. Add your Supabase project URL and public publishable (or anon) key to .env.local, then restart the app.";

// Capture callback details before the SDK consumes/removes the URL parameters.
const currentUrl =
  typeof window === "undefined" ? null : new URL(window.location.href);
const hashParams = new URLSearchParams(currentUrl?.hash.slice(1));
export const isInitialRecoveryRedirect = Boolean(
  currentUrl?.pathname.replace(/\/+$/, "") ===
    `${import.meta.env.BASE_URL}reset-password` &&
    (currentUrl?.searchParams.has("code") ||
      hashParams.get("type") === "recovery"),
);
export const initialAuthRedirectError =
  currentUrl?.searchParams.get("error_code") ??
  hashParams.get("error_code") ??
  currentUrl?.searchParams.get("error") ??
  hashParams.get("error") ??
  null;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;

// Register before React renders, so a fast PKCE exchange cannot deliver the
// recovery event before AuthProvider mounts. This singleton listener only
// records the event; it never calls auth methods while the SDK holds its lock.
let recoveryEvent: { userId: string; occurredAt: number } | null = null;
supabase?.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY" && session) {
    recoveryEvent = { userId: session.user.id, occurredAt: Date.now() };
  } else if (event === "SIGNED_OUT") {
    recoveryEvent = null;
  }
});

export const getRecoveryEvent = () => recoveryEvent;
export const clearRecoveryEvent = () => {
  recoveryEvent = null;
};
