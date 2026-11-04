#!/usr/bin/env python3
"""JSON round-trip entrypoint for the shared independent tree oracle."""
import runpy
import sys
from pathlib import Path
source = Path(__file__).resolve().parents[2] / 'trees-datatotree/acceptance/oracle.py'
sys.argv = [str(source), '--scenario', 'json', *sys.argv[1:]]
runpy.run_path(str(source), run_name='__main__')
