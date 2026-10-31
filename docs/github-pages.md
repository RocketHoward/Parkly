# GitHub Pages deployment

Repository: https://github.com/RocketHoward/Parkly

Planned website: https://rockethoward.github.io/Parkly/

Direct parking map: https://rockethoward.github.io/Parkly/explore/

## Publishing

In repository Settings → Pages, choose **GitHub Actions** as the build source. The included `Deploy Parkly to GitHub Pages` workflow builds, tests, and publishes pushes to `main`. It can also be started manually from Actions.

The workflow includes the existing Supabase project URL and **public publishable key** used in the browser. These are public client configuration. Override them using repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` if the project changes. Never use a service-role key or server secret here.

For a local Pages build:

```sh
npm ci
npm run build:pages
```

`build:pages` defaults to `/Parkly/`, creates entrypoints for all known routes, and adds a `404.html` fallback for unknown paths. Query strings and authentication fragments are preserved. `npm run build` still defaults to `/` for root-domain hosting. Set `PARKLY_BASE_PATH` to change the base.

## Supabase redirects

Add both URLs in Supabase → Authentication → URL Configuration → Redirect URLs:

- `https://rockethoward.github.io/Parkly/auth/callback`
- `https://rockethoward.github.io/Parkly/reset-password`

Keep existing redirect URLs while the original deployment is in use. If Pages becomes the primary website, set Site URL to `https://rockethoward.github.io/Parkly/`. This repository does not change the external Supabase configuration automatically.

Supabase may redirect to the Site URL when a requested URL is not allowlisted. Complete this setup before testing confirmation emails, password recovery, or OAuth. Current browser sessions do not transfer between the old and new origins; sign in again on the new site. Start new email/OAuth flows from the same browser where they will be completed.

## Verification

Open `/Parkly/explore/`, select a connected lot, and verify the occupancy levels, permit link, and Go route preview. Refresh the direct URL to verify static routing. Check `/Parkly/login/` and `/Parkly/privacy/` for illustration, styles, and the correct content. Location permission is requested separately for the new origin.

The occupancy feed remains simulated. Navigation uses public OSRM and OpenStreetMap services; see the main README for its limitations.
