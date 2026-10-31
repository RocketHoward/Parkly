import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, MailCheck, KeyRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { validateEmail } from "../lib/validation";
import { Field, Notice, Spinner, errorMessage } from "../components/UI";
export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState(""),
    [submitted, setSubmitted] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError("");
    if (validateEmail(email)) return;
    setBusy(true);
    try {
      await sendPasswordReset(email.trim());
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
        {sent ? <MailCheck size={28} /> : <KeyRound size={27} />}
      </span>
      <span className="form-eyebrow">LET’S GET YOU BACK ON THE ROAD</span>
      <h2>{sent ? "Check your inbox." : "Forgot your password?"}</h2>
      <p className="form-description">
        {sent
          ? "If an account exists for this email, a secure reset link is on its way. Check your spam folder, too."
          : "It happens. Enter your email and we’ll send you a secure link to reset it."}
      </p>
      {sent ? (
        <Notice success>
          Open the link in your email to choose a new password. The link expires
          for your security.
        </Notice>
      ) : (
        <form onSubmit={submit} noValidate>
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
          {error && <Notice>{error}</Notice>}
          <button className="button primary full" disabled={busy}>
            {busy ? (
              <Spinner />
            ) : (
              <>
                Send reset link
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      )}
      <Link className="back-link" to="/login">
        <ArrowLeft size={16} />
        Back to log in
      </Link>
    </div>
  );
}
