#!/usr/bin/env python3
"""Discover official CIPM PDFs, validate in isolation and apply a validated batch.

Only HTTPS Sanidad URLs under the configured source directory are followed.
No dependency outside Python's standard library and the existing PDF extractor.
"""
import argparse
import contextlib
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen, HTTPRedirectHandler, build_opener

import cipm_extract as extractor

ROOT = Path(__file__).resolve().parent.parent
INDEX = 'https://www.sanidad.gob.es/areas/farmacia/precios/comisionInteministerial/acuerdosNotasInformativas/home.htm'
PREFIX = '/areas/farmacia/precios/comisionInteministerial/acuerdosNotasInformativas/'
MAX_PDF = 20 * 1024 * 1024
MAX_TOTAL = 200 * 1024 * 1024


class MonitorFailure(Exception):
    def __init__(self, phase, urls):
        self.phase = phase
        self.urls = urls
        super().__init__(phase)


def official_url(url):
    p = urlsplit(url)
    decoded = unquote(p.path)
    if (p.scheme != 'https' or p.hostname != 'www.sanidad.gob.es' or
            p.username or p.password or p.port not in (None, 443) or
            not decoded.startswith(PREFIX) or '..' in decoded.split('/')):
        raise ValueError('URL fuera del directorio oficial de acuerdos CIPM')
    return urlunsplit((p.scheme, p.netloc, p.path, p.query, ''))


class OfficialRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, official_url(newurl))


def download(url, limit):
    url = official_url(url)
    with build_opener(OfficialRedirects()).open(
            Request(url, headers={'User-Agent': 'EvidenceGap-Radar-CIPM-Monitor/1.0'}), timeout=45) as response:
        official_url(response.geturl())
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Documento demasiado grande; requiere revisión manual')
    return data


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.urls.extend(v for k, v in attrs if k == 'href' and v)


def discover(index, fetch=download):
    """Follow same-directory HTML indexes (at most two levels), not PDF links."""
    queue = [(official_url(index), 0)]
    visited, pdfs = set(), set()
    while queue:
        url, depth = queue.pop(0)
        if url in visited:
            continue
        visited.add(url)
        if len(visited) > 30:
            raise ValueError('Demasiadas páginas de índice; revisar la estructura de Sanidad')
        data = fetch(url, 4 * 1024 * 1024)
        parser = Links()
        parser.feed(data.decode('utf-8', errors='replace'))
        for href in parser.urls:
            absolute = urljoin(url, href)
            try:
                absolute = official_url(absolute)
            except ValueError:
                continue
            path = unquote(urlsplit(absolute).path).lower()
            name = path.rsplit('/', 1)[-1]
            if path.endswith('.pdf') and any(word in name for word in ('cipm', 'acuerdo', 'nota')):
                pdfs.add(absolute)
            elif depth < 2 and path.endswith(('.htm', '.html')) and '/docs/' not in path:
                queue.append((absolute, depth + 1))
    if not pdfs:
        raise ValueError('El índice no contiene PDF CIPM reconocibles; revisar URL o formato de la página')
    if len(pdfs) > 200:
        raise ValueError('Más de 200 PDF detectados; revisar el índice antes de importar')
    return sorted(pdfs)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def pdf_identity(path):
    pages = extractor.pdf_pages(path)
    kind = extractor.detect(pages)
    if kind == 'acuerdos':
        # Full validation is performed by the existing extractor below.
        from cipm_markdown import session_identity
        session, date = session_identity('\n'.join(pages))
        return kind, session, date
    if kind == 'nota':
        _, summary, _ = extractor.parse_nota(path, pages, None)
        return kind, None, summary['fecha']
    raise ValueError('PDF CIPM con formato no reconocido; requiere adaptación del extractor')


def validate(staging):
    """Run the unmodified extraction workflow against a temporary source tree."""
    saved = extractor.ROOT, extractor.FUENTES, extractor.MANIFEST, extractor.OUT
    try:
        extractor.ROOT = staging
        extractor.FUENTES = staging / 'fuentes'
        extractor.MANIFEST = extractor.FUENTES / 'fuentes.json'
        extractor.OUT = staging / 'data/cipm.json'
        with contextlib.redirect_stdout(io.StringIO()):
            extractor.main([])
    finally:
        extractor.ROOT, extractor.FUENTES, extractor.MANIFEST, extractor.OUT = saved


def synchronize(root=ROOT, index=INDEX, fetch=download, identify=pdf_identity, validator=validate):
    root = Path(root)
    current = json.loads((root / 'data/cipm.json').read_text())
    docs = current['meta']['documentos']
    latest_session = max(int(d['cipm']) for d in docs if d['tipo'] == 'acuerdos')
    latest_note = max((d['fecha'] for d in docs if d['tipo'] == 'nota'), default='0000-00-00')
    state_path = root / 'data/cipm-monitor.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else {'version': 1, 'documents': {}}
    if state.get('version') != 1:
        raise ValueError('Versión de estado del monitor no soportada')
    urls = discover(index, fetch)
    report = {'index': index, 'discovered': len(urls), 'added': [], 'revised': [], 'changed': False}
    local_hashes = {digest(p.read_bytes()): p.name for p in (root / 'fuentes').glob('*.pdf')}
    total = 0
    with tempfile.TemporaryDirectory(prefix='cipm-monitor-') as temp:
        staging = Path(temp)
        shutil.copytree(root / 'fuentes', staging / 'fuentes')
        (staging / 'data').mkdir()
        manifest_path = staging / 'fuentes/fuentes.json'
        manifest = json.loads(manifest_path.read_text())
        entries = {d['archivo']: d for d in manifest['documentos']}
        changed_files = set()
        for url in urls:
            previous = state['documents'].get(url)
            # Backfill of missing historical sessions is a separate editorial task.
            # Recheck URLs already monitored even when their session is older.
            number = re.search(r'(?:acuerdos[_\s-]*(?:de[_\s-]*la[_\s-]*)?cipm[_\s-]*)(\d{3})(?!\d)',
                               unquote(urlsplit(url).path), re.I)
            if not previous and number and int(number[1]) < latest_session:
                continue
            try:
                data = fetch(url, MAX_PDF)
            except Exception as error:
                raise MonitorFailure('descarga', [url]) from error
            total += len(data)
            if total > MAX_TOTAL:
                raise ValueError('Se supera el límite de descarga de 200 MiB por ejecución')
            if not data.startswith(b'%PDF-'):
                raise MonitorFailure('respuesta que no es PDF', [url])
            sha = digest(data)
            if previous and previous['sha256'] == sha:
                continue
            if sha in local_hashes:
                filename = local_hashes[sha]
                state['documents'][url] = {'sha256': sha, 'archivo': filename}
                if filename in entries and not entries[filename].get('url'):
                    entries[filename]['url'] = url
                continue
            incoming = staging / 'incoming.pdf'
            incoming.write_bytes(data)
            try:
                kind, session, date = identify(incoming)
            except (Exception, SystemExit) as error:
                raise MonitorFailure('identificación del PDF', [url]) from error
            if kind == 'acuerdos' and int(session) < latest_session and not previous:
                continue
            if kind == 'nota' and date < latest_note and not previous:
                continue
            existing = next((d for d in docs if d['tipo'] == kind and
                             (d.get('cipm') == session if session else d['fecha'] == date)), None)
            if existing and existing['fecha'] != date:
                raise ValueError('Una sesión existente aparece con otra fecha; requiere revisión')
            if previous and previous['archivo'] in {d['archivo'] for d in docs}:
                old = next(d for d in docs if d['archivo'] == previous['archivo'])
                if old['tipo'] != kind or old.get('cipm') != session or old['fecha'] != date:
                    raise ValueError('La URL monitorizada ha cambiado de sesión o fecha; requiere revisión')
            filename = existing['archivo'] if existing else (
                f'Acuerdos_CIPM_{session}.pdf' if session else f'Nota_informativa_CIPM_{date}.pdf')
            if not re.fullmatch(r'[\w.-]+\.pdf', filename, re.I):
                raise ValueError('Nombre de fuente incompatible con una actualización PDF')
            destination = staging / 'fuentes' / filename
            if filename in changed_files and destination.read_bytes() != data:
                raise ValueError('Dos PDF distintos para la misma sesión; requiere revisión')
            destination.write_bytes(data)
            entries[filename] = {'archivo': filename, 'url': url}
            state['documents'][url] = {'sha256': sha, 'archivo': filename}
            changed_files.add(filename)
            local_hashes[sha] = filename
            report['revised' if existing else 'added'].append({'archivo': filename, 'url': url})
        manifest['documentos'] = list(entries.values())
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        manifest_changed = json.loads((root / 'fuentes/fuentes.json').read_text()) != manifest
        state_text = json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + '\n'
        state_changed = not state_path.exists() or state_path.read_text() != state_text
        if changed_files or manifest_changed:
            # Nothing in the checkout is changed until the entire batch validates.
            try:
                validator(staging)
            except (Exception, SystemExit) as error:
                pending = report['added'] + report['revised']
                raise MonitorFailure('validación del lote', [d['url'] for d in pending]) from error
            for filename in changed_files:
                shutil.copy2(staging / 'fuentes' / filename, root / 'fuentes' / filename)
            shutil.copy2(manifest_path, root / 'fuentes/fuentes.json')
            shutil.copy2(staging / 'data/cipm.json', root / 'data/cipm.json')
        if state_changed:
            state_path.write_text(state_text)
        report['changed'] = bool(changed_files or manifest_changed or state_changed)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index-url', default=INDEX)
    parser.add_argument('--report', type=Path, default=Path('/tmp/cipm-monitor-report.json'))
    args = parser.parse_args()
    try:
        report = synchronize(index=args.index_url)
    except (Exception, SystemExit) as error:
        # The report contains no response bodies, credentials or remote error text.
        report = {'changed': False, 'error': type(error).__name__,
                  'message': 'No se ha aplicado la actualización. Revisar acceso a Sanidad, índice y validación del extractor.',
                  'index': args.index_url,
                  'phase': getattr(error, 'phase', 'descubrimiento o comprobación'),
                  'documents': getattr(error, 'urls', [])}
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(report['message'], file=sys.stderr)
        return 1
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
