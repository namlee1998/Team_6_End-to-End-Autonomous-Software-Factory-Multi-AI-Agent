from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
AGENTS_DIR = ROOT / "agents"

for path in (ROOT, AGENTS_DIR):
    value = str(path)
    if value not in sys.path:
        sys.path.insert(0, value)
