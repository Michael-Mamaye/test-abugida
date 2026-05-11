// Thin fetch wrapper that:
//   • prefixes apiBase
//   • attaches the stored bearer token (if any)
//   • captures the `set-auth-token` response header from Better-Auth's bearer
//     plugin and stashes it as the new active token
//   • pushes every call into the network-log UI

import { getToken, setToken } from "./token.js";

export const createApi = ({ apiBase, log }) => {
  return async (path, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
    const token = getToken();
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

      const newToken = response.headers.get("set-auth-token");
      if (newToken) setToken(newToken);

      const contentType = response.headers.get("content-type") || "";
      body = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.text();
    } catch (err) {
      body = { error: String(err?.message || err) };
    }

    const dur = Math.round(performance.now() - t0);
    log.push({ method, path, url, reqBody: init.body, status, respHeaders, respBody: body, dur, time });

    return { status, body, headers: respHeaders };
  };
};
