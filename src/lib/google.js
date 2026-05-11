// Google Identity Services (GIS) wrapper — the canonical web equivalent of
// the mobile native sign-in flow we use on Flutter. The Google JS library is
// loaded via a <script> tag in index.html and exposes itself as
// `window.google.accounts.id` once ready.
//
// Flow:
//   1. waitForGis() resolves once the GIS script is ready.
//   2. init(clientId, onCredential) wires the callback that receives a JWT
//      ID token (the `credential` field). Audience of the token equals
//      `clientId` — same value the backend already accepts.
//   3. renderButton(container) draws Google's official "Sign in with Google"
//      button into the given DOM node. Click → consent → callback fires.
//
// No access token is issued by the Sign-In-with-Google button flow — only
// an ID token. Better-Auth's /sign-in/social accepts `{ idToken: { token } }`
// and treats the access token as optional, which matches.

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

export const waitForGis = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
    const start = performance.now();
    const tick = () => {
      if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
      if (performance.now() - start > 8000) {
        return reject(new Error(`GIS not loaded — check the <script src="${SCRIPT_SRC}"> tag and that the page can reach accounts.google.com`));
      }
      setTimeout(tick, 50);
    };
    tick();
  });

export const init = async (clientId, onCredential) => {
  if (!clientId) throw new Error("VITE_GOOGLE_CLIENT_ID is not set — see .env.example");
  const gis = await waitForGis();
  gis.initialize({
    client_id: clientId,
    callback: ({ credential, select_by }) => onCredential({ credential, select_by }),
    auto_select: false,
    use_fedcm_for_prompt: true,
    cancel_on_tap_outside: true,
  });
  return gis;
};

export const renderButton = async (gis, container, options = {}) => {
  gis.renderButton(container, {
    theme: "outline",
    size: "large",
    type: "standard",
    text: "signin_with",
    shape: "rectangular",
    logo_alignment: "left",
    width: 280,
    ...options,
  });
};

// Decode the JWT payload without verifying — purely for the test UI so we
// can show the user what they just got back. Trust nothing in here for
// security purposes; that's the backend's job.
export const decodeIdToken = (jwt) => {
  if (!jwt || typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice(0, (4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};
