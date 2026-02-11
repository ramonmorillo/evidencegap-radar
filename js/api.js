// js/api.js

// 👉 TU WORKER REAL
const WORKER_BASE = "https://red-surf-9fd1.ramon-morillo-verdugo.workers.dev";

function apiBase() {
  const host = window.location.hostname;
  const isGitHubPages = host.endsWith("github.io");

  // En GitHub Pages → llama al Worker
  // Si algún día sirves todo desde el mismo dominio → usará rutas relativas
  return isGitHubPages ? WORKER_BASE : "";
}

export async function getJson(path) {
  const base = apiBase();
  const url = (base ? base.replace(/\/$/, "") : "") + path;

  try {
    const resp = await fetch(url, {
      method: "GET",
      credentials: "omit",
      headers: { "Accept": "application/json" }
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("API ERROR →", url, resp.status, text);
      throw new Error(`HTTP ${resp.status}`);
    }

    return await resp.json();
  } catch (e) {
    console.error("API ERROR →", url, e);
    throw e;
  }
}
