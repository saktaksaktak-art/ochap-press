#!/usr/bin/env python3
"""Add two-reporter UI to an already-produced OchaP newspaper HTML.

Preserves the original newspaper bytes except for two resource tags in <head>.
Never touches the source file. Usage:
  python scripts/prepare_newspaper.py /path/to/original.html /path/to/index.html
"""
from pathlib import Path
import sys

MARKER = '<script defer src="./assets/gemi-reporter.js"></script>'
STYLES = '<link rel="stylesheet" href="./assets/gemi-reporter.css">'

def run(src: Path, dst: Path):
    raw = src.read_bytes()
    if b'</head>' not in raw:
        raise ValueError('Original newspaper does not contain </head>')
    if raw.count(b'<article ') == 0:
        raise ValueError('No newspaper race articles found')
    if MARKER.encode() not in raw:
        raw = raw.replace(b'</head>', (STYLES + MARKER + '</head>').encode(), 1)
    if src.resolve() == dst.resolve():
        raise ValueError('Cannot replace source newspaper in place')
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(raw)
    print(f'Wrote {dst}: {len(raw)} bytes. Source unchanged: {src}')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: prepare_newspaper.py SOURCE_HTML OUTPUT_INDEX_HTML')
    run(Path(sys.argv[1]), Path(sys.argv[2]))
