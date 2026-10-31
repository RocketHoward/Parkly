import { lazy, Suspense, useEffect } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LocationAccessProvider from "./contexts/LocationAccessContext";
import AuthLayout from "./components/AuthLayout";
import { Notice, Spinner } from "./components/UI";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Profile from "./pages/Profile";
import Legal from "./pages/Legal";
const Dashboard = lazy(() => import("./pages/Dashboard"));
function Loading() {
  return (
    <div className="page-loading" role="status">
      <Spinner />
      <span>Finding our bearings…</span>
    </div>
  );
}
function Private({ children }: { children: ReactNode }) {
  const { user, loading, isRecovery } = useAuth();
  if (loading) return <Loading />;
  if (isRecovery) return <Navigate to="/reset-password" replace />;
  return user ? children : <Navigate to="/login" replace />;
}
function Guest({ children }: { children: ReactNode }) {
  const { user, loading, isRecovery } = useAuth();
  if (loading) return <Loading />;
  if (isRecovery) return <Navigate to="/reset-password" replace />;
  return user ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <AuthLayout>{children}</AuthLayout>
  );
}
function Home() {
  const { user, loading, isRecovery } = useAuth();
  return loading ? (
    <Loading />
  ) : (
    <Navigate
      to={isRecovery ? "/reset-password" : user ? "/dashboard" : "/login"}
      replace
    />
  );
}
function Callback() {
  const { user, loading, isRecovery, authError } = useAuth();
  if (loading) return <Loading />;
  if (user && !authError)
    return (
      <Navigate to={isRecovery ? "/reset-password" : "/dashboard"} replace />
    );
  return (
    <AuthLayout>
      <div className="auth-content">
        <h2>Let’s try that again.</h2>
        <p className="form-description">
          Your sign-in link may have expired or was opened in a different
          browser.
        </p>
        <Notice>
          {authError ||
            "We couldn’t complete sign-in. Please request a fresh link or sign in again."}
        </Notice>
        <Link className="button primary full" to="/login">
          Back to log in
        </Link>
      </div>
    </AuthLayout>
  );
}
function RouteEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const names: Record<string, string> = {
      "/login": "Welcome back",
      "/signup": "Create an account",
      "/dashboard": "Find parking",
      "/explore": "Explore the map",
      "/profile": "Your account",
      "/forgot-password": "Reset your password",
      "/reset-password": "Choose a password",
      "/verify-email": "Check your email",
    };
    document.title = `${names[pathname.replace(/\/+$/, "")] ?? "Find your spot"} · Parkly`;
  }, [pathname]);
  return null;
}
export default function App() {
  return (
    <AuthProvider>
      <LocationAccessProvider>
      <RouteEffects />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/login"
            element={
              <Guest>
                <Login />
              </Guest>
            }
          />
          <Route
            path="/signup"
            element={
              <Guest>
                <Signup />
              </Guest>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <Guest>
                <ForgotPassword />
              </Guest>
            }
          />
          <Route
            path="/verify-email"
            element={
              <Guest>
                <VerifyEmail />
              </Guest>
            }
          />
          <Route
            path="/reset-password"
            element={
              <AuthLayout>
                <ResetPassword />
              </AuthLayout>
            }
          />
          <Route path="/auth/callback" element={<Callback />} />
          <Route
            path="/dashboard"
            element={
              <Private>
                <Dashboard />
              </Private>
            }
          />
          <Route path="/explore" element={<Dashboard demo />} />
          <Route path="/campus" element={<Navigate to="/explore" replace />} />
          <Route
            path="/profile"
            element={
              <Private>
                <Profile />
              </Private>
            }
          />
          <Route path="/privacy" element={<Legal />} />
          <Route path="/terms" element={<Legal />} />
          <Route
            path="*"
            element={
              <AuthLayout>
                <div className="auth-content">
                  <span className="form-eyebrow">A SMALL DETOUR</span>
                  <h2>Let’s get you back.</h2>
                  <p className="form-description">
                    We couldn’t find that page. Your next journey is still
                    waiting.
                  </p>
                  <Link className="button primary full" to="/">
                    Back to Parkly
                  </Link>
                </div>
              </AuthLayout>
            }
          />
        </Routes>
      </Suspense>
      </LocationAccessProvider>
    </AuthProvider>
  );
}
