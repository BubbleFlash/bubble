"""Audit CDP timestamps and the actual colour of the carousel in Chromium trace screenshots."""
import base64
import gzip
import io
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageStat


def quant(values):
    values = sorted(values)
    return [len(values)] + [round(values[math.ceil(q*len(values))-1], 1) if values else None
                            for q in (.5, .95, 1)]


def intervals(values):
    xs = sorted(set(values))
    return [(b-a)/1000 for a,b in zip(xs, xs[1:])]


def media_phase(events, run, marker, end, slide, film):
    origin = marker["ts"] - 1000*marker["args"]["data"]["startTime"]
    click = slide["click"]["time"]
    start = origin + click*1000
    relevant = [e for e in events if start-2000 <= e["ts"] < end]
    timing = next((e["args"]["data"] for e in relevant if e["name"] == "EventTiming"
                   and e["args"].get("data", {}).get("type") == "click"), {})
    out = {"clickToReadyPoll": round(slide["ready"]-click, 1), "loaded":slide["click"]["loaded"],
           "eventTiming":{k:round(timing[k]-click,1) for k in ("processingStart","processingEnd",
                        "enqueuedToMainThreadTime","commitFinishTime") if k in timing}}
    out["eventTiming"]["durationMs"] = timing.get("duration")
    box = slide["imageBox"]
    index = int(slide["path"].split("-")[-1].split(".")[0])
    # Images 0/1/2 have red/green/blue dominant channels. Sample the shared top part
    # (different aspect ratios) away from counter/arrows. Exclude neutral UI colours.
    frames = []
    samples = [(e["ts"],e["args"]["snapshot"]) for e in relevant if e["name"]=="Screenshot"]
    if film:
        samples = [(f["metadata"]["monotonicTimestamp"]*1e6,f["data"]) for f in film
                   if start-160000 <= f["metadata"]["monotonicTimestamp"]*1e6 <= end]
    for ts, jpeg in samples:
        img = Image.open(io.BytesIO(base64.b64decode(jpeg))).convert("RGB")
        scale = img.width/run["viewport"]["width"]
        x = int((box["x"]+box["width"]*.45)*scale)
        y = int((box["y"]+min(55,box["height"]*.3))*scale)
        rgb = ImageStat.Stat(img.crop((x-3,y-3,x+4,y+4))).mean
        channels = sorted(range(3),key=rgb.__getitem__,reverse=True)
        frames.append([round((ts-start)/1000,1), channels[0] if rgb[channels[0]]-rgb[channels[1]]>12 else None])
    first = next((i for i,f in enumerate(frames) if f[1]==index),None)
    out["screenshots"] = frames
    out["firstTargetSampleMs"] = frames[first][0] if first is not None else None
    out["previousSampleMs"] = frames[first-1][0] if first else None
    out["marks"] = [[e["name"],round((e["ts"]-start)/1000,1)] for e in relevant if e["name"].startswith("gallery:")]
    res = slide["resources"][-1] if slide["resources"] else {}
    out["transfer"] = {k:res.get(k) for k in ("transferSize","encodedBodySize","startTime","requestStart","responseStart","responseEnd")}
    out["operations"] = [[e["name"],round((e["ts"]-start)/1000,1),round(e["dur"]/1000,1)]
                         for e in relevant if e.get("dur",0)>=1000 and e["name"] in
                         {"ImageDecodeTask","GpuImageDecodeCache::DecodeImage","Layout","UpdateLayoutTree","Paint",
                          "RasterTask","Commit","Display::DrawAndSwap","MinorGC","MajorGC"}]
    return out


def scroll_phase(events, begin, end):
    selected = [e for e in events if begin["ts"]<=e["ts"]<=end]
    renderer = [e for e in selected if e["pid"]==begin["pid"]]
    moved = sorted(set(e["ts"] for e in renderer if e["name"]=="PresentedFrameInformation"
                        and e["args"].get("scroll_deltas",{}).get("original_delta_in_gpu_frame_y")))
    gaps = sorted(zip(moved,moved[1:]),key=lambda p:p[1]-p[0], reverse=True)
    ops = ("FunctionCall","EventDispatch","Layout","UpdateLayoutTree","PrePaint","Paint","RasterTask",
           "GpuImageDecodeCache::DecodeImage","Commit","MinorGC","MajorGC","ProxyMain::BeginMainFrame",
           "GpuChannel::ExecuteDeferredRequest","Display::DrawAndSwap","Scheduler::RunTask")
    stats = {}
    for name in ops:
        spans = [e["dur"]/1000 for e in selected if e["name"]==name and "dur" in e]
        if spans: stats[name] = [len(spans),round(sum(spans),1),round(max(spans),1)]
    gap = {}
    if gaps:
        a,b = gaps[0]
        overlap = [(min(b,e["ts"]+e.get("dur",0))-max(a,e["ts"]),e) for e in selected
                   if e["name"] in ops and "dur" in e]
        gap = {"ms":round((b-a)/1000,1),
               "longestOverlaps":[[e["name"],round(t/1000,1),e["tid"]] for t,e in
                                 sorted(overlap,key=lambda x:-x[0])[:8] if t>0]}
    return {"movedIntervals":quant(intervals(moved)), "workCountTotalMaxMs":stats, "largestGap":gap}


def audit(directory):
    result = {}
    for path in sorted(directory.glob("*-[0-9].json")):
        run = json.loads(path.read_bytes())
        phases = {}
        traces = run.get("depths") or [{"traceFile":run["traceFile"]}]
        for depth in traces:
            if "traceFile" not in depth: continue
            events = json.load(gzip.open(directory/depth["traceFile"]))["traceEvents"]
            filmfile = directory/depth["traceFile"].replace(".trace.json.gz",".filmstrip.json")
            film = json.loads(filmfile.read_bytes()) if filmfile.exists() else []
            ends = {e["name"][11:]:e["ts"] for e in events if e["name"].startswith("bubble:end:")}
            for begin in (e for e in events if e["name"].startswith("bubble:start:")):
                name = begin["name"][13:]
                if name.startswith("media-"):
                    slide = next(s for s in depth["windows"]["media"] if "media-"+s["label"]==name)
                    row = media_phase(events,run,begin,ends[name],slide,film)
                else:
                    row = scroll_phase(events,begin,ends[name])
                phases[str(depth.get("depth",20))+"/"+name] = row
        if "rows" in run.get("data",{}):
            data = run["data"]
            for row in data["rows"]:
                name = row["name"]
                phase = phases.setdefault("20/"+name,{})
                phase["rafIntervals"] = quant(data["frames"][name])
                phase["scrollEvents"] = quant(intervals(e[2]*1000 for e in data["events"] if e[:2]==[name,"scroll"]))
                phase["distance"] = round(row["end"]-row["start"])
                phase["rowMutations"] = sum(1 for e in data["mounts"] if e[0]==name)
        result[path.stem] = phases
    (directory/"audit.json").write_text(json.dumps(result,indent=2))


if __name__ == "__main__":
    for directory in sys.argv[1:]:
        audit(Path(directory))
