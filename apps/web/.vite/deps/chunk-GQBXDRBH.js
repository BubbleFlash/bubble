import {
  getBit
} from "./chunk-O76RKEBI.js";
import {
  INT8,
  StringType,
  UINT8
} from "./chunk-3HBPJLK7.js";

// ../../node_modules/music-metadata/lib/tokens/id3v2.js
var AttachedPictureType = {
  0: "Other",
  1: "32x32 pixels 'file icon' (PNG only)",
  2: "Other file icon",
  3: "Cover (front)",
  4: "Cover (back)",
  5: "Leaflet page",
  6: "Media (e.g. label side of CD)",
  7: "Lead artist/lead performer/soloist",
  8: "Artist/performer",
  9: "Conductor",
  10: "Band/Orchestra",
  11: "Composer",
  12: "Lyricist/text writer",
  13: "Recording Location",
  14: "During recording",
  15: "During performance",
  16: "Movie/video screen capture",
  17: "A bright coloured fish",
  18: "Illustration",
  19: "Band/artist logotype",
  20: "Publisher/Studio logotype"
};
var attachedPictureTypes = AttachedPictureType;
function attachedPictureType(typeId) {
  return attachedPictureTypes[typeId];
}
function ensureAvailable(buffer, offset, length) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new RangeError(`Cannot read ${length} byte(s) at offset ${offset} from a ${buffer.length}-byte buffer`);
  }
}
var UINT32SYNCSAFE = {
  len: 4,
  get(buffer, offset) {
    ensureAvailable(buffer, offset, UINT32SYNCSAFE.len);
    return buffer[offset + 3] & 127 | buffer[offset + 2] << 7 | buffer[offset + 1] << 14 | buffer[offset] << 21;
  },
  put(buffer, offset, value) {
    ensureAvailable(buffer, offset, UINT32SYNCSAFE.len);
    if (!Number.isSafeInteger(value) || value < 0 || value > 268435455) {
      throw new RangeError(`Sync-safe integer must be between 0 and ${268435455}, got ${value}`);
    }
    buffer[offset] = value >>> 21 & 127;
    buffer[offset + 1] = value >>> 14 & 127;
    buffer[offset + 2] = value >>> 7 & 127;
    buffer[offset + 3] = value & 127;
    return offset + UINT32SYNCSAFE.len;
  }
};

// ../../node_modules/music-metadata/lib/id3v2/ID3v2Token.js
var LyricsContentType = {
  other: 0,
  lyrics: 1,
  text: 2,
  movement_part: 3,
  events: 4,
  chord: 5,
  trivia_pop: 6
};
var TimestampFormat = {
  notSynchronized: 0,
  mpegFrameNumber: 1,
  milliseconds: 2
};
var ID3v2Header = {
  len: 10,
  get: (buf, off) => {
    return {
      // ID3v2/file identifier   "ID3"
      fileIdentifier: new StringType(3, "ascii").get(buf, off),
      // ID3v2 versionIndex
      version: {
        major: INT8.get(buf, off + 3),
        revision: INT8.get(buf, off + 4)
      },
      // ID3v2 flags
      flags: {
        // Unsynchronisation
        unsynchronisation: getBit(buf, off + 5, 7),
        // Extended header
        isExtendedHeader: getBit(buf, off + 5, 6),
        // Experimental indicator
        expIndicator: getBit(buf, off + 5, 5),
        footer: getBit(buf, off + 5, 4)
      },
      size: UINT32SYNCSAFE.get(buf, off + 6)
    };
  }
};
var TextEncodingToken = {
  len: 1,
  get: (uint8Array, off) => {
    switch (uint8Array[off]) {
      case 0:
        return { encoding: "latin1" };
      // binary
      case 1:
        return { encoding: "utf-16le", bom: true };
      case 2:
        return { encoding: "utf-16be", bom: false };
      case 3:
        return { encoding: "utf8", bom: false };
      default:
        return { encoding: "utf8", bom: false };
    }
  }
};
var TextHeader = {
  len: 4,
  get: (uint8Array, off) => {
    return {
      encoding: TextEncodingToken.get(uint8Array, off),
      language: new StringType(3, "latin1").get(uint8Array, off + 1)
    };
  }
};
var SyncTextHeader = {
  len: 6,
  get: (uint8Array, off) => {
    const text = TextHeader.get(uint8Array, off);
    return {
      encoding: text.encoding,
      language: text.language,
      timeStampFormat: UINT8.get(uint8Array, off + 4),
      contentType: UINT8.get(uint8Array, off + 5)
    };
  }
};

export {
  AttachedPictureType,
  attachedPictureType,
  UINT32SYNCSAFE,
  LyricsContentType,
  TimestampFormat,
  ID3v2Header,
  TextEncodingToken,
  TextHeader,
  SyncTextHeader
};
//# sourceMappingURL=chunk-GQBXDRBH.js.map
