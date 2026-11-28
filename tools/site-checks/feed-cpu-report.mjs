/* eslint no-console: "off" */
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

for (const dir of process.argv.slice(2)) {
  const maps = new Map();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".cpuprofile"))) {
    const data = JSON.parse(readFileSync(join(dir, file)));
    const nodes = new Map(data.nodes.map((n) => [n.id, n]));
    const parents = new Map();
    for (const n of data.nodes) for (const id of n.children ?? []) parents.set(id, n.id);
    const labels = new Map();
    function label(id) {
      if (labels.has(id)) return labels.get(id);
      const f = nodes.get(id).callFrame;
      let name = f.functionName || "(anonymous)";
      if (f.url.includes("/assets/") && f.lineNumber >= 0) {
        const path = join(
          dir,
          "build",
          file.includes("-window-") ? "window" : "control",
          "assets",
          basename(f.url) + ".map",
        );
        if (!maps.has(path)) maps.set(path, new TraceMap(JSON.parse(readFileSync(path))));
        const original = originalPositionFor(maps.get(path), {
          line: f.lineNumber + 1,
          column: f.columnNumber,
        });
        if (original.source)
          name = original.source + ":" + original.line + " " + (original.name ?? name);
      }
      labels.set(id, name);
      return name;
    }
    const inclusive = new Map();
    for (let i = 0; i < data.samples.length; i++) {
      const stack = new Set();
      for (let id = data.samples[i]; id; id = parents.get(id)) stack.add(label(id));
      for (const name of stack)
        inclusive.set(name, (inclusive.get(name) ?? 0) + data.timeDeltas[i] / 1000);
    }
    console.log(
      file,
      [...inclusive]
        .filter(([name]) => name.includes("/src/"))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, n]) => [name, Math.round(n)]),
    );
  }
}
