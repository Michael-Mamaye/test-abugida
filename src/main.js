import "./style.css";
import { getToken, setToken, onTokenChange } from "./lib/token.js";
import { createNetworkLog } from "./lib/network-log.js";
import { createApi } from "./lib/api.js";
import * as google from "./lib/google.js";

// ── Config ──────────────────────────────────────────────────────────────
const apiBase = import.meta.env.VITE_API_BASE ?? "https://api.abugida.et";
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const origin = window.location.origin;
const defaultGoogleCallback =
  import.meta.env.VITE_GOOGLE_CALLBACK_URL ?? `${origin}/?google=success`;
const stripeSuccessUrl = `${origin}/?stripe=success`;
const stripeCancelUrl = `${origin}/?stripe=cancel`;

const GOOGLE_CB_KEY = "abugida.googleCallback";

// ── Markup ──────────────────────────────────────────────────────────────
document.querySelector("#app").innerHTML = `
  <header>
    <h1>Abugida — Auth + Payment Test</h1>
    <div class="sub">
      API: <code id="apiBase"></code> · Origin: <code id="origin"></code> ·
      Status: <span id="health" class="pill">checking</span>
    </div>
  </header>

  <main>
    <section>
      <h2>1 · Email + password</h2>
      <div class="grid2">
        <div><label>Name</label><input id="name" placeholder="Selam" /></div>
        <div><label>Email</label><input id="email" type="email" placeholder="you@example.com" /></div>
      </div>
      <label>Password (min 8 chars)</label>
      <input id="password" type="password" placeholder="••••••••" />
      <div class="row">
        <button class="primary" id="btn-signup">Sign up</button>
        <button id="btn-signin">Sign in</button>
      </div>
      <div class="hint">Bearer token from the response body is stored in <code>localStorage</code>.</div>
    </section>

    <section>
      <h2>2 · Google sign-in (ID token, recommended)</h2>
      <div class="hint" style="margin-bottom: 10px">
        Native web flow — Google Identity Services issues an ID token in-page,
        we <code>POST /sign-in/social</code> with <code>{ provider, idToken: { token } }</code>.
        No redirect, no <code>callbackURL</code>, no handoff bridge. The bearer
        comes back via <code>set-auth-token</code>.
      </div>
      <div id="google-id-button" style="margin: 8px 0"></div>
      <div id="google-id-status" class="hint"></div>
      <details style="margin-top: 10px">
        <summary class="hint" style="cursor: pointer">show decoded ID token (last sign-in)</summary>
        <pre id="google-id-decoded" style="margin-top: 6px">—</pre>
      </details>
    </section>

    <section class="full">
      <h2>3 · Google sign-in (redirect, fallback)</h2>
      <label>callbackURL (origin must be in API's TRUSTED_ORIGINS or be loopback)</label>
      <input id="google-cb" placeholder="${defaultGoogleCallback}" />
      <div class="row">
        <button id="btn-google">Sign in with Google (redirect)</button>
      </div>
      <div class="hint">
        Browser-fallback flow. The API auto-wraps cross-site callbacks through
        <code>/auth/handoff</code>, so the bearer lands in the URL fragment as
        <code>#token=...&amp;userId=...</code>.
      </div>
    </section>

    <section class="full">
      <h2>4 · Session</h2>
      <div class="row">
        <button id="btn-session">Get session</button>
        <button id="btn-signout" class="danger">Sign out</button>
        <span class="pill" id="auth-pill">no token</span>
        <button id="btn-cleartoken">Clear token</button>
      </div>
      <label>Bearer token</label>
      <textarea id="token" rows="2" placeholder="set after sign-in"></textarea>
      <label>Latest API response</label>
      <pre id="out">—</pre>
    </section>

    <section class="full">
      <h2>5 · Subscription / Stripe checkout</h2>
      <div class="row">
        <button id="btn-plans">List plans</button>
        <select id="plan" style="min-width: 240px"></select>
        <button class="primary" id="btn-checkout">Create checkout session</button>
        <button id="btn-mysub">My subscription</button>
      </div>
      <div class="hint">
        <code>successUrl</code> = <code id="successUrl"></code> ·
        <code>cancelUrl</code> = <code id="cancelUrl"></code>.
      </div>
      <pre id="plansOut">—</pre>
    </section>

    <section class="full">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <h2 style="margin:0">6 · Network log <span class="pill" id="net-count">0</span></h2>
        <div class="row" style="margin:0">
          <label style="margin:0;font-size:12px;display:flex;align-items:center;gap:4px">
            <input type="checkbox" id="net-pretty" checked /> pretty
          </label>
          <button id="net-clear">Clear</button>
        </div>
      </div>
      <div id="net-log" class="net-log"></div>
    </section>
  </main>
`;

const byId = (id) => document.getElementById(id);
const out = byId("out");
const plansOut = byId("plansOut");
const tokenEl = byId("token");
const authPill = byId("auth-pill");

byId("apiBase").textContent = apiBase;
byId("origin").textContent = origin;
byId("successUrl").textContent = stripeSuccessUrl;
byId("cancelUrl").textContent = stripeCancelUrl;

// ── Token UI sync ───────────────────────────────────────────────────────
const refreshTokenUI = (value = getToken()) => {
  tokenEl.value = value;
  authPill.textContent = value ? `token: ${value.slice(0, 8)}…` : "no token";
  authPill.className = `pill ${value ? "ok" : ""}`;
};
onTokenChange(refreshTokenUI);
refreshTokenUI();
tokenEl.addEventListener("change", () => setToken(tokenEl.value.trim()));
byId("btn-cleartoken").onclick = () => { setToken(""); out.textContent = "cleared token"; };

// ── Persisted Google redirect callback ─────────────────────────────────
const googleCbEl = byId("google-cb");
googleCbEl.value = localStorage.getItem(GOOGLE_CB_KEY) || defaultGoogleCallback;
googleCbEl.addEventListener("change", () =>
  localStorage.setItem(GOOGLE_CB_KEY, googleCbEl.value.trim()),
);

// ── Network log + API helper ────────────────────────────────────────────
const log = createNetworkLog({
  container: byId("net-log"),
  counter: byId("net-count"),
  prettyToggle: byId("net-pretty"),
  clearButton: byId("net-clear"),
});
const api = createApi({ apiBase, log });

const show = (target, label, value) => {
  const formatted = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  target.textContent = `${label} ${formatted}`;
};

// ── 0 · health probe ────────────────────────────────────────────────────
api("/api/v1/health")
  .then((r) => {
    const el = byId("health");
    el.textContent = r.status === 200 ? "ok" : `fail (${r.status})`;
    el.className = `pill ${r.status === 200 ? "ok" : "err"}`;
  })
  .catch((err) => {
    const el = byId("health");
    el.textContent = "unreachable";
    el.className = "pill err";
    out.textContent = `Health check failed: ${err.message}`;
  });

// ── 1 · email + password ────────────────────────────────────────────────
byId("btn-signup").onclick = async () => {
  const r = await api("/api/v1/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      name: byId("name").value,
      email: byId("email").value,
      password: byId("password").value,
    }),
  });
  if (r.body?.token) setToken(r.body.token);
  show(out, "POST /sign-up/email →", r);
};

byId("btn-signin").onclick = async () => {
  const r = await api("/api/v1/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({
      email: byId("email").value,
      password: byId("password").value,
    }),
  });
  if (r.body?.token) setToken(r.body.token);
  show(out, "POST /sign-in/email →", r);
};

// ── 2 · Google ID-token flow ────────────────────────────────────────────
const idStatus = byId("google-id-status");
const idDecoded = byId("google-id-decoded");

const onCredential = async ({ credential }) => {
  idStatus.textContent = "ID token received — verifying with backend…";
  idDecoded.textContent = JSON.stringify(google.decodeIdToken(credential), null, 2) ?? "—";
  const r = await api("/api/v1/auth/sign-in/social", {
    method: "POST",
    body: JSON.stringify({
      provider: "google",
      idToken: { token: credential },
    }),
  });
  if (r.body?.token) setToken(r.body.token);
  const bearer = getToken();
  if (r.status === 200 && bearer) {
    idStatus.innerHTML = `<span class="pill ok">signed in</span> bearer token captured (${bearer.slice(0, 8)}…)`;
  } else {
    idStatus.innerHTML = `<span class="pill err">sign-in failed (${r.status})</span> — see network log + below`;
  }
  show(out, "POST /sign-in/social (id-token) →", r);
};

if (!googleClientId) {
  idStatus.innerHTML =
    `<span class="pill err">VITE_GOOGLE_CLIENT_ID is not set</span> — copy your Web OAuth client ID into .env`;
} else {
  google
    .init(googleClientId, onCredential)
    .then((gis) => google.renderButton(gis, byId("google-id-button")))
    .then(() => { idStatus.textContent = "Ready — click the Google button to sign in."; })
    .catch((err) => {
      idStatus.innerHTML = `<span class="pill err">GIS init failed</span> — ${err.message}`;
    });
}

// ── 3 · Google redirect flow (fallback) ─────────────────────────────────
byId("btn-google").onclick = async () => {
  const callbackURL = googleCbEl.value.trim() || defaultGoogleCallback;
  localStorage.setItem(GOOGLE_CB_KEY, callbackURL);
  const r = await api("/api/v1/auth/sign-in/social", {
    method: "POST",
    body: JSON.stringify({ provider: "google", callbackURL }),
  });
  if (r.body?.url) {
    window.location.href = r.body.url;
    return;
  }
  show(out, "POST /sign-in/social (redirect) →", r);
};

// ── 4 · session ─────────────────────────────────────────────────────────
byId("btn-session").onclick = async () => {
  show(out, "GET /get-session →", await api("/api/v1/auth/get-session"));
};

byId("btn-signout").onclick = async () => {
  const r = await api("/api/v1/auth/sign-out", { method: "POST", body: "{}" });
  setToken("");
  show(out, "POST /sign-out →", r);
};

// ── 5 · subscription / Stripe ───────────────────────────────────────────
byId("btn-plans").onclick = async () => {
  const r = await api("/api/v1/subscription-plans");
  const plans = Array.isArray(r.body) ? r.body : (r.body?.data ?? []);
  const select = byId("plan");
  select.innerHTML = "";
  for (const plan of plans) {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = `${plan.name} — ${(plan.priceCents / 100).toFixed(2)} ${plan.currency}${
      plan.billingInterval ? `/${plan.billingInterval}` : ""
    }`;
    select.appendChild(option);
  }
  show(plansOut, "GET /subscription-plans →", r);
};

byId("btn-mysub").onclick = async () => {
  show(plansOut, "GET /me/subscription →", await api("/api/v1/me/subscription"));
};

byId("btn-checkout").onclick = async () => {
  const planId = byId("plan").value;
  if (!planId) return show(plansOut, "select a plan first", "");
  const r = await api("/api/v1/me/subscription/checkout", {
    method: "POST",
    body: JSON.stringify({ planId, successUrl: stripeSuccessUrl, cancelUrl: stripeCancelUrl }),
  });
  show(plansOut, "POST /me/subscription/checkout →", r);
  if (r.body?.checkoutUrl && window.confirm(`Redirect to Stripe?\n\n${r.body.checkoutUrl}`)) {
    window.location.href = r.body.checkoutUrl;
  }
};

// ── Return-from-redirect handler (handoff bridge → URL fragment) ────────
const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
const handoffToken = hash.get("token");
const handoffError = hash.get("error");
if (handoffToken) {
  setToken(handoffToken);
  history.replaceState(null, "", window.location.pathname + window.location.search);
  out.textContent = `Returned from Google sign-in. Bearer captured (${handoffToken.slice(0, 8)}…). Verifying via /get-session…`;
  api("/api/v1/auth/get-session").then((r) => show(out, "GET /get-session →", r));
} else if (handoffError) {
  out.textContent = `Sign-in handoff error: ${handoffError}`;
  history.replaceState(null, "", window.location.pathname + window.location.search);
} else {
  const query = new URLSearchParams(window.location.search);
  if (query.get("google") === "success") {
    out.textContent = "Returned from Google (no token in fragment — handoff may be unwired). Trying /get-session…";
    api("/api/v1/auth/get-session").then((r) => show(out, "GET /get-session (auto) →", r));
  } else if (query.get("stripe")) {
    out.textContent = `Returned from Stripe: ${query.get("stripe")}${
      query.get("session_id") ? ` (session_id=${query.get("session_id")})` : ""
    }`;
  } else if (query.get("error")) {
    out.textContent = `Auth error: ${query.get("error")}${
      query.get("error_description") ? ` — ${query.get("error_description")}` : ""
    }`;
  }
}
