import { Link } from "react-router-dom";
export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      className={`brand-logo${compact ? " compact" : ""}`}
      to="/"
      aria-label="Parkly home"
    >
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path
            d="M10 25V8h8a6 6 0 0 1 0 12h-3"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M20 7c0-4 5-5 7-4 0 4-3 6-7 4Z" fill="currentColor" />
        </svg>
      </span>
      <span>
        parkly<span className="logo-dot">.</span>
      </span>
    </Link>
  );
}
