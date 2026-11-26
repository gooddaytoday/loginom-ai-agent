#!/usr/bin/env python3
from pathlib import Path
import runpy

if __name__ == '__main__':
    folder = Path(__file__).resolve().parent
    runpy.run_path(str(folder.parent / 'file-chains' / 'oracle.py'))['main'](folder)
