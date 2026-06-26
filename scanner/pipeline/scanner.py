
import subprocess
import sys
import os
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent.parent

def scan(symbol,timeframe):

    env=os.environ.copy()

    env["ICT_SYMBOL"]=symbol
    env["ICT_TIMEFRAME"]=timeframe
    env["ICT_EXCHANGE"]="NSE"

    run=subprocess.run(
        [
            sys.executable,
            str(ROOT/"scanner/run_phase14_pine_scanner.py")
        ],
        cwd=str(ROOT),
        env=env
    )

    return run.returncode==0
