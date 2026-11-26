"""Exercise all positive/negative stop boundaries using real loopback HTTP."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

from provider import ADV, ADVICE, END, PROMPT, READY, STOP

base = Path(__file__).resolve().parent
tools = [{"type":"function","function":{"name":name}} for name in [
    "skill","loginom_dock_prepare","loginom_dock_action_run","loginom_dock_browser_recovery","loginom_browser_snapshot"]]
with tempfile.TemporaryDirectory() as tmp:
    for case in ("no_next", "good", "stale_and_foreign", "repeated"):
        out = Path(tmp) / case
        process = subprocess.Popen([sys.executable, str(base / "provider.py"), "--out", str(out), "--port", "0"], stdout=subprocess.PIPE, text=True)
        try:
            port = int(process.stdout.readline())
            def post(messages):
                payload = json.dumps({"model":"mechanics","messages":messages,"tools":tools,"stream":True}).encode()
                req = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", data=payload, headers={"Authorization":"Bearer s5-local-fixture-only","Content-Type":"application/json"})
                with urllib.request.urlopen(req,timeout=3) as resp:
                    rows = resp.read().decode().splitlines()
                    assert rows[-2]=="data: [DONE]" and resp.status==200
                    return json.loads(rows[0].removeprefix("data: "))["choices"][0]["delta"]
            assert post([{"role":"user","content":READY}])["content"]=="READY"
            history = [{"role":"user","content":PROMPT+" `/test/eval-controlled-example-s5-new-package-1.lgp`."}]
            op = None
            for expected in ("skill","loginom_dock_prepare","loginom_dock_action_run","loginom_dock_browser_recovery","loginom_dock_browser_recovery"):
                call = post(history)["tool_calls"][0]
                assert call["function"]["name"]==expected
                if expected=="loginom_dock_action_run": op=json.loads(call["function"]["arguments"])["operation_id"]
                history.extend([{"role":"assistant","content":None,"tool_calls":[call]}, {"role":"tool","tool_call_id":call["id"],"content":"controlled fixture result"}])
            assert post(history)["content"]==STOP
            history.append({"role":"assistant","content":STOP})
            reminder = ADV+op+ADVICE
            if case=="good":
                history.append({"role":"user","content":reminder})
                for expected in ("loginom_browser_snapshot","loginom_dock_browser_recovery"):
                    call = post(history)["tool_calls"][0]
                    assert call["function"]["name"]==expected
                    history.extend([{"role":"assistant","content":None,"tool_calls":[call]}, {"role":"tool","tool_call_id":call["id"],"content":"ok"}])
                assert post(history)["content"]==END
            elif case in ("stale_and_foreign","repeated"):
                if case=="stale_and_foreign": history.insert(-1,{"role":"user","content":reminder})
                history.append({"role":"user","content":(ADV+"other"+ADVICE if case=="stale_and_foreign" else reminder+"\n"+reminder)})
                assert "no single matching" in post(history)["content"]
            rows = [json.loads(s) for s in out.read_text().splitlines()]
            assert sum(x.get("ordinary_stop", False) for x in rows)==1
            nexts = [x for x in rows if x.get("next_post")]
            assert len(nexts)==(case!="no_next")
            if nexts: assert (nexts[0]["current_reminders"],nexts[0]["other_or_malformed_reminders"])=={"good":(1,0),"stale_and_foreign":(0,1),"repeated":(2,0)}[case]
            print(case,"pass",len(rows),"observed POSTs")
        finally:
            process.terminate()
            process.wait(timeout=3)
