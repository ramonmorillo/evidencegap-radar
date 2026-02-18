// js/export.js — Exportar resultados a CSV y RIS

/**
 * Genera CSV a partir de un array de publicaciones PubMed (esummary).
 */
export function exportCSV(pubs, filename) {
  if (!pubs?.length) return;

  const header = "PMID,Title,Authors,Journal,Year,PubDate,PublicationType";
  const rows = pubs.map(p => {
    const pmid = p.uid || "";
    const title = csvEsc(p.title || "");
    const authors = csvEsc((p.authors || []).map(a => a.name).join("; "));
    const journal = csvEsc(p.fulljournalname || p.source || "");
    const year = (p.pubdate || "").split(" ")[0] || "";
    const pubdate = csvEsc(p.pubdate || "");
    const types = csvEsc((p.pubtype || []).join("; "));
    return `${pmid},${title},${authors},${journal},${year},${pubdate},${types}`;
  });

  const csv = [header, ...rows].join("\n");
  download(csv, filename || "evidencegap_results.csv", "text/csv;charset=utf-8;");
}

/**
 * Genera RIS mínimo a partir de un array de publicaciones PubMed.
 */
export function exportRIS(pubs, filename) {
  if (!pubs?.length) return;

  const entries = pubs.map(p => {
    const lines = [];
    lines.push("TY  - JOUR");
    if (p.uid) lines.push(`AN  - ${p.uid}`);
    if (p.title) lines.push(`TI  - ${p.title}`);
    if (p.fulljournalname || p.source) lines.push(`JO  - ${p.fulljournalname || p.source}`);
    const year = (p.pubdate || "").split(" ")[0];
    if (year) lines.push(`PY  - ${year}`);
    if (p.pubdate) lines.push(`DA  - ${p.pubdate}`);
    for (const a of (p.authors || [])) {
      if (a.name) lines.push(`AU  - ${a.name}`);
    }
    for (const t of (p.pubtype || [])) {
      lines.push(`KW  - ${t}`);
    }
    if (p.uid) lines.push(`UR  - https://pubmed.ncbi.nlm.nih.gov/${p.uid}/`);
    lines.push("ER  - ");
    return lines.join("\n");
  });

  const ris = entries.join("\n\n");
  download(ris, filename || "evidencegap_results.ris", "application/x-research-info-systems;charset=utf-8;");
}

function csvEsc(s) {
  const str = String(s ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function download(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
