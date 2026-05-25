import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Rule:
    source: str
    pattern: str
    index: int
    regex: bool = False

    def matches(self, text):
        if self.regex:
            return re.search(self.pattern, text) is not None
        return self.pattern in text

    def finditer(self, text):
        if self.regex:
            yield from re.finditer(self.pattern, text)
            return

        start = 0
        while True:
            index = text.find(self.pattern, start)
            if index < 0:
                return
            yield _LiteralMatch(index, index + len(self.pattern))
            start = index + max(1, len(self.pattern))

    @property
    def label(self):
        kind = "regex" if self.regex else "literal"
        return f"{self.source} rule #{self.index} ({kind})"


@dataclass(frozen=True)
class Finding:
    path: Path
    line: int
    column: int
    rule: str
    area: str = "content"
    file_index: int | None = None

    @property
    def location(self):
        if self.area == "commit":
            return f"{self.path}:{self.line}:{self.column}"
        if self.file_index is None:
            return f"file:#{self.area}:{self.line}:{self.column}"
        if self.area == "path":
            return f"file #{self.file_index}:path:{self.column}"
        return f"file #{self.file_index}:content:{self.line}:{self.column}"


class _LiteralMatch:
    def __init__(self, start, end):
        self._start = start
        self._end = end

    def start(self):
        return self._start

    def end(self):
        return self._end


class CommitMessageScanError(Exception):
    pass


def load_rules(pattern_files, env_value=""):
    rules = []
    for pattern_file in pattern_files:
        path = Path(pattern_file)
        if path.exists():
            rules.extend(_rules_from_lines(path.read_text(encoding="utf-8").splitlines(), "file"))
    rules.extend(_rules_from_lines(env_value.splitlines(), "env"))
    return rules


def scan_paths(root, paths, rules):
    root = Path(root).resolve()
    findings = []
    for file_index, path in enumerate(paths, start=1):
        absolute_path = Path(path)
        if not absolute_path.is_absolute():
            absolute_path = root / absolute_path
        if not absolute_path.is_file():
            continue
        relative_path = _relative_to(absolute_path, root)
        path_text = os.fspath(relative_path).replace("\\", "/")
        for rule in rules:
            for match in rule.finditer(path_text):
                findings.append(
                    Finding(
                        path=relative_path,
                        line=1,
                        column=match.start() + 1,
                        rule=rule.label,
                        area="path",
                        file_index=file_index,
                    )
                )
        text = _read_text(absolute_path)
        if text is None:
            continue
        for line_number, line in enumerate(text.splitlines(), start=1):
            for rule in rules:
                for match in rule.finditer(line):
                    findings.append(
                        Finding(
                            path=relative_path,
                            line=line_number,
                            column=match.start() + 1,
                            rule=rule.label,
                            area="content",
                            file_index=file_index,
                        )
                    )
    return findings


def scan_commit_messages(root, rev_range, rules, require_range=False):
    root = Path(root).resolve()
    if not rev_range:
        return []
    result = subprocess.run(
        ["git", "log", "--format=%H%x1f%B%x1e", rev_range],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        if require_range:
            raise CommitMessageScanError("commit messages could not be scanned")
        return []

    findings = []
    for record in result.stdout.split("\x1e"):
        record = record.strip()
        if not record or "\x1f" not in record:
            continue
        commit_hash, message = record.split("\x1f", 1)
        short_hash = commit_hash[:12]
        virtual_path = Path(f"commit-{short_hash}.message")
        for line_number, line in enumerate(message.splitlines(), start=1):
            for rule in rules:
                for match in rule.finditer(line):
                    findings.append(
                        Finding(
                            path=virtual_path,
                            line=line_number,
                            column=match.start() + 1,
                            rule=rule.label,
                            area="commit",
                        )
                    )
    return findings


def main(argv=None, env=None):
    parser = argparse.ArgumentParser(description="Scan public repository files for private reference traces.")
    parser.add_argument("paths", nargs="*", help="Optional file paths to scan. Defaults to git-tracked files.")
    parser.add_argument("--root", default=".", help="Repository root. Defaults to the current directory.")
    parser.add_argument(
        "--commit-range",
        default="origin/main..HEAD",
        help="Git revision range whose commit messages should be scanned. Defaults to origin/main..HEAD.",
    )
    parser.add_argument(
        "--no-commit-messages",
        action="store_true",
        help="Skip commit message scanning.",
    )
    parser.add_argument(
        "--require-commit-range",
        action="store_true",
        help="Fail closed when the selected commit range cannot be scanned.",
    )
    parser.add_argument(
        "--patterns-file",
        action="append",
        default=[],
        help="File containing newline-separated forbidden literals, or regex:... rules.",
    )
    parser.add_argument(
        "--require-rules",
        action="store_true",
        help="Fail closed when no forbidden patterns are loaded.",
    )
    parser.add_argument(
        "--require-env-rules",
        action="store_true",
        help="Fail closed when no env-injected forbidden patterns are loaded.",
    )
    args = parser.parse_args(argv)

    environ = os.environ if env is None else env
    root = Path(args.root).resolve()
    pattern_files = [
        root / ".public-hygiene" / "forbidden-patterns.txt",
        root / ".public-hygiene" / "forbidden-patterns.local.txt",
    ]
    pattern_files.extend(Path(path) for path in args.patterns_file)

    rules = load_rules(pattern_files, env_value=environ.get("PUBLIC_HYGIENE_FORBIDDEN_PATTERNS", ""))
    if args.require_rules and not rules:
        print("Public hygiene scan failed: no forbidden patterns were loaded.", file=sys.stderr)
        return 2
    if args.require_env_rules and not any(rule.source == "env" for rule in rules):
        print("Public hygiene scan failed: no env forbidden patterns were loaded.", file=sys.stderr)
        return 2

    paths = [Path(path) for path in args.paths] if args.paths else _git_tracked_files(root)
    findings = scan_paths(root, paths, rules)
    if not args.no_commit_messages:
        try:
            findings.extend(scan_commit_messages(root, args.commit_range, rules, args.require_commit_range))
        except CommitMessageScanError:
            print("Public hygiene scan failed: commit messages could not be scanned.", file=sys.stderr)
            return 2

    if findings:
        print("Public hygiene scan failed: private reference traces were found.", file=sys.stderr)
        for finding in findings:
            print(f"{finding.location}: {finding.rule}", file=sys.stderr)
        return 1

    print(f"Public hygiene scan passed: {len(paths)} file(s) checked, {len(rules)} rule(s) loaded.")
    return 0


def _rules_from_lines(lines, source):
    rules = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("regex:"):
            rules.append(Rule(source=source, pattern=stripped.removeprefix("regex:"), index=len(rules) + 1, regex=True))
        else:
            rules.append(Rule(source=source, pattern=stripped, index=len(rules) + 1, regex=False))
    return rules


def _read_text(path):
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if b"\0" in data:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def _relative_to(path, root):
    try:
        return path.resolve().relative_to(root)
    except ValueError:
        return path.resolve()


def _git_tracked_files(root):
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=root,
        check=False,
        capture_output=True,
        text=False,
    )
    if result.returncode == 0:
        return [Path(item.decode("utf-8")) for item in result.stdout.split(b"\0") if item]
    return [path.relative_to(root) for path in root.rglob("*") if path.is_file() and ".git" not in path.parts]


if __name__ == "__main__":
    raise SystemExit(main())
