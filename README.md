# abugida-test-app

Browser harness for exercising the live Abugida API. Vite + vanilla JS, no
framework — small enough that the code is the docs.

## Run

```sh
cd abugida-test-app
yarn install   # or npm install
cp .env.example .env
# fill in VITE_GOOGLE_CLIENT_ID (see below)
yarn dev       # http://localhost:3001
```

`vite.config.js` pins port 3001 because the API's CORS already accepts
loopback and the prod `TRUSTED_ORIGINS` lists that origin.

```sh
yarn build && yarn preview   # production build sanity-check
```

## What it tests

| Section | API call | Why it's there |
|---|---|---|
| 1 — Email + password | `POST /sign-in/email`, `/sign-up/email` | Baseline auth path; bearer in body. |
| 2 — **Google sign-in (ID token)** | `POST /sign-in/social` with `{ provider, idToken: { token } }` | Recommended flow. Same shape Flutter uses, no redirect. |
| 3 — Google sign-in (redirect) | `POST /sign-in/social` with `{ provider, callbackURL }` | Browser fallback. Handoff bridge delivers bearer via `#token=…`. |
| 4 — Session | `GET /get-session`, `POST /sign-out` | Inspect what the backend thinks the session is. |
| 5 — Plans / Stripe | `GET /subscription-plans`, `POST /me/subscription/checkout` | Verifies live Stripe enrichment + checkout redirect. |
| 6 — Network log | (all of the above) | Inline DevTools-style view of every request/response with headers. |

## Code layout

```
src/
├── main.js               # bootstrap, UI markup, wire-up
├── style.css             # styles (light / dark via prefers-color-scheme)
└── lib/
    ├── api.js            # fetch wrapper, attaches bearer, logs requests
    ├── google.js         # Google Identity Services bootstrap + decode helper
    ├── network-log.js    # the request log UI
    └── token.js          # bearer persistence + change-listener
```

## Configuration

| Variable | Required | What it's for |
|---|---|---|
| `VITE_API_BASE` | yes | Base URL of the API. Defaults to `https://api.abugida.et`. Point at `http://localhost:3000` to hit a local backend. |
| `VITE_GOOGLE_CLIENT_ID` | for section 2 | The **Web** OAuth client ID (same value as `GOOGLE_CLIENT_ID` on the backend). GIS issues an ID token whose `aud` matches this; the backend verifies against the same value. |
| `VITE_GOOGLE_CALLBACK_URL` | for section 3 | Where Better-Auth lands after the redirect flow. Origin must be loopback or in the backend's `TRUSTED_ORIGINS`. |

## ID-token vs redirect — which to use

Use **ID token (section 2)** for any new client. It's:
- Fewer moving parts (no consent URL hop, no `/handoff` bridge, no URL-fragment bearer extraction).
- The same architecture mobile (Flutter, native iOS/Android) uses.
- Friendlier to third-party-cookie blocking on Safari / Brave / Firefox ETP.

Use redirect (section 3) only when the client can't run the Google JS SDK
or pure-mobile-native equivalent.

## Backend prerequisites

The backend at [abugida.backend](../abugida.backend) needs:

1. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set to the same Web OAuth
   client whose ID you put in `VITE_GOOGLE_CLIENT_ID` here.
2. `TRUSTED_ORIGINS` must include `http://localhost:3001` for production
   origins (loopback already matches by wildcard, so this is automatic in
   dev — only relevant if you change the port).

No deep-link / custom-scheme entries needed — the ID-token flow doesn't use
them.

## Behaviour notes

- Bearer token is stored in `localStorage` under `abugida.token`. All API
  calls auto-attach it via `Authorization: Bearer …`.
- Every successful sign-in (email, ID token, or redirect-handoff) updates
  the stored bearer. Section 4's "Sign out" / "Clear token" resets it.
- The network log is in-memory only — refresh clears it.
