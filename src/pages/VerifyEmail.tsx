import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MailCheck, ArrowLeft } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { validateEmail } from "../lib/validation";
import { Field, Notice, Spinner, errorMessage } from "../components/UI";
export default function VerifyEmail() {
  const location = useLocation(),
    { resendVerification } = useAuth();
  const [email, setEmail] = useState<string>(location.state?.email ?? ""),
    [cooldown, setCooldown] = useState(
      location.state?.email && !location.state?.resend ? 60 : 0,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function resend() {
    setError("");
    const invalid = validateEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      await resendVerification(email.trim());
      setCooldown(60);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-content">
      <span className="form-illustration">
        <MailCheck size={30} />
      </span>
      <span className="form-eyebrow">ONE SMALL STEP, THEN YOU’RE OFF</span>
      <h2>Check your inbox.</h2>
      <p className="form-description">
        We’ve requested a verification link for your email. Follow it to confirm
        your address and start your journey.
      </p>
      <div className="info-card">
        <strong>A secure link, just for you.</strong>
        <p>
          Open the confirmation email in this browser. If you can’t see it,
          check your spam folder.
        </p>
      </div>
      <Field
        label="Email address"
        id="verification-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        disabled={busy}
      />
      {error && <Notice>{error}</Notice>}
      {sent && (
        <Notice success>
          If this email is awaiting confirmation, a new link has been sent.
        </Notice>
      )}
      <button
        className="button secondary full"
        onClick={resend}
        disabled={busy || cooldown > 0}
      >
        {busy ? (
          <Spinner />
        ) : cooldown > 0 ? (
          `Resend link in ${cooldown}s`
        ) : (
          "Resend verification link"
        )}
      </button>
      <Link className="back-link" to="/login">
        <ArrowLeft size={16} />
        Back to log in
      </Link>
    </div>
  );
}
