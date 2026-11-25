#!/usr/bin/env python3
"""Calculate the expectation for this turn from the chain fixtures."""
from pathlib import Path
import runpy

if __name__ == '__main__':
    folder = Path(__file__).resolve().parent
    runpy.run_path(str(folder.parent / 'g2' / 'oracle.py'))['main'](folder.name)
