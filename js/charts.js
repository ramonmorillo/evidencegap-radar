// js/charts.js — Gráficos CSS/SVG puros (sin dependencias)

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Bar chart vertical (CSS) para serie temporal de publicaciones.
 * data = [{ label: "2021", value: 42 }, ...]
 */
export function barChartTimeSeries(data, title) {
  if (!data?.length) return `<p class="muted">Sin datos para serie temporal.</p>`;
  const max = Math.max(...data.map(d => d.value), 1);
  const bars = data.map(d => {
    const h = Math.max(2, Math.round((d.value / max) * 120));
    return `<div class="bar-col">
      <span class="bar-val">${d.value}</span>
      <div class="bar" style="height:${h}px"></div>
      <span class="bar-lbl">${esc(d.label)}</span>
    </div>`;
  }).join("");
  return `<div class="chart-card">
    <h4>${esc(title)}</h4>
    <div class="bar-chart">${bars}</div>
  </div>`;
}

/**
 * Horizontal bar chart para distribución (pub types, trial status, etc.)
 * data = { "Journal Article": 15, "Review": 3, ... }
 */
export function hbarChart(data, title) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!entries.length) return `<div class="chart-card"><h4>${esc(title)}</h4><p class="muted">Sin datos.</p></div>`;
  const max = Math.max(...entries.map(e => e[1]), 1);
  const rows = entries.map(([label, val]) => {
    const w = Math.max(3, Math.round((val / max) * 100));
    return `<div class="hbar-row">
      <span class="hbar-label">${esc(label)}</span>
      <div class="hbar-track"><div class="hbar-fill" style="width:${w}%"></div></div>
      <span class="hbar-val">${val}</span>
    </div>`;
  }).join("");
  return `<div class="chart-card"><h4>${esc(title)}</h4>${rows}</div>`;
}

/**
 * Cuadrante scatter: reciente (x) vs trials activos (y).
 * Single point for the current search.
 */
export function quadrantChart(pubRecent, trialsActive) {
  // Normalize to 0-100 range with caps
  const xCap = 100, yCap = 20;
  const xPct = Math.min(100, Math.round((pubRecent / xCap) * 100));
  const yPct = Math.min(100, Math.round((trialsActive / yCap) * 100));
  // SVG coordinates: x goes right, y goes UP (so invert)
  const cx = 20 + (xPct / 100) * 160;
  const cy = 170 - (yPct / 100) * 140;

  return `<div class="chart-card">
    <h4>Cuadrante: publicaciones recientes vs ensayos activos</h4>
    <svg viewBox="0 0 200 200" class="quadrant-svg" xmlns="http://www.w3.org/2000/svg">
      <!-- Background quadrants -->
      <rect x="20" y="30" width="80" height="70" fill="rgba(255,92,108,0.08)" />
      <rect x="100" y="30" width="80" height="70" fill="rgba(178,123,255,0.08)" />
      <rect x="20" y="100" width="80" height="70" fill="rgba(255,176,32,0.08)" />
      <rect x="100" y="100" width="80" height="70" fill="rgba(53,208,127,0.08)" />
      <!-- Labels -->
      <text x="60" y="25" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="7">Pocos pubs</text>
      <text x="140" y="25" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="7">Muchos pubs</text>
      <text x="10" y="65" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="6" transform="rotate(-90,10,65)">+trials</text>
      <text x="10" y="135" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="6" transform="rotate(-90,10,135)">-trials</text>
      <!-- Axes -->
      <line x1="20" y1="170" x2="180" y2="170" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
      <line x1="20" y1="30" x2="20" y2="170" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
      <!-- Point -->
      <circle cx="${cx}" cy="${cy}" r="6" fill="var(--accent)" opacity="0.9"/>
      <circle cx="${cx}" cy="${cy}" r="3" fill="white" opacity="0.8"/>
      <!-- Axis labels -->
      <text x="100" y="190" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="7">Publicaciones recientes (cap ${xCap})</text>
      <text x="195" y="100" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="7" transform="rotate(90,195,100)">Ensayos activos (cap ${yCap})</text>
    </svg>
    <small class="muted">Punto: pub recientes=${pubRecent}, ensayos activos=${trialsActive}</small>
  </div>`;
}

/**
 * Mini donut: fuentes consultadas con timestamp
 */
export function sourcePie(sources, timestamp) {
  // sources = [{ name, count, color }]
  const total = sources.reduce((s, x) => s + x.count, 0) || 1;
  let offset = 0;
  const segments = sources.map(src => {
    const pct = (src.count / total) * 100;
    const seg = `<circle r="25" cx="40" cy="40" fill="none" stroke="${src.color}"
      stroke-width="12" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${-offset}"
      pathLength="100"/>`;
    offset += pct;
    return seg;
  }).join("");

  const legend = sources.map(src =>
    `<span class="pie-legend-item"><span class="pie-dot" style="background:${src.color}"></span>${esc(src.name)}: ${src.count}</span>`
  ).join("");

  return `<div class="chart-card">
    <h4>Fuentes consultadas</h4>
    <div class="pie-container">
      <svg viewBox="0 0 80 80" class="donut-svg">${segments}</svg>
      <div class="pie-legend">${legend}</div>
    </div>
    <small class="muted">Consulta: ${esc(timestamp)}</small>
  </div>`;
}
