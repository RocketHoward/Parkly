import { useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
export function Field({
  label,
  id,
  error,
  icon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
  error?: string | null;
  icon?: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`input-wrap ${error ? "invalid" : ""}`}>
        {icon && <span className="input-icon">{icon}</span>}
        <input
          id={id}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
      </div>
      {error && (
        <p role="alert" className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
export function PasswordField({
  label = "Password",
  id = "password",
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  id?: string;
  error?: string | null;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`input-wrap password-wrap ${error ? "invalid" : ""}`}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        <button
          type="button"
          className="visibility-button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </div>
      {error && (
        <p role="alert" className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
export function Notice({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return (
    <div
      className={`notice ${success ? "success" : ""}`}
      role={success ? "status" : "alert"}
    >
      {success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      <span>{children}</span>
    </div>
  );
}
export function Spinner() {
  return <LoaderCircle className="spin" size={18} aria-label="Loading" />;
}
export function GoogleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.4 14.4 0 0 1 9.77 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
