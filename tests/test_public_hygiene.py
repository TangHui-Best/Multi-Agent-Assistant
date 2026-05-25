import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path

from scripts import public_hygiene


class PublicHygieneScannerTest(unittest.TestCase):
    def test_reports_forbidden_literal_with_location(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "docs" / "note.md"
            doc.parent.mkdir()
            doc.write_text("public text\nleaks SecretReferenceName here\n", encoding="utf-8")

            pattern_file = root / "patterns.txt"
            pattern_file.write_text("SecretReferenceName\n", encoding="utf-8")

            rules = public_hygiene.load_rules([pattern_file], env_value="")
            findings = public_hygiene.scan_paths(root, [doc], rules)

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].path, Path("docs/note.md"))
        self.assertEqual(findings[0].line, 2)
        self.assertEqual(findings[0].column, 7)
        self.assertIn("literal", findings[0].rule)

    def test_loads_newline_separated_secret_patterns_from_environment(self):
        rules = public_hygiene.load_rules([], env_value="AlphaPrivate\n# comment\nregex:Beta\\d+")

        self.assertEqual([rule.source for rule in rules], ["env", "env"])
        self.assertTrue(rules[0].matches("contains AlphaPrivate"))
        self.assertTrue(rules[1].matches("contains Beta42"))
        self.assertFalse(rules[1].matches("contains Beta"))

    def test_cli_returns_zero_when_no_forbidden_patterns_are_found(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "README.md"
            doc.write_text("generic private reference wording is allowed\n", encoding="utf-8")
            pattern_file = root / "patterns.txt"
            pattern_file.write_text("SpecificPrivateSourceName\n", encoding="utf-8")

            with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
                exit_code = public_hygiene.main(
                    ["--root", os.fspath(root), "--patterns-file", os.fspath(pattern_file), os.fspath(doc)]
                )

        self.assertEqual(exit_code, 0)

    def test_cli_returns_one_when_forbidden_patterns_are_found(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "README.md"
            doc.write_text("this names SpecificPrivateSourceName\n", encoding="utf-8")
            pattern_file = root / "patterns.txt"
            pattern_file.write_text("SpecificPrivateSourceName\n", encoding="utf-8")

            with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
                exit_code = public_hygiene.main(
                    ["--root", os.fspath(root), "--patterns-file", os.fspath(pattern_file), os.fspath(doc)]
                )

        self.assertEqual(exit_code, 1)
