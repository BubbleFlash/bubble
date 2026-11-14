import {
  TrackType
} from "./chunk-XS2AH7GC.js";
import {
  Genres
} from "./chunk-47WSSSOY.js";
import {
  FourCcToken
} from "./chunk-E7VQDEJP.js";
import "./chunk-GQBXDRBH.js";
import {
  getBit,
  uint8ArrayToHex
} from "./chunk-O76RKEBI.js";
import {
  BasicParser,
  FieldDecodingError,
  INT16_BE,
  INT24_BE,
  INT32_BE,
  INT8,
  StringType,
  UINT16_BE,
  UINT24_BE,
  UINT32_BE,
  UINT64_BE,
  UINT8,
  Uint8ArrayType,
  createTokenizerView,
  defaultMaxChapterCount,
  getMaxChapterCount,
  getMaxMetadataEntries,
  lib_exports,
  makeUnexpectedFileContentError,
  readToken,
  textDecode,
  validateAllocation
} from "./chunk-3HBPJLK7.js";
import {
  require_browser
} from "./chunk-ZGKN2RSD.js";
import {
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/mp4/MP4Parser.js
var import_debug3 = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/mp4/Atom.js
var import_debug2 = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/mp4/AtomToken.js
var import_debug = __toESM(require_browser(), 1);
var debug = (0, import_debug.default)("music-metadata:parser:MP4:atom");
var Mp4ContentError = class extends makeUnexpectedFileContentError("MP4") {
};
var maxMp4StructureEntries = 5e6;
var Header = {
  len: 8,
  get: (buf, off) => {
    const length = UINT32_BE.get(buf, off);
    if (length < 0) {
      throw new Mp4ContentError("Invalid atom header length");
    }
    return {
      length: BigInt(length),
      name: new StringType(4, "latin1").get(buf, off + 4)
    };
  },
  put: (buf, off, hdr) => {
    UINT32_BE.put(buf, off, Number(hdr.length));
    return FourCcToken.put(buf, off + 4, hdr.name);
  }
};
var ExtendedSize = UINT64_BE;
var ftyp = {
  len: 4,
  get: (buf, off) => {
    return {
      type: new StringType(4, "ascii").get(buf, off)
    };
  }
};
var FixedLengthAtom = class {
  /**
   *
   * @param {number} len Length as specified in the size field
   * @param {number} expLen Total length of sum of specified fields in the standard
   * @param atomId Atom ID
   */
  constructor(len, expLen, atomId) {
    __publicField(this, "len");
    if (len < expLen) {
      throw new Mp4ContentError(`Atom ${atomId} expected to be ${expLen}, but specifies ${len} bytes long.`);
    }
    if (len > expLen) {
      debug(`Warning: atom ${atomId} expected to be ${expLen}, but was actually ${len} bytes long.`);
    }
    this.len = len;
  }
};
var SecondsSinceMacEpoch = {
  len: 4,
  get: (buf, off) => {
    const secondsSinceUnixEpoch = UINT32_BE.get(buf, off) - 2082844800;
    return new Date(secondsSinceUnixEpoch * 1e3);
  }
};
var SecondsSinceMacEpoch64 = {
  len: 8,
  get: (buf, off) => {
    const secondsSinceUnixEpoch = Number(UINT64_BE.get(buf, off)) - 2082844800;
    return new Date(secondsSinceUnixEpoch * 1e3);
  }
};
function readTimeHeader(buf, off) {
  const version = UINT8.get(buf, off);
  const wide = version === 1;
  const timestamp = wide ? SecondsSinceMacEpoch64 : SecondsSinceMacEpoch;
  return {
    version,
    flags: UINT24_BE.get(buf, off + 1),
    creationTime: timestamp.get(buf, off + 4),
    modificationTime: timestamp.get(buf, off + (wide ? 12 : 8)),
    timeScale: UINT32_BE.get(buf, off + (wide ? 20 : 12)),
    duration: wide ? Number(UINT64_BE.get(buf, off + 24)) : UINT32_BE.get(buf, off + 16)
  };
}
var MdhdAtom = class extends FixedLengthAtom {
  constructor(len) {
    super(len, 24, "mdhd");
  }
  get(buf, off) {
    const version = UINT8.get(buf, off);
    if (version !== 0 && version !== 1) {
      throw new FieldDecodingError("Invalid mdhd version header");
    }
    const tail = off + (version === 1 ? 32 : 20);
    return {
      ...readTimeHeader(buf, off),
      language: UINT16_BE.get(buf, tail),
      quality: UINT16_BE.get(buf, tail + 2)
    };
  }
};
var MvhdAtom = class extends FixedLengthAtom {
  constructor(len) {
    super(len, 100, "mvhd");
  }
  get(buf, off) {
    const tail = off + (UINT8.get(buf, off) === 1 ? 32 : 20);
    return {
      ...readTimeHeader(buf, off),
      preferredRate: UINT32_BE.get(buf, tail),
      preferredVolume: UINT16_BE.get(buf, tail + 4),
      // Reserved (10 bytes) and matrix structure (36 bytes).
      previewTime: UINT32_BE.get(buf, tail + 52),
      previewDuration: UINT32_BE.get(buf, tail + 56),
      posterTime: UINT32_BE.get(buf, tail + 60),
      selectionTime: UINT32_BE.get(buf, tail + 64),
      selectionDuration: UINT32_BE.get(buf, tail + 68),
      currentTime: UINT32_BE.get(buf, tail + 72),
      nextTrackID: UINT32_BE.get(buf, tail + 76)
    };
  }
};
var DataAtomHeader = {
  len: 8,
  get(buf, off) {
    if (off < 0 || buf.length - off < 8) {
      throw new Mp4ContentError("Truncated data atom header");
    }
    return {
      type: { set: UINT8.get(buf, off), type: UINT24_BE.get(buf, off + 1) },
      locale: UINT32_BE.get(buf, off + 4)
    };
  }
};
var NameAtom = class {
  constructor(len) {
    __publicField(this, "len");
    this.len = len;
  }
  get(buf, off) {
    return {
      version: UINT8.get(buf, off),
      flags: UINT24_BE.get(buf, off + 1),
      name: new StringType(this.len - 4, "utf-8").get(buf, off + 4)
    };
  }
};
var TrackHeaderAtom = class {
  constructor(len) {
    __publicField(this, "len");
    this.len = len;
  }
  get(buf, off) {
    const available = Math.min(this.len, buf.length - off);
    if (available < 4) {
      throw new Mp4ContentError("Truncated tkhd header");
    }
    const version = UINT8.get(buf, off);
    if (version === 0 && available < 38 || version === 1 && available < 50) {
      throw new Mp4ContentError("Truncated tkhd header");
    }
    const flags = UINT24_BE.get(buf, off + 1);
    switch (version) {
      case 0:
        return {
          version,
          flags,
          creationTime: SecondsSinceMacEpoch.get(buf, off + 4),
          modificationTime: SecondsSinceMacEpoch.get(buf, off + 8),
          trackId: UINT32_BE.get(buf, off + 12),
          // reserved 4 bytes
          duration: UINT32_BE.get(buf, off + 20),
          // reserved 8 bytes
          layer: UINT16_BE.get(buf, off + 32),
          alternateGroup: UINT16_BE.get(buf, off + 34),
          volume: UINT16_BE.get(buf, off + 36),
          // ToDo: fixed point
          ...available >= 84 ? {
            displayWidth: UINT32_BE.get(buf, off + 76) / 65536,
            displayHeight: UINT32_BE.get(buf, off + 80) / 65536
          } : {}
        };
      case 1:
        return {
          version,
          flags,
          creationTime: SecondsSinceMacEpoch64.get(buf, off + 4),
          modificationTime: SecondsSinceMacEpoch64.get(buf, off + 12),
          trackId: UINT32_BE.get(buf, off + 20),
          // reserved 4 bytes
          duration: Number(UINT64_BE.get(buf, off + 28)),
          // reserved 8 bytes
          layer: UINT16_BE.get(buf, off + 44),
          alternateGroup: UINT16_BE.get(buf, off + 46),
          volume: UINT16_BE.get(buf, off + 48),
          // ToDo: fixed point
          ...available >= 96 ? {
            displayWidth: UINT32_BE.get(buf, off + 88) / 65536,
            displayHeight: UINT32_BE.get(buf, off + 92) / 65536
          } : {}
        };
      default:
        throw new FieldDecodingError("Invalid tkhd version header");
    }
  }
};
var stsdHeader = {
  len: 8,
  get: (buf, off) => {
    return {
      version: UINT8.get(buf, off),
      flags: UINT24_BE.get(buf, off + 1),
      numberOfEntries: UINT32_BE.get(buf, off + 4)
    };
  }
};
var SampleDescriptionTable = class {
  constructor(len) {
    __publicField(this, "len");
    this.len = len;
  }
  get(buf, off) {
    const descrLen = this.len - 12;
    return {
      dataFormat: FourCcToken.get(buf, off),
      dataReferenceIndex: UINT16_BE.get(buf, off + 10),
      description: descrLen > 0 ? new Uint8ArrayType(descrLen).get(buf, off + 12) : void 0
    };
  }
};
var StsdAtom = class {
  constructor(len, maxEntries = maxMp4StructureEntries) {
    __publicField(this, "maxEntries");
    __publicField(this, "len");
    this.maxEntries = maxEntries;
    this.len = len;
  }
  get(buf, off) {
    const end = Math.min(off + this.len, buf.length);
    if (end - off < stsdHeader.len) {
      throw new Mp4ContentError("Truncated stsd header");
    }
    const header = stsdHeader.get(buf, off);
    off += stsdHeader.len;
    const table = [];
    for (let n = 0; n < header.numberOfEntries; ++n) {
      if (end - off < UINT32_BE.len) {
        throw new Mp4ContentError("Truncated stsd sample entry");
      }
      const size = UINT32_BE.get(buf, off);
      if (size < 16 || size > end - off) {
        throw new Mp4ContentError(`Invalid stsd sample entry size: ${size}`);
      }
      if (n >= this.maxEntries) {
        throw new Mp4ContentError(`stsd entry count ${header.numberOfEntries} exceeds entry limit ${this.maxEntries}`);
      }
      off += UINT32_BE.len;
      table.push(new SampleDescriptionTable(size - UINT32_BE.len).get(buf, off));
      off += size - UINT32_BE.len;
    }
    return {
      header,
      table
    };
  }
};
var SoundSampleDescriptionVersion = {
  len: 8,
  get(buf, off) {
    return {
      version: INT16_BE.get(buf, off),
      revision: INT16_BE.get(buf, off + 2),
      vendor: INT32_BE.get(buf, off + 4)
    };
  }
};
var SoundSampleDescriptionV0 = {
  len: 12,
  get(buf, off) {
    return {
      numAudioChannels: INT16_BE.get(buf, off + 0),
      sampleSize: INT16_BE.get(buf, off + 2),
      compressionId: INT16_BE.get(buf, off + 4),
      packetSize: INT16_BE.get(buf, off + 6),
      sampleRate: UINT16_BE.get(buf, off + 8) + UINT16_BE.get(buf, off + 10) / 1e4
    };
  }
};
var SimpleTableAtom = class {
  constructor(len, token, maxEntries = maxMp4StructureEntries) {
    __publicField(this, "maxEntries");
    __publicField(this, "len");
    __publicField(this, "token");
    this.maxEntries = maxEntries;
    this.len = len;
    this.token = token;
  }
  get(buf, off) {
    const nrOfEntries = INT32_BE.get(buf, off + 4);
    return {
      version: INT8.get(buf, off + 0),
      flags: INT24_BE.get(buf, off + 1),
      numberOfEntries: nrOfEntries,
      entries: readTokenTable(buf, this.token, off + 8, this.len - 8, nrOfEntries, this.maxEntries)
    };
  }
};
var TimeToSampleToken = {
  len: 8,
  get(buf, off) {
    return {
      count: UINT32_BE.get(buf, off + 0),
      duration: UINT32_BE.get(buf, off + 4)
    };
  }
};
var SttsAtom = class extends SimpleTableAtom {
  constructor(len, maxEntries) {
    super(len, TimeToSampleToken, maxEntries);
  }
};
var SampleToChunkToken = {
  len: 12,
  get(buf, off) {
    return {
      firstChunk: UINT32_BE.get(buf, off),
      samplesPerChunk: UINT32_BE.get(buf, off + 4),
      sampleDescriptionId: UINT32_BE.get(buf, off + 8)
    };
  }
};
var StscAtom = class extends SimpleTableAtom {
  constructor(len, maxEntries) {
    super(len, SampleToChunkToken, maxEntries);
  }
};
var StszAtom = class {
  constructor(len, maxRetainedEntries = 0) {
    __publicField(this, "maxRetainedEntries");
    __publicField(this, "len");
    this.maxRetainedEntries = maxRetainedEntries;
    this.len = len;
  }
  get(buf, off) {
    if (this.len < 12) {
      throw new Mp4ContentError("Invalid stsz payload length");
    }
    const sampleSize = UINT32_BE.get(buf, off + 4);
    const numberOfEntries = UINT32_BE.get(buf, off + 8);
    const tableLength = this.len - 12;
    if (tableLength !== 0 && tableLength !== numberOfEntries * UINT32_BE.len) {
      throw new Mp4ContentError("mismatch number-of-entries with remaining atom-length");
    }
    const tableEntries = tableLength / UINT32_BE.len;
    const retainedCount = Math.min(tableEntries, this.maxRetainedEntries);
    const entries = [];
    let totalSize = sampleSize * numberOfEntries;
    for (let index = 0; index < tableEntries; ++index) {
      const size = UINT32_BE.get(buf, off + 12 + index * UINT32_BE.len);
      if (sampleSize === 0) {
        totalSize += size;
      }
      if (index < retainedCount) {
        entries.push(size);
      }
    }
    return {
      version: INT8.get(buf, off),
      flags: INT24_BE.get(buf, off + 1),
      sampleSize,
      numberOfEntries,
      totalSize: sampleSize > 0 || tableEntries > 0 ? totalSize : void 0,
      entries
    };
  }
};
var StcoAtom = class extends SimpleTableAtom {
  constructor(len, maxEntries) {
    super(len, UINT32_BE, maxEntries);
  }
};
var Co64Atom = class extends SimpleTableAtom {
  constructor(len, maxEntries) {
    super(len, {
      len: 8,
      get(buf, off) {
        const offset = UINT64_BE.get(buf, off);
        if (offset > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Mp4ContentError("Chunk offset exceeds Number.MAX_SAFE_INTEGER");
        }
        return Number(offset);
      }
    }, maxEntries);
  }
};
var ChapterText = class {
  constructor(len) {
    __publicField(this, "len");
    this.len = len;
  }
  get(buf, off) {
    const available = Math.min(this.len, buf.length - off);
    if (available < 2) {
      return "";
    }
    const titleLen = Math.min(UINT16_BE.get(buf, off), available - 2);
    const bytes = buf.subarray(off + 2, off + 2 + titleLen);
    if (bytes[0] === 254 && bytes[1] === 255) {
      const littleEndian = new Uint8Array(bytes.length - 2);
      for (let i = 2; i + 1 < bytes.length; i += 2) {
        littleEndian[i - 2] = bytes[i + 1];
        littleEndian[i - 1] = bytes[i];
      }
      return textDecode(littleEndian, "utf-16le");
    }
    if (bytes[0] === 255 && bytes[1] === 254) {
      return textDecode(bytes.subarray(2), "utf-16le");
    }
    return textDecode(bytes);
  }
};
var ChapterListAtom = class {
  constructor(len, maxChapters = defaultMaxChapterCount, onLimit) {
    __publicField(this, "len");
    __publicField(this, "maxChapters");
    __publicField(this, "onLimit");
    this.len = len;
    this.maxChapters = maxChapters;
    this.onLimit = onLimit;
  }
  get(buf, off) {
    var _a;
    const end = off + Math.min(this.len, buf.length - off);
    if (end - off < 5) {
      return [];
    }
    const version = UINT8.get(buf, off);
    if (version > 1) {
      throw new Mp4ContentError(`Unsupported chpl version: ${version}`);
    }
    let position = off + (version === 1 ? 8 : 4);
    if (position >= end) {
      return [];
    }
    const count = UINT8.get(buf, position++);
    if (count > this.maxChapters) {
      (_a = this.onLimit) == null ? void 0 : _a.call(this);
    }
    const chapters = [];
    for (let i = 0; i < Math.min(count, this.maxChapters) && position + 9 <= end; ++i) {
      const start = UINT64_BE.get(buf, position);
      const titleLength = UINT8.get(buf, position + 8);
      position += 9;
      if (position + titleLength > end) {
        break;
      }
      if (start > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Mp4ContentError("Chapter start exceeds Number.MAX_SAFE_INTEGER");
      }
      chapters.push({
        title: textDecode(buf.subarray(position, position + titleLength)),
        start: Number(start),
        timeScale: 1e7
      });
      position += titleLength;
    }
    return chapters;
  }
};
function readTokenTable(buf, token, off, remainingLen, numberOfEntries, maxEntries = maxMp4StructureEntries) {
  debug(`remainingLen=${remainingLen}, numberOfEntries=${numberOfEntries} * token-len=${token.len}`);
  if (remainingLen === 0) {
    return [];
  }
  if (remainingLen !== numberOfEntries * token.len) {
    throw new Mp4ContentError("mismatch number-of-entries with remaining atom-length");
  }
  if (numberOfEntries > maxEntries) {
    throw new Mp4ContentError(`MP4 table entry count ${numberOfEntries} exceeds entry limit ${maxEntries}`);
  }
  const entries = [];
  for (let n = 0; n < numberOfEntries; ++n) {
    entries.push(token.get(buf, off));
    off += token.len;
  }
  return entries;
}
var TrackFragmentHeaderBox = class {
  constructor(len) {
    __publicField(this, "len");
    this.len = len;
  }
  get(buf, off) {
    const flagOffset = off + 1;
    const header = {
      version: INT8.get(buf, off),
      flags: {
        baseDataOffsetPresent: getBit(buf, flagOffset + 2, 0),
        sampleDescriptionIndexPresent: getBit(buf, flagOffset + 2, 1),
        defaultSampleDurationPresent: getBit(buf, flagOffset + 2, 3),
        defaultSampleSizePresent: getBit(buf, flagOffset + 2, 4),
        defaultSampleFlagsPresent: getBit(buf, flagOffset + 2, 5),
        defaultDurationIsEmpty: getBit(buf, flagOffset, 0),
        defaultBaseIsMoof: getBit(buf, flagOffset, 1)
      },
      trackId: UINT32_BE.get(buf, 4)
    };
    let dynOffset = 8;
    if (header.flags.baseDataOffsetPresent) {
      header.baseDataOffset = UINT64_BE.get(buf, dynOffset);
      dynOffset += 8;
    }
    if (header.flags.sampleDescriptionIndexPresent) {
      header.sampleDescriptionIndex = UINT32_BE.get(buf, dynOffset);
      dynOffset += 4;
    }
    if (header.flags.defaultSampleDurationPresent) {
      header.defaultSampleDuration = UINT32_BE.get(buf, dynOffset);
      dynOffset += 4;
    }
    if (header.flags.defaultSampleSizePresent) {
      header.defaultSampleSize = UINT32_BE.get(buf, dynOffset);
      dynOffset += 4;
    }
    if (header.flags.defaultSampleFlagsPresent) {
      header.defaultSampleFlags = UINT32_BE.get(buf, dynOffset);
    }
    return header;
  }
};
var TrackRunBox = class {
  constructor(len, maxSampleCount = maxMp4StructureEntries) {
    __publicField(this, "maxSampleCount");
    __publicField(this, "len");
    this.maxSampleCount = maxSampleCount;
    this.len = len;
  }
  get(buf, off) {
    const flagOffset = off + 1;
    const trun = {
      version: INT8.get(buf, off),
      flags: {
        dataOffsetPresent: getBit(buf, flagOffset + 2, 0),
        firstSampleFlagsPresent: getBit(buf, flagOffset + 2, 2),
        sampleDurationPresent: getBit(buf, flagOffset + 1, 0),
        sampleSizePresent: getBit(buf, flagOffset + 1, 1),
        sampleFlagsPresent: getBit(buf, flagOffset + 1, 2),
        sampleCompositionTimeOffsetsPresent: getBit(buf, flagOffset + 1, 3)
      },
      sampleCount: UINT32_BE.get(buf, off + 4),
      duration: 0,
      size: 0,
      timingComplete: true,
      explicitSampleCount: 0
    };
    let dynOffset = off + 8;
    if (trun.flags.dataOffsetPresent) {
      trun.dataOffset = UINT32_BE.get(buf, dynOffset);
      dynOffset += 4;
    }
    if (trun.flags.firstSampleFlagsPresent) {
      trun.firstSampleFlags = UINT32_BE.get(buf, dynOffset);
      dynOffset += 4;
    }
    const sampleFields = Number(trun.flags.sampleDurationPresent) + Number(trun.flags.sampleSizePresent) + Number(trun.flags.sampleFlagsPresent) + Number(trun.flags.sampleCompositionTimeOffsetsPresent);
    if (dynOffset + sampleFields * 4 * trun.sampleCount > off + this.len) {
      throw new Mp4ContentError("Invalid trun sample count");
    }
    if (sampleFields === 0) {
      return trun;
    }
    if (trun.sampleCount > this.maxSampleCount) {
      throw new Mp4ContentError(`trun sample count ${trun.sampleCount} exceeds entry limit ${this.maxSampleCount}`);
    }
    for (let n = 0; n < trun.sampleCount; ++n) {
      if (trun.flags.sampleDurationPresent) {
        const duration = UINT32_BE.get(buf, dynOffset);
        trun.duration += duration;
        trun.timingComplete && (trun.timingComplete = duration > 0);
        dynOffset += 4;
      }
      if (trun.flags.sampleSizePresent) {
        trun.size += UINT32_BE.get(buf, dynOffset);
        dynOffset += 4;
      }
      dynOffset += 4 * (Number(trun.flags.sampleFlagsPresent) + Number(trun.flags.sampleCompositionTimeOffsetsPresent));
    }
    trun.explicitSampleCount = trun.sampleCount;
    return trun;
  }
};
var HandlerBox = class {
  constructor(len) {
    __publicField(this, "len");
    this.len = len;
  }
  get(buf, off) {
    const _flagOffset = off + 1;
    const charTypeToken = new StringType(4, "utf-8");
    return {
      version: INT8.get(buf, off),
      flags: UINT24_BE.get(buf, off + 1),
      componentType: charTypeToken.get(buf, off + 4),
      handlerType: charTypeToken.get(buf, off + 8),
      componentName: new StringType(this.len - 28, "utf-8").get(buf, off + 28)
    };
  }
};
var ChapterTrackReferenceBox = class {
  constructor(len, maxEntries = maxMp4StructureEntries) {
    __publicField(this, "maxEntries");
    __publicField(this, "len");
    this.maxEntries = maxEntries;
    this.len = len;
  }
  get(buf, off) {
    if (this.len % UINT32_BE.len !== 0) {
      throw new Mp4ContentError("Invalid chapter track-reference length");
    }
    const count = this.len / UINT32_BE.len;
    if (count > this.maxEntries) {
      throw new Mp4ContentError(`Chapter track-reference count ${count} exceeds entry limit ${this.maxEntries}`);
    }
    let dynOffset = 0;
    const trackIds = [];
    while (dynOffset < this.len) {
      trackIds.push(UINT32_BE.get(buf, off + dynOffset));
      dynOffset += 4;
    }
    return trackIds;
  }
};

// ../../node_modules/music-metadata/lib/mp4/Atom.js
var debug2 = (0, import_debug2.default)("music-metadata:parser:MP4:Atom");
var maxAtomDepth = 64;
var Atom = class _Atom {
  constructor(header, extended, parent, payloadLength, reserveAtom = () => void 0) {
    __publicField(this, "payloadLength");
    __publicField(this, "reserveAtom");
    __publicField(this, "atomPath");
    __publicField(this, "header");
    __publicField(this, "extended");
    __publicField(this, "parent");
    this.payloadLength = payloadLength;
    this.reserveAtom = reserveAtom;
    this.header = header;
    this.extended = extended;
    this.parent = parent;
    this.atomPath = (this.parent ? `${this.parent.atomPath}.` : "") + this.header.name;
  }
  static async readAtom(tokenizer, dataHandler, parent, remaining, reserveAtom = () => void 0) {
    let depth = 0;
    for (let ancestor = parent; ancestor; ancestor = ancestor.parent) {
      if (++depth >= maxAtomDepth) {
        throw new Mp4ContentError(`MP4 atom nesting exceeds limit ${maxAtomDepth}`);
      }
    }
    const offset = tokenizer.position;
    remaining = Math.min(remaining, (tokenizer.fileInfo.size ?? Number.POSITIVE_INFINITY) - offset);
    if (remaining < Header.len) {
      throw new Mp4ContentError("Truncated atom header");
    }
    debug2(`Reading next token on offset=${offset}...`);
    const header = await tokenizer.readToken(Header);
    const extended = header.length === 1n;
    if (extended) {
      if (remaining < 16) {
        throw new Mp4ContentError("Truncated extended atom header");
      }
      header.length = await tokenizer.readToken(ExtendedSize);
    }
    const headerLength = extended ? 16 : 8;
    if ((extended || header.length !== 0n) && header.length < BigInt(headerLength)) {
      throw new Mp4ContentError(`Invalid atom size: ${header.length}`);
    }
    if (header.length > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Mp4ContentError(`Atom size exceeds Number.MAX_SAFE_INTEGER: ${header.length}`);
    }
    const length = header.length === 0n ? remaining : Number(header.length);
    if (length > remaining) {
      throw new Mp4ContentError(`Atom size exceeds remaining bytes: ${header.length} > ${remaining}`);
    }
    const payloadLength = length - headerLength;
    reserveAtom();
    const atomBean = new _Atom(header, extended, parent, payloadLength, reserveAtom);
    debug2(`parse atom name=${atomBean.atomPath}, extended=${atomBean.extended}, offset=${offset}, len=${atomBean.header.length}`);
    await atomBean.readData(tokenizer, dataHandler, payloadLength);
    return atomBean;
  }
  getHeaderLength() {
    return this.extended ? 16 : 8;
  }
  getPayloadLength() {
    return this.payloadLength;
  }
  async readAtoms(tokenizer, dataHandler, size) {
    while (size > 0) {
      if (size === Number.POSITIVE_INFINITY) {
        const bytesRead = await tokenizer.peekBuffer(new Uint8Array(Header.len), { mayBeLess: true });
        if (bytesRead === 0) {
          return;
        }
        if (bytesRead < Header.len) {
          throw new Mp4ContentError("Truncated atom header");
        }
      }
      const atomBean = await _Atom.readAtom(tokenizer, dataHandler, this, size, this.reserveAtom);
      size = atomBean.header.length === 0n ? 0 : size - Number(atomBean.header.length);
    }
  }
  async readData(tokenizer, dataHandler, remaining) {
    switch (this.header.name) {
      // "Container" atoms, contains nested atoms
      case "moov":
      // The Movie Atom: contains other atoms
      case "udta":
      // User defined atom
      case "mdia":
      // Media atom
      case "minf":
      // Media Information Atom
      case "stbl":
      // The Sample Table Atom
      case "<id>":
      case "ilst":
      case "tref":
      case "mvex":
      case "moof":
        return this.readAtoms(tokenizer, dataHandler, remaining);
      case "meta": {
        if (remaining < 8) {
          throw new Mp4ContentError("Truncated meta atom");
        }
        const peekHeader = await tokenizer.peekToken(Header);
        const paddingLength = peekHeader.name === "hdlr" ? 0 : 4;
        await tokenizer.ignore(paddingLength);
        return this.readAtoms(tokenizer, dataHandler, remaining - paddingLength);
      }
      default:
        return dataHandler(this, remaining);
    }
  }
};

// ../../node_modules/music-metadata/lib/mp4/MP4Parser.js
var debug3 = (0, import_debug3.default)("music-metadata:parser:MP4");
var tagFormat = "iTunes";
var maxChapterTitleBytes = 64 * 1024;
var encoderDict = {
  raw: {
    lossy: false,
    format: "raw"
  },
  MAC3: {
    lossy: true,
    format: "MACE 3:1"
  },
  MAC6: {
    lossy: true,
    format: "MACE 6:1"
  },
  ima4: {
    lossy: true,
    format: "IMA 4:1"
  },
  ulaw: {
    lossy: true,
    format: "uLaw 2:1"
  },
  alaw: {
    lossy: true,
    format: "uLaw 2:1"
  },
  Qclp: {
    lossy: true,
    format: "QUALCOMM PureVoice"
  },
  ".mp3": {
    lossy: true,
    format: "MPEG-1 layer 3"
  },
  alac: {
    lossy: false,
    format: "ALAC"
  },
  "ac-3": {
    lossy: true,
    format: "AC-3"
  },
  mp4a: {
    lossy: true,
    format: "MPEG-4/AAC"
  },
  mp4s: {
    lossy: true,
    format: "MP4S"
  },
  // Closed Captioning Media, https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap3/qtff3.html#//apple_ref/doc/uid/TP40000939-CH205-SW87
  c608: {
    lossy: true,
    format: "CEA-608"
  },
  c708: {
    lossy: true,
    format: "CEA-708"
  }
};
function supportsSeeking(tokenizer) {
  return tokenizer.supportsRandomAccess() && "setPosition" in tokenizer && typeof tokenizer.setPosition === "function";
}
function isAudioTrack(track) {
  const [ssd] = track.soundSampleDescription ?? [];
  if (!ssd) {
    return false;
  }
  if (track.handler) {
    return track.handler.handlerType === "soun" || track.handler.handlerType === "audi";
  }
  return !!ssd.description && ssd.description.numAudioChannels > 0;
}
function readAacLcChannels(objectType, config) {
  if (objectType !== 2 || config.length < 2) {
    return void 0;
  }
  const frequencyIndex = (config[0] & 7) << 1 | config[1] >>> 7;
  let channelConfigByte = 1;
  if (frequencyIndex === 15) {
    if (config.length < 5) {
      return void 0;
    }
    channelConfigByte = 4;
  }
  const channelConfig = config[channelConfigByte] >>> 3 & 15;
  if (channelConfig >= 1 && channelConfig <= 7) {
    return channelConfig === 7 ? 8 : channelConfig;
  }
  if (channelConfig === 0 && config.length > channelConfigByte + 1) {
    const pceByte = channelConfigByte + 1;
    if ((config[pceByte] & 128) !== 0) {
      const profile = config[pceByte] >>> 6;
      if (profile === 0) {
        const channels = config[pceByte] >> 1 & 7;
        if (channels > 0) {
          return channels;
        }
      }
    }
  }
  return void 0;
}
var MP4Parser = class _MP4Parser extends BasicParser {
  constructor() {
    super(...arguments);
    __publicField(this, "maxChapterCount", getMaxChapterCount(this.options));
    __publicField(this, "movieHeader");
    __publicField(this, "trackDefaults", /* @__PURE__ */ new Map());
    __publicField(this, "tracks", /* @__PURE__ */ new Map());
    __publicField(this, "mediaDataRanges", []);
    __publicField(this, "streamedChapters", /* @__PURE__ */ new Map());
    __publicField(this, "streamedChapterCount");
    __publicField(this, "neroChapters", []);
    __publicField(this, "hasVideoTrack", false);
    __publicField(this, "hasAudioTrack", false);
    __publicField(this, "remainingAtoms", 0);
    __publicField(this, "maxMetadataEntries", 0);
    __publicField(this, "metadataKeys", /* @__PURE__ */ new WeakMap());
    __publicField(this, "pendingTags", []);
    __publicField(this, "atomParsers", {
      /**
       * Parse movie header (mvhd) atom
       * Ref: https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap2/qtff2.html#//apple_ref/doc/uid/TP40000939-CH204-56313
       */
      mvhd: async (len) => {
        const mvhd = await this.readToken(new MvhdAtom(len));
        this.movieHeader = mvhd;
        this.metadata.setFormat("creationTime", mvhd.creationTime);
        this.metadata.setFormat("modificationTime", mvhd.modificationTime);
      },
      chpl: async (len) => {
        if (this.options.includeChapters) {
          this.neroChapters = await this.readToken(new ChapterListAtom(len, this.maxChapterCount, () => {
            this.addWarning(`Chapter count exceeds the ${this.maxChapterCount} chapter limit`);
          }));
        } else {
          await this.tokenizer.ignore(len);
        }
      },
      trex: async (len) => {
        const data = await this.readToken(new Uint8ArrayType(len));
        if (len < 24) {
          throw new Mp4ContentError("Truncated trex box");
        }
        const trackId = UINT32_BE.get(data, 4);
        if (!this.trackDefaults.has(trackId)) {
          this.assertRetainedEntryCapacity(this.trackDefaults.size, "MP4 track-default");
        }
        this.trackDefaults.set(trackId, {
          duration: UINT32_BE.get(data, 12),
          size: UINT32_BE.get(data, 16)
        });
      },
      /**
       * Parse mdat atom.
       * Will scan for chapters
       */
      mdat: async (len) => {
        const range = { offset: this.tokenizer.position, end: this.tokenizer.position + len };
        if (this.options.includeChapters) {
          if (supportsSeeking(this.tokenizer)) {
            this.assertRetainedEntryCapacity(this.mediaDataRanges.length, "MP4 media-data range");
            this.mediaDataRanges.push(range);
          } else {
            await this.parseChapters([range], true);
          }
        }
        await this.tokenizer.ignore(range.end - this.tokenizer.position);
      },
      ftyp: async (len) => {
        if (len < 8 || len % ftyp.len !== 0) {
          throw new Mp4ContentError(`Invalid ftyp payload length: ${len}`);
        }
        const typeCount = len / ftyp.len;
        if (typeCount > maxMp4StructureEntries) {
          throw new Mp4ContentError(`ftyp entry count ${typeCount} exceeds entry limit ${maxMp4StructureEntries}`);
        }
        const types = [];
        while (len > 0) {
          const ftype = await this.readToken(ftyp);
          len -= ftyp.len;
          const value = ftype.type.replace(/\W/g, "");
          if (value.length > 0) {
            types.push(value);
          }
        }
        debug3(`ftyp: ${types.join("/")}`);
        const x = [...new Set(types)].join("/");
        this.metadata.setFormat("container", x);
      },
      date: async (len) => {
        const date = await this.readToken(new StringType(len, "utf-8"));
        await this.addTag("date", date);
      }
    });
  }
  static read_BE_Integer(array, signed) {
    const integerType = (signed ? "INT" : "UINT") + array.length * 8 + (array.length > 1 ? "_BE" : "");
    const token = lib_exports[integerType];
    if (!token) {
      throw new Mp4ContentError(`Token for integer type not found: "${integerType}"`);
    }
    return Number(token.get(array, 0));
  }
  // Metadata and sample tables are buffered; media data is skipped separately.
  // A bound is also necessary for streams whose total size is unknown.
  validatePayloadLength(length) {
    validateAllocation(length, this.options, (message) => new Mp4ContentError(message));
  }
  async readToken(token, position) {
    return readToken(this.tokenizer, token, this.options, position, (message) => new Mp4ContentError(message));
  }
  async parse() {
    var _a, _b;
    this.hasVideoTrack = false;
    this.hasAudioTrack = false;
    this.maxMetadataEntries = getMaxMetadataEntries(this.options);
    this.remainingAtoms = maxMp4StructureEntries;
    this.tracks.clear();
    this.mediaDataRanges = [];
    this.streamedChapters.clear();
    this.streamedChapterCount = void 0;
    this.neroChapters = [];
    this.trackDefaults.clear();
    this.movieHeader = void 0;
    this.pendingTags = [];
    this.metadataKeys = /* @__PURE__ */ new WeakMap();
    let remainingFileSize = this.tokenizer.fileInfo.size ?? Number.POSITIVE_INFINITY;
    while (remainingFileSize > 0) {
      try {
        const token = await this.tokenizer.peekToken(Header);
        if (token.name === "\0\0\0\0") {
          const errMsg = `Error at offset=${this.tokenizer.position}: box.id=0`;
          debug3(errMsg);
          this.addWarning(errMsg);
          break;
        }
      } catch (error) {
        if (error instanceof Error) {
          const errMsg = `Error at offset=${this.tokenizer.position}: ${error.message}`;
          debug3(errMsg);
          this.addWarning(errMsg);
        } else {
          throw error;
        }
        break;
      }
      const atomsBeforeRoot = this.remainingAtoms;
      const rootAtom = await Atom.readAtom(this.tokenizer, (atom, remaining) => this.handleAtom(atom, remaining), null, remainingFileSize, () => this.reserveAtom());
      this.remainingAtoms = atomsBeforeRoot;
      remainingFileSize = rootAtom.header.length === 0n ? 0 : remainingFileSize - Number(rootAtom.header.length);
      for (const tag of this.pendingTags) {
        let id = tag.id;
        if (tag.scope && id.length === 4 && id.charCodeAt(0) === 0) {
          const index = [...id].reduce((value, character) => value * 256 + character.charCodeAt(0), 0);
          const key = (_a = this.metadataKeys.get(tag.scope)) == null ? void 0 : _a[index - 1];
          if (key !== void 0) {
            id = key;
          } else {
            this.addWarning(`Unresolved MP4 metadata key index ${index}`);
          }
        }
        await this.metadata.addTag(tagFormat, id, tag.value);
      }
      this.pendingTags = [];
      this.metadataKeys = /* @__PURE__ */ new WeakMap();
    }
    if (this.mediaDataRanges.length > 0 && supportsSeeking(this.tokenizer)) {
      const tokenizer = this.tokenizer;
      const position = tokenizer.position;
      try {
        await this.parseChapters(this.mediaDataRanges);
      } finally {
        tokenizer.setPosition(position);
      }
    }
    if (this.streamedChapterCount !== void 0 && this.streamedChapters.size !== this.streamedChapterCount) {
      if (this.neroChapters.length === 0) {
        throw new Mp4ContentError("Chapter chunk exceeding media data bounds");
      }
      this.addWarning("Cannot read chapter track: Chapter chunk exceeding media data bounds");
    }
    if (this.options.includeChapters && this.neroChapters.length > 0 && !((_b = this.metadata.format.chapters) == null ? void 0 : _b.some((chapter) => chapter.title))) {
      this.metadata.setFormat("chapters", this.neroChapters);
    }
    const formatList = [];
    this.tracks.forEach((track) => {
      const trackFormats = [];
      for (const ssd of track.soundSampleDescription) {
        const encoderInfo = ssd.encoder ?? encoderDict[ssd.dataFormat];
        if (encoderInfo) {
          trackFormats.push(encoderInfo.format);
        }
      }
      if (trackFormats.length >= 1) {
        formatList.push(trackFormats.join("/"));
      }
    });
    if (formatList.length > 0) {
      this.metadata.setFormat("codec", [...new Set(formatList)].join("+"));
    }
    const audioTracks = [...this.tracks.values()].filter(isAudioTrack);
    for (const track of this.tracks.values()) {
      this.calculateTrackTiming(track);
    }
    for (const audioTrack of audioTracks) {
      const ssd = audioTrack.soundSampleDescription[0];
      if (ssd.description && audioTrack.media.header) {
        this.metadata.setFormat("sampleRate", ssd.description.sampleRate);
        this.metadata.setFormat("bitsPerSample", ssd.description.sampleSize);
        this.metadata.setFormat("numberOfChannels", ssd.description.numAudioChannels);
        if (audioTrack.media.header.timeScale === 0 && audioTrack.timeToSampleTable.length > 0 && ssd.description.sampleRate > 0) {
          const totalSampleSize = audioTrack.timeToSampleTable.map((ttstEntry) => ttstEntry.count * ttstEntry.duration).reduce((total, sampleSize) => total + sampleSize);
          audioTrack.duration = totalSampleSize / ssd.description.sampleRate;
        }
      }
      const encoderInfo = ssd.encoder ?? encoderDict[ssd.dataFormat];
      if (encoderInfo) {
        this.metadata.setFormat("lossless", !encoderInfo.lossy);
      }
    }
    if (audioTracks.length >= 1) {
      const firstAudioTrack = audioTracks[0];
      if (firstAudioTrack.duration) {
        this.metadata.setFormat("duration", firstAudioTrack.duration);
        if (firstAudioTrack.sizeInBytes) {
          this.metadata.setFormat("bitrate", 8 * firstAudioTrack.sizeInBytes / firstAudioTrack.duration);
        }
      }
    }
    for (const track of this.tracks.values()) {
      this.metadata.addStreamInfo(this.getTrackInfo(track));
    }
    this.metadata.setFormat("hasAudio", this.hasAudioTrack || audioTracks.length > 0);
    this.metadata.setFormat("hasVideo", this.hasVideoTrack);
    const movieDuration = this.getDuration(this.movieHeader);
    if (movieDuration !== void 0) {
      this.metadata.setFormat("containerDuration", movieDuration);
    } else {
      const endTimes = [...this.tracks.values()].filter((track) => {
        var _a2;
        return isAudioTrack(track) || ((_a2 = track.handler) == null ? void 0 : _a2.handlerType) === "vide";
      }).map((track) => track.endTime);
      if (endTimes.length > 0 && endTimes.every((endTime) => endTime !== void 0)) {
        this.metadata.setFormat("containerDuration", endTimes.reduce((maximum, endTime) => Math.max(maximum, endTime), 0));
      }
    }
  }
  async handleAtom(atom, remaining) {
    var _a;
    if (atom.header.name === "keys" && ((_a = atom.parent) == null ? void 0 : _a.header.name) === "meta") {
      return this.parseMetadataKeys(atom.parent, remaining);
    }
    if (atom.parent) {
      switch (atom.parent.header.name) {
        case "ilst":
        case "<id>":
          return this.parseMetadataItemData(atom);
        case "moov":
          switch (atom.header.name) {
            case "trak":
              return this.parseTrackBox(atom);
            case "udta":
              return this.parseTrackBox(atom);
          }
          break;
        case "moof":
          switch (atom.header.name) {
            case "traf":
              return this.parseTrackFragmentBox(atom);
          }
      }
    }
    if (["chap", "stsd", "stsz"].includes(atom.header.name)) {
      this.validatePayloadLength(remaining);
      if (atom.header.name === "stsd") {
        await this.readToken(new StsdAtom(remaining, maxMp4StructureEntries));
      } else if (atom.header.name === "stsz") {
        await this.readToken(new StszAtom(remaining));
      } else {
        await this.tokenizer.ignore(remaining);
      }
      this.addWarning(`Ignoring track-specific atom ${atom.atomPath} outside a track`);
      return;
    }
    if (this.atomParsers[atom.header.name]) {
      if (atom.header.name !== "mdat") {
        this.validatePayloadLength(remaining);
      }
      return this.atomParsers[atom.header.name](remaining);
    }
    debug3(`No parser for atom path=${atom.atomPath}, payload-len=${remaining}, ignoring atom`);
    await this.tokenizer.ignore(remaining);
  }
  reserveAtom() {
    if (this.remainingAtoms === 0) {
      throw new Mp4ContentError("MP4 atom count exceeds entry limit");
    }
    --this.remainingAtoms;
  }
  assertRetainedEntryCapacity(count, collection, limit = maxMp4StructureEntries) {
    if (count >= limit) {
      throw new Mp4ContentError(`${collection} count exceeds entry limit ${limit}`);
    }
  }
  async addTag(id, value, scope) {
    this.assertRetainedEntryCapacity(this.pendingTags.length, "MP4 metadata value", this.maxMetadataEntries);
    this.pendingTags.push({ id, value, scope });
  }
  async parseMetadataKeys(scope, length) {
    if (length < 8) {
      throw new Mp4ContentError("Truncated metadata keys header");
    }
    const data = await this.readToken(new Uint8ArrayType(length));
    if (UINT32_BE.get(data, 0) !== 0) {
      throw new Mp4ContentError("Unsupported metadata keys version or flags");
    }
    const count = UINT32_BE.get(data, 4);
    if (count > this.maxMetadataEntries || count > Math.floor((length - 8) / 8)) {
      throw new Mp4ContentError("Metadata keys count exceeds entry limit or payload bounds");
    }
    const keys = [];
    let offset = 8;
    for (let index = 0; index < count; ++index) {
      if (offset + 8 > length) {
        throw new Mp4ContentError("Truncated metadata key entry");
      }
      const size = UINT32_BE.get(data, offset);
      if (size < 8 || size > length - offset) {
        throw new Mp4ContentError("Invalid metadata key entry size");
      }
      const namespace = new StringType(4, "latin1").get(data, offset + 4);
      keys.push(`${namespace}:${textDecode(data.subarray(offset + 8, offset + size))}`);
      offset += size;
    }
    if (offset !== length) {
      throw new Mp4ContentError("Unexpected bytes after metadata keys");
    }
    if (this.metadataKeys.has(scope)) {
      this.addWarning("Duplicate MP4 metadata keys table; keeping the first table");
    } else {
      this.metadataKeys.set(scope, keys);
    }
  }
  addWarning(message) {
    debug3(`Warning: ${message}`);
    this.metadata.addWarning(message);
  }
  /**
   * Parse data of Meta-item-list-atom (item of 'ilst' atom)
   * @param metaAtom
   * Ref: https://developer.apple.com/library/content/documentation/QuickTime/QTFF/Metadata/Metadata.html#//apple_ref/doc/uid/TP40000939-CH1-SW8
   */
  parseMetadataItemData(metaAtom) {
    let tagKey = metaAtom.header.name;
    let scope = metaAtom.parent;
    while (scope && scope.header.name !== "meta") {
      scope = scope.parent;
    }
    const indexed = scope !== null && tagKey.charCodeAt(0) === 0;
    return metaAtom.readAtoms(this.tokenizer, async (child) => {
      const payLoadLength = child.getPayloadLength();
      switch (child.header.name) {
        case "data":
          return this.parseValueAtom(tagKey, child, scope ?? void 0);
        case "name":
        // name atom (optional)
        case "mean":
        case "rate": {
          const name = await this.readToken(new NameAtom(payLoadLength));
          if (!indexed) {
            tagKey += `:${name.name}`;
          }
          break;
        }
        default: {
          const uint8Array = await this.readToken(new Uint8ArrayType(payLoadLength));
          this.addWarning(`Unsupported meta-item: ${tagKey}[${child.header.name}] => value=${uint8ArrayToHex(uint8Array)} ascii=${textDecode(uint8Array, "ascii")}`);
        }
      }
    }, metaAtom.getPayloadLength());
  }
  async parseValueAtom(tagKey, metaAtom, scope) {
    const length = metaAtom.getPayloadLength();
    if (length < DataAtomHeader.len) {
      throw new Mp4ContentError("Truncated data atom header");
    }
    const header = await this.readToken(DataAtomHeader);
    if (header.type.set !== 0) {
      throw new Mp4ContentError(`Unsupported type-set != 0: ${header.type.set}`);
    }
    const bodyLength = length - DataAtomHeader.len;
    if (this.options.skipCovers && (header.type.type === 13 || header.type.type === 14)) {
      const body = createTokenizerView(this.tokenizer, bodyLength);
      try {
        await body.consumeRemainder();
      } finally {
        await body.close();
      }
      return;
    }
    this.validatePayloadLength(length);
    const dataAtom = { ...header, value: await this.readToken(new Uint8ArrayType(bodyLength)) };
    switch (dataAtom.type.type) {
      case 0:
        switch (tagKey) {
          case "trkn":
          case "disk": {
            const num = UINT8.get(dataAtom.value, 3);
            const of = UINT8.get(dataAtom.value, 5);
            await this.addTag(tagKey, `${num}/${of}`, scope);
            break;
          }
          case "gnre": {
            const genreInt = UINT8.get(dataAtom.value, 1);
            const genreStr = Genres[genreInt - 1];
            await this.addTag(tagKey, genreStr, scope);
            break;
          }
          case "rate": {
            const rate = textDecode(dataAtom.value, "ascii");
            await this.addTag(tagKey, rate, scope);
            break;
          }
          default:
            debug3(`unknown proprietary value type for: ${metaAtom.atomPath}`);
        }
        break;
      case 1:
      // UTF-8: Without any count or NULL terminator
      case 18:
        await this.addTag(tagKey, textDecode(dataAtom.value), scope);
        break;
      case 13:
        await this.addTag(tagKey, {
          format: "image/jpeg",
          data: Uint8Array.from(dataAtom.value)
        }, scope);
        break;
      case 14:
        await this.addTag(tagKey, {
          format: "image/png",
          data: Uint8Array.from(dataAtom.value)
        }, scope);
        break;
      case 21:
        await this.addTag(tagKey, _MP4Parser.read_BE_Integer(dataAtom.value, true), scope);
        break;
      case 22:
        await this.addTag(tagKey, _MP4Parser.read_BE_Integer(dataAtom.value, false), scope);
        break;
      case 65:
        await this.addTag(tagKey, INT8.get(dataAtom.value, 0), scope);
        break;
      case 66:
        await this.addTag(tagKey, INT16_BE.get(dataAtom.value, 0), scope);
        break;
      case 67:
        await this.addTag(tagKey, INT32_BE.get(dataAtom.value, 0), scope);
        break;
      default:
        this.addWarning(`atom key=${tagKey}, has unknown well-known-type (data-type): ${dataAtom.type.type}`);
    }
  }
  getDuration(header) {
    if (header && header.timeScale > 0 && header.duration > 0 && header.duration !== 4294967295 && header.duration !== Number(0xffffffffffffffffn)) {
      return header.duration / header.timeScale;
    }
    return void 0;
  }
  calculateTrackTiming(track) {
    var _a;
    const timeScale = (_a = track.media.header) == null ? void 0 : _a.timeScale;
    track.duration = this.getDuration(track.media.header);
    track.endTime = track.duration;
    let sampleCount = track.timeToSampleTable.reduce((sum, entry) => sum + entry.count, 0);
    let timeUnits = track.timeToSampleTable.reduce((sum, entry) => sum + entry.count * entry.duration, 0);
    const fragments = track.fragmentStatistics;
    if (fragments) {
      const size = (track.sizeInBytes ?? 0) + fragments.size;
      const sizesComplete = (track.sampleCount === 0 || track.sizeInBytes !== void 0) && fragments.sizesComplete;
      sampleCount += fragments.sampleCount;
      if (sizesComplete && Number.isSafeInteger(size)) {
        track.sizeInBytes = size;
      } else {
        track.sizeInBytes = void 0;
      }
      if (fragments.timingComplete && timeScale && fragments.start !== void 0 && Number.isSafeInteger(fragments.end)) {
        timeUnits += fragments.end - fragments.start;
        track.duration = Math.max(track.duration ?? 0, timeUnits / timeScale);
        track.endTime = Math.max(fragments.end / timeScale, track.duration);
      } else {
        timeUnits = 0;
      }
    } else if (track.duration === void 0 && timeScale && timeUnits > 0) {
      track.duration = timeUnits / timeScale;
      track.endTime = track.duration;
    }
    if (timeScale && timeUnits > 0 && sampleCount > 0 && Number.isSafeInteger(sampleCount)) {
      track.frameRate = sampleCount * timeScale / timeUnits;
    }
    if (track.duration === void 0 && this.movieHeader && track.header.duration > 0 && track.header.duration !== 4294967295 && track.header.duration !== Number(0xffffffffffffffffn) && this.movieHeader.timeScale > 0) {
      track.duration = track.header.duration / this.movieHeader.timeScale;
      track.endTime = track.duration;
    }
  }
  aggregateFragment(track, header, run, decodeTime) {
    if (run.sampleCount === 0) {
      return;
    }
    const defaults = this.trackDefaults.get(track.header.trackId);
    const fragments = track.fragmentStatistics ?? (track.fragmentStatistics = {
      cursor: track.timeToSampleTable.reduce((sum, entry) => sum + entry.count * entry.duration, 0),
      end: 0,
      sampleCount: 0,
      size: 0,
      timingComplete: true,
      sizesComplete: true
    });
    fragments.cursor = decodeTime ?? fragments.cursor;
    fragments.start = fragments.start === void 0 ? fragments.cursor : Math.min(fragments.start, fragments.cursor);
    const defaultDuration = header.defaultSampleDuration ?? (defaults == null ? void 0 : defaults.duration);
    const defaultSize = header.defaultSampleSize ?? (defaults == null ? void 0 : defaults.size);
    if (run.flags.sampleDurationPresent) {
      fragments.cursor += run.duration;
      fragments.timingComplete && (fragments.timingComplete = run.timingComplete);
    } else if (defaultDuration !== void 0 && defaultDuration > 0) {
      fragments.cursor += defaultDuration * run.sampleCount;
    } else {
      fragments.timingComplete = false;
    }
    if (run.flags.sampleSizePresent) {
      fragments.size += run.size;
    } else if (defaultSize !== void 0) {
      fragments.size += defaultSize * run.sampleCount;
    } else {
      fragments.sizesComplete = false;
    }
    fragments.sampleCount += run.sampleCount;
    fragments.end = Math.max(fragments.end, fragments.cursor);
  }
  getTrackInfo(track) {
    var _a, _b, _c;
    const info = {
      id: track.header.trackId,
      flagEnabled: (track.header.flags & 1) !== 0
    };
    switch ((_a = track.handler) == null ? void 0 : _a.handlerType) {
      case "soun":
      case "audi":
        info.type = TrackType.audio;
        break;
      case "vide":
        info.type = TrackType.video;
        break;
      case "text":
      case "sbtl":
      case "subt":
      case "clcp":
        info.type = TrackType.subtitle;
        break;
      case "meta":
      case "mdta":
        info.type = TrackType.metadata;
        break;
      default:
        if (isAudioTrack(track)) {
          info.type = TrackType.audio;
        }
    }
    const mediaHeader = track.media.header;
    if (mediaHeader) {
      const letters = [10, 5, 0].map((shift) => mediaHeader.language >> shift & 31);
      if (letters.every((letter) => letter >= 1 && letter <= 26)) {
        info.language = String.fromCharCode(...letters.map((letter) => letter + 96));
      }
    }
    if (track.duration !== void 0) {
      info.duration = track.duration;
    }
    const size = track.sizeInBytes;
    if (size !== void 0 && info.duration && info.duration > 0) {
      info.bitrate = 8 * size / info.duration;
    }
    const ssd = track.soundSampleDescription[0];
    if (ssd) {
      info.codecId = ssd.dataFormat;
      const encoder = ssd.encoder ?? encoderDict[ssd.dataFormat];
      info.codecName = (encoder == null ? void 0 : encoder.format) ?? `<${ssd.dataFormat}>`;
      if (info.type === TrackType.audio) {
        if (encoder) {
          info.lossless = !encoder.lossy;
        }
        if (ssd.description) {
          info.audio = {};
          if (ssd.description.sampleRate > 0) {
            info.audio.samplingFrequency = ssd.description.sampleRate;
          }
          if (ssd.description.numAudioChannels > 0) {
            info.audio.channels = ssd.description.numAudioChannels;
          }
          if (ssd.description.sampleSize && ssd.description.sampleSize > 0) {
            info.audio.bitDepth = ssd.description.sampleSize;
          }
        }
      }
    }
    const description = (_c = (_b = track.sampleDescriptions) == null ? void 0 : _b[0]) == null ? void 0 : _c.description;
    if (info.type === TrackType.video) {
      info.video = {};
      if (track.frameRate !== void 0) {
        info.video.frameRate = track.frameRate;
      }
      if (track.header.displayWidth && track.header.displayHeight) {
        info.video.displayWidth = track.header.displayWidth;
        info.video.displayHeight = track.header.displayHeight;
      }
    }
    if (info.video && description && description.length >= 20) {
      const pixelWidth = UINT16_BE.get(description, 16);
      const pixelHeight = UINT16_BE.get(description, 18);
      if (pixelWidth > 0 && pixelHeight > 0) {
        info.video.pixelWidth = pixelWidth;
        info.video.pixelHeight = pixelHeight;
      }
    }
    return info;
  }
  async parseTrackBox(trakBox) {
    const track = {
      media: {},
      soundSampleDescription: [],
      chunkOffsetTable: [],
      sampleSize: 0,
      sampleCount: 0,
      sampleSizeTable: [],
      sampleToChunkTable: [],
      timeToSampleTable: []
    };
    await trakBox.readAtoms(this.tokenizer, async (child) => {
      var _a, _b, _c, _d;
      const payLoadLength = child.getPayloadLength();
      switch (child.header.name) {
        case "chap": {
          const chap = await this.readToken(new ChapterTrackReferenceBox(payLoadLength, maxMp4StructureEntries));
          track.chapterList = chap;
          break;
        }
        case "tkhd":
          track.header = await this.readToken(new TrackHeaderAtom(payLoadLength));
          break;
        case "hdlr":
          if (((_a = child.parent) == null ? void 0 : _a.header.name) !== "mdia" || child.parent.parent !== trakBox) {
            await this.tokenizer.ignore(payLoadLength);
            break;
          }
          track.handler = await this.readToken(new HandlerBox(payLoadLength));
          if (track.handler.handlerType === "audi" || track.handler.handlerType === "soun") {
            this.hasAudioTrack = true;
          } else if (track.handler.handlerType === "vide") {
            this.hasVideoTrack = true;
          }
          break;
        case "mdhd": {
          const mdhd_data = await this.readToken(new MdhdAtom(payLoadLength));
          track.media.header = mdhd_data;
          break;
        }
        case "stco":
        case "co64": {
          const token = child.header.name === "co64" ? new Co64Atom(payLoadLength, maxMp4StructureEntries) : new StcoAtom(payLoadLength, maxMp4StructureEntries);
          const stco = await this.readToken(token);
          track.chunkOffsetTable = stco.entries;
          break;
        }
        case "stsc": {
          const stsc = await this.readToken(new StscAtom(payLoadLength, maxMp4StructureEntries));
          track.sampleToChunkTable = stsc.entries;
          break;
        }
        case "stsd": {
          const stsd = await this.readToken(new StsdAtom(payLoadLength, maxMp4StructureEntries));
          track.sampleDescriptions = stsd.table;
          track.soundSampleDescription = stsd.table.map((dfEntry) => this.parseSoundSampleDescription(dfEntry));
          break;
        }
        case "stts": {
          const stts = await this.readToken(new SttsAtom(payLoadLength, maxMp4StructureEntries));
          track.timeToSampleTable = stts.entries;
          break;
        }
        case "stsz": {
          const stsz = await this.readToken(new StszAtom(payLoadLength, this.options.includeChapters ? this.maxChapterCount : 0));
          track.sampleSize = stsz.sampleSize;
          track.sampleCount = stsz.numberOfEntries;
          track.sampleSizeTable = stsz.entries;
          track.sizeInBytes = stsz.totalSize;
          break;
        }
        case "dinf":
        case "vmhd":
        case "smhd":
          debug3(`Ignoring: ${child.header.name}`);
          await this.tokenizer.ignore(payLoadLength);
          break;
        default: {
          if (((_b = child.parent) == null ? void 0 : _b.header.name) === "ilst" || ((_c = child.parent) == null ? void 0 : _c.header.name) === "<id>" || child.header.name === "keys" && ((_d = child.parent) == null ? void 0 : _d.header.name) === "meta") {
            await this.handleAtom(child, payLoadLength);
            break;
          }
          debug3(`Unexpected track box: ${child.header.name}`);
          await this.tokenizer.ignore(payLoadLength);
        }
      }
    }, trakBox.getPayloadLength());
    if (track.header) {
      if (!this.tracks.has(track.header.trackId)) {
        this.assertRetainedEntryCapacity(this.tracks.size, "MP4 track");
      }
      this.tracks.set(track.header.trackId, { ...track, header: track.header });
    }
  }
  async parseTrackFragmentBox(trafBox) {
    let tfhd;
    let decodeTime;
    const runs = [];
    let remainingSamples = maxMp4StructureEntries;
    await trafBox.readAtoms(this.tokenizer, async (child) => {
      const length = child.getPayloadLength();
      switch (child.header.name) {
        case "tfhd":
          tfhd = await this.readToken(new TrackFragmentHeaderBox(length));
          break;
        case "tfdt": {
          const data = await this.readToken(new Uint8ArrayType(length));
          if (length < 4 || data[0] === 0 && length < 8 || data[0] === 1 && length < 12) {
            throw new Mp4ContentError("Truncated tfdt box");
          }
          if (data[0] === 0) {
            decodeTime = UINT32_BE.get(data, 4);
          } else if (data[0] === 1) {
            decodeTime = Number(UINT64_BE.get(data, 4));
          } else {
            throw new Mp4ContentError("Invalid tfdt version");
          }
          if (!Number.isSafeInteger(decodeTime)) {
            throw new Mp4ContentError("Unsafe tfdt decode time");
          }
          break;
        }
        case "trun": {
          const run = await this.readToken(new TrackRunBox(length, remainingSamples));
          remainingSamples -= run.explicitSampleCount;
          runs.push(run);
          break;
        }
        default:
          await this.tokenizer.ignore(length);
      }
    }, trafBox.getPayloadLength());
    if (tfhd) {
      const track = this.tracks.get(tfhd.trackId);
      for (const run of runs) {
        if (track) {
          this.aggregateFragment(track, tfhd, run, decodeTime);
        }
        decodeTime = void 0;
      }
    }
  }
  /**
   * @param sampleDescription
   * Ref: https://developer.apple.com/library/archive/documentation/QuickTime/QTFF/QTFFChap3/qtff3.html#//apple_ref/doc/uid/TP40000939-CH205-128916
   */
  parseSoundSampleDescription(sampleDescription) {
    const ssd = {
      dataFormat: sampleDescription.dataFormat,
      dataReferenceIndex: sampleDescription.dataReferenceIndex
    };
    let offset = 0;
    const { description } = sampleDescription;
    if (description && description.length >= SoundSampleDescriptionVersion.len) {
      const version = SoundSampleDescriptionVersion.get(description, offset);
      offset += SoundSampleDescriptionVersion.len;
      if (version.version === 0 || version.version === 1) {
        if (description.length >= offset + SoundSampleDescriptionV0.len) {
          ssd.description = SoundSampleDescriptionV0.get(description, offset);
          if (ssd.dataFormat === "mp4a") {
            const childOffset = offset + SoundSampleDescriptionV0.len + (version.version === 1 ? 16 : 0);
            if (childOffset > description.length) {
              throw new Mp4ContentError("Truncated mp4a sound sample description");
            }
            const audioConfig = this.readAudioConfig(description, childOffset);
            if ((audioConfig == null ? void 0 : audioConfig.objectType) === 36) {
              ssd.encoder = { format: "MPEG-4/ALS", lossy: false };
            }
            if (audioConfig == null ? void 0 : audioConfig.channels) {
              ssd.description.numAudioChannels = audioConfig.channels;
            }
          }
        } else {
          debug3(`Warning: sound-sample-description too short: ${description.length} bytes`);
        }
      } else {
        debug3(`Warning: sound-sample-description ${version} not implemented`);
      }
    }
    return ssd;
  }
  /** Read codec configuration only inside the bounded AudioSampleEntry child boxes. */
  readAudioConfig(data, offset) {
    while (offset < data.length) {
      this.reserveAtom();
      if (data.length - offset < 8) {
        throw new Mp4ContentError("Truncated mp4a child box header");
      }
      let size = UINT32_BE.get(data, offset);
      const name = Header.get(data, offset).name;
      let headerSize = 8;
      if (size === 1) {
        if (data.length - offset < 16) {
          throw new Mp4ContentError("Truncated mp4a extended child box header");
        }
        const extendedSize = UINT64_BE.get(data, offset + 8);
        if (extendedSize > BigInt(data.length - offset)) {
          throw new Mp4ContentError("mp4a child box exceeds sample entry");
        }
        size = Number(extendedSize);
        headerSize = 16;
      } else if (size === 0) {
        size = data.length - offset;
      }
      if (size < headerSize || size > data.length - offset) {
        throw new Mp4ContentError("Invalid mp4a child box size");
      }
      if (name === "esds") {
        return this.readEsdsAudioConfig(data.subarray(offset + headerSize, offset + size));
      }
      offset += size;
    }
  }
  /** ISO/IEC 14496-1 descriptor sizes have at most four base-128 bytes. */
  *readDescriptors(data, offset) {
    while (offset < data.length) {
      this.reserveAtom();
      const tag = data[offset++];
      let size = 0;
      for (let i = 0; ; i++) {
        if (offset >= data.length || i === 4) {
          throw new Mp4ContentError("Truncated or invalid MPEG-4 descriptor length");
        }
        const byte = data[offset++];
        size = size << 7 | byte & 127;
        if (!(byte & 128)) {
          break;
        }
      }
      if (size > data.length - offset) {
        throw new Mp4ContentError("MPEG-4 descriptor exceeds its parent");
      }
      yield { tag, body: data.subarray(offset, offset + size) };
      offset += size;
    }
  }
  readEsdsAudioConfig(data) {
    if (data.length < 4) {
      throw new Mp4ContentError("Truncated esds full-box header");
    }
    for (const es of this.readDescriptors(data, 4)) {
      if (es.tag !== 3) {
        continue;
      }
      if (es.body.length < 3) {
        throw new Mp4ContentError("Truncated ES descriptor");
      }
      const flags = es.body[2];
      let offset = 3 + (flags & 128 ? 2 : 0);
      if (flags & 64) {
        if (offset >= es.body.length) {
          throw new Mp4ContentError("Truncated ES URL length");
        }
        offset += 1 + es.body[offset];
      }
      offset += flags & 32 ? 2 : 0;
      if (offset > es.body.length) {
        throw new Mp4ContentError("Truncated optional ES descriptor fields");
      }
      for (const decoder of this.readDescriptors(es.body, offset)) {
        if (decoder.tag !== 4) {
          continue;
        }
        if (decoder.body.length < 13) {
          throw new Mp4ContentError("Truncated decoder configuration");
        }
        if (decoder.body[0] !== 64 || decoder.body[1] >>> 2 !== 5) {
          continue;
        }
        for (const specific of this.readDescriptors(decoder.body, 13)) {
          if (specific.tag !== 5) {
            continue;
          }
          if (specific.body.length === 0 || specific.body[0] >>> 3 === 31 && specific.body.length < 2) {
            throw new Mp4ContentError("Truncated AudioSpecificConfig object type");
          }
          const type = specific.body[0] >>> 3;
          if (type === 31) {
            return { objectType: 32 + ((specific.body[0] & 7) << 3) + (specific.body[1] >>> 5) };
          }
          return { objectType: type, channels: readAacLcChannels(type, specific.body) };
        }
      }
    }
  }
  async parseChapters(mediaDataRanges, forwardOnly = false) {
    for (const track of this.tracks.values()) {
      for (const id of track.chapterList ?? []) {
        const chapterTrack = this.tracks.get(id);
        if (!chapterTrack || chapterTrack === track || chapterTrack.handler && !["text", "sbtl"].includes(chapterTrack.handler.handlerType)) {
          continue;
        }
        try {
          await this.parseChapterTrack(chapterTrack, track, mediaDataRanges, forwardOnly);
        } catch (error) {
          if (this.neroChapters.length === 0 || !(error instanceof Mp4ContentError)) {
            throw error;
          }
          this.streamedChapterCount = void 0;
          this.streamedChapters.clear();
          this.addWarning(`Cannot read chapter track: ${error.message}`);
        }
        return;
      }
    }
  }
  async parseChapterTrack(chapterTrack, track, mediaDataRanges, forwardOnly) {
    var _a, _b, _c, _d;
    const timeScale = (_a = chapterTrack.media.header) == null ? void 0 : _a.timeScale;
    if (timeScale === void 0 || timeScale <= 0) {
      throw new Mp4ContentError("Invalid chapter track timescale");
    }
    const sampleCount = Math.min(chapterTrack.sampleCount, this.maxChapterCount);
    if (chapterTrack.sampleCount > this.maxChapterCount) {
      this.addWarning(`Chapter count exceeds the ${this.maxChapterCount} chapter limit`);
    }
    if (forwardOnly) {
      this.streamedChapterCount = sampleCount;
    }
    const chapters = [];
    let sampleIndex = 0;
    let timeRun = 0;
    let samplesInTimeRun = ((_b = chapterTrack.timeToSampleTable[0]) == null ? void 0 : _b.count) ?? 0;
    let start = 0;
    const chunkRuns = chapterTrack.sampleToChunkTable;
    for (let run = 0; run < chunkRuns.length && sampleIndex < sampleCount; ++run) {
      const { firstChunk, samplesPerChunk } = chunkRuns[run];
      const nextFirstChunk = ((_c = chunkRuns[run + 1]) == null ? void 0 : _c.firstChunk) ?? chapterTrack.chunkOffsetTable.length + 1;
      if (run === 0 && firstChunk !== 1 || firstChunk < 1 || samplesPerChunk === 0 || nextFirstChunk <= firstChunk || nextFirstChunk > chapterTrack.chunkOffsetTable.length + 1) {
        throw new Mp4ContentError("Invalid chapter sample-to-chunk table");
      }
      for (let chunk = firstChunk - 1; chunk < nextFirstChunk - 1 && sampleIndex < sampleCount; ++chunk) {
        let offset = chapterTrack.chunkOffsetTable[chunk];
        for (let sample = 0; sample < samplesPerChunk && sampleIndex < sampleCount; ++sample) {
          while (samplesInTimeRun === 0 && timeRun < chapterTrack.timeToSampleTable.length) {
            samplesInTimeRun = ((_d = chapterTrack.timeToSampleTable[++timeRun]) == null ? void 0 : _d.count) ?? 0;
          }
          const timing = chapterTrack.timeToSampleTable[timeRun];
          if (!timing) {
            throw new Mp4ContentError("Missing chapter sample timing");
          }
          const size = chapterTrack.sampleSize || chapterTrack.sampleSizeTable[sampleIndex];
          const deferred = forwardOnly && (this.streamedChapters.has(sampleIndex) || offset >= mediaDataRanges[0].end);
          if (!deferred) {
            if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || size < 0 || !mediaDataRanges.some((range) => offset >= range.offset && size <= range.end - offset)) {
              throw new Mp4ContentError("Chapter chunk exceeding media data bounds");
            }
            if (forwardOnly && offset < this.tokenizer.position) {
              throw new Mp4ContentError("Chapter chunk exceeding media data bounds");
            }
            const title = size < 2 || size > maxChapterTitleBytes ? "" : await this.readToken(new ChapterText(size), offset);
            const chapter = {
              title,
              timeScale,
              start
            };
            if (track.chunkOffsetTable.length > 0 && track.sampleToChunkTable.length > 0 && track.timeToSampleTable.length > 0) {
              track.chapterSampleLookup ?? (track.chapterSampleLookup = this.createSampleOffsetLookup(track));
              chapter.sampleOffset = track.chapterSampleLookup(offset + size);
            }
            if (forwardOnly) {
              this.streamedChapters.set(sampleIndex, chapter);
            } else {
              chapters.push(chapter);
            }
          }
          offset += size;
          start += timing.duration;
          --samplesInTimeRun;
          ++sampleIndex;
        }
      }
    }
    if (sampleIndex < sampleCount) {
      throw new Mp4ContentError("Missing chapter sample-to-chunk entries");
    }
    if (!forwardOnly) {
      this.metadata.setFormat("chapters", chapters);
    } else if (this.streamedChapters.size === sampleCount) {
      this.metadata.setFormat("chapters", [...this.streamedChapters].sort(([left], [right]) => left - right).map(([, chapter]) => chapter));
    }
  }
  /** Advance across monotone queries; restart for backward queries without sorting file tables. */
  createSampleOffsetLookup(track) {
    let previousChunk = 0;
    for (const entry of track.sampleToChunkTable) {
      if (previousChunk === 0 && entry.firstChunk !== 1 || entry.firstChunk <= previousChunk || entry.samplesPerChunk === 0) {
        throw new Mp4ContentError("Invalid audio sample-to-chunk table");
      }
      previousChunk = entry.firstChunk;
    }
    let chunkIndex = 0;
    let chunkId = 1;
    let chunkRun = 0;
    let timingIndex = 0;
    let remainingSamples = 0;
    let sampleDuration = 0;
    let totalDuration = 0;
    let previousOffset = Number.NEGATIVE_INFINITY;
    return (chapterOffset) => {
      var _a;
      if (chapterOffset < previousOffset) {
        chunkIndex = chunkRun = timingIndex = remainingSamples = sampleDuration = totalDuration = 0;
        chunkId = 1;
      }
      previousOffset = chapterOffset;
      while (chunkIndex < track.chunkOffsetTable.length && track.chunkOffsetTable[chunkIndex] < chapterOffset) {
        ++chunkIndex;
      }
      const targetChunk = chunkIndex + 1;
      for (; chunkId < targetChunk; ++chunkId) {
        while (((_a = track.sampleToChunkTable[chunkRun + 1]) == null ? void 0 : _a.firstChunk) <= chunkId) {
          ++chunkRun;
        }
        let samplesPerChunk = track.sampleToChunkTable[chunkRun].samplesPerChunk;
        while (samplesPerChunk > 0) {
          while (remainingSamples === 0) {
            const timing = track.timeToSampleTable[timingIndex++];
            if (!timing) {
              throw new Mp4ContentError("Missing audio sample timing for chapter offset");
            }
            remainingSamples = timing.count;
            sampleDuration = timing.duration;
          }
          const samples = Math.min(remainingSamples, samplesPerChunk);
          totalDuration += samples * sampleDuration;
          if (!Number.isSafeInteger(totalDuration)) {
            throw new Mp4ContentError("Unsafe audio sample timing for chapter offset");
          }
          remainingSamples -= samples;
          samplesPerChunk -= samples;
        }
      }
      return totalDuration;
    };
  }
};
export {
  MP4Parser
};
//# sourceMappingURL=MP4Parser-OAELRODP.js.map
