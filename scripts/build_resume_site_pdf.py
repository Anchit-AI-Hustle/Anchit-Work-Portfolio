#!/usr/bin/env python3
"""Render the approved two-page public resume on macOS (also used by CI).

The checked-in PDF is served directly; ordinary website builds do not render it.
Edit scripts/resume/content.json and render.swift, then run this script on macOS.
Keep assets/resume.html in sync as the editable browser version.
"""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
if sys.platform != 'darwin':
    raise SystemExit('Resume rendering requires macOS AppKit/PDFKit. Use the Publish final resume PDF workflow on other systems.')
cache = Path(tempfile.gettempdir()) / 'portfolio-resume-swift-cache'
subprocess.run(['swift', '-module-cache-path', str(cache), str(root / 'scripts/resume/render.swift'), str(root)], check=True)
