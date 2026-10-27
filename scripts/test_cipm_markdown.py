"""Regression tests for historical Markdown ingestion (standard library only)."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from cipm_extract import ExtractionError
from cipm_markdown import ITEM, parse_markdown, session_identity

ROOT = Path(__file__).resolve().parent.parent


class MarkdownImportTests(unittest.TestCase):
    def parse_text(self, text):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'test.md'
            path.write_text(text, encoding='utf-8')
            return parse_markdown(path)

    def test_session_uses_content_not_filename(self):
        path = ROOT / 'fuentes/20230202_ACUERDOS_CIPM_230.md'
        self.assertEqual(session_identity(path.read_text()), ('230', '2022-12-15'))

    def test_extraordinary_session(self):
        self.assertEqual(session_identity('SESIÓN EXTRAORDINARIA 216 DE 06 DE OCTUBRE DE 2021'),
                         ('216', '2021-10-06'))

    def test_impossible_date_rejected(self):
        with self.assertRaises(ExtractionError):
            session_identity('Sesión 1 de 31 de febrero de 2020')

    def test_table_words_are_not_medicine_bullets(self):
        self.assertIsNone(ITEM.fullmatch('ORAL EN SOBRES EFG'))
        self.assertIsNone(ITEM.fullmatch('ORPHAN'))
        self.assertIsNotNone(ITEM.fullmatch('xiii. Tivicay® ........'))

    def test_split_table_heading_and_roman_dots(self):
        records, _, _ = parse_markdown(ROOT / 'fuentes/20230202_ACUERDOS_CIPM_230.md')
        self.assertEqual(len(records), 38)
        self.assertTrue(any(r['nombreComercial'] == 'Micetal' for r in records))
        records, _, _ = parse_markdown(ROOT / 'fuentes/ACUERDOS_CIPM_252.md')
        self.assertTrue(any(r['nombreComercial'] == 'Libmeldy' and r['principioActivo'] for r in records))

    def test_no_block_is_not_inferred_as_favourable(self):
        records, _, _ = parse_markdown(ROOT / 'fuentes/ACUERDOS_CIPM_239.md')
        self.assertEqual(len(records), 2)
        self.assertTrue(all(r['bloque'] == 'Sin bloque en el documento' for r in records))
        self.assertTrue(all(r['pagina'] is None and r['laboratorio'] is None for r in records))

    def test_missing_index_entry_fails_instead_of_partial_import(self):
        text = (ROOT / 'fuentes/ACUERDOS_CIPM_239.md').read_text()
        text = text.replace('ii) Amoxicilina/ácido clavulánico oral pediátrica .......................',
                            'Encabezado no reconocido')
        with self.assertRaises(ExtractionError):
            self.parse_text(text)

    def test_orphan_ingredient_fails_for_document_without_index(self):
        text = '''SESIÓN 1 DE 4 DE FEBRERO DE 2020
1. ACUERDOS DE PRECIO Y FINANCIACIÓN DE MEDICAMENTOS
A. NUEVOS MEDICAMENTOS
Principio activo: L04AC18 - Risankizumab
'''
        with self.assertRaises(ExtractionError):
            self.parse_text(text)

    def test_decision_retained_even_without_ingredient_label(self):
        text = '''SESIÓN 1 DE 4 DE FEBRERO DE 2020
1. ACUERDOS DE PRECIO Y FINANCIACIÓN DE MEDICAMENTOS
A. NUEVOS MEDICAMENTOS
o MEDICINA
LABORATORIO MEDICAMENTO FORMATO CN
LAB MEDICINA 123456
Indicación terapéutica: texto de la indicación.
Con respecto a este medicamento, la Comisión acuerda su financiación.
'''
        records, _, _ = self.parse_text(text)
        self.assertIsNone(records[0]['principioActivo'])
        self.assertIn('acuerda su financiación', records[0]['acuerdo'])

    def test_check_mode_validates_all_sources_without_modifying_dataset(self):
        path = ROOT / 'data/cipm.json'
        before = hashlib.sha256(path.read_bytes()).digest()
        result = subprocess.run([sys.executable, '-B', 'scripts/cipm_extract.py', '--check'],
                                cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('2216 registros de 71 documento(s)', result.stdout)
        self.assertEqual(hashlib.sha256(path.read_bytes()).digest(), before)
        data = json.loads(path.read_text())
        self.assertEqual(len({r['id'] for r in data['records']}), len(data['records']))
        self.assertEqual(len([d for d in data['meta']['documentos'] if d['cipm'] == '253']), 1)
        self.assertTrue(all((ROOT / r['archivo']).is_file() for r in data['records']))


if __name__ == '__main__':
    unittest.main()
