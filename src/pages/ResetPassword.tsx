import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, ArrowRight, Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { validatePassword } from "../lib/validation";
import { PasswordField, Notice, Spinner, errorMessage } from "../components/UI";
export default function ResetPassword() {
  const { isRecovery, user, updatePassword, authError, signOut, loading } =
    useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [submitted, setSubmitted] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError("");
    if (validatePassword(password) || password !== confirm) return;
    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
      setPassword("");
      setConfirm("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function returnToLogin() {
    setBusy(true);
    setError("");
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (e) {
      setError(
        "Your password was updated, but we couldn’t sign you out. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading && !done)
    return (
      <div className="auth-content">
        <Spinner />
        <p className="form-description">Checking your secure reset link…</p>
      </div>
    );
  return (
    <div className="auth-content">
      <span className="form-illustration">
        {done ? <Check size={28} /> : <KeyRound size={28} />}
      </span>
      <span className="form-eyebrow">A FRESH START</span>
      <h2>{done ? "You’re good to go." : "Choose a new password."}</h2>
      {done ? (
        <>
          <p className="form-description">
            Your password has been updated securely. Log in to continue your
            journey.
          </p>
          <button
            className="button primary full"
            onClick={returnToLogin}
            disabled={busy}
          >
            {busy ? (
              <Spinner />
            ) : (
              <>
                Back to log in
                <ArrowRight size={17} />
              </>
            )}
          </button>
          {error && <Notice>{error}</Notice>}
        </>
      ) : !user || !isRecovery ? (
        <>
          <p className="form-description">
            Open the secure link in your password recovery email to reset your
            password.
          </p>
          <Notice>
            {authError ||
              "This reset session is missing or has expired. Request a new link below."}
          </Notice>
          <Link className="button primary full" to="/forgot-password">
            Request a new reset link
          </Link>
        </>
      ) : (
        <>
          <p className="form-description">
            Make it something memorable, and keep it just for you.
          </p>
          <form onSubmit={submit} noValidate>
            <PasswordField
              label="New password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={submitted ? validatePassword(password) : null}
              disabled={busy}
            />
            <p className="field-hint">Use at least 8 characters.</p>
            <PasswordField
              label="Confirm new password"
              id="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={
                submitted
                  ? !confirm
                    ? "Confirm your password."
                    : password !== confirm
                      ? "Your passwords don’t match."
                      : null
                  : null
              }
              disabled={busy}
            />
            {error && <Notice>{error}</Notice>}
            <button className="button primary full" disabled={busy}>
              {busy ? <Spinner /> : "Update password"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
