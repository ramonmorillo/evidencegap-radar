// ===============================
// EvidenceGap Radar – API helper
// ===============================

// 👉 PEGA AQUÍ TU URL REAL DEL WORKER
// (Cloudflare → Worker → "Visit")
const WORKER_BASE = "https://TU-WORKER.workers.dev"; 

export async function getJson(path) {
  const url = path.startsWith("http")
    ? path
    : `${WORKER_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status} ${resp.statusText}\n${text}`);
    }

    return await resp.json();

  } catch (err) {
    console.error("API ERROR →", url, err);
    throw err;
  }
}
