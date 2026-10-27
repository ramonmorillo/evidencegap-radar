"""Importación de conversiones Markdown: fechas del texto, sin inventar páginas.

Se conservan los expedientes y textos, no las tablas de precios. Cuando existe
índice, se contrasta la secuencia de nombres, bloques y apartados del cuerpo.
"""
import re
import difflib
from datetime import date
from cipm_extract import (ExtractionError, MESES, norm_key, clean_name,
                          records_from_exps, HEADER_RE)

SESSION = re.compile(r"sesi[oó]n\s+(?:extraordinaria\s+)?(\d+)\s+de\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})", re.I)
BLOCK = re.compile(r"^(?:\d[.)]?\s*)?(Acuerdos\s+(?:de\s+Precio\s+y\s+Financiaci[oó]n\s+de\s+Medicamentos|denegatorios))\.?$", re.I)
SECTION = re.compile(r"^[a-dA-D][.)]\s*((?:Nuevos medicamentos|Nuevas indicaciones|Alteraciones (?:en|de) la oferta|Alegaciones))\.?$", re.I)
ITEM = re.compile(r"^(?:([ivxl]+)[.)]\s*|o\s+(?:\.\s*)?)(.+?)(?:\s*\.{3,}\s*\d*)?$", re.I)


def session_identity(text):
    m = SESSION.search(re.sub(r"\s+", " ", text))
    if not m:
        raise ExtractionError("Markdown sin fecha y número de sesión reconocibles")
    try:
        return m[1], date(int(m[4]), MESES[m[3].lower()], int(m[2])).isoformat()
    except (KeyError, ValueError) as error:
        raise ExtractionError(f"Fecha de sesión inválida: {m[0]}") from error


def markdown_lines(text):
    lines = []
    for raw in text.splitlines():
        # Strip Markdown table framing, retaining literal cell text.
        if re.fullmatch(r"[|\s:\-]+", raw) and "---" in raw:
            continue
        line = re.sub(r"\s+", " ", raw.replace('|', ' ')).strip()
        line = re.sub(r"^#{1,6}\s+", "", line).replace('**', '')
        line = re.sub(r"^(?:[•\uf0b7-]\s*|D\)\s*)(?=Con respecto)", "", line)
        if HEADER_RE.fullmatch(line) or line in ('SECRETARIA GENERAL DE', 'MINISTERIO SANIDAD'):
            continue
        lines.append(line)
    # Some conversions put the bullet, title and section letter on separate lines.
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if re.fullmatch(r"o|[A-Da-d][.)]", line):
            j = i + 1
            while j < len(lines) and not lines[j]:
                j += 1
            if j < len(lines):
                line += ' ' + lines[j]
                i = j
        out.append(line)
        i += 1
    return out


def parse_markdown(path, manifest_entry=None):
    text = path.read_text(encoding='utf-8')
    cipm, fecha = session_identity(text)
    lines = markdown_lines(text)
    # Index entries end in page numbers; body headings end in dots or plain text.
    toc = []
    block = section = None
    body_start = None
    for i, line in enumerate(lines):
        plain = re.sub(r"\s*\.{3,}\s*\d+\s*$", '', line)
        if m := BLOCK.fullmatch(plain):
            block, section = m[1], None
            if not re.search(r"\.{3,}\s*\d+$", line):
                body_start = i
                break
        elif m := SECTION.fullmatch(plain):
            section = m[1]
            if not re.search(r"\.{3,}\s*\d+$", line) and toc:
                body_start = i
                break
        elif re.search(r"\.{3,}\s*\d+$", line) and (m := ITEM.fullmatch(plain)):
            toc.append((block, section, clean_name(m[2])))
    if body_start is None:
        raise ExtractionError(f'{path.name}: no se encuentra el bloque de acuerdos')
    exps = []
    block = (toc[0][0] or 'Sin bloque en el documento') if toc else None
    section = None
    cur = None
    for i in range(body_start, len(lines)):
        line = lines[i]
        if m := BLOCK.fullmatch(line):
            block, section, cur = m[1], None, None
        elif m := SECTION.fullmatch(line):
            section, cur = m[1], None
        elif m := ITEM.fullmatch(line):
            # Clinical prose also uses "o": require a medicine table before its
            # first active-ingredient label, and before another candidate title.
            following = []
            for tail in lines[i + 1:]:
                if re.match(r'^Principio activo\s*:', tail, re.I):
                    break
                if BLOCK.fullmatch(tail) or SECTION.fullmatch(tail) or ITEM.fullmatch(tail):
                    break
                following.append(tail)
            table = ' '.join(following)
            if not ('MEDICAMENT' in table and ('CN' in table or 'C.N.' in table)):
                if cur is not None:
                    cur['lines'].append(line)
                continue
            if not block or not section:
                raise ExtractionError(f'{path.name}: expediente sin bloque/apartado: {line}')
            cur = dict(roman=m[1] or str(len(exps) + 1), nombre=clean_name(m[2]),
                       pagina=None, bloque=block, apartado=section, lines=[])
            exps.append(cur)
        elif cur is not None:
            # Standalone numbers are page footers in these conversions; table CN
            # have six digits and are retained. Do not assign inferred PDF pages.
            if not re.fullmatch(r'\d{1,3}', line):
                cur['lines'].append(line)
    # Independent coverage check: an ingredient line must not disappear between
    # headings, even in old documents with no table of contents.
    ingredient = re.compile(r"^Principio activo\s*:", re.I)
    expected_pa = sum(bool(ingredient.match(l)) for l in lines[body_start:])
    captured_pa = sum(bool(ingredient.match(l)) for e in exps for l in e['lines'])
    if expected_pa != captured_pa:
        raise ExtractionError(f'{path.name}: líneas de principio activo sin expediente '
                              f'({captured_pa}/{expected_pa}): ' + str([l for l in lines[body_start:] if ingredient.match(l) and not any(l in e['lines'] for e in exps)]))
    if not exps:
        raise ExtractionError(f'{path.name}: ningún expediente reconocido')
    if toc:
        got = [(e['bloque'], e['apartado'], e['nombre']) for e in exps]
        if len(got) != len(toc):
            raise ExtractionError(f'{path.name}: {len(got)} expedientes / {len(toc)} en índice: {got}')
        for expected, actual in zip(toc, got):
            if (norm_key(expected[0] or 'Sin bloque en el documento') != norm_key(actual[0]) or
                norm_key(expected[1]) != norm_key(actual[1]) or
                difflib.SequenceMatcher(None, norm_key(expected[2]), norm_key(actual[2])).ratio() < .75):
                raise ExtractionError(f'{path.name}: índice {expected} ≠ cuerpo {actual}')
    warnings = ['Conversión Markdown: sin paginación PDF verificable; laboratorio no inferido de tablas sin alineación.']
    if not toc:
        warnings.append('Documento sin índice: detección por encabezados y tablas de medicamentos.')
    records, warnings = records_from_exps(path, cipm, fecha, exps, manifest_entry, warnings)
    summary = dict(archivo=path.name, tipo='acuerdos', cipm=cipm, fecha=fecha,
                   paginas=None, registros=len(records), url=(manifest_entry or {}).get('url'), formato='markdown')
    return records, summary, warnings
