export const API_BASE = "https://red-surf-9fd1.ramon-morillo-verdugo.workers.dev";

export async function getJson(path) {
  const resp = await fetch(`${API_BASE}${path}`);

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text}`);
  }

  return resp.json();
}
