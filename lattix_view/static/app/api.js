// The workbench API from a plugin page: the token travels as a header, the prefix is this plugin's.
export const PREFIX = "/plugins/lattix_view";

const params = new URLSearchParams(location.search);
export const token = params.get("token") || "";
export const session = params.get("session") || "";
export const embedded = params.get("embedded") === "1";

export async function getJSON(path) {
  const r = await fetch(path, { headers: { "X-Lattix-Token": token } });
  const ct = r.headers.get("Content-Type") || "";
  const body = ct.startsWith("application/json") ? await r.json() : await r.text();
  if (!r.ok) {
    const e = new Error((body && body.error && body.error.message) || `HTTP ${r.status}`);
    e.status = r.status; e.body = body;
    throw e;
  }
  return body;
}

export function withToken(path) {
  return path + (path.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);
}
