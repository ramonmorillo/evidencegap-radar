#!/usr/bin/env python3
"""
CIPM Finder — extracción de registros desde los PDF oficiales de la CIPM.

Lee los PDF guardados en fuentes/ y regenera data/cipm.json.

  * "Acuerdos CIPM <n>"            → fuente principal. Un registro por EXPEDIENTE
                                     (cada "i) Nombre®" del documento).
  * "Nota informativa CIPM <mes>"  → fuente complementaria, PROVISIONAL.
                                     Un registro por medicamento citado.

Criterios:
  * Texto literal: bloque, apartado, indicación y acuerdo se copian del PDF
    (solo se unen líneas y se eliminan cabeceras/pies de página).
  * No se extrae el precio.
  * Validación: los expedientes extraídos deben coincidir con el índice del
    propio PDF (nombre y página). Si no coinciden, el script termina con error
    y no escribe el JSON.

Requisitos: Python 3.9+ y `pdftotext` (poppler-utils).

Uso:
  python3 scripts/cipm_extract.py            # extrae y escribe data/cipm.json
  python3 scripts/cipm_extract.py --check    # solo valida, no escribe
"""

import json
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FUENTES = ROOT / "fuentes"
MANIFEST = FUENTES / "fuentes.json"
OUT = ROOT / "data" / "cipm.json"

SCHEMA_VERSION = 2
MAX_TEXT = 4000  # caracteres por campo de texto largo; si se supera se marca como truncado

MESES = {m: i + 1 for i, m in enumerate(
    "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split())}

# Cabeceras/pies de página que se repiten en todas las páginas
HEADER_RE = re.compile(
    r"^(SECRETAR[IÍ]A DE ESTADO( DE)?( SANIDAD)?|MINISTERIO( DE SANIDAD)?|DE SANIDAD|SANIDAD|"
    r"COMISI[OÓ]N INTERMINISTERIAL DE|PRECIOS DE LOS MEDICAMENTOS|-?\d{1,3}-?)$")


class ExtractionError(Exception):
    pass


# ----------------------------------------------------------------- utilidades

def pdf_pages(path):
    """Texto por página (modo layout para conservar columnas de las tablas)."""
    res = subprocess.run(["pdftotext", "-layout", str(path), "-"],
                         capture_output=True, text=True, check=True)
    pages = res.stdout.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    return pages


def clean_lines(pages):
    """[(página, línea)] sin cabeceras ni números de página."""
    out = []
    for pno, page in enumerate(pages, 1):
        for line in page.split("\n"):
            # Una línea de cabecera puede juntar varios rótulos en columnas
            chunks = [c for c in re.split(r"\s{2,}", line.strip()) if c]
            if chunks and all(HEADER_RE.match(re.sub(r"\s+", " ", c)) for c in chunks):
                continue
            out.append((pno, line.rstrip()))
    return out


def paragraphs(lines):
    """Une líneas en párrafos (separados por líneas en blanco o viñetas)."""
    paras, cur = [], []
    for line in lines:
        s = line.strip()
        if not s or s.startswith("•") or re.match(r"^o\s", s):
            if cur:
                paras.append(" ".join(cur))
            cur = [] if not s else [s]
            continue
        cur.append(s)
    if cur:
        paras.append(" ".join(cur))
    paras = [re.sub(r"\s+", " ", p).strip() for p in paras if p.strip()]
    # Reunir párrafos partidos por un salto de página (continúa en minúscula)
    merged = []
    for p in paras:
        if merged and not re.search(r"[.:;]$", merged[-1]) and re.match(r"^[a-záéíóúñ(]", p):
            merged[-1] += " " + p
        else:
            merged.append(p)
    return merged


def cap(text):
    if text and len(text) > MAX_TEXT:
        return text[:MAX_TEXT].rstrip() + " […]", True
    return text, False


def slug(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def fecha_es(d, mes, y):
    m = MESES.get(mes.lower())
    if not m:
        raise ExtractionError(f"Mes no reconocido: {mes}")
    return f"{int(y):04d}-{m:02d}-{int(d):02d}"


def load_manifest():
    if MANIFEST.exists():
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
        return {e["archivo"]: e for e in data.get("documentos", [])}
    return {}


# ------------------------------------------------------------ Acuerdos CIPM

ROMAN = r"[ivxl]+"
TOC_RE = re.compile(rf"^({ROMAN})\)\s+(.+?)\s*\.{{3,}}\s*(\d+)$")
EXP_RE = re.compile(rf"^({ROMAN})\)\s+(.+?)\s*\.{{5,}}\s*\d*$")
BLOQUE_RE = re.compile(r"^([12])\)\s+(Acuerdos.*?)\s*(\.{3,}\s*\d+)?$")
APARTADO_RE = re.compile(r"^([a-d])\)\s+([A-ZÁÉÍÓÚ][^.]*?)\s*(\.{3,}\s*\d+)?$")


def parse_toc(lines):
    """Índice: lista de (bloque, apartado, nombre, página)."""
    toc, bloque, apartado, started = [], None, None, False
    for _, line in lines:
        s = line.strip()
        if s == "Contenido":
            started = True
            continue
        if not started:
            continue
        if not re.search(r"\.{3,}\s*\d+$", s):
            if toc:
                break
            continue
        if m := BLOQUE_RE.match(s):
            bloque = m[2].strip()
        elif m := APARTADO_RE.match(s):
            apartado = m[2].strip()
        elif m := TOC_RE.match(s):
            toc.append((bloque, apartado, clean_name(m[2]), int(m[3])))
    return toc


def clean_name(s):
    return re.sub(r"\s+", " ", s.replace("®", "")).strip()


def table_column(header, word):
    i = header.find(word)
    return i if i >= 0 else None


def parse_table(tlines):
    """Laboratorio y CN de la tabla del expediente (sin precio)."""
    header_idx = next((i for i, l in enumerate(tlines) if "LABORATORIO" in l and "MEDICAMENTO" in l), None)
    cns, lab_parts = [], []
    if header_idx is None:
        return None, cns
    header = tlines[header_idx]
    med_col = table_column(header, "MEDICAMENTO")
    for line in tlines[header_idx + 1:]:
        # Código nacional: 6 dígitos aislados (los precios llevan coma decimal)
        cns += re.findall(r"(?<![\d,.])(\d{6})(?![\d,])", line)
        m = re.match(r"^(\s*)(\S.*?)(?=\s{2,}|$)", line)
        if m and med_col is not None:
            start, chunk = len(m[1]), m[2]
            if start < med_col - 5 and start + len(chunk) < med_col + 2 and not re.fullmatch(r"[\d.,\s]+", chunk):
                lab_parts.append(chunk.strip())
    lab = re.sub(r"\s+", " ", " ".join(lab_parts)).strip() or None
    return lab, list(dict.fromkeys(cns))


SECTION_RE = {
    "indicacion": re.compile(r"^Indicaci(ón|ones) terap[ée]utica(s)? autorizada(s)?( y financiada(s)?)?\s*(:|$)", re.I),
    "indicacionFinanciada": re.compile(r"^Indicaci(ón|ones) terap[ée]utica(s)? financiada(s)?\s*(:|$)", re.I),
    "indicacionObjeto": re.compile(r"^Indicaci(ón|ones) terap[ée]utica(s)? objeto\b[^:]*(:|$)", re.I),
    "condiciones": re.compile(r"^Condiciones de prescripci[oó]n", re.I),
    "acuerdo": re.compile(r"^Con respecto a (este|estos|esta|estas)\b", re.I),
}


def split_sections(body):
    """Divide el texto (tras la tabla) en secciones por sus rótulos literales."""
    sections, cur = {"_pre": []}, "_pre"
    for line in body:
        s = line.strip()
        for key, rx in SECTION_RE.items():
            if rx.match(s) and (key != "acuerdo" or "acuerdo" not in sections):
                cur = key
                sections.setdefault(cur, [])
                if key.startswith("indicacion"):
                    s = s.split(":", 1)[1].strip() if ":" in s else ""
                break
        sections[cur].append(s if s != line.strip() else line)
    return sections


def first_decision(acuerdo_paras):
    """Primera frase del acuerdo; si termina en 'acuerda:', se añade la primera viñeta."""
    if not acuerdo_paras:
        return None
    first = acuerdo_paras[0]
    if first.rstrip().endswith(":") and len(acuerdo_paras) > 1:
        bullet = acuerdo_paras[1].lstrip("• ").strip()
        return f"{first} {bullet}"
    m = re.match(r"(.+?\.)(\s|$)", first)
    return m[1] if m else first


def parse_acuerdos(path, pages, manifest_entry):
    full = "\n".join(pages)
    m = re.search(r"Sesi[oó]n\s+(\d+)\s+de\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})", full)
    if not m:
        raise ExtractionError(f"{path.name}: no se encuentra 'Sesión N de D de MES de AAAA'")
    cipm, fecha = m[1], fecha_es(m[2], m[3], m[4])
    lines = clean_lines(pages)
    toc = parse_toc(lines)
    if not toc:
        raise ExtractionError(f"{path.name}: no se encuentra el índice ('Contenido')")

    # Cuerpo: a partir de la 2.ª aparición del primer bloque (la 1.ª es el índice)
    starts = [i for i, (_, l) in enumerate(lines) if BLOQUE_RE.match(l.strip()) and l.strip().startswith("1)")]
    if len(starts) < 2:
        raise ExtractionError(f"{path.name}: no se localiza el inicio del cuerpo")
    bloque = apartado = None
    exps, cur = [], None
    for pno, line in lines[starts[1]:]:
        s = line.strip()
        if (mb := BLOQUE_RE.match(s)) and not EXP_RE.match(s):
            bloque, apartado, cur = mb[2].strip(), None, None
            continue
        if (ma := APARTADO_RE.match(s)) and len(s) < 60:
            apartado, cur = ma[2].strip(), None
            continue
        if me := EXP_RE.match(s):
            cur = {"roman": me[1], "nombre": clean_name(me[2]), "pagina": pno,
                   "bloque": bloque, "apartado": apartado, "lines": []}
            exps.append(cur)
            continue
        if cur is not None:
            cur["lines"].append(line)

    # Validación contra el índice
    got = [(e["bloque"], e["apartado"], e["nombre"], e["pagina"]) for e in exps]
    if got != toc:
        diff = [f"  índice: {t}\n  extraído: {g}" for t, g in zip(toc, got) if t != g]
        raise ExtractionError(
            f"{path.name}: los expedientes no coinciden con el índice "
            f"({len(got)} extraídos / {len(toc)} en índice)\n" + "\n".join(diff[:10]))

    url = (manifest_entry or {}).get("url")
    records, warnings = [], []
    bloque_n = {}
    for e in exps:
        text = e["lines"]
        pa_idx = next((i for i, l in enumerate(text) if l.strip().startswith("Principio activo:")), None)
        if pa_idx is None:
            warnings.append(f"{e['nombre']}: sin línea 'Principio activo'")
            table, body, atc, pa = text, [], None, None
        else:
            table, body = text[:pa_idx], text[pa_idx + 1:]
            pa_line = re.sub(r"\s+", " ", text[pa_idx].split(":", 1)[1]).strip().rstrip(".")
            mpa = re.match(r"^([A-Z]\d{2}[A-Z]{0,2}\d{0,2})\s*[-–]?\s*(.*)$", pa_line)
            atc, pa = (mpa[1], mpa[2].strip() or None) if mpa else (None, pa_line)
        lab, cns = parse_table(table)
        if not cns:
            warnings.append(f"{e['nombre']}: sin código nacional en la tabla")
        sec = split_sections(body)
        acuerdo_p = paragraphs(sec.get("acuerdo", []))
        indic, t1 = cap("\n".join(paragraphs(sec.get("indicacion", []))) or None)
        indic_f, t2 = cap("\n".join(paragraphs(sec.get("indicacionFinanciada", []))) or None)
        indic_o, t4 = cap("\n".join(paragraphs(sec.get("indicacionObjeto", []))) or None)
        acuerdo, t3 = cap("\n".join(acuerdo_p) or None)
        cond = " ".join(paragraphs(sec.get("condiciones", [])))
        cond = re.sub(r"^Condiciones de prescripci[oó]n y dispensaci[oó]n:\s*", "", cond) or None
        if not acuerdo:
            warnings.append(f"{e['nombre']}: sin texto 'Con respecto a… la Comisión acuerda'")
        bloque_n.setdefault(e["bloque"], len(bloque_n) + 1)
        records.append({
            "id": f"cipm{cipm}-{bloque_n[e['bloque']]}{slug(e['apartado'] or 'x')[:12]}-{e['roman']}-{slug(e['nombre'])}",
            "demo": False,
            "fuente": "acuerdos",
            "provisional": False,
            "cipm": cipm,
            "fecha": fecha,
            "bloque": e["bloque"],
            "apartado": e["apartado"],
            "tipo": f"{e['bloque']} · {e['apartado']}",
            "nombreComercial": e["nombre"],
            "principioActivo": pa,
            "atc": atc,
            "laboratorio": lab,
            "codigoNacional": cns,
            "indicacion": indic,
            "indicacionFinanciada": indic_f,
            "indicacionObjeto": indic_o,
            "condiciones": cond,
            "decision": first_decision(acuerdo_p),
            "acuerdo": acuerdo,
            "truncado": t1 or t2 or t3 or t4,
            "pagina": e["pagina"],
            "archivo": f"fuentes/{path.name}",
            "url": url,
        })
    summary = {"archivo": path.name, "tipo": "acuerdos", "cipm": cipm, "fecha": fecha,
               "paginas": len(pages), "registros": len(records), "url": url}
    return records, summary, warnings


# ------------------------------------------------------- Notas informativas

NOTA_ITEM_RE = re.compile(r"([A-ZÁÉÍÓÚ][\w\-]+(?:\s[A-Z][\w\-]+)*)\s*(H\*)?\s*\(([^)]+)\)")
NOTA_PROSA_RE = re.compile(
    r"^((?:Adicionalmente, )?se ha acordado la financiaci[oó]n de la extensi[oó]n de indicaci[oó]n de)\s+"
    r"(.+?)\s+para\s+(.+)$", re.I)


def parse_nota(path, pages, manifest_entry):
    full = re.sub(r"\s+", " ", " ".join(pages))
    m = re.search(r"Precios de los Medicamentos\s+(\d{1,2}) de (\w+) de (\d{4})", full)
    if not m:
        raise ExtractionError(f"{path.name}: no se encuentra la fecha de la reunión")
    fecha = fecha_es(m[1], m[2], m[3])
    url = (manifest_entry or {}).get("url")
    records, warnings, section = [], [], None
    seq = 0

    def add(nc, orphan, pa, ind, pno, apartado):
        nonlocal seq
        seq += 1
        ind, t = cap(ind or None)
        records.append({
            "id": f"nota{fecha}-{seq:02d}-{slug(nc)}",
            "demo": False, "fuente": "nota", "provisional": True,
            "cipm": None, "fecha": fecha,
            "bloque": "Nota informativa", "apartado": apartado,
            "tipo": f"Nota informativa · {apartado}",
            "nombreComercial": nc, "principioActivo": pa, "atc": None, "laboratorio": None,
            "codigoNacional": [], "huerfano": orphan,
            "indicacion": ind, "indicacionFinanciada": None, "indicacionObjeto": None, "condiciones": None,
            "decision": apartado, "acuerdo": None, "truncado": t,
            "pagina": pno, "archivo": f"fuentes/{path.name}", "url": url,
        })

    for pno, page in enumerate(pages, 1):
        lines = [l for _, l in clean_lines([page])]
        # bloques: viñeta "•" abre bloque; sub-viñetas "o" se mantienen dentro
        blocks, cur = [], None
        for line in lines:
            s = line.strip()
            if not s:
                if cur:
                    blocks.append(cur)
                cur = None
                continue
            if s.startswith("•"):
                if cur:
                    blocks.append(cur)
                cur = ["b", s[1:].strip()]
            elif cur and cur[0] == "b" and re.match(r"^o\s", s):
                cur[1] += "\n" + s[1:].strip()
            elif cur:
                cur[1] += " " + s
            else:
                cur = ["p", s]
        if cur:
            blocks.append(cur)
        for kind, b in blocks:
            b = re.sub(r"[ \t]+", " ", b).strip()
            if kind == "p":
                if b.startswith("Información importante"):
                    section = None
                elif b.endswith(":"):
                    section = b[:-1].strip()
                elif mp := NOTA_PROSA_RE.match(b):
                    for nc, orph, pa in NOTA_ITEM_RE.findall(mp[2]):
                        add(nc, bool(orph), pa, mp[3].rstrip("."), pno, mp[1])
                continue
            if section is None:
                continue
            head, _, ind = b.partition(":")
            items = NOTA_ITEM_RE.findall(head)
            if not items:
                warnings.append(f"p.{pno}: viñeta no reconocida: {b[:80]}")
                continue
            ind = "\n".join(x.strip() for x in ind.strip().split("\n") if x.strip())
            for nc, orph, pa in items:
                add(nc, bool(orph), pa.strip(), ind, pno, section)

    # Validación orientativa con las cifras del primer párrafo
    mn = re.search(r"financiaci[oó]n total o parcial de (\d+) nuevos? medicamentos?", full)
    if mn:
        n_new = sum(1 for r in records if re.match(r"Los? nuevos? medicamentos?", r["apartado"] or ""))
        if n_new != int(mn[1]):
            warnings.append(f"nuevos medicamentos: la nota dice {mn[1]}, extraídos {n_new}")
    mi = re.search(r"(\d+) nuevas? indicaci[oó]n(?:es)? de (\d+) medicamentos?", full)
    if mi:
        n_ind = sum(1 for r in records if re.match(r"Las? nuevas? indicaci", r["apartado"] or ""))
        if n_ind != int(mi[2]):
            warnings.append(f"nuevas indicaciones: la nota dice {mi[2]} medicamentos, extraídos {n_ind}")

    summary = {"archivo": path.name, "tipo": "nota", "cipm": None, "fecha": fecha,
               "paginas": len(pages), "registros": len(records), "url": url}
    return records, summary, warnings


# ------------------------------------------------------------------- main

def detect(pages):
    head = re.sub(r"\s+", " ", " ".join(pages[:2])).upper()
    if "ACUERDOS DE LA COMISION INTERMINISTERIAL" in head or "ACUERDOS DE LA COMISIÓN INTERMINISTERIAL" in head:
        return "acuerdos"
    if "PUNTOS DESTACADOS DE LA REUNI" in head:
        return "nota"
    return None


def main(argv):
    check_only = "--check" in argv
    if not shutil.which("pdftotext"):
        sys.exit("ERROR: falta 'pdftotext' (paquete poppler-utils).")
    pdfs = sorted(FUENTES.glob("*.pdf"))
    if not pdfs:
        sys.exit(f"ERROR: no hay PDF en {FUENTES}")
    manifest = load_manifest()
    all_records, docs, errors = [], [], []
    for pdf in pdfs:
        pages = pdf_pages(pdf)
        kind = detect(pages)
        try:
            if kind == "acuerdos":
                recs, summ, warns = parse_acuerdos(pdf, pages, manifest.get(pdf.name))
            elif kind == "nota":
                recs, summ, warns = parse_nota(pdf, pages, manifest.get(pdf.name))
            else:
                raise ExtractionError(f"{pdf.name}: tipo de documento no reconocido")
        except ExtractionError as e:
            errors.append(str(e))
            print(f"✗ {e}", file=sys.stderr)
            continue
        summ["avisos"] = warns
        docs.append(summ)
        all_records += recs
        flag = "⚠" if warns else "✓"
        print(f"{flag} {pdf.name}: {summ['tipo']} · {summ['fecha']} · {len(recs)} registros")
        for w in warns:
            print(f"    aviso: {w}")

    if errors:
        sys.exit(f"\n{len(errors)} documento(s) con errores. No se escribe {OUT.relative_to(ROOT)}.")

    ids = [r["id"] for r in all_records]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        sys.exit(f"ERROR: identificadores duplicados: {sorted(dup)}")

    all_records.sort(key=lambda r: (r["fecha"], r["cipm"] or "", -r["pagina"]), reverse=True)
    docs.sort(key=lambda d: d["fecha"], reverse=True)
    out = {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "dataset": "cipm",
            "isDemo": False,
            "updated": date.today().isoformat(),
            "generator": "scripts/cipm_extract.py",
            "granularidad": "Acuerdos CIPM: un registro por expediente (cada 'i) Nombre®' del documento). "
                            "Notas informativas: un registro por medicamento citado.",
            "criterioTexto": "bloque, apartado, indicación y acuerdo se transcriben literalmente del PDF; "
                             "solo se unen líneas y se eliminan cabeceras y pies de página.",
            "exclusiones": "No se extrae el precio.",
            "documentos": docs,
        },
        "records": all_records,
    }
    print(f"\nTotal: {len(all_records)} registros de {len(docs)} documento(s).")
    if check_only:
        print("--check: validación correcta, no se escribe el JSON.")
        return
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Escrito {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1:])
