
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent.parent

def exported_file(symbol,timeframe):

    f=ROOT/"public/data"/f"NSE_{symbol}_{timeframe}.json"

    return f.exists(),f
