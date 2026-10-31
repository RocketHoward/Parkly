import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, UserRound, ShieldCheck, LogOut, Mail } from "lucide-react";
import Logo from "../components/Logo";
import { Field, Notice, Spinner, errorMessage } from "../components/UI";
import { useAuth } from "../contexts/AuthContext";
import { validateName } from "../lib/validation";
export default function Profile() {
  const { user, updateProfile, sendPasswordReset, signOut } = useAuth();
  const [name, setName] = useState(user?.user_metadata.full_name ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function action(fn: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await fn();
      setSuccess(message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateName(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    void action(
      () => updateProfile(name.trim()),
      "Your profile has been updated.",
    );
  }
  return (
    <div className="settings-page">
      <header className="simple-header">
        <Logo />
        <Link className="back-link" to="/dashboard">
          <ArrowLeft size={16} />
          Back to the map
        </Link>
      </header>
      <main className="settings-main">
        <span className="form-eyebrow">MAKE YOURSELF AT HOME</span>
        <h1>Your account.</h1>
        <p className="form-description">
          The little details that make your journey yours.
        </p>
        <section className="settings-card">
          <div className="settings-title">
            <span className="form-illustration">
              <UserRound size={24} />
            </span>
            <div>
              <h2>Profile details</h2>
              <p>Your information, all in one place.</p>
            </div>
          </div>
          <form noValidate onSubmit={submit}>
            <Field
              id="profile-name"
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              disabled={busy}
            />
            <Field
              id="profile-email"
              label="Email address"
              type="email"
              value={user?.email ?? ""}
              readOnly
              icon={<Mail size={17} />}
            />
            <p className="field-hint">
              Your verified email is managed by your sign-in provider.
            </p>
            {error && <Notice>{error}</Notice>}
            {success && <Notice success>{success}</Notice>}
            <button className="button primary" disabled={busy}>
              {busy ? <Spinner /> : "Save changes"}
            </button>
          </form>
        </section>
        <section className="settings-card">
          <div className="settings-title">
            <ShieldCheck size={24} />
            <div>
              <h2>Account security</h2>
              <p>Keep your next journey secure.</p>
            </div>
          </div>
          <button
            className="button secondary full"
            disabled={busy}
            onClick={() =>
              void action(
                () => sendPasswordReset(user?.email ?? ""),
                "If password recovery is available for this account, a secure link is on its way to your inbox.",
              )
            }
          >
            Send a password reset email
          </button>
          <button
            className="button quiet full"
            disabled={busy}
            onClick={() => void action(signOut, "")}
          >
            <LogOut size={17} />
            Log out
          </button>
        </section>
      </main>
    </div>
  );
}
