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
VITE_API_BASE=http://localhost:3000 npm run dev
```

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
