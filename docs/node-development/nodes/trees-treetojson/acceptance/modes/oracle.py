#!/usr/bin/env python3
"""Independent stage-0 proposal entrypoint; never a model input."""
import runpy
import sys
from pathlib import Path
source = Path(__file__).resolve().parents[3] / 'trees-datatotree/acceptance/modes/oracle.py'
sys.argv = [str(source), '--node', 'trees-treetojson', *sys.argv[1:]]
runpy.run_path(str(source), run_name='__main__')
