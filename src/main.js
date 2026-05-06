import "./style.css";

const apiBase = import.meta.env.VITE_API_BASE ?? "https://api.abugida.et";
const origin = window.location.origin;
const defaultGoogleCallback =
  import.meta.env.VITE_GOOGLE_CALLBACK_URL ?? `${origin}/?google=success`;

const successUrl = `${origin}/?stripe=success`;
const cancelUrl = `${origin}/?stripe=cancel`;

document.querySelector("#app").innerHTML = `
  <header>
    <h1>Abugida - Auth + Payment Test</h1>
    <div class="sub">
      API: <code id="apiBase">...</code> · Origin: <code id="origin">...</code>
      · Status: <span id="health" class="pill">checking</span>
    </div>
  </header>

  <main>
    <section>
      <h2>1 - Email + password</h2>
      <div class="grid2">
        <div>
          <label>Name</label>
          <input id="name" placeholder="Selam" />
        </div>
        <div>
          <label>Email</label>
          <input id="email" type="email" placeholder="you@example.com" />
        </div>
      </div>
      <label>Password (min 8 chars)</label>
      <input id="password" type="password" placeholder="........" />
      <div class="row">
        <button class="primary" id="btn-signup">Sign up</button>
        <button id="btn-signin">Sign in</button>
      </div>
      <div class="hint">Stores the bearer token returned by Better-Auth in <code>localStorage</code>.</div>
    </section>

    <section>
      <h2>2 - Google sign-in (OAuth)</h2>
      <label>callbackURL (where Better-Auth lands you after success — defaults to this page)</label>
      <input id="google-cb" placeholder="http://localhost:3001/?google=success" />
      <div class="row">
        <button class="primary" id="btn-google">Sign in with Google</button>
      </div>
      <div class="hint">
        On click: <code>POST /sign-in/social</code> with the <code>callbackURL</code> above, then
        <code>window.location</code> to the returned Google consent URL.
      </div>
    </section>

    <section class="full">
      <h2>3 - Session</h2>
      <div class="row">
        <button id="btn-session">Get session</button>
        <button id="btn-signout" class="danger">Sign out</button>
        <span class="pill" id="auth-pill">no token</span>
        <button id="btn-cleartoken">Clear token</button>
      </div>
      <label>Bearer token (auto-stored after sign-in / read from <code>set-auth-token</code>)</label>
      <textarea id="token" rows="2" placeholder="set after sign-in"></textarea>
      <label>Latest API response</label>
      <pre id="out">-</pre>
    </section>

    <section class="full">
      <h2>4 - Subscription / Stripe checkout</h2>
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
      <pre id="plansOut">-</pre>
    </section>

    <section class="full">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <h2 style="margin:0">5 - Network log <span class="pill" id="net-count">0</span></h2>
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
byId("successUrl").textContent = successUrl;
byId("cancelUrl").textContent = cancelUrl;

// Persist the callbackURL so the field survives reloads (and OAuth round-trips).
// Default: bounce back to this very page so the test app can inspect the result.
// Any origin in the API's trustedOrigins works (any localhost port, plus the
// explicit prod entries — but NOT https://admin.abugida.et, which uses a
// separate custom auth and has nothing to do with Better-Auth).
const GOOGLE_CB_KEY = "abugida.googleCallback";
const googleCbEl = byId("google-cb");
googleCbEl.value = localStorage.getItem(GOOGLE_CB_KEY) || defaultGoogleCallback;
googleCbEl.addEventListener("change", () =>
  localStorage.setItem(GOOGLE_CB_KEY, googleCbEl.value.trim()),
);
// One-time reset for users whose localStorage still has the old admin URL.
if (googleCbEl.value.includes("admin.abugida.et")) {
  googleCbEl.value = defaultGoogleCallback;
  localStorage.setItem(GOOGLE_CB_KEY, googleCbEl.value);
}

const TOKEN_KEY = "abugida.token";

function getToken() {
  const value = localStorage.getItem(TOKEN_KEY) || "";
  tokenEl.value = value;
  authPill.textContent = value ? `token: ${value.slice(0, 8)}...` : "no token";
  authPill.className = `pill ${value ? "ok" : ""}`;
  return value;
}

function setToken(value) {
  if (value) {
    localStorage.setItem(TOKEN_KEY, value);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
  getToken();
}

tokenEl.addEventListener("change", () => setToken(tokenEl.value.trim()));

// ---- Network log ----------------------------------------------------------
const netLog = byId("net-log");
const netCount = byId("net-count");
let netSeq = 0;

const escape = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

const fmtBody = (body) => {
  if (body == null) return "";
  if (typeof body === "string") {
    if (byId("net-pretty")?.checked) {
      try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
    }
    return body;
  }
  return JSON.stringify(body, byId("net-pretty")?.checked ? null : null, 2);
};

const statusClass = (s) =>
  s >= 500 ? "err" : s >= 400 ? "warn" : s >= 300 ? "info" : s >= 200 ? "ok" : "muted";

const renderEntry = (entry) => {
  const headersText = Object.entries(entry.respHeaders)
    .filter(([k]) => /^(set-cookie|set-auth-token|location|content-type|access-control-)/i.test(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `
    <details class="net-entry" ${entry.open ? "open" : ""}>
      <summary>
        <span class="net-method">${entry.method}</span>
        <span class="net-path">${escape(entry.path)}</span>
        <span class="pill ${statusClass(entry.status)}">${entry.status ?? "ERR"}</span>
        <span class="net-time">${entry.dur}ms · ${entry.time}</span>
      </summary>
      <div class="net-detail">
        <div class="net-block">
          <div class="net-label">Request</div>
          <pre>${escape(entry.method)} ${escape(entry.url)}${entry.reqBody ? "\n\n" + escape(fmtBody(entry.reqBody)) : ""}</pre>
        </div>
        <div class="net-block">
          <div class="net-label">Response · ${entry.status ?? "no response"}</div>
          ${headersText ? `<pre class="net-headers">${escape(headersText)}</pre>` : ""}
          <pre>${escape(fmtBody(entry.respBody))}</pre>
        </div>
      </div>
    </details>
  `;
};

const pushEntry = (entry) => {
  const el = document.createElement("div");
  el.innerHTML = renderEntry(entry);
  netLog.prepend(el.firstElementChild);
  netCount.textContent = ++netSeq;
};

byId("net-clear").onclick = () => {
  netLog.innerHTML = "";
  netSeq = 0;
  netCount.textContent = 0;
};

// ---- API helper -----------------------------------------------------------
async function api(path, init = {}) {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const url = `${apiBase}${path}`;
  const method = (init.method || "GET").toUpperCase();
  const t0 = performance.now();
  const time = new Date().toLocaleTimeString();
  let response, body, respHeaders = {}, status = null;

  try {
    response = await fetch(url, { ...init, headers, credentials: "include" });
    status = response.status;
    respHeaders = Object.fromEntries(response.headers.entries());
    const setAuthToken = response.headers.get("set-auth-token");
    if (setAuthToken) setToken(setAuthToken);

    const contentType = response.headers.get("content-type") || "";
    body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text();
  } catch (err) {
    body = { error: String(err?.message || err) };
  }

  const dur = Math.round(performance.now() - t0);
  pushEntry({
    method,
    path,
    url,
    reqBody: init.body,
    status,
    respHeaders,
    respBody: body,
    dur,
    time,
    open: false,
  });

  return { status, body, headers: respHeaders };
}

function show(target, label, value) {
  const formatted = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  target.textContent = `${label} ${formatted}`;
}

api("/api/v1/health")
  .then((result) => {
    const health = byId("health");
    health.textContent = result.status === 200 ? "ok" : `fail (${result.status})`;
    health.className = `pill ${result.status === 200 ? "ok" : "err"}`;
  })
  .catch((error) => {
    const health = byId("health");
    health.textContent = "unreachable";
    health.className = "pill err";
    out.textContent = `Health check failed: ${error.message}`;
  });

byId("btn-signup").onclick = async () => {
  const result = await api("/api/v1/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      name: byId("name").value,
      email: byId("email").value,
      password: byId("password").value,
    }),
  });
  if (result.body?.token) {
    setToken(result.body.token);
  }
  show(out, "POST /sign-up/email ->", result);
};

byId("btn-signin").onclick = async () => {
  const result = await api("/api/v1/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({
      email: byId("email").value,
      password: byId("password").value,
    }),
  });
  if (result.body?.token) {
    setToken(result.body.token);
  }
  show(out, "POST /sign-in/email ->", result);
};

byId("btn-google").onclick = async () => {
  const callbackURL = googleCbEl.value.trim() || defaultGoogleCallback;
  localStorage.setItem(GOOGLE_CB_KEY, callbackURL);
  const result = await api("/api/v1/auth/sign-in/social", {
    method: "POST",
    body: JSON.stringify({ provider: "google", callbackURL }),
  });
  if (result.body?.url) {
    window.location.href = result.body.url;
    return;
  }
  show(out, "POST /sign-in/social ->", result);
};

byId("btn-session").onclick = async () => {
  const result = await api("/api/v1/auth/get-session");
  show(out, "GET /get-session ->", result);
};

byId("btn-signout").onclick = async () => {
  const result = await api("/api/v1/auth/sign-out", {
    method: "POST",
    body: "{}",
  });
  setToken("");
  show(out, "POST /sign-out ->", result);
};

byId("btn-cleartoken").onclick = () => {
  setToken("");
  show(out, "cleared token", "");
};

byId("btn-plans").onclick = async () => {
  const result = await api("/api/v1/subscription-plans");
  const plans = Array.isArray(result.body) ? result.body : (result.body?.data ?? []);
  const select = byId("plan");
  select.innerHTML = "";

  for (const plan of plans) {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = `${plan.name} - ${(plan.priceCents / 100).toFixed(2)} ${plan.currency}${
      plan.billingInterval ? `/${plan.billingInterval}` : ""
    }`;
    select.appendChild(option);
  }

  show(plansOut, "GET /subscription-plans ->", result);
};

byId("btn-mysub").onclick = async () => {
  const result = await api("/api/v1/me/subscription");
  show(plansOut, "GET /me/subscription ->", result);
};

byId("btn-checkout").onclick = async () => {
  const planId = byId("plan").value;
  if (!planId) {
    show(plansOut, "select a plan first", "");
    return;
  }

  const result = await api("/api/v1/me/subscription/checkout", {
    method: "POST",
    body: JSON.stringify({
      planId,
      successUrl,
      cancelUrl,
    }),
  });

  show(plansOut, "POST /me/subscription/checkout ->", result);

  if (result.body?.checkoutUrl) {
    const go = window.confirm(`Redirect to Stripe?\n\n${result.body.checkoutUrl}`);
    if (go) {
      window.location.href = result.body.checkoutUrl;
    }
  }
};

const query = new URLSearchParams(window.location.search);
if (query.get("google") === "success") {
  out.textContent = "Returned from Google sign-in. Trying to read the current session...";
  api("/api/v1/auth/get-session").then((result) => show(out, "GET /get-session (auto) ->", result));
} else if (query.get("stripe")) {
  out.textContent = `Returned from Stripe: ${query.get("stripe")}${
    query.get("session_id") ? ` (session_id=${query.get("session_id")})` : ""
  }`;
} else if (query.get("error")) {
  out.textContent = `Auth error: ${query.get("error")}${
    query.get("error_description") ? ` - ${query.get("error_description")}` : ""
  }`;
}

getToken();
