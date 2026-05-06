# abugida-test-app

Tiny Vite browser harness for hitting the live abugida API at `https://api.abugida.et`.

## Run

```sh
cd abugida-test-app
npm install
npm run dev
```

The app runs on `http://localhost:3001` (configured in `vite.config.js`).

## Build

```sh
npm run build
npm run preview
```

## Configure API base

```sh
cp .env.example .env
# then edit .env values if needed
npm run dev
```

Environment variables:

- `VITE_API_BASE` - API base URL (example: `http://localhost:3000`)
- `VITE_GOOGLE_CALLBACK_URL` - default Google OAuth callback URL

## Exercises

- email + password sign-up / sign-in (Better-Auth)
- Google OAuth (Better-Auth `/sign-in/social`)
- session inspection (`/get-session`, `/sign-out`)
- subscription plan listing + Stripe checkout

## One-time API config

The API enforces Better-Auth `trustedOrigins`. For Google sign-in to return
to the test app, add the test app origin to the API env:

```sh
# in /opt/abugida.backend/.env on the deployment server
TRUSTED_ORIGINS=http://localhost:3001
```

Then restart the API container.
