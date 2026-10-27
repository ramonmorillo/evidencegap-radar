"""Network-free integration tests using the repository's real official PDFs."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest

import cipm_monitor
from cipm_monitor import INDEX, PREFIX, MonitorFailure, discover, official_url, synchronize, validate

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / 'fuentes/Acuerdos_CIPM_271.pdf'
NEW = 'https://www.sanidad.gob.es' + PREFIX + 'docs/Acuerdos_CIPM_272.pdf'


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'fuentes').mkdir()
        (self.root / 'data').mkdir()
        self.dataset = {'meta': {'documentos': [
            {'tipo': 'acuerdos', 'cipm': '271', 'fecha': '2026-06-17', 'archivo': PDF.name},
            {'tipo': 'nota', 'cipm': None, 'fecha': '2026-09-23', 'archivo': 'nota.pdf'}]}, 'records': []}
        (self.root / 'data/cipm.json').write_text(json.dumps(self.dataset))
        (self.root / 'fuentes/fuentes.json').write_text(json.dumps({'documentos': []}))
        self.payload = PDF.read_bytes()

    def fetch(self, url, limit):
        return f'<a href="{NEW}">Acuerdos nuevos</a>'.encode() if url == INDEX else self.payload

    def validate_fake(self, staging):
        (staging / 'data/cipm.json').write_text(json.dumps({'validated': True}))

    def test_rejects_external_http_and_path_traversal(self):
        for url in ['http://www.sanidad.gob.es' + PREFIX + 'x.pdf',
                    'https://attacker.example/x.pdf',
                    'https://www.sanidad.gob.es' + PREFIX + '%2e%2e/secreto.pdf',
                    'https://user@www.sanidad.gob.es' + PREFIX + 'x.pdf']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                official_url(url)

    def test_discovers_nested_indexes_and_deduplicates(self):
        year = 'https://www.sanidad.gob.es' + PREFIX + '2026.htm'
        pages = {INDEX: f'<a href="2026.htm">2026</a><a href="{NEW}">PDF</a>',
                 year: f'<a href="{NEW}#page=1">PDF</a><a href="https://evil.example/x.pdf">x</a>'}
        self.assertEqual(discover(INDEX, lambda url, limit: pages[url].encode()), [NEW])

    def test_changed_index_does_not_mean_no_news(self):
        with self.assertRaises(ValueError):
            discover(INDEX, lambda url, limit: b'<html>No links</html>')

    def test_new_pdf_is_validated_then_applied_and_repeat_is_noop(self):
        options = dict(root=self.root, fetch=self.fetch,
                       identify=lambda path: ('acuerdos', '272', '2026-10-20'), validator=self.validate_fake)
        first = synchronize(**options)
        self.assertTrue(first['changed'])
        self.assertEqual(first['added'][0]['archivo'], 'Acuerdos_CIPM_272.pdf')
        self.assertTrue((self.root / 'fuentes/Acuerdos_CIPM_272.pdf').is_file())
        # Restore the minimal dataset shape that the real validator always writes.
        self.dataset['meta']['documentos'].append({'tipo': 'acuerdos', 'cipm': '272',
            'fecha': '2026-10-20', 'archivo': 'Acuerdos_CIPM_272.pdf'})
        (self.root / 'data/cipm.json').write_text(json.dumps(self.dataset))
        self.assertFalse(synchronize(**options)['changed'])

    def test_invalid_batch_preserves_entire_checkout(self):
        before = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        def fail(staging):
            raise SystemExit('Invalid table of contents')
        with self.assertRaises(MonitorFailure):
            synchronize(root=self.root, fetch=self.fetch,
                        identify=lambda path: ('acuerdos', '272', '2026-10-20'), validator=fail)
        after = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(before, after)

    def test_real_pdf_identical_to_local_does_not_create_duplicate(self):
        shutil.copy2(PDF, self.root / 'fuentes' / PDF.name)
        url = 'https://www.sanidad.gob.es' + PREFIX + 'docs/' + PDF.name
        def fetch(url_, limit):
            return f'<a href="{url}">PDF</a>'.encode() if url_ == INDEX else self.payload
        report = synchronize(root=self.root, fetch=fetch,
                             identify=lambda path: self.fail('identical PDF should not be re-imported'))
        self.assertEqual(report['added'], [])
        self.assertEqual(len(list((self.root / 'fuentes').glob('*.pdf'))), 1)

    def test_unrecognized_pdf_reports_document_url(self):
        with self.assertRaises(MonitorFailure) as context:
            synchronize(root=self.root, fetch=self.fetch,
                        identify=lambda path: (_ for _ in ()).throw(ValueError('unknown format')))
        self.assertEqual(context.exception.urls, [NEW])

    def test_revision_of_monitored_pdf_is_detected(self):
        shutil.copy2(PDF, self.root / 'fuentes' / PDF.name)
        url = 'https://www.sanidad.gob.es' + PREFIX + 'docs/' + PDF.name
        (self.root / 'data/cipm-monitor.json').write_text(json.dumps({'version': 1, 'documents': {
            url: {'sha256': 'old-hash', 'archivo': PDF.name}}}))
        payload = self.payload + b'\n% revision\n'
        def fetch(url_, limit):
            return f'<a href="{url}">PDF</a>'.encode() if url_ == INDEX else payload
        report = synchronize(root=self.root, fetch=fetch,
            identify=lambda path: ('acuerdos', '271', '2026-06-17'), validator=self.validate_fake)
        self.assertEqual(report['revised'][0]['archivo'], PDF.name)

    def test_end_to_end_import_uses_real_pdf_and_extractor(self):
        old = ROOT / 'fuentes/Acuerdos_CIPM_270.pdf'
        shutil.copy2(old, self.root / 'fuentes' / old.name)
        self.dataset['meta']['documentos'] = [
            {'tipo': 'acuerdos', 'cipm': '270', 'fecha': '2026-05-20', 'archivo': old.name}]
        (self.root / 'data/cipm.json').write_text(json.dumps(self.dataset))
        url = 'https://www.sanidad.gob.es' + PREFIX + 'docs/' + PDF.name
        def fetch(url_, limit):
            return f'<a href="{url}">PDF</a>'.encode() if url_ == INDEX else self.payload
        report = synchronize(root=self.root, fetch=fetch)
        self.assertEqual(report['added'][0]['archivo'], PDF.name)
        data = json.loads((self.root / 'data/cipm.json').read_text())
        self.assertEqual({d['cipm'] for d in data['meta']['documentos']}, {'270', '271'})
        self.assertEqual(len(data['records']), 62)
        self.assertFalse(synchronize(root=self.root, fetch=fetch)['changed'])

    def test_legacy_header_is_identified_from_real_source_text(self):
        # Text of the official 2021 extraordinary session that blocked the first run.
        text = (ROOT / 'fuentes/20211025_ACUERDOS_CIPM_EXTRAORDINARIA_2162.md').read_text()
        original = cipm_monitor.extractor.pdf_pages
        cipm_monitor.extractor.pdf_pages = lambda path: [text]
        self.addCleanup(setattr, cipm_monitor.extractor, 'pdf_pages', original)
        self.assertEqual(cipm_monitor.pdf_identity(Path('ignored.pdf')), ('acuerdos', '216', '2021-10-06'))

    def test_all_legacy_sources_are_identifiable(self):
        original = cipm_monitor.extractor.pdf_pages
        self.addCleanup(setattr, cipm_monitor.extractor, 'pdf_pages', original)
        for source in sorted((ROOT / 'fuentes').glob('*.md')):
            text = source.read_text()
            if not cipm_monitor.LEGACY_HEADER.search(text[:6000]):
                continue
            with self.subTest(source=source.name):
                cipm_monitor.extractor.pdf_pages = lambda path, text=text: [text]
                kind, session, _ = cipm_monitor.pdf_identity(Path('ignored.pdf'))
                self.assertEqual(kind, 'acuerdos')
                self.assertTrue(session.isdigit())

    def test_historical_pdf_with_irregular_name_is_skipped(self):
        old = 'https://www.sanidad.gob.es' + PREFIX + 'docs/20211025_ACUERDOS_CIPM_EXTRAORDINARIA_2162.pdf'
        def fetch(url, limit):
            return f'<a href="{old}">PDF</a>'.encode() if url == INDEX else self.payload
        options = dict(root=self.root, fetch=fetch,
                       identify=lambda path: ('acuerdos', '216', '2021-10-06'),
                       validator=lambda staging: self.fail('historical PDF must not be validated'))
        report = synchronize(**options)
        self.assertEqual((report['added'], report['revised']), ([], []))
        self.assertEqual(list((self.root / 'fuentes').glob('*.pdf')), [])
        # The first run only initialises the monitor state; the next one is a no-op.
        self.assertFalse(synchronize(**options)['changed'])

    def test_unknown_format_is_still_reported(self):
        original = cipm_monitor.extractor.pdf_pages
        cipm_monitor.extractor.pdf_pages = lambda path: ['Documento sin cabecera reconocible']
        self.addCleanup(setattr, cipm_monitor.extractor, 'pdf_pages', original)
        with self.assertRaises(ValueError):
            cipm_monitor.pdf_identity(Path('ignored.pdf'))

    def test_official_file_names_separate_history_from_news(self):
        # Real names from the Sanidad index (27-oct-2026); latest imported: session 271, note 2026-09-23.
        history = ['Acuerdos_CIPM_270-.pdf', 'ACUERDOS_CIPM_2592.pdf', '20230504_ACUERDOS_CIPM_233v2.pdf',
                   '20211025_ACUERDOS_CIPM_EXTRAORDINARIA_2162.pdf', 'ACUERDOS_DE_LA_CIPM_1972_web.pdf',
                   'NOTAINFORMATIVACIPM_183.pdf', 'NOTA_INFORMATIVA_DE_LA_CIPM_1882_web.pdf',
                   'NOTAINFORMATIVACIPM_JUNIO20252.pdf', 'NOTAINFORMATIVACIPM_OCTUBRE23.pdf',
                   'NOTAINFORMATIVACIPM_ABR23.pdf', 'NOTAINFORMATIVACIPM_MARZO2026.pdf',
                   'Nota_CIPM_Abril_2026.pdf', 'Nota_informativa_CIPM_Julio_2026.pdf']
        news = ['Acuerdos_CIPM_272.pdf', 'Acuerdos_CIPM_273.pdf', 'Acuerdos_CIPM_271.pdf',
                'Nota_informativa_CIPM_Octubre_2026.pdf', 'Nota_informativa_CIPM_Septiembre_2026.pdf',
                'Documento_sin_numero.pdf']
        base = 'https://www.sanidad.gob.es' + PREFIX + 'docs/'
        for name in history:
            with self.subTest(name=name):
                self.assertTrue(cipm_monitor.historical_by_name(base + name, 271, '2026-09-23'))
        for name in news:
            with self.subTest(name=name):
                self.assertFalse(cipm_monitor.historical_by_name(base + name, 271, '2026-09-23'))

    def test_real_extractor_runs_in_isolation(self):
        staging = self.root / 'staging'
        (staging / 'fuentes').mkdir(parents=True)
        (staging / 'data').mkdir()
        shutil.copy2(PDF, staging / 'fuentes' / PDF.name)
        (staging / 'fuentes/fuentes.json').write_text('{"documentos": []}')
        validate(staging)
        data = json.loads((staging / 'data/cipm.json').read_text())
        self.assertEqual(len(data['records']), 31)
        self.assertEqual(data['meta']['documentos'][0]['cipm'], '271')


if __name__ == '__main__':
    unittest.main()
