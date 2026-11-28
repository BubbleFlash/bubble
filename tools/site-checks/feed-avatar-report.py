"""Join per-element intersections, CDP requests and Resource Timing in the navigation clock."""
import gzip
import json
import sys
from pathlib import Path
from urllib.parse import urlparse


def audit(directory):
    rows = []
    for path in sorted(directory.glob("*-[0-9].json")):
        run = json.loads(path.read_bytes())
        depth = run["depths"][0] if "depths" in run else {**run, **run["data"]}
        trace = json.load(gzip.open(directory/depth["traceFile"]))["traceEvents"]
        mark = next(e for e in trace if e["name"].startswith("bubble:start:"))
        origin = mark["ts"]/1000-mark["args"]["data"]["startTime"]
        requests = {}
        for e in run["network"]:
            req = requests.setdefault(e["requestId"],{})
            if e.get("url"): req["path"] = urlparse(e["url"]).path
            if e["event"] == "requestWillBeSent": req.update(start=e["timestamp"]*1000-origin,priority=e["priority"])
            if e["event"] == "responseReceived":
                req["headers"] = e["timestamp"]*1000-origin
                timing = e.get("timing") or {}
                if timing.get("sendStart",-1)>=0: req["send"] = timing["requestTime"]*1000-origin+timing["sendStart"]
            if e["event"] == "loadingFinished": req.update(end=e["timestamp"]*1000-origin,bytes=e["encodedDataLength"])
        media = [r for r in requests.values() if "/perf-media/" in r.get("path","")]
        for entry in depth["avatars"]:
            req = next((r for r in media if r["path"]==entry["path"] and "end" in r),None)
            row = {"case":path.stem,**entry}
            if req:
                pairs = {"requestMinusEntry":(req.get("start"),entry["at"]),
                         "queued":(req.get("send"),req.get("start")),
                         "ttfb":(req.get("headers"),req.get("send")),
                         "body":(req.get("end"),req.get("headers")),
                         "loadMinusEnd":(entry.get("load"),req.get("end")),
                         "loadMinusEntry":(entry.get("load"),entry["at"])}
                row.update({key:round(a-b,1) for key,(a,b) in pairs.items() if a is not None and b is not None})
                row.update(priority=req["priority"], bytes=req["bytes"], photoTransfersAtEntry=sum(
                    1 for r in media if "/photo/" in r["path"] and r.get("send",float("inf"))<entry["at"]<r.get("end",float("inf"))))
            rows.append(row)
    (directory/"avatar-audit.json").write_text(json.dumps(rows,indent=2))


if __name__ == "__main__":
    for directory in sys.argv[1:]:
        audit(Path(directory))
