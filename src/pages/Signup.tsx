import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  validateEmail,
  validatePassword,
  validateName,
} from "../lib/validation";
import {
  Field,
  PasswordField,
  Notice,
  Spinner,
  GoogleIcon,
  errorMessage,
} from "../components/UI";
export default function Signup() {
  const { signUp, signInWithGoogle } = useAuth(),
    navigate = useNavigate();
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [submitted, setSubmitted] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError("");
    if (
      validateName(name) ||
      validateEmail(email) ||
      validatePassword(password) ||
      password !== confirm
    )
      return;
    setBusy(true);
    try {
      const result = await signUp(name.trim(), email.trim(), password);
      navigate(result.needsVerification ? "/verify-email" : "/dashboard", {
        state: { email: email.trim() },
        replace: true,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <div className="auth-content signup-content">
      <span className="form-eyebrow">MORE GOOD DAYS AHEAD</span>
      <h2>Find your happy place.</h2>
      <p className="form-description">
        Create an account. Make room for better journeys.
      </p>
      <button className="button google-button" disabled={busy} onClick={google}>
        <GoogleIcon />
        Continue with Google
      </button>
      <div className="divider">
        <span>or sign up with email</span>
      </div>
      <form noValidate onSubmit={submit}>
        <Field
          label="Full name"
          id="name"
          autoComplete="name"
          placeholder="Your full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={submitted ? validateName(name) : null}
          disabled={busy}
        />
        <Field
          label="Email address"
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={submitted ? validateEmail(email) : null}
          disabled={busy}
        />
        <PasswordField
          autoComplete="new-password"
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={submitted ? validatePassword(password) : null}
          disabled={busy}
        />
        <p className="field-hint">
          Use at least 8 characters. A longer passphrase is even better.
        </p>
        <PasswordField
          id="confirm-password"
          label="Confirm password"
          autoComplete="new-password"
          placeholder="One more time"
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
        <p className="agreement">
          By creating an account, you agree to our{" "}
          <Link to="/terms">Terms</Link> and acknowledge our{" "}
          <Link to="/privacy">Privacy notice</Link>.
        </p>
        <button className="button primary full" disabled={busy}>
          {busy ? (
            <Spinner />
          ) : (
            <>
              Create account
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>
      <p className="signup-prompt">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
