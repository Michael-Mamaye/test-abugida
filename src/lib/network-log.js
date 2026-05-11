// Tiny network-log UI used by api.js — renders an expandable details element
// per request into a single container, prepending so newest is on top.

const escape = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const statusClass = (s) =>
  s >= 500 ? "err" : s >= 400 ? "warn" : s >= 300 ? "info" : s >= 200 ? "ok" : "muted";

const fmtBody = (body, pretty) => {
  if (body == null) return "";
  if (typeof body === "string") {
    if (pretty) {
      try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
    }
    return body;
  }
  return JSON.stringify(body, null, pretty ? 2 : undefined);
};

export const createNetworkLog = ({ container, counter, prettyToggle, clearButton }) => {
  let count = 0;
  const updateCount = () => { counter.textContent = String(count); };

  const render = (entry) => {
    const pretty = prettyToggle?.checked ?? true;
    const headersText = Object.entries(entry.respHeaders)
      .filter(([k]) => /^(set-cookie|set-auth-token|location|content-type|access-control-)/i.test(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const wrapper = document.createElement("details");
    wrapper.className = "net-entry";
    wrapper.innerHTML = `
      <summary>
        <span class="net-method">${escape(entry.method)}</span>
        <span class="net-path">${escape(entry.path)}</span>
        <span class="pill ${statusClass(entry.status)}">${entry.status ?? "ERR"}</span>
        <span class="net-time">${entry.dur}ms · ${entry.time}</span>
      </summary>
      <div class="net-detail">
        <div class="net-block">
          <div class="net-label">Request</div>
          <pre>${escape(entry.method)} ${escape(entry.url)}${
            entry.reqBody ? "\n\n" + escape(fmtBody(entry.reqBody, pretty)) : ""
          }</pre>
        </div>
        <div class="net-block">
          <div class="net-label">Response · ${entry.status ?? "no response"}</div>
          ${headersText ? `<pre class="net-headers">${escape(headersText)}</pre>` : ""}
          <pre>${escape(fmtBody(entry.respBody, pretty))}</pre>
        </div>
      </div>
    `;
    container.prepend(wrapper);
    count++;
    updateCount();
  };

  clearButton?.addEventListener("click", () => {
    container.innerHTML = "";
    count = 0;
    updateCount();
  });

  return { push: render };
};
