
from pathlib import Path
import argparse,json,time,subprocess,sys
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor,as_completed

from pipeline.exporter import export
from pipeline.validator import exported_file
from pipeline.scanner import scan
from pipeline.merger import get_row

ROOT=Path(__file__).resolve().parent.parent
UNIVERSE=ROOT/"scanner/universe/nse_symbols.json"
OUTPUT=ROOT/"public/data/scanner_daily.json"
CHECKPOINT=ROOT/"public/data/checkpoint.json"

def load(limit):
    data=json.loads(UNIVERSE.read_text())
    return [str(x).strip().upper() for x in data["symbols"]][:limit]

def worker(symbol,timeframe,retries):
    for i in range(retries+1):
        if export(symbol,timeframe):
            ok,_=exported_file(symbol,timeframe)
            if ok and scan(symbol,timeframe):
                row=get_row(symbol)
                if row:return symbol,row
    return symbol,None

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--limit",type=int,default=10)
    p.add_argument("--timeframe",default="1D")
    p.add_argument("--workers",type=int,default=4)
    p.add_argument("--resume",action="store_true")
    p.add_argument("--retries",type=int,default=2)
    a=p.parse_args()
    symbols=load(a.limit)
    done=set()
    rows=[]
    if a.resume and CHECKPOINT.exists():
        try: done=set(json.loads(CHECKPOINT.read_text())["done"])
        except: pass
    pending=[s for s in symbols if s not in done]
    start=time.time()
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        fut={ex.submit(worker,s,a.timeframe,a.retries):s for s in pending}
        total=len(symbols)
        complete=len(done)
        for f in as_completed(fut):
            sym,row=f.result()
            complete+=1
            if row:
                rows.append(row)
                done.add(sym)
                CHECKPOINT.write_text(json.dumps({"done":sorted(done)},indent=2))
            eta=((time.time()-start)/max(1,complete))*(total-complete)
            print(f"[{complete}/{total}] {sym} ETA:{eta:.0f}s")
    OUTPUT.write_text(json.dumps({"generated_at":datetime.now(timezone.utc).isoformat(),"timeframe":a.timeframe,"results":rows},indent=2))
    subprocess.run([sys.executable,str(ROOT/"scanner/export_chunked_scanner.py"),"--input",str(OUTPUT),"--timeframe",a.timeframe,"--page-size","50"],cwd=str(ROOT))
    print("DONE",len(rows))
if __name__=="__main__":
    main()
