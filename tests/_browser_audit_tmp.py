import json
import os
import subprocess
import tempfile
import time
import urllib.request
import websocket
import socket

chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
profile = tempfile.mkdtemp(prefix="palm-ai-audit-")
with socket.socket() as socket_guard:
    socket_guard.bind(("127.0.0.1", 0))
    debug_port = socket_guard.getsockname()[1]
proc = subprocess.Popen([
    chrome, "--headless=new", "--disable-gpu", "--no-first-run",
    f"--remote-debugging-port={debug_port}", f"--user-data-dir={profile}",
    "--window-size=1440,1000", "about:blank",
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    version = None
    for _ in range(50):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json/list", timeout=1) as response:
                targets = json.load(response)
                version = next((item for item in targets if item.get("type") == "page"), None)
                if version is None:
                    request = urllib.request.Request(f"http://127.0.0.1:{debug_port}/json/new?about:blank", method="PUT")
                    with urllib.request.urlopen(request, timeout=1) as created:
                        version = json.load(created)
            break
        except Exception:
            time.sleep(.2)
    if not version:
        raise RuntimeError("Chrome DevTools did not start")
    ws = websocket.create_connection(version["webSocketDebuggerUrl"], timeout=10, suppress_origin=True)
    seq = 0
    events = []
    def call(method, params=None):
        global seq
        seq += 1
        ident = seq
        ws.send(json.dumps({"id": ident, "method": method, "params": params or {}}))
        while True:
            packet = json.loads(ws.recv())
            if "method" in packet:
                events.append(packet)
            if packet.get("id") == ident:
                if "error" in packet:
                    raise RuntimeError(packet["error"])
                return packet
    def evaluate(expression, await_promise=False):
        result = call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": await_promise})
        if "exceptionDetails" in result.get("result", {}):
            raise RuntimeError(result["result"]["exceptionDetails"])
        return result["result"].get("result", {}).get("value")
    call("Page.enable")
    call("Runtime.enable")
    call("Log.enable")
    nav_result = call("Page.navigate", {"url": "http://127.0.0.1:5174/"})
    for _ in range(60):
        loaded = evaluate("document.querySelectorAll('.navigation button').length === 5 && !document.body.innerText.includes('Connecting…') && document.querySelectorAll('tbody tr').length >= 12")
        if loaded: break
        time.sleep(.5)
    report = {"target": {"url": version.get("url"), "type": version.get("type")}, "navigate": nav_result, "loaded": bool(loaded), "location": evaluate("({href:location.href,ready:document.readyState,title:document.title})"), "initial": evaluate("({title:document.title, blocks:document.querySelectorAll('tbody tr').length, body:document.body.innerText.slice(0,400)})")}
    report["proxy"] = json.loads(urllib.request.urlopen("http://127.0.0.1:5174/api/health").read())
    report["nav"] = evaluate("(async()=>{let out=[];for(const [id,label] of [['risk-analysis','Risk Analysis'],['block-diagnostics','Block Diagnostics'],['weather-impact','Weather Impact'],['productivity','Productivity']]){let b=[...document.querySelectorAll('.navigation button')].find(x=>x.innerText.includes(label));b?.click();await new Promise(r=>setTimeout(r,250));out.push({id,hash:location.hash,active:document.querySelector('.navigation button[aria-current=page]')?.innerText,content:document.querySelector('main')?.innerText.slice(0,170)})}return out})()", True)
    report["riskFilter"] = evaluate("(async()=>{location.hash='#risk-analysis';await new Promise(r=>setTimeout(r,600));let s=document.querySelector('input[aria-label=\"Search by block ID\"]');if(!s)return {found:false};let setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(s,'B012');s.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,100));return {found:true,rows:document.querySelectorAll('tbody tr').length,text:document.querySelector('tbody')?.innerText.slice(0,150)}})()", True)
    evaluate("document.querySelector('.navigation button:nth-of-type(3)').click()")
    time.sleep(.7)
    report["diagnostics"] = evaluate("(()=>{let q=document.querySelector('input[aria-label=\"Filter blocks\"]');if(q){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(q,'');q.dispatchEvent(new Event('input',{bubbles:true}))}let s=document.querySelector('.selector-controls select');if(s){Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'B008');s.dispatchEvent(new Event('change',{bubbles:true}))}return {block:s?.value}})()")
    time.sleep(.4)
    report["diagnostics"]["after"] = evaluate("document.querySelector('main')?.innerText.slice(200,550)")
    evaluate("document.querySelector('.navigation button:nth-of-type(5)').click()")
    time.sleep(.7)
    evaluate("[...document.querySelectorAll('[role=tab]')].find(x=>x.innerText.includes('Data & model'))?.click()")
    time.sleep(.25)
    report["productivity"] = evaluate("({tabs:document.querySelectorAll('[role=tab]').length,selected:document.querySelector('[role=tab][aria-selected=true]')?.innerText,body:document.querySelector('main')?.innerText.slice(-500)})")
    evaluate("[...document.querySelectorAll('[role=tab]')].find(x=>x.innerText.includes('Yield forecast'))?.click()")
    time.sleep(.25)
    evaluate("[...document.querySelectorAll('.year-pill-toggle button')].find(x=>x.innerText==='2026')?.click()")
    time.sleep(.25)
    report["modelForecast"] = evaluate("(()=>{let year=[...document.querySelectorAll('.year-pill-toggle button')].find(x=>x.innerText==='2026');return {year:year?.innerText,yearActive:year?.getAttribute('aria-pressed'),basis:document.querySelector('.method-note')?.innerText,hasUnsupportedRange:/Low estimate|High estimate/.test(document.querySelector('main')?.innerText),table:document.querySelector('.monthly-output-table')?.innerText.slice(0,160)}})()")
    call("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
    report["mobile"] = evaluate("({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,menu:!!document.querySelector('[aria-label=\"Open navigation\"]'),overflow:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:String(e.className?.baseVal||e.className||''),left:Math.round(e.getBoundingClientRect().left),right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width)})).filter(x=>x.right>392&&x.width>30).slice(0,12)})")
    call("Page.reload")
    time.sleep(3)
    report["refresh"] = evaluate("({loaded:document.querySelectorAll('.navigation button').length===5,hash:location.hash})")
    report["errors"] = [e.get("params",{}).get("message", e.get("params",{}).get("exceptionDetails",{}).get("text")) for e in events if e.get("method") in ["Log.entryAdded","Runtime.exceptionThrown"] and e.get("params",{}).get("entry",{}).get("level") == "error"]
    print(json.dumps(report, indent=2, default=str))
    ws.close()
finally:
    proc.terminate()
