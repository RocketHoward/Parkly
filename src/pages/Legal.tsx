import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "../components/Logo";
export default function Legal() {
  const privacy = useLocation().pathname.replace(/\/+$/, "") === "/privacy";
  return (
    <div className="settings-page">
      <header className="simple-header">
        <Logo />
        <Link className="back-link" to="/login">
          <ArrowLeft size={16} />
          Back to Parkly
        </Link>
      </header>
      <main className="legal-content">
        <span className="form-eyebrow">CLEAR FROM THE START</span>
        <h1>{privacy ? "Your privacy matters." : "A few things to know."}</h1>
        <p className="form-description">
          Parkly development preview · October 2026
        </p>
        {privacy ? (
          <>
            <h2>Account information</h2>
            <p>
              When authentication is configured, Supabase processes your email,
              profile name, authentication tokens, and sign-in credentials.
              Google sign-in is handled by Google and Supabase; Parkly never
              asks for your Google password.
            </p>
            <h2>Location and destination searches</h2>
            <p>
              Your location is requested only after you choose to share it.
              Coordinates center the map and help find nearby parking. When you
              request driving directions, your starting coordinates and destination
              are sent to the OSRM routing service. Active navigation uses GPS
              updates until you end it. Destination searches are sent
              to the configured geocoding provider (Photon by default).
              OpenStreetMap serves the map tiles. These services receive
              connection information, such as your IP address.
            </p>
            <h2>Browser storage</h2>
            <p>
              Supabase stores session tokens in browser storage to keep you
              signed in. Parkly does not store passwords. A temporary
              recovery-flow flag may be stored for password reset continuity.
              A local flag remembers whether you answered the first-visit location
              prompt. Location and route information stay in memory and are not
              saved to your Parkly account or browser storage.
              Destination search results may be cached in memory. No advertising
              analytics have been added.
            </p>
            <h2>Before public launch</h2>
            <p>
              This is a development preview. The operator must publish their
              contact information, retention practices, and a complete privacy
              policy before collecting production account data. Do not submit
              sensitive personal information to this preview.
            </p>
          </>
        ) : (
          <>
            <h2>A development preview</h2>
            <p>
              Parkly is being built to make discovering parking simpler. This
              preview demonstrates the interface and map features.
              Authentication requires a configured Supabase project.
            </p>
            <h2>Parking information</h2>
            <p>
              Demonstration locations are examples, not verified parking
              recommendations. Prices, restrictions, operating hours, and
              availability shown as unknown must be checked independently.
              Always follow posted signs and local regulations.
            </p>
            <h2>Navigation and distances</h2>
            <p>
              Parking-list distances are approximate straight-line estimates.
              Driving directions use OpenStreetMap roads through OSRM and do not
              include live traffic. Routes end on a nearby mapped road; parking
              entrances and internal lanes are not verified. Route preview uses
              simulated movement, while live guidance requires location permission
              and a usable GPS signal. External navigation links open Google Maps. Do not
              interact with Parkly while driving.
            </p>
            <h2>Future service terms</h2>
            <p>
              The operator must provide final service terms and support contact
              details before public launch. This notice describes the
              limitations of the current development preview.
            </p>
          </>
        )}
        <Link className="button secondary" to="/login">
          Back to log in
          <ArrowLeft size={16} />
        </Link>
      </main>
    </div>
  );
}
