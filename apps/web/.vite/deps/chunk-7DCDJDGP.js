import {
  Genres
} from "./chunk-47WSSSOY.js";
import {
  AttachedPictureType,
  ID3v2Header,
  SyncTextHeader,
  TextEncodingToken,
  TextHeader,
  UINT32SYNCSAFE
} from "./chunk-GQBXDRBH.js";
import {
  decodeString,
  decodeUintBE,
  findZero,
  getBit,
  splitText
} from "./chunk-O76RKEBI.js";
import {
  UINT24_BE,
  UINT32_BE,
  UINT8,
  defaultMaxMetadataEntries,
  getMaxChapterCount,
  getMaxMetadataEntries,
  makeUnexpectedFileContentError,
  readBuffer,
  textDecode
} from "./chunk-3HBPJLK7.js";
import {
  require_browser
} from "./chunk-ZGKN2RSD.js";
import {
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/id3v2/FrameParser.js
var import_debug = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/id3v2/ID3v2ChapterToken.js
var ChapterInfo = {
  len: 16,
  get: (buf, off) => {
    const startOffset = UINT32_BE.get(buf, off + 8);
    const endOffset = UINT32_BE.get(buf, off + 12);
    return {
      startTime: UINT32_BE.get(buf, off),
      endTime: UINT32_BE.get(buf, off + 4),
      startOffset: startOffset === 4294967295 ? void 0 : startOffset,
      endOffset: endOffset === 4294967295 ? void 0 : endOffset
    };
  }
};

// ../../node_modules/music-metadata/lib/id3v2/FrameParser.js
var debug = (0, import_debug.default)("music-metadata:id3v2:frame-parser");
var defaultEnc = "latin1";
var urlEnc = { encoding: defaultEnc, bom: false };
function parseGenre(origVal, maxEntries = defaultMaxMetadataEntries) {
  const genres = [];
  const addGenre = (genre) => {
    if (genres.length >= maxEntries) {
      throw new Id3v2ContentError(`TCON value count ${genres.length + 1} exceeds entry limit ${maxEntries}`);
    }
    genres.push(genre);
  };
  let word = "";
  for (let offset = 0; offset < origVal.length; ) {
    const open = origVal.indexOf("(", offset);
    if (open < 0) {
      word += origVal.slice(offset);
      break;
    }
    word += origVal.slice(offset, open);
    if (origVal[open + 1] === "(") {
      word += "(";
      offset = open + 2;
      continue;
    }
    const close = origVal.indexOf(")", open + 1);
    if (close < 0) {
      break;
    }
    if (word !== "") {
      addGenre(word);
      word = "";
    }
    const genre = parseGenreCode(origVal.slice(open + 1, close));
    if (genre) {
      addGenre(genre);
    }
    offset = close + 1;
  }
  if (word) {
    if (genres.length === 0 && word.match(/^\d*$/)) {
      word = parseGenreCode(word);
    }
    if (word) {
      addGenre(word);
    }
  }
  return genres;
}
function parseGenreCode(code) {
  if (code === "RX") {
    return "Remix";
  }
  if (code === "CR") {
    return "Cover";
  }
  if (code.match(/^\d*$/)) {
    return Genres[Number.parseInt(code, 10)];
  }
}
var FrameParser = class _FrameParser {
  /**
   * Create id3v2 frame parser
   * @param major - Major version, e.g. (4) for  id3v2.4
   * @param warningCollector - Used to collect decode issue
   */
  constructor(major, warningCollector, maxEntries = defaultMaxMetadataEntries) {
    __publicField(this, "maxEntries");
    __publicField(this, "embeddedFrameDepth", 0);
    __publicField(this, "major");
    __publicField(this, "warningCollector");
    __publicField(this, "validateTextValues", (count, context) => {
      if (count > this.maxEntries) {
        throw new Id3v2ContentError(`${context} value count ${count} exceeds entry limit ${this.maxEntries}`);
      }
    });
    this.maxEntries = maxEntries;
    this.major = major;
    this.warningCollector = warningCollector;
  }
  readData(uint8Array, type, includeCovers) {
    if (uint8Array.length === 0) {
      if (type === "CHAP" || type === "CTOC") {
        throw new Id3v2ContentError(`Truncated ${type} header`);
      }
      this.warningCollector.addWarning(`id3v2.${this.major} header has empty tag type=${type}`);
      return;
    }
    const { encoding, bom } = TextEncodingToken.get(uint8Array, 0);
    const length = uint8Array.length;
    let offset = 0;
    let output = [];
    const nullTerminatorLength = _FrameParser.getNullTerminatorLength(encoding);
    let fzero;
    debug(`Parsing tag type=${type}, encoding=${encoding}, bom=${bom}`);
    switch (type !== "TXXX" && type[0] === "T" ? "T*" : type) {
      case "T*":
      // 4.2.1. Text information frames - details
      case "GRP1":
      // iTunes-specific ID3v2 grouping field
      case "GP1":
      // iTunes-specific ID3v2.2 grouping field
      case "IPL":
      // v2.2: Involved people list
      case "IPLS":
      // v2.3: Involved people list
      case "MVIN":
      case "MVNM":
      case "PCS":
      case "PCST": {
        let text;
        try {
          text = _FrameParser.trimNullPadding(decodeString(uint8Array.subarray(1), encoding));
        } catch (error) {
          if (error instanceof Error) {
            this.warningCollector.addWarning(`id3v2.${this.major} type=${type} header has invalid string value: ${error.message}`);
            break;
          }
          throw error;
        }
        switch (type) {
          case "TMCL":
          // Musician credits list
          case "TIPL":
          // Involved people list
          case "IPL":
          // v2.2: Involved people list
          case "IPLS":
            output = this.functionList(this.splitValue(type, text));
            break;
          case "TRK":
          case "TRCK":
          case "TPOS":
          case "TIT1":
          case "TIT2":
          case "TIT3":
            output = text;
            break;
          case "TCOM":
          case "TEXT":
          case "TOLY":
          case "TOPE":
          case "TPE1":
          case "TSRC":
            output = this.splitValue(type, text);
            break;
          case "TCO":
          case "TCON": {
            const genres = [];
            for (const value of this.splitValue(type, text)) {
              for (const genre of parseGenre(value, this.maxEntries)) {
                this.validateTextValues(genres.length + 1, "TCON");
                genres.push(genre);
              }
            }
            output = genres;
            break;
          }
          case "PCS":
          case "PCST":
            output = this.major >= 4 ? this.splitValue(type, text) : [text];
            output = Array.isArray(output) && output[0] === "" ? 1 : 0;
            break;
          default:
            output = this.major >= 4 ? this.splitValue(type, text) : [text];
        }
        break;
      }
      case "TXXX": {
        const idAndData = _FrameParser.readIdentifierAndData(uint8Array.subarray(1), encoding);
        output = {
          description: idAndData.id,
          text: this.splitValue(type, _FrameParser.trimNullPadding(decodeString(idAndData.data, encoding)), idAndData.id)
        };
        break;
      }
      case "PIC":
      case "APIC":
        if (includeCovers) {
          const pic = {};
          uint8Array = uint8Array.subarray(1);
          switch (this.major) {
            case 2:
              pic.format = decodeString(uint8Array.subarray(0, 3), "latin1");
              uint8Array = uint8Array.subarray(3);
              break;
            case 3:
            case 4:
              fzero = findZero(uint8Array, defaultEnc);
              pic.format = decodeString(uint8Array.subarray(0, fzero), defaultEnc);
              uint8Array = uint8Array.subarray(fzero + 1);
              break;
            default:
              throw makeUnexpectedMajorVersionError(this.major);
          }
          pic.format = _FrameParser.fixPictureMimeType(pic.format);
          pic.type = AttachedPictureType[uint8Array[0]];
          uint8Array = uint8Array.subarray(1);
          fzero = findZero(uint8Array, encoding);
          pic.description = decodeString(uint8Array.subarray(0, fzero), encoding);
          uint8Array = uint8Array.subarray(fzero + nullTerminatorLength);
          pic.data = uint8Array;
          output = pic;
        }
        break;
      case "CNT":
      case "PCNT":
        output = decodeUintBE(uint8Array);
        break;
      case "SYLT": {
        const syltHeader = SyncTextHeader.get(uint8Array, 0);
        uint8Array = uint8Array.subarray(SyncTextHeader.len);
        const result = {
          descriptor: "",
          language: syltHeader.language,
          contentType: syltHeader.contentType,
          timeStampFormat: syltHeader.timeStampFormat,
          syncText: []
        };
        let readSyllables = false;
        while (uint8Array.length > 0) {
          const nullStr = _FrameParser.readNullTerminatedString(uint8Array, syltHeader.encoding);
          uint8Array = uint8Array.subarray(nullStr.len);
          if (readSyllables) {
            this.validateTextValues(result.syncText.length + 1, "SYLT");
            const timestamp = UINT32_BE.get(uint8Array, 0);
            uint8Array = uint8Array.subarray(UINT32_BE.len);
            result.syncText.push({
              text: nullStr.text,
              timestamp
            });
          } else {
            result.descriptor = nullStr.text;
            readSyllables = true;
          }
        }
        output = result;
        break;
      }
      case "ULT":
      case "USLT":
      case "COM":
      case "COMM": {
        const textHeader = TextHeader.get(uint8Array, offset);
        offset += TextHeader.len;
        const descriptorStr = _FrameParser.readNullTerminatedString(uint8Array.subarray(offset), textHeader.encoding);
        offset += descriptorStr.len;
        const textStr = _FrameParser.readNullTerminatedString(uint8Array.subarray(offset), textHeader.encoding);
        const comment = {
          language: textHeader.language,
          descriptor: descriptorStr.text,
          text: textStr.text
        };
        output = comment;
        break;
      }
      case "UFID": {
        const ufid = _FrameParser.readIdentifierAndData(uint8Array, defaultEnc);
        output = { owner_identifier: ufid.id, identifier: ufid.data };
        break;
      }
      case "PRIV": {
        const priv = _FrameParser.readIdentifierAndData(uint8Array, defaultEnc);
        output = { owner_identifier: priv.id, data: priv.data };
        break;
      }
      case "POPM": {
        uint8Array = uint8Array.subarray(offset);
        const emailStr = _FrameParser.readNullTerminatedString(uint8Array, urlEnc);
        const email = emailStr.text;
        uint8Array = uint8Array.subarray(emailStr.len);
        if (uint8Array.length === 0) {
          this.warningCollector.addWarning(`id3v2.${this.major} type=${type} POPM frame missing rating byte`);
          output = { email, rating: 0, counter: void 0 };
          break;
        }
        const rating = UINT8.get(uint8Array, 0);
        const counterBytes = uint8Array.subarray(UINT8.len);
        output = {
          email,
          rating,
          counter: counterBytes.length > 0 ? decodeUintBE(counterBytes) : void 0
        };
        break;
      }
      case "GEOB": {
        const encoding2 = TextEncodingToken.get(uint8Array, 0);
        uint8Array = uint8Array.subarray(1);
        const mimeTypeStr = _FrameParser.readNullTerminatedString(uint8Array, urlEnc);
        const mimeType = mimeTypeStr.text;
        uint8Array = uint8Array.subarray(mimeTypeStr.len);
        const filenameStr = _FrameParser.readNullTerminatedString(uint8Array, encoding2);
        const filename = filenameStr.text;
        uint8Array = uint8Array.subarray(filenameStr.len);
        const descriptionStr = _FrameParser.readNullTerminatedString(uint8Array, encoding2);
        const description = descriptionStr.text;
        uint8Array = uint8Array.subarray(descriptionStr.len);
        const geob = {
          type: mimeType,
          filename,
          description,
          data: uint8Array
        };
        output = geob;
        break;
      }
      // W-Frames:
      case "WCOM":
      case "WCOP":
      case "WOAF":
      case "WOAR":
      case "WOAS":
      case "WORS":
      case "WPAY":
      case "WPUB":
        output = _FrameParser.readNullTerminatedString(uint8Array, urlEnc).text;
        break;
      case "WXXX": {
        const encoding2 = TextEncodingToken.get(uint8Array, 0);
        uint8Array = uint8Array.subarray(1);
        const descriptionStr = _FrameParser.readNullTerminatedString(uint8Array, encoding2);
        const description = descriptionStr.text;
        uint8Array = uint8Array.subarray(descriptionStr.len);
        output = { description, url: _FrameParser.trimNullPadding(decodeString(uint8Array, defaultEnc)) };
        break;
      }
      case "WFD":
      case "WFED": {
        const encoding2 = TextEncodingToken.get(uint8Array, 0);
        uint8Array = uint8Array.subarray(1);
        output = _FrameParser.readNullTerminatedString(uint8Array, encoding2).text;
        break;
      }
      case "MCDI": {
        output = uint8Array.subarray(0, length);
        break;
      }
      // ID3v2 Chapters 1.0
      // https://mutagen-specs.readthedocs.io/en/latest/id3/id3v2-chapters-1.0.html#chapter-frame
      case "CHAP": {
        debug("Reading CHAP");
        fzero = uint8Array.indexOf(0);
        if (fzero < 0) {
          throw new Id3v2ContentError("Missing CHAP element ID terminator");
        }
        if (length - fzero - 1 < ChapterInfo.len) {
          throw new Id3v2ContentError("Truncated CHAP header");
        }
        const chapter = {
          label: decodeString(uint8Array.subarray(0, fzero), defaultEnc),
          info: ChapterInfo.get(uint8Array, fzero + 1),
          frames: this.readEmbeddedFrames(uint8Array, fzero + 1 + ChapterInfo.len, includeCovers)
        };
        output = chapter;
        break;
      }
      // ID3v2 Chapters 1.0
      // https://mutagen-specs.readthedocs.io/en/latest/id3/id3v2-chapters-1.0.html#table-of-contents-frame
      case "CTOC": {
        debug("Reading CTOC");
        const idEnd = uint8Array.indexOf(0);
        if (idEnd < 0) {
          throw new Id3v2ContentError("Missing CTOC element ID terminator");
        }
        if (length - idEnd - 1 < 2) {
          throw new Id3v2ContentError("Truncated CTOC header");
        }
        const label = decodeString(uint8Array.subarray(0, idEnd), defaultEnc);
        offset = idEnd + 1;
        const flags = UINT8.get(uint8Array, offset++);
        const topLevel = (flags & 2) !== 0;
        const ordered = (flags & 1) !== 0;
        const entryCount = UINT8.get(uint8Array, offset++);
        const childElementIds = [];
        for (let i = 0; i < entryCount; i++) {
          const end = uint8Array.indexOf(0, offset);
          if (end < 0) {
            throw new Id3v2ContentError("Truncated CTOC child element ID");
          }
          const childId = decodeString(uint8Array.subarray(offset, end), defaultEnc);
          childElementIds.push(childId);
          offset = end + 1;
        }
        const toc = {
          label,
          flags: { topLevel, ordered },
          childElementIds,
          // Optional embedded sub-frames (e.g. TIT2) follow after the child list.
          frames: this.readEmbeddedFrames(uint8Array, offset, includeCovers)
        };
        output = toc;
        break;
      }
      default:
        debug(`Warning: unsupported id3v2-tag-type: ${type}`);
        break;
    }
    return output;
  }
  readEmbeddedFrames(data, offset, includeCovers) {
    const frames = /* @__PURE__ */ new Map();
    const headerLength = getFrameHeaderLength(this.major);
    while (offset < data.length) {
      if (data.length - offset < headerLength) {
        throw new Id3v2ContentError("Truncated embedded ID3v2 frame header");
      }
      const frame = readFrameHeader(data.subarray(offset), this.major, this.warningCollector);
      offset += headerLength;
      if (frame.length > data.length - offset) {
        throw new Id3v2ContentError(`Embedded ID3v2 frame ${frame.id} size ${frame.length} exceeds remaining chapter data`);
      }
      this.validateTextValues(frames.size + 1, "Embedded frame");
      if (this.embeddedFrameDepth >= 32) {
        throw new Id3v2ContentError("Embedded ID3v2 frame nesting exceeds limit 32");
      }
      ++this.embeddedFrameDepth;
      let value;
      try {
        value = this.readData(data.subarray(offset, offset + frame.length), frame.id, includeCovers);
      } finally {
        --this.embeddedFrameDepth;
      }
      offset += frame.length;
      frames.set(frame.id, value);
    }
    return frames;
  }
  static readNullTerminatedString(uint8Array, encoding) {
    const originalLen = uint8Array.length;
    const zeroIndex = findZero(uint8Array, encoding.encoding);
    if (zeroIndex >= originalLen) {
      return {
        text: decodeString(uint8Array, encoding.encoding),
        len: originalLen
      };
    }
    const txt = uint8Array.subarray(0, zeroIndex);
    return {
      text: decodeString(txt, encoding.encoding),
      len: zeroIndex + _FrameParser.getNullTerminatorLength(encoding.encoding)
    };
  }
  static fixPictureMimeType(pictureType) {
    pictureType = pictureType.toLocaleLowerCase();
    switch (pictureType) {
      case "jpg":
        return "image/jpeg";
      case "png":
        return "image/png";
    }
    return pictureType;
  }
  /**
   * Converts TMCL (Musician credits list) or TIPL (Involved people list)
   * @param entries
   */
  functionList(entries) {
    const roles = /* @__PURE__ */ new Map();
    for (let i = 0; i < entries.length; i += 2) {
      const role = entries[i];
      const people = entries[i + 1];
      if (role === void 0 || people === void 0) {
        break;
      }
      const names = splitText(people, ",", "people-list", this.validateTextValues, { keepEmpty: true });
      roles.set(role, (roles.get(role) ?? []).concat(names));
    }
    return Object.fromEntries(roles);
  }
  /**
   * id3v2.4 defines that multiple T* values are separated by 0x00
   * id3v2.3 defines that TCOM, TEXT, TOLY, TOPE & TPE1 values are separated by /
   * (TCON/TCO genre values are NOT slash-separated in ID3v2.3)
   * @param tag - Tag name
   * @param text - Concatenated tag value
   * @param description - User text description, for legacy slash-separated list compatibility
   * @returns Split tag value
   */
  splitValue(tag, text, description = "") {
    let values;
    if (this.major < 4) {
      values = splitText(text, "\0", tag, this.validateTextValues, { keepEmpty: true });
      if (values.length > 1) {
        if (tag !== "IPL" && tag !== "IPLS") {
          this.warningCollector.addWarning(`ID3v2.${this.major} ${tag} uses non standard null-separator.`);
        }
      } else if ([
        /* v2.3: */
        "TPE1",
        "TPE2",
        "TPE3",
        "TPE4",
        "TCOM",
        "TEXT",
        "TOLY",
        "TOPE",
        /* v2.2: */
        "TP1",
        "TCM",
        "TXT",
        "TOA",
        "TOL",
        "TSRC",
        // Retain legacy support for nonstandard slash-separated credits.
        "IPL",
        "IPLS"
      ].includes(tag) || // Preserve arbitrary TXXX text (XML, URLs, paths, etc.). Only known list
      // descriptions retain compatibility with Picard's legacy '/' separator.
      // https://picard-docs.musicbrainz.org/en/v2.13/config/options_tags_compatibility_id3.html
      tag === "TXXX" && [
        "ARTISTS",
        "MUSICBRAINZ ARTIST ID",
        "MUSICBRAINZ ALBUM ARTIST ID",
        "MUSICBRAINZ ALBUM TYPE",
        "ISRC"
      ].includes(description.toUpperCase())) {
        values = splitText(text, "/", tag, this.validateTextValues, { keepEmpty: true });
      }
    } else {
      values = splitText(text, "\0", tag, this.validateTextValues, { keepEmpty: true });
    }
    return _FrameParser.trimArray(values);
  }
  static trimArray(values) {
    return values.map((value) => _FrameParser.trimNullPadding(value).trim());
  }
  static trimNullPadding(value) {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 0) {
      end--;
    }
    return end === value.length ? value : value.slice(0, end);
  }
  static readIdentifierAndData(uint8Array, encoding) {
    const idStr = _FrameParser.readNullTerminatedString(uint8Array, { encoding, bom: false });
    return { id: idStr.text, data: uint8Array.subarray(idStr.len) };
  }
  static getNullTerminatorLength(enc) {
    return enc.startsWith("utf-16") ? 2 : 1;
  }
};
var Id3v2ContentError = class extends makeUnexpectedFileContentError("id3v2") {
};
function makeUnexpectedMajorVersionError(majorVer) {
  throw new Id3v2ContentError(`Unexpected majorVer: ${majorVer}`);
}

// ../../node_modules/music-metadata/lib/id3v2/FrameHeader.js
function getFrameHeaderLength(majorVer) {
  switch (majorVer) {
    case 2:
      return 6;
    case 3:
    case 4:
      return 10;
    default:
      throw makeUnexpectedMajorVersionError2(majorVer);
  }
}
function readFrameFlags(b, majorVer) {
  if (majorVer === 3) {
    return {
      status: {
        tag_alter_preservation: getBit(b, 0, 7),
        file_alter_preservation: getBit(b, 0, 6),
        read_only: getBit(b, 0, 5)
      },
      format: {
        compression: getBit(b, 1, 7),
        encryption: getBit(b, 1, 6),
        grouping_identity: getBit(b, 1, 5),
        // Unsynchronisation and data-length-indicator do not exist as per-frame flags in ID3v2.3.
        unsynchronisation: false,
        data_length_indicator: false
      }
    };
  }
  return {
    status: {
      tag_alter_preservation: getBit(b, 0, 6),
      file_alter_preservation: getBit(b, 0, 5),
      read_only: getBit(b, 0, 4)
    },
    format: {
      grouping_identity: getBit(b, 1, 6),
      compression: getBit(b, 1, 3),
      encryption: getBit(b, 1, 2),
      unsynchronisation: getBit(b, 1, 1),
      data_length_indicator: getBit(b, 1, 0)
    }
  };
}
function readFrameHeader(uint8Array, majorVer, warningCollector) {
  switch (majorVer) {
    case 2:
      return parseFrameHeaderV22(uint8Array, majorVer, warningCollector);
    case 3:
    case 4:
      return parseFrameHeaderV23V24(uint8Array, majorVer, warningCollector);
    default:
      throw makeUnexpectedMajorVersionError2(majorVer);
  }
}
function parseFrameHeaderV22(uint8Array, majorVer, warningCollector) {
  const header = {
    id: textDecode(uint8Array.subarray(0, 3), "ascii"),
    length: UINT24_BE.get(uint8Array, 3)
  };
  if (!header.id.match(/^[A-Z0-9]{3}$/)) {
    warningCollector.addWarning(`Invalid ID3v2.${majorVer} frame-header-ID: ${header.id}`);
  }
  return header;
}
function parseFrameHeaderV23V24(uint8Array, majorVer, warningCollector) {
  const header = {
    id: textDecode(uint8Array.subarray(0, 4), "ascii"),
    length: (majorVer === 4 ? UINT32SYNCSAFE : UINT32_BE).get(uint8Array, 4),
    flags: readFrameFlags(uint8Array.subarray(8, 10), majorVer)
  };
  if (!header.id.match(/^[A-Z0-9]{4}$/)) {
    warningCollector.addWarning(`Invalid ID3v2.${majorVer} frame-header-ID: ${header.id}`);
  }
  return header;
}
function makeUnexpectedMajorVersionError2(majorVer) {
  throw new Id3v2ContentError(`Unexpected majorVer: ${majorVer}`);
}

// ../../node_modules/music-metadata/lib/id3v2/ID3v2Parser.js
var ID3v2Parser = class _ID3v2Parser {
  constructor() {
    __publicField(this, "tokenizer");
    __publicField(this, "id3Header");
    __publicField(this, "metadata");
    __publicField(this, "headerType");
    __publicField(this, "options");
  }
  static removeUnsyncBytes(buffer) {
    let readI = 0;
    let writeI = 0;
    while (readI < buffer.length - 1) {
      if (readI !== writeI) {
        buffer[writeI] = buffer[readI];
      }
      readI += buffer[readI] === 255 && buffer[readI + 1] === 0 ? 2 : 1;
      writeI++;
    }
    if (readI < buffer.length) {
      buffer[writeI++] = buffer[readI];
    }
    return buffer.subarray(0, writeI);
  }
  static readFrameData(uint8Array, frameHeader, majorVer, includeCovers, warningCollector, maxEntries) {
    var _a, _b;
    const frameParser = new FrameParser(majorVer, warningCollector, maxEntries);
    switch (majorVer) {
      case 2:
        return frameParser.readData(uint8Array, frameHeader.id, includeCovers);
      case 3:
      case 4:
        if ((_a = frameHeader.flags) == null ? void 0 : _a.format.unsynchronisation) {
          uint8Array = _ID3v2Parser.removeUnsyncBytes(uint8Array);
        }
        if ((_b = frameHeader.flags) == null ? void 0 : _b.format.data_length_indicator) {
          uint8Array = uint8Array.subarray(4, uint8Array.length);
        }
        return frameParser.readData(uint8Array, frameHeader.id, includeCovers);
      default:
        throw makeUnexpectedMajorVersionError3(majorVer);
    }
  }
  /**
   * Create a combined tag key, of tag & description
   * @param tag e.g.: COM
   * @param description e.g. iTunPGAP
   * @returns string e.g. COM:iTunPGAP
   */
  static makeDescriptionTagName(tag, description) {
    return tag + (description ? `:${description}` : "");
  }
  async parse(metadata, tokenizer, options) {
    this.tokenizer = tokenizer;
    this.metadata = metadata;
    this.options = options;
    const id3Header = await this.tokenizer.readToken(ID3v2Header);
    if (id3Header.fileIdentifier !== "ID3") {
      throw new Id3v2ContentError("expected ID3-header file-identifier 'ID3' was not found");
    }
    const fileSize = this.tokenizer.fileInfo.size;
    if (fileSize !== void 0) {
      const remainingBytes = fileSize - this.tokenizer.position;
      if (id3Header.size > remainingBytes) {
        throw new Id3v2ContentError(`ID3v2 tag size ${id3Header.size} exceeds remaining file size ${remainingBytes}`);
      }
    }
    this.id3Header = id3Header;
    this.headerType = `ID3v2.${id3Header.version.major}`;
    await this.parseId3Data(id3Header.size);
    const chapters = this.mapId3v2Chapters(this.metadata.native[this.headerType]);
    this.metadata.setFormat("chapters", chapters);
  }
  getExtendedHeaderSize(data) {
    if (data.length < UINT32_BE.len) {
      throw new Id3v2ContentError("ID3v2 extended header size field exceeds tag boundary");
    }
    const extendedHeaderSize = this.id3Header.version.major === 4 ? UINT32SYNCSAFE.get(data, 0) : UINT32_BE.get(data, 0) + 4;
    const minimumSize = this.id3Header.version.major === 4 ? 6 : 10;
    if (extendedHeaderSize < minimumSize || extendedHeaderSize > data.length) {
      throw new Id3v2ContentError(`Invalid ID3v2 extended header size: ${extendedHeaderSize}`);
    }
    return extendedHeaderSize;
  }
  async parseId3Data(dataLen) {
    let uint8Array = await readBuffer(this.tokenizer, dataLen, this.options, void 0, (message) => new Id3v2ContentError(message));
    if (this.id3Header.flags.unsynchronisation && this.id3Header.version.major < 4) {
      uint8Array = _ID3v2Parser.removeUnsyncBytes(uint8Array);
    }
    if (this.id3Header.flags.isExtendedHeader) {
      uint8Array = uint8Array.subarray(this.getExtendedHeaderSize(uint8Array));
    }
    const tags = this.parseMetadata(uint8Array);
    for (const tag of tags) {
      switch (tag.id) {
        case "TXXX":
          if (tag.value) {
            await this.handleTag(tag, tag.value.text, () => tag.value.description);
          }
          break;
        default:
          await (Array.isArray(tag.value) ? Promise.all(tag.value.map((value) => this.addTag(tag.id, value))) : this.addTag(tag.id, tag.value));
      }
    }
    if (this.id3Header.version.major === 3) {
      await this.mapRecordingDate(tags);
    }
  }
  async mapRecordingDate(tags) {
    var _a;
    const text = (id) => {
      var _a2, _b;
      return (_b = (_a2 = tags.findLast((tag) => tag.id === id && tag.value.at(-1))) == null ? void 0 : _a2.value) == null ? void 0 : _b.at(-1);
    };
    const discogs = tags.findLast((tag) => tag.id === "TXXX" && tag.value.description.toUpperCase() === "DISCOGS_RELEASED" && tag.value.text.at(-1));
    const explicit = text("TDRC") ?? text("TDRV") ?? ((_a = discogs == null ? void 0 : discogs.value) == null ? void 0 : _a.text.at(-1));
    if (explicit) {
      await this.metadata.postMap(this.headerType, { id: "date", value: explicit });
      return;
    }
    const year = text("TYER");
    if (!year || !/^\d{4}$/.test(year)) {
      return;
    }
    let date = year;
    const dayMonth = text("TDAT");
    if (dayMonth && /^\d{4}$/.test(dayMonth)) {
      const day = Number(dayMonth.slice(0, 2));
      const month = Number(dayMonth.slice(2));
      const y = Number(year);
      const leapYear = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
      const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (day >= 1 && day <= daysInMonth[month - 1]) {
        date += `-${dayMonth.slice(2)}-${dayMonth.slice(0, 2)}`;
        const time = text("TIME");
        if (time && /^([01]\d|2[0-3])[0-5]\d$/.test(time)) {
          date += `T${time.slice(0, 2)}:${time.slice(2)}`;
        }
      }
    }
    await this.metadata.postMap(this.headerType, { id: "date", value: date });
  }
  async handleTag(tag, values, descriptor, resolveValue = (value) => value) {
    await Promise.all(values.map((value) => this.addTag(_ID3v2Parser.makeDescriptionTagName(tag.id, descriptor(value)), resolveValue(value))));
  }
  async addTag(id, value) {
    await this.metadata.addTag(this.headerType, id, value);
  }
  parseMetadata(data) {
    let offset = 0;
    let frameCount = 0;
    const tags = [];
    while (true) {
      if (offset === data.length) {
        break;
      }
      if (data[offset] === 0) {
        if (data.subarray(offset).some((byte) => byte !== 0)) {
          this.metadata.addWarning("Non-zero bytes found in ID3v2 padding");
        }
        break;
      }
      const frameHeaderLength = getFrameHeaderLength(this.id3Header.version.major);
      if (offset + frameHeaderLength > data.length) {
        this.metadata.addWarning("Illegal ID3v2 tag length");
        break;
      }
      const frameHeaderBytes = data.subarray(offset, offset + frameHeaderLength);
      offset += frameHeaderLength;
      const frameHeader = readFrameHeader(frameHeaderBytes, this.id3Header.version.major, this.metadata);
      if (++frameCount > getMaxMetadataEntries(this.options)) {
        throw new Id3v2ContentError("Frame count exceeds entry limit");
      }
      const frameDataBytes = data.subarray(offset, offset + frameHeader.length);
      offset += frameHeader.length;
      const values = _ID3v2Parser.readFrameData(frameDataBytes, frameHeader, this.id3Header.version.major, !this.options.skipCovers, this.metadata, getMaxMetadataEntries(this.options));
      if (values) {
        tags.push({ id: frameHeader.id, value: values });
      }
    }
    return tags;
  }
  /**
   * Convert parsed ID3v2 chapter frames (CHAP / CTOC) to generic `format.chapters`.
   *
   * This function expects the `native` tags already to contain parsed `CHAP` and `CTOC` frame values,
   * as produced by `FrameParser.readData`.
   */
  mapId3v2Chapters(id3Tags) {
    if (!id3Tags) {
      return;
    }
    const chapFrames = id3Tags.filter((t) => t.id === "CHAP").map((t) => t.value);
    if (!chapFrames.length) {
      return;
    }
    const tocFrames = id3Tags.filter((t) => t.id === "CTOC").map((t) => t.value);
    const topLevelToc = tocFrames.find((t) => t.flags.topLevel);
    const chapterById = /* @__PURE__ */ new Map();
    for (const chap of chapFrames) {
      chapterById.set(chap.label, chap);
    }
    const orderedIds = topLevelToc == null ? void 0 : topLevelToc.childElementIds;
    const chapters = [];
    const maxChapterCount = getMaxChapterCount(this.options);
    const source = orderedIds ?? [...chapterById.keys()].sort((left, right) => {
      var _a, _b;
      return (((_a = chapterById.get(left)) == null ? void 0 : _a.info.startTime) ?? 0) - (((_b = chapterById.get(right)) == null ? void 0 : _b.info.startTime) ?? 0);
    });
    for (const id of source) {
      const chap = chapterById.get(id);
      if (!chap) {
        continue;
      }
      const frames = chap.frames;
      const title = frames.get("TIT2") ?? "";
      if (chapters.length >= maxChapterCount) {
        this.metadata.addWarning(`Chapter count exceeds the ${maxChapterCount} chapter limit`);
        break;
      }
      chapters.push({
        id,
        title,
        url: frames.get("WXXX"),
        start: chap.info.startTime / 1e3,
        end: chap.info.endTime / 1e3,
        image: frames.get("APIC")
      });
    }
    return chapters.length ? chapters : void 0;
  }
};
function makeUnexpectedMajorVersionError3(majorVer) {
  throw new Id3v2ContentError(`Unexpected majorVer: ${majorVer}`);
}

export {
  Id3v2ContentError,
  ID3v2Parser
};
//# sourceMappingURL=chunk-7DCDJDGP.js.map
