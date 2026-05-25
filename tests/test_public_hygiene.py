import os
import subprocess
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

    def test_failure_output_redacts_forbidden_pattern_value(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "README.md"
            secret = "SpecificPrivateSourceName"
            doc.write_text(f"this names {secret}\n", encoding="utf-8")
            stderr = StringIO()

            with redirect_stdout(StringIO()), redirect_stderr(stderr):
                exit_code = public_hygiene.main(
                    ["--root", os.fspath(root), os.fspath(doc)],
                    env={"PUBLIC_HYGIENE_FORBIDDEN_PATTERNS": secret},
                )

        self.assertEqual(exit_code, 1)
        self.assertNotIn(secret, stderr.getvalue())
        self.assertIn("env rule #1", stderr.getvalue())

    def test_file_paths_are_scanned_and_redacted_in_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            secret = "PathOnlyPrivateSourceName"
            doc = root / "docs" / f"{secret}-notes.md"
            doc.parent.mkdir()
            doc.write_text("clean content\n", encoding="utf-8")
            stderr = StringIO()

            rules = public_hygiene.load_rules([], env_value=secret)
            findings = public_hygiene.scan_paths(root, [doc], rules)

            with redirect_stdout(StringIO()), redirect_stderr(stderr):
                exit_code = public_hygiene.main(
                    ["--root", os.fspath(root), "--no-commit-messages", os.fspath(doc)],
                    env={"PUBLIC_HYGIENE_FORBIDDEN_PATTERNS": secret},
                )

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].area, "path")
        self.assertEqual(exit_code, 1)
        self.assertNotIn(secret, stderr.getvalue())
        self.assertNotIn(os.fspath(doc.relative_to(root)), stderr.getvalue())
        self.assertIn("file #1:path", stderr.getvalue())

    def test_commit_messages_are_scanned_without_echoing_secret(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _run_git(root, "init")
            _run_git(root, "config", "user.email", "agent@example.com")
            _run_git(root, "config", "user.name", "Agent")
            (root / "README.md").write_text("clean tracked file\n", encoding="utf-8")
            _run_git(root, "add", "README.md")
            secret = "CommitOnlyPrivateSourceName"
            _run_git(root, "commit", "-m", f"mention {secret}")

            stderr = StringIO()
            with redirect_stdout(StringIO()), redirect_stderr(stderr):
                exit_code = public_hygiene.main(
                    ["--root", os.fspath(root), "--commit-range", "HEAD"],
                    env={"PUBLIC_HYGIENE_FORBIDDEN_PATTERNS": secret},
                )

        self.assertEqual(exit_code, 1)
        self.assertNotIn(secret, stderr.getvalue())
        self.assertIn("commit", stderr.getvalue())

    def test_require_rules_fails_closed_when_no_rules_are_loaded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "README.md"
            doc.write_text("clean\n", encoding="utf-8")
            stderr = StringIO()

            with redirect_stdout(StringIO()), redirect_stderr(stderr):
                exit_code = public_hygiene.main(["--root", os.fspath(root), "--require-rules", os.fspath(doc)])

        self.assertEqual(exit_code, 2)
        self.assertIn("no forbidden patterns were loaded", stderr.getvalue())

    def test_require_env_rules_ignores_public_file_rules(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "README.md"
            doc.write_text("clean\n", encoding="utf-8")
            public_rules = root / "public-rules.txt"
            public_rules.write_text("NonSensitivePublicRule\n", encoding="utf-8")
            stderr = StringIO()

            with redirect_stdout(StringIO()), redirect_stderr(stderr):
                exit_code = public_hygiene.main(
                    [
                        "--root",
                        os.fspath(root),
                        "--patterns-file",
                        os.fspath(public_rules),
                        "--require-env-rules",
                        "--no-commit-messages",
                        os.fspath(doc),
                    ],
                    env={},
                )

        self.assertEqual(exit_code, 2)
        self.assertIn("no env forbidden patterns were loaded", stderr.getvalue())

    def test_require_commit_range_fails_closed_when_commit_scan_cannot_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            doc = root / "README.md"
            doc.write_text("clean\n", encoding="utf-8")
            stderr = StringIO()

            with redirect_stdout(StringIO()), redirect_stderr(stderr):
                exit_code = public_hygiene.main(
                    [
                        "--root",
                        os.fspath(root),
                        "--commit-range",
                        "HEAD",
                        "--require-commit-range",
                        os.fspath(doc),
                    ],
                    env={"PUBLIC_HYGIENE_FORBIDDEN_PATTERNS": "NoMatchPrivateName"},
                )

        self.assertEqual(exit_code, 2)
        self.assertIn("commit messages could not be scanned", stderr.getvalue())


def _run_git(root, *args):
    subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True)
