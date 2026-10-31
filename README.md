# Parkly

GitHub Pages setup and hosting details: [deployment guide](docs/github-pages.md).

**Find your spot. Enjoy your journey.**

A responsive React and TypeScript parking application with a matcha-green design system, Supabase authentication, and a Leaflet map foundation. Authentication uses real Supabase provider calls. Missing configuration produces a setup message; it never creates a pretend signed-in session.

## Run locally

Use Node.js 22.12+ (or a current compatible LTS release) and npm.

```sh
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase project URL and PUBLIC key.
npm run dev
```

Open the local URL printed by Vite. Its default is `http://127.0.0.1:5173`. Use the same hostname consistently: `localhost` and `127.0.0.1` are different origins with separate browser storage. After changing environment variables, restart Vite. Production environment changes require a new build.

```sh
npm test
npm run build
npm run preview
```

The build output is `dist/`. Unit tests exercise shared input-validation boundaries and conservative parking recommendation rules. Passing those checks does not verify an external Supabase project, email delivery, Google OAuth, or deployed routing; complete the manual checks below with your configured services.

## Supabase setup

1. Create a Supabase project. Under Project Settings → API, copy its project URL and public publishable key into `.env.local`. Legacy **anon** JWT keys are also supported through `VITE_SUPABASE_ANON_KEY`; remove `VITE_SUPABASE_PUBLISHABLE_KEY` when using that alternative.
2. Enable the Email provider and email/password signup. **Keep Confirm email enabled** so new email accounts cannot sign in until ownership is verified. Configure your password requirements in Supabase; the app requires at least eight characters and displays provider policy failures. Supabase remains responsible for password validation, hashing, and authentication.
3. Under Authentication → URL Configuration, set the Site URL to your deployed HTTPS application origin. Add these exact development redirect URLs, plus the corresponding URLs on your production origin:

   ```text
   http://127.0.0.1:5173/auth/callback
   http://127.0.0.1:5173/reset-password
   https://your-parkly-domain.example/auth/callback
   https://your-parkly-domain.example/reset-password
   ```

   If you use localhost, another port, or `npm run preview`, add that actual origin's callback and reset URLs too. Allow only origins you control. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).
4. In Email Templates, keep the provider-generated confirmation URL in both **Confirm signup** and **Reset password** templates, for example `<a href="{{ .ConfirmationURL }}">Continue to Parkly</a>`. This app uses link-based verification, not six-digit OTP entry. Do not replace the link with a bare application URL or a custom token-hash route that the app does not implement. See [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
5. Configure custom SMTP before sending real user emails. Supabase's built-in mail service has restrictive recipient/rate limits and is for initial testing. Configure your sending domain and delivery credentials inside Supabase, then test inbox and spam delivery. See [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).
6. Optionally run `supabase/schema.sql` in the project's SQL Editor to create the future profile-data table. It enables RLS and permits authenticated users to select, insert, or update only their own row. The current profile screen uses `auth.updateUser({ data: { full_name } })`; it does not require or automatically synchronize this optional table. See [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Google sign-in setup

1. Create a Google Cloud project and configure its OAuth audience/consent screen, app branding, and allowed test users while the app is in testing.
2. Create a **Web application** OAuth client. Add your app origins as authorized JavaScript origins where required. Add the **Supabase provider callback** shown in Supabase's Google provider settings as an authorized redirect URI. For a standard hosted project it resembles `https://PROJECT_REF.supabase.co/auth/v1/callback`.
3. Enable Google under Supabase Authentication → Sign In / Providers. Put the Google client ID and secret there. Do not put the Google secret in Vite variables or source files.
4. Keep the Parkly `/auth/callback` URLs on Supabase's redirect allowlist. Google's callback goes to Supabase; Supabase then returns the user to Parkly. These are two different configuration steps.
5. Test Continue with Google from a normal browser tab, using an allowed account. The button calls `signInWithOAuth` and redirects to Google's official interface. A disabled or misconfigured provider is reported as an error.

See [Supabase's Google sign-in guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).

## Authentication behavior

| Route | Purpose |
| --- | --- |
| `/` | Session-based entry redirect |
| `/login` | Email/password or Google sign-in |
| `/signup` | Registration and confirmation handoff |
| `/verify-email` | Instructions and resend confirmation link |
| `/auth/callback` | OAuth/email verification result |
| `/forgot-password` | Generic recovery-email confirmation |
| `/reset-password` | Recovery session and new password |
| `/dashboard` | Protected parking map, initially centered on PCC with parking lots with simulated tracking |
| `/explore` | Parking map without Parkly sign-in; includes parking lots with simulated tracking at PCC |
| `/campus` | Compatibility redirect to `/explore`; there is no separate campus page |
| `/profile` | Protected account details and display-name editing |

The Supabase client uses PKCE, automatic URL/session detection, persistent sessions, and token refresh. The SDK exchanges callback codes automatically; do not also exchange a code in the callback page. AuthContext checks `getUser` with Supabase before exposing a loaded session to protected UI. It responds to sign-in, sign-out, token-refresh, and recovery events. See [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow) and [getUser verification](https://supabase.com/docs/reference/javascript/auth-getuser).

Complete verification and recovery links in the browser where the flow began. PKCE relies on its browser-held code verifier; opening the link in another browser, device, or an in-app mail browser can fail. Start a new flow in the intended browser if this happens. Links and codes are provider-generated, expire, and cannot be reused indefinitely.

Password recovery redirects to `/reset-password`. A `PASSWORD_RECOVERY` event records a user-bound, one-hour UI marker in sessionStorage so a reload can stay on the reset screen. The marker contains no password or token and does not authorize anything. Updating the password still requires a valid Supabase session, a fresh `getUser` check, and the provider's password policy. The marker clears after a successful password update or sign-out. If browser storage is blocked, recovery may need to be restarted after reloading. Normal authenticated-page redirects must respect `isRecovery` until the flow finishes.

Sign-out uses Supabase's local scope, ending the current browser's session. It does not promise to sign out every other device. Supabase stores its session tokens through its browser SDK; the application never stores or logs passwords. Display-name metadata is user-editable and must never be used for authorization roles.

## Map and recommendation foundation

The dashboard uses React Leaflet and OpenStreetMap tiles. Treat any labeled demonstration parking records as examples, not evidence of live availability or permission to park. Unknown prices, restrictions, and availability must stay unknown. Verify signs and applicable parking rules on site.

The sidebar opens directly to **Parking nearby**, with the initial map area loaded automatically. There is no hero headline or PCC button required to reveal parking. The initial inventory includes the seven tracked PCC lots and nearby OpenStreetMap parking seed records. Other parking locations use black markers with a white **P**; their availability is unknown because they have no occupancy feed.

Pan or zoom to choose a different area, then press **Refresh this area** to load its parking locations and update the sidebar. Moving the map alone does not query a new area. Selecting a destination from search moves the map and loads that destination's area automatically. Area discovery is implemented in `src/services/mapParking.ts`; it is separate from the five-second occupancy updates for tracked lots.

Destination search uses a Photon-compatible geocoding endpoint. Set the optional `VITE_GEOCODING_URL` to a full `/api/` endpoint to use your own or managed service. The default public service is intended for modest development use; production should use an appropriately provisioned endpoint.

Map tile delivery and destination search require network access and their own usage policies. Geolocation requires browser permission and HTTPS in production. A denied location request must leave manual destination search usable. Before scaling traffic, choose appropriate production tile/geocoding services; public infrastructure is not a guaranteed production SLA.

The first version's recommendations are rule-based. No AI API key is required. A future model integration belongs behind a server-side endpoint, with verified source data and explicit uncertainty about legality or availability.

## Tracked parking on the map

The existing `/explore` and signed-in `/dashboard` map views initially show Pasadena City College. Colored occupancy markers replace the map's Student/Staff parking icons for seven sites: Student Parking Lot No. 3, No. 5, No. 10, and No. 11, plus Staff Parking Lot No. 1, No. 4, and No. 7. Names and marker positions follow the OpenStreetMap parking features. Select a lot marker to see its floors in the left panel. Every floor row has the level number on the left and the parked-car count on the right; select a floor to inspect its 24 spaces. Each lot has three illustrative levels, giving 72 spaces per lot and 504 across the example inventory.

The colored badges sit slightly above their map coordinates to center them within the visible lot shapes: a 20-pixel offset normally and a 12-pixel offset in the compact overview. This is a display adjustment; lot coordinates, occupancy counts, and interactions are unchanged.

Lot markers and floor rows use the same occupancy scale: green below 50%, yellow from 50% to below 75%, orange from 75% to below 95%, and red from 95% upward. Red means almost full or full; only 100% occupied is labeled **Full**. The UI also displays counts and text so color is not the only way to understand capacity.

This models parking lots connected to a school's API, but the current provider runs entirely in the browser. It supplies simulated observations every five seconds. Data that has not been refreshed for 15 seconds becomes **Unknown**, and unknown spaces do not count as free. A lot or level with any unknown spaces has an unknown occupancy band rather than a color implying known capacity. Each tab has its own simulation; there is no shared occupancy backend, school API connection, or camera feed.

Lot names and map positions come from OpenStreetMap; floors, capacities, space types, and availability remain illustrative. The PCC setting does not imply an official map or affiliation with the college. The real campus address used to orient the map is listed on [PCC's directions page](https://pasadena.edu/about/directions.php). No campus API key or AI model is needed to use the example.

There is no standalone campus demo page or navigation entry. Old `/campus` links redirect to `/explore`. The Sites preview's hosting access gate applies independently of whether a route requires a Parkly account.

See [the occupancy API integration design](docs/campus-api.md) for a proposed future nested lot, floor, and space contract. That document describes integration work that is not deployed by this version.

## Deploy to Vercel or Netlify

1. Push the application to a Git repository. If deploying a parent repository, set the project/base directory to `parkly-app`.
2. Use build command `npm run build` and output/publish directory `dist`. Use a compatible Node version.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or the legacy anon alternative) in the host's build environment, then deploy.
4. Configure an SPA fallback so direct requests to `/dashboard`, `/auth/callback`, and `/reset-password` serve `index.html`. On Netlify use a `_redirects` rule `/* /index.html 200`; on Vercel use a rewrite from `/(.*)` to `/index.html`. Keep real static assets available. The repository's hosting configuration should be included in deployment.
5. Set Supabase's production Site URL and exact redirect allowlist to the deployed HTTPS origin. If preview deployments need auth, configure only the controlled preview origins you intend to support.
6. Run the manual authentication checks on the deployed domain; local success does not confirm deployment configuration.

All `VITE_*` values are visible to users in the JavaScript bundle. Only public keys belong there. Never expose a Supabase service-role key, secret key, Google client secret, SMTP password, or AI provider secret. The frontend rejects recognizable secret/admin auth keys, but that check cannot remove a secret already baked into a public build; rotate accidentally exposed credentials immediately.

## Manual integration QA checklist

These are required checks for a configured project, **not a claim that external integrations have already passed**.

- With missing env values, login and Google sign-in show configuration guidance and cannot create a session.
- Register with a new address. Confirm an email arrives, unverified login is blocked, resend works with its cooldown, and the confirmation link opens Parkly in the same browser.
- Sign in with valid credentials; try an incorrect password, malformed email, missing fields, and provider-enforced weak passwords. Check visible errors and loading/disabled controls.
- Complete Google consent, then repeat with an existing Google account. Cancel consent and test a disabled/misconfigured provider. Confirm callback failures are readable.
- Reload `/dashboard` and directly open `/profile`. A valid session remains usable; an absent or expired session is redirected to login after verification finishes.
- Request recovery for an existing and a nonexistent address. Both successful request responses must remain generic. Complete a valid reset, reload the reset screen mid-flow, try mismatched/weak passwords, and verify the new password works after sign-out.
- Try an expired/reused reset link, a link opened in a different browser, and `/reset-password` without a recovery session. None should silently claim a password was changed.
- Update the display name, reload, and verify the persisted profile. Sign out, use the browser back button, and directly revisit protected routes.
- If using `profiles`, test two separate accounts: neither can read or mutate the other's row. Anonymous clients cannot access profile rows.
- Test keyboard-only forms, password toggles, error announcements, focus indicators, reduced motion, and mobile layouts without horizontal overflow.
- Confirm parking appears on first load without a PCC button. Pan/zoom and verify the queried area stays unchanged until **Refresh this area** is pressed; then compare the new sidebar and map locations. Select a search destination and confirm its area loads automatically. Verify other parking markers remain black with white text and unknown availability. Test parking-type filters, details, navigation links, denied and allowed geolocation, network failures, and visible demonstration/unknown-data labels.
- Open `/explore` and the signed-in `/dashboard`; confirm the PCC map setting and simulated-source label. Select each lot marker, compare its occupancy with the floor counts, and select a floor to inspect its spaces. Confirm lot and floor colors use the same thresholds and **Full** is reserved for 100% occupied. Exercise feed failures in the provider tests and verify data older than 15 seconds becomes Unknown. Check the map and detail panel on mobile and with keyboard navigation; confirm `/campus` redirects to `/explore`.

## Security and production boundaries

Client route guards improve navigation but cannot enforce database authorization. Use RLS for every exposed table and verify authorization again in future backend endpoints. Treat metadata and browser storage as user-controlled. Avoid injecting unsanitized HTML, audit dependencies, use HTTPS, and choose a CSP compatible with your fonts and map services. Rate limiting, SMTP, password policy, bot protections, session settings, and Google consent configuration are provider/deployment responsibilities.

This phase does not implement payments, live parking occupancy, verified municipal restrictions, a reservation backend, or model-based recommendations. Add verified data sources and server-side controls before presenting those capabilities as available.

## Current delivery

This repository is configured for GitHub Pages at `https://rockethoward.github.io/Parkly/`. See [the deployment guide](docs/github-pages.md) for publishing and Supabase redirect settings. The included workflow supplies public browser configuration at build time. End-to-end email delivery, confirmation, recovery, and Google sign-in require verification with the configured Supabase project; Google sign-in remains disabled until its provider is configured.

The map cannot zoom out beyond its initial overview for the current screen size. Parking-marker selection updates the details without scrolling the mobile page or automatically panning the map.

## Navigation and first-visit location

The first visit shows a location invitation on all routes. **Share location** requests browser permission; **Not now** keeps manual exploration available. Only a `parkly.location-introduction.v1` flag is saved locally; coordinates remain in memory. A granted location centers the parking map, including after moving from sign-in to Explore. Browsers control the native permission prompt and may require settings changes after denial.

Each connected lot's summary has a **Go** button. It opens driving-route setup with **Use my location** and an explicit **Try route preview** option. Routing uses the public OSRM HTTPS endpoint with OpenStreetMap roads. Preview begins from a fixed point near PCC and simulates movement along the returned road route; it never substitutes for GPS silently. **Start** begins guidance with the next maneuver, distance in meters/miles, remaining route distance and estimated time. The position arrow stays upright while the map rotates with the travel bearing. Heading comes from moving GPS or route geometry, not a phone compass when stationary.

Live navigation handles missing/denied GPS, stale fixes, network failure, and rerouting after repeated off-route observations. Ending navigation clears watches, timers and outstanding requests. The route endpoint is a nearby mapped road, not a verified driveway or interior parking space. ETA excludes live traffic. This is a browser navigation prototype; public routing/tiles and background mobile GPS are not guaranteed for production. Choose an appropriately licensed routing service before scaling. Route calculations send the requested origin and destination to OSRM. Google Maps remains available as an external alternative.
