import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  clearRecoveryEvent,
  configurationMessage,
  getRecoveryEvent,
  initialAuthRedirectError,
  isInitialRecoveryRedirect,
  supabase,
} from "../lib/supabase";
import {
  validateEmail,
  validateName,
  validatePassword,
} from "../lib/validation";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isRecovery: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    fullName: string,
    email: string,
    password: string,
  ) => Promise<{ needsVerification: boolean }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  updateProfile: (fullName: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const RECOVERY_STORAGE_KEY = "parkly:password-recovery";
const RECOVERY_DURATION_MS = 60 * 60 * 1000;
type RecoveryMarker = { userId: string; expiresAt: number };

// This marker preserves the recovery screen across a reload. It contains no
// credentials and never grants access: every operation still needs Supabase auth.
function readRecovery(): RecoveryMarker | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(RECOVERY_STORAGE_KEY) ?? "null",
    );
    if (
      typeof value?.userId === "string" &&
      typeof value?.expiresAt === "number" &&
      value.expiresAt > Date.now()
    ) {
      return value as RecoveryMarker;
    }
    sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
  } catch {
    /* Storage may be unavailable in a restricted browser. */
  }
  return null;
}

function storeRecovery(value: RecoveryMarker | null) {
  try {
    if (value)
      sessionStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
  } catch {
    /* Recovery still works in this tab without persistence. */
  }
}

function friendlyError(error: unknown): Error {
  const details = error as {
    code?: string;
    status?: number;
    message?: string;
  } | null;
  const messages: Record<string, string> = {
    invalid_credentials:
      "That email and password do not match. Please try again.",
    email_not_confirmed:
      "Confirm your email before signing in. You can request a new verification email.",
    email_address_invalid: "Enter a valid email address.",
    email_address_not_authorized:
      "Email delivery is not configured for this address. The site owner needs to configure Supabase SMTP.",
    user_already_exists:
      "An account may already use this email. Try signing in or resetting your password.",
    weak_password:
      "Choose a stronger password that meets the site’s password requirements.",
    same_password: "Choose a password different from your current password.",
    over_email_send_rate_limit:
      "Please wait a minute before requesting another email.",
    over_request_rate_limit:
      "Too many attempts. Please wait a moment and try again.",
    otp_expired:
      "This email link has expired or has already been used. Request a new link.",
    flow_state_expired:
      "This sign-in link has expired. Start again in this browser.",
    flow_state_not_found:
      "This sign-in link is no longer valid. Start again in the same browser.",
    bad_code_verifier:
      "Open this link in the browser where you started, or request a new link here.",
    validation_failed: "Please check your details and try again.",
    provider_disabled: "Google sign-in is not enabled for this site yet.",
    signup_disabled:
      "New account registration is not enabled for this site yet.",
    access_denied: "Sign-in was cancelled or denied. Please try again.",
    session_not_found: "Your session has ended. Please sign in again.",
    refresh_token_not_found: "Your session has ended. Please sign in again.",
    bad_jwt: "Your session has expired. Please sign in again.",
    user_not_found: "Your session is no longer valid. Please sign in again.",
  };
  if (details?.code && messages[details.code])
    return new Error(messages[details.code]);
  if (details?.status === 429)
    return new Error("Too many attempts. Please wait a moment and try again.");
  if (details?.status && details.status >= 500)
    return new Error(
      "The authentication service is temporarily unavailable. Please try again.",
    );
  if (
    error instanceof TypeError ||
    /fetch|network|connection/i.test(details?.message ?? "")
  ) {
    return new Error(
      "We could not connect. Check your internet connection and try again.",
    );
  }
  if (/code verifier|pkce/i.test(details?.message ?? "")) {
    return new Error(
      "Open this link in the browser where you started, or request a new link here.",
    );
  }
  return new Error(
    "We could not complete that request. Please try again, or request a fresh email link.",
  );
}

function requireClient() {
  if (!supabase) throw new Error(configurationMessage);
  return supabase;
}

function assertValid(...errors: (string | null)[]) {
  const error = errors.find(Boolean);
  if (error) throw new Error(error);
}

async function providerCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw friendlyError(error);
  }
}

const callbackUrl = (path: string) =>
  new URL(
    `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`,
    window.location.origin,
  ).toString();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const verifiedUserId = useRef<string | null>(null);
  const recovery = useRef<RecoveryMarker | null>(readRecovery());
  const [isRecovery, setIsRecovery] = useState(
    isInitialRecoveryRedirect || Boolean(recovery.current),
  );
  const [authError, setAuthError] = useState<string | null>(
    initialAuthRedirectError
      ? friendlyError({ code: initialAuthRedirectError }).message
      : null,
  );

  function clearRecovery() {
    clearRecoveryEvent();
    recovery.current = null;
    storeRecovery(null);
    setIsRecovery(false);
  }

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let mounted = true;
    let revision = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    async function verifySession(
      next: Session | null,
      expectedRevision: number,
    ) {
      if (!mounted || expectedRevision !== revision) return;
      if (!next) {
        clearRecovery();
        verifiedUserId.current = null;
        setUser(null);
        setSession(null);
        setLoading(false);
        return;
      }
      try {
        // getSession reads browser storage; getUser verifies this exact token
        // with the Auth server before protected UI receives an authenticated user.
        const { data, error } = await client!.auth.getUser(next.access_token);
        if (!mounted || expectedRevision !== revision) return;
        if (error || !data.user)
          throw error ?? new Error("No authenticated user");
        verifiedUserId.current = data.user.id;
        setUser(data.user);
        setSession({ ...next, user: data.user });
        const event = getRecoveryEvent();
        if (
          event?.userId === data.user.id &&
          event.occurredAt + RECOVERY_DURATION_MS > Date.now()
        ) {
          const restored = {
            userId: event.userId,
            expiresAt: event.occurredAt + RECOVERY_DURATION_MS,
          };
          recovery.current = restored;
          storeRecovery(restored);
          setIsRecovery(true);
        }
        const marker = recovery.current;
        if (
          marker &&
          (marker.userId !== data.user.id || marker.expiresAt <= Date.now())
        ) {
          clearRecovery();
        }
      } catch (error) {
        if (!mounted || expectedRevision !== revision) return;
        clearRecovery();
        verifiedUserId.current = null;
        setUser(null);
        setSession(null);
        setAuthError(friendlyError(error).message);
      } finally {
        if (mounted && expectedRevision === revision) setLoading(false);
      }
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, next) => {
      const currentRevision = ++revision;
      if (event === "PASSWORD_RECOVERY" && next) {
        const marker = {
          userId: next.user.id,
          expiresAt: Date.now() + RECOVERY_DURATION_MS,
        };
        recovery.current = marker;
        storeRecovery(marker);
        setIsRecovery(true);
      }
      if (event === "SIGNED_OUT") {
        clearRecovery();
        verifiedUserId.current = null;
        setUser(null);
        setSession(null);
        setLoading(false);
        return;
      }
      // A refreshed token, tab-focus sign-in event, or profile edit for the
      // already-verified identity must not unmount protected page content.
      // New identities remain blocked until getUser verifies them.
      if (!next || next.user.id !== verifiedUserId.current) {
        setLoading(true);
        verifiedUserId.current = null;
        setUser(null);
        setSession(null);
      }
      // Defer network calls until outside the SDK's auth callback/lock.
      const timer = setTimeout(() => {
        timers.delete(timer);
        void verifySession(next, currentRevision);
      }, 0);
      timers.add(timer);
    });

    void (async () => {
      try {
        // initialize() reuses the SDK's automatic initialization promise and
        // lets the callback page surface expired links and failed exchanges.
        const initialization = await client.auth.initialize();
        if (!mounted) return;
        if (initialization.error) {
          setAuthError(friendlyError(initialization.error).message);
          clearRecovery();
        }
        const { data, error } = await client.auth.getSession();
        if (!mounted) return;
        if (error) throw error;
        await verifySession(data.session, revision);
      } catch (error) {
        if (!mounted) return;
        clearRecovery();
        verifiedUserId.current = null;
        setAuthError(friendlyError(error).message);
        setUser(null);
        setSession(null);
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      revision += 1;
      timers.forEach(clearTimeout);
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const client = requireClient();
    assertValid(validateEmail(email), password ? null : "Enter your password.");
    await providerCall(async () => {
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    });
    clearRecovery();
    setAuthError(null);
  }

  async function signUp(fullName: string, email: string, password: string) {
    const client = requireClient();
    assertValid(
      validateName(fullName),
      validateEmail(email),
      validatePassword(password),
    );
    return providerCall(async () => {
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: callbackUrl("/auth/callback"),
        },
      });
      if (error) throw error;
      setAuthError(null);
      return { needsVerification: !data.session };
    });
  }

  async function signInWithGoogle() {
    const client = requireClient();
    await providerCall(async () => {
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl("/auth/callback") },
      });
      if (error) throw error;
    });
    clearRecovery();
    setAuthError(null);
  }

  async function signOut() {
    const client = requireClient();
    await providerCall(async () => {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    });
    clearRecovery();
    verifiedUserId.current = null;
    setUser(null);
    setSession(null);
    setAuthError(null);
  }

  async function sendPasswordReset(email: string) {
    const client = requireClient();
    assertValid(validateEmail(email));
    await providerCall(async () => {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: callbackUrl("/reset-password"),
      });
      if (error) throw error;
    });
  }

  async function updatePassword(password: string) {
    const client = requireClient();
    assertValid(validatePassword(password));
    const marker = recovery.current;
    if (
      !marker ||
      marker.userId !== user?.id ||
      marker.expiresAt <= Date.now()
    ) {
      clearRecovery();
      throw new Error(
        "Open a fresh password-reset link from your email in this browser before setting a new password.",
      );
    }
    await providerCall(async () => {
      const { data, error: userError } = await client.auth.getUser();
      if (userError || !data.user || data.user.id !== marker.userId) {
        clearRecovery();
        verifiedUserId.current = null;
        setUser(null);
        setSession(null);
        throw userError ?? { code: "session_not_found" };
      }
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    });
    clearRecovery();
    setAuthError(null);
  }

  async function resendVerification(email: string) {
    const client = requireClient();
    assertValid(validateEmail(email));
    await providerCall(async () => {
      const { error } = await client.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl("/auth/callback") },
      });
      if (error) throw error;
    });
  }

  async function updateProfile(fullName: string) {
    const client = requireClient();
    assertValid(validateName(fullName));
    await providerCall(async () => {
      const { data, error } = await client.auth.updateUser({
        data: { full_name: fullName.trim() },
      });
      if (error) throw error;
      if (data.user) setUser(data.user);
    });
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isRecovery,
        authError,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        sendPasswordReset,
        updatePassword,
        resendVerification,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
