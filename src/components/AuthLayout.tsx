import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Leaf,
  MapPin,
  ArrowUpRight,
  ShieldCheck,
  MoveUpRight,
} from "lucide-react";
import Logo from "./Logo";
export default function AuthLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isSignup = pathname.replace(/\/+$/, "") === "/signup";
  return (
    <main className="auth-shell">
      <section className="brand-panel" aria-label="Welcome to Parkly">
        <Logo />
        <div className="brand-copy">
          <span className="eyebrow">
            <span className="tiny-dot" /> LESS CIRCLING. MORE LIVING.
          </span>
          <h1>
            Parking
            <br />
            made simple<span>.</span>
          </h1>
          <p>
            A little less searching. A little more exploring.
            <br className="desktop-break" /> Find your perfect spot and get to
            the good part.
          </p>
        </div>
        <div className="brand-art">
          <div className="art-orbit" />
          <img
            src={`${import.meta.env.BASE_URL}images/parking-garden.svg`}
            alt="A quiet tree-lined street with a little sage-green car and a parking sign"
          />
          <div className="art-note">
            <span className="note-icon">
              <MapPin size={19} />
            </span>
            <div>
              Your next stop, simplified.
              <span>More time for what matters.</span>
            </div>
            <MoveUpRight size={15} />
          </div>
          <span className="art-spark spark-one">✳</span>
          <span className="art-spark spark-two">✳</span>
        </div>
        <div className="brand-bottom">
          <span>
            <Leaf size={16} /> Find your spot. Enjoy your journey.
          </span>
          <span className="brand-coordinate">A BETTER WAY TO ARRIVE</span>
        </div>
      </section>
      <section className="auth-panel">
        <header className="auth-top">
          <div className="mobile-logo">
            <Logo />
          </div>
          <span>
            {isSignup
              ? "Already part of the journey?"
              : "New around here?"}{" "}
            <Link to={isSignup ? "/login" : "/signup"}>
              {isSignup ? "Log in" : "Create an account"}
              <ArrowUpRight size={14} />
            </Link>
          </span>
        </header>
        <div className="auth-main">{children}</div>
        <footer className="auth-footer">
          <span>© {new Date().getFullYear()} Parkly</span>
          <nav aria-label="Legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <span className="footer-secure">
              <ShieldCheck size={14} /> Built with care
            </span>
          </nav>
        </footer>
      </section>
    </main>
  );
}
