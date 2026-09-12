"""Set the release version everywhere it lives, in one step.

    python tools/bump_version.py 0.1.0rc1      # a rehearsal: TestPyPI when tagged v0.1.0rc1
    python tools/bump_version.py 0.1.0         # the release: PyPI when tagged v0.1.0

Touches lattix_view/_version.py, CITATION.cff (version and date), CHANGELOG.md (the Unreleased
section becomes the base version's section, dated today) and the README's image links (pinned to
the tag so a PyPI page keeps the images of its release).  The version must be canonical PEP 440.
"""
from __future__ import annotations

import datetime as dt
import re
import sys
from pathlib import Path

from packaging.version import Version

ROOT = Path(__file__).resolve().parents[1]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    v = argv[1]
    parsed = Version(v)
    if str(parsed) != v:
        print(f"{v!r} is not canonical PEP 440; use {str(parsed)!r}")
        return 2
    base = parsed.base_version
    today = dt.date.today().isoformat()
    tag = f"v{v}"

    (ROOT / "lattix_view" / "_version.py").write_text(f'__version__ = "{v}"\nDIST_NAME = "lattix-view"\n')

    cff = (ROOT / "CITATION.cff").read_text()
    cff = re.sub(r"^version:\s*\S+", f"version: {v}", cff, count=1, flags=re.M)
    cff = re.sub(r"^date-released:\s*\S+", f"date-released: {today}", cff, count=1, flags=re.M)
    (ROOT / "CITATION.cff").write_text(cff)

    log = (ROOT / "CHANGELOG.md").read_text()
    if f"## [{base}]" in log:
        log = re.sub(rf"^## \[{re.escape(base)}\].*$", f"## [{base}] - {today}", log, count=1, flags=re.M)
    else:
        log = log.replace("## [Unreleased]\n", f"## [Unreleased]\n\n## [{base}] - {today}\n", 1)
    (ROOT / "CHANGELOG.md").write_text(log)

    readme = (ROOT / "README.md").read_text()
    readme = re.sub(r"(raw\.githubusercontent\.com/Accel-Toolkit/lattix-view/)[^/]+(/docs/img/)",
                    rf"\g<1>{tag}\g<2>", readme)
    (ROOT / "README.md").write_text(readme)
    print(f"version {v} (changelog section {base}, dated {today}, README images pinned to {tag})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
