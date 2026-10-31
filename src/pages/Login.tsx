import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Compass, LockKeyhole } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { validateEmail } from "../lib/validation";
import {
  Field,
  PasswordField,
  Notice,
  Spinner,
  GoogleIcon,
  errorMessage,
} from "../components/UI";
export default function Login() {
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<"email" | "google" | null>(null),
    [submitted, setSubmitted] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError("");
    if (validateEmail(email) || !password) return;
    setBusy("email");
    try {
      await signIn(email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  async function google() {
    setError("");
    setBusy("google");
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }
  return (
    <div className="auth-content">
      <span className="form-eyebrow">A GOOD PLACE TO START</span>
      <h2>
        Welcome back<span className="welcome-dot">.</span>
      </h2>
      <p className="form-description">
        Your next great day is just a parking spot away.
      </p>
      <button
        className="button google-button"
        disabled={!!busy}
        onClick={google}
      >
        {busy === "google" ? <Spinner /> : <GoogleIcon />}Continue with Google
      </button>
      <div className="divider">
        <span>or continue with email</span>
      </div>
      <form onSubmit={submit} noValidate>
        <Field
          id="email"
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={submitted ? validateEmail(email) : null}
          disabled={!!busy}
        />
        <div className="password-section">
          <PasswordField
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            error={submitted && !password ? "Enter your password." : null}
            disabled={!!busy}
          />
          <Link className="forgot-link" to="/forgot-password">
            Forgot password?
          </Link>
        </div>
        {error && (
          <Notice>
            <span>{error}</span>
            {error.includes("Confirm your email") && (
              <Link
                className="resend-inline"
                to="/verify-email"
                state={{ email: email.trim(), resend: true }}
              >
                Resend confirmation email
              </Link>
            )}
          </Notice>
        )}
        <button className="button primary full" type="submit" disabled={!!busy}>
          {busy === "email" ? (
            <Spinner />
          ) : (
            <>
              Log in <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>
      <p className="signup-prompt">
        First time here?{" "}
        <Link to="/signup">
          Let’s get you started <ArrowUpRightSmall />
        </Link>
      </p>
      <div className="auth-assurance">
        <LockKeyhole size={13} />
        <span>A secure start to a smoother journey.</span>
      </div>
      <div className="demo-invite">
        <Link to="/explore">
          <Compass size={16} /> Take a look around <ArrowRight size={15} />
        </Link>
        <span>Explore the map with demonstration data</span>
      </div>
    </div>
  );
}
function ArrowUpRightSmall() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 9 9 3M3 3h6v6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
