import { Fragment, useMemo } from "react";
import data from "@emoji-mart/data/sets/15/twitter.json";
import type { EmojiMartData } from "@emoji-mart/data";
import emojiSheet from "emoji-datasource-twitter/img/twitter/sheets-clean/20.png";

const emojiData: EmojiMartData = data;
const positions = new Map<string, string>();
for (const emoji of Object.values(emojiData.emojis)) {
  for (const skin of emoji.skins) {
    if (skin.x === undefined || skin.y === undefined) continue;
    const position = `${skin.x / (emojiData.sheet.cols - 1) * 100}% ${skin.y / (emojiData.sheet.rows - 1) * 100}%`;
    positions.set(skin.native.replaceAll("\ufe0f", ""), position);
  }
}

const Segmenter = (Intl as unknown as {
  Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => {
    segment: (text: string) => Iterable<{ segment: string }>;
  };
}).Segmenter;
const segmenter = Segmenter ? new Segmenter(undefined, { granularity: "grapheme" }) : undefined;

export default function EmojiText({ text, measureFont }: { text: string; measureFont?: string }) {
  const measure = useMemo(() => {
    if (!measureFont) return undefined;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return undefined;
    context.font = measureFont;
    const widths = new Map<string, number>();
    return (segment: string) => {
      let width = widths.get(segment);
      if (width === undefined) {
        width = context.measureText(segment).width;
        widths.set(segment, width);
      }
      return width;
    };
  }, [measureFont]);
  const segments = segmenter ? Array.from(segmenter.segment(text), (item) => item.segment) : Array.from(text);
  return <>{segments.map((segment, index) => {
    const position = positions.get(segment.replaceAll("\ufe0f", ""));
    if (!position) return <Fragment key={index}>{segment}</Fragment>;
    const glyph = <span className="emoji-glyph"
      style={{ backgroundImage: `url(${emojiSheet})`, backgroundPosition: position }}>{segment}</span>;
    return measure ? <span key={index} className="emoji-glyph-cell" style={{ width: measure(segment) }}>{glyph}</span>
      : <Fragment key={index}>{glyph}</Fragment>;
  })}</>;
}
