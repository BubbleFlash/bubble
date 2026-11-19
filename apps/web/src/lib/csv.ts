type Cell = string | number | boolean | null | undefined;

export function csvText(headers: string[], rows: Cell[][]) {
  const cell = (value: Cell) => {
    const text = String(value ?? "");
    const safe =
      typeof value === "string" && /^[\s\p{Cc}]*[=+\-@]/u.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadCsv(name: string, headers: string[], rows: Cell[][]) {
  const url = URL.createObjectURL(
    new Blob([csvText(headers, rows)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `bubble-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
