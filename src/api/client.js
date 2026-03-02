// src/api/client.js
const BASE = import.meta.env.VITE_API_URL || "/api";
const token = () => localStorage.getItem("sd_token");

async function req(method, path, body) {
  const headers = { Authorization: `Bearer ${token()}` };
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const r = await fetch(`${BASE}${path}`, {
    method, headers,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  if (r.status === 401) { localStorage.clear(); location.href = "/login"; return; }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

export const authApi = {
  login: (email, password) => req("POST", "/auth/login", { email, password }),
  me: () => req("GET", "/auth/me"),
};

export const inboxApi = {
  list: (status = "ready") => req("GET", `/inbox?status=${status}`),
  stats: () => req("GET", "/inbox/stats"),
  update: (id, data) => req("PUT", `/inbox/${id}`, data),
  skip: (id) => req("POST", `/inbox/${id}/skip`),
  reprocess: () => req("POST", "/inbox/reprocess"),
  streamUrl: () => `${BASE}/inbox/stream`,
};

export const bodegasApi = {
  list: () => req("GET", "/bodegas"),
  create: (d) => req("POST", "/bodegas", d),
  update: (id, d) => req("PUT", `/bodegas/${id}`, d),
  delete: (id) => req("DELETE", `/bodegas/${id}`),
  syncGroups: () => req("POST", "/bodegas/sync"),
};

export const comunidadesApi = {
  list: () => req("GET", "/comunidades"),
  create: (d) => req("POST", "/comunidades", d),
  delete: (id) => req("DELETE", `/comunidades/${id}`),
};

export const whatsappApi = {
  status: () => req("GET", "/whatsapp/status"),
  qr: () => req("GET", "/whatsapp/qr"),
  connect: () => req("POST", "/whatsapp/connect"),
  disconnect: () => req("POST", "/whatsapp/disconnect"),
};

export function startDifusion({ inbox_ids, comunidad_ids, onStart, onSent, onFailed, onComplete, onError }) {
  const controller = new AbortController();
  fetch(`${BASE}/difundir/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify({ inbox_ids, comunidad_ids }),
    signal: controller.signal,
  }).then(async (r) => {
    if (!r.ok) { const d = await r.json().catch(()=>{}); onError?.(d?.error || "Error"); return; }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      let ev = null;
      for (const line of lines) {
        if (line.startsWith("event: ")) ev = line.slice(7).trim();
        else if (line.startsWith("data: ")) {
          try {
            const d = JSON.parse(line.slice(6));
            if (ev === "start") onStart?.(d);
            else if (ev === "sent") onSent?.(d);
            else if (ev === "failed") onFailed?.(d);
            else if (ev === "complete") onComplete?.(d);
            else if (ev === "error") onError?.(d.message);
          } catch {}
          ev = null;
        }
      }
    }
  }).catch(e => { if (e.name !== "AbortError") onError?.(e.message); });
  return () => controller.abort();
}
