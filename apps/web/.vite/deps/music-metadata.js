import {
  AdtsFrameHeader
} from "./chunk-5QXUL7QG.js";
import {
  MetadataCollector,
  createAudioTrackInfo,
  fileTypeFromBuffer,
  fileTypeFromTokenizer,
  finalizeContainerInfo
} from "./chunk-6PCIRQPE.js";
import {
  TrackType
} from "./chunk-XS2AH7GC.js";
import {
  BlockHeader,
  BlockType,
  PICTURE_TYPES,
  decodeBase64,
  decodePicture,
  encodeBase64,
  normalizePictureMimeType,
  parseVorbisComment,
  pictureTypeToNumber
} from "./chunk-ZTPD4JNR.js";
import {
  hasID3v1Header
} from "./chunk-47WSSSOY.js";
import {
  APEv2Parser
} from "./chunk-E7VQDEJP.js";
import {
  LyricsContentType,
  TimestampFormat,
  UINT32SYNCSAFE
} from "./chunk-GQBXDRBH.js";
import {
  orderTags,
  ratioToDb
} from "./chunk-O76RKEBI.js";
import {
  CouldNotDetermineFileTypeError,
  EndOfStreamError,
  FieldDecodingError,
  InternalParserError,
  TokenWriter,
  UINT16_BE,
  UINT24_BE,
  UINT32_BE,
  UINT32_LE,
  UINT64_BE,
  UINT8,
  UnexpectedFileContentError,
  UnsupportedFileTypeError,
  fromBlob,
  fromBuffer,
  fromWebStream,
  getMaxChapterCount,
  getMaxMemoryAllocation,
  getMaxMetadataEntries,
  getTokenizerOptions,
  isRandomAccessTokenizer,
  makeParseError,
  makeUnexpectedFileContentError,
  textDecode,
  textEncode
} from "./chunk-3HBPJLK7.js";
import {
  require_browser
} from "./chunk-ZGKN2RSD.js";
import {
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/lyrics3/Lyrics3.js
var endTag2 = "LYRICS200";
async function getLyricsHeaderLength(tokenizer) {
  const fileSize = tokenizer.fileInfo.size;
  if (fileSize >= 143) {
    const buf = new Uint8Array(15);
    const position = tokenizer.position;
    await tokenizer.readBuffer(buf, { position: fileSize - 143 });
    tokenizer.setPosition(position);
    const txt = textDecode(buf, "latin1");
    const tag = txt.substring(6);
    if (tag === endTag2) {
      return Number.parseInt(txt.substring(0, 6), 10) + 15;
    }
  }
  return 0;
}

// ../../node_modules/music-metadata/node_modules/content-type/dist/index.js
var SP = 32;
var HTAB = 9;
var SEMI = 59;
var EQ = 61;
var DQUOTE = 34;
var BSLASH = 92;
var COMMA = 44;
var LOWER_CASE = 1;
var OWS = 2;
var SEMI_FLAG = 4;
var COMMA_FLAG = 8;
var TOKEN_FLAG = 16;
var NON_ASCII = 65280;
var CASE_FLAGS = LOWER_CASE | NON_ASCII;
var CHAR_MAP = new Uint8Array(256);
CHAR_MAP[HTAB] |= OWS;
CHAR_MAP[SP] |= OWS;
CHAR_MAP[SEMI] |= SEMI_FLAG;
CHAR_MAP[COMMA] |= COMMA_FLAG;
for (let code = 128; code <= 255; code++) {
  CHAR_MAP[code] |= LOWER_CASE;
}
for (const char of "!#$%&'*+-.^_`|~") {
  CHAR_MAP[char.charCodeAt(0)] |= TOKEN_FLAG;
}
for (let code = 48; code <= 57; code++) {
  CHAR_MAP[code] |= TOKEN_FLAG;
}
for (let code = 65; code <= 90; code++) {
  CHAR_MAP[code] |= LOWER_CASE | TOKEN_FLAG;
}
for (let code = 97; code <= 122; code++) {
  CHAR_MAP[code] |= TOKEN_FLAG;
}
var NullObject = (() => {
  const C = function() {
  };
  C.prototype = /* @__PURE__ */ Object.create(null);
  return C;
})();
function parse(header2, options) {
  const stopFlags = SEMI_FLAG | ((options == null ? void 0 : options.comma) === true ? COMMA_FLAG : 0);
  const len = header2.length;
  let valueStart = (options == null ? void 0 : options.start) ?? 0;
  while ((CHAR_MAP[header2.charCodeAt(valueStart)] & OWS) !== 0) {
    valueStart++;
  }
  let index = valueStart;
  let typeFlags = 0;
  let whitespace = -1;
  let stop = (options == null ? void 0 : options.parameters) === false ? COMMA_FLAG : 0;
  while (index < len) {
    const code = header2.charCodeAt(index);
    const flags = CHAR_MAP[code];
    if ((flags & stopFlags) !== 0) {
      stop |= flags & COMMA_FLAG;
      break;
    }
    if ((flags & OWS) !== 0) {
      if (whitespace === -1)
        whitespace = index;
    } else {
      whitespace = -1;
    }
    typeFlags |= code & NON_ASCII | flags;
    index++;
  }
  const valueEnd = whitespace === -1 ? index : whitespace;
  const value = header2.slice(valueStart, valueEnd);
  const type = (typeFlags & CASE_FLAGS) === 0 ? value : value.toLowerCase();
  if (index === len || stop !== 0) {
    return { type, index, parameters: new NullObject() };
  }
  return parseParameters(header2, type, index, len, stopFlags);
}
function parseParameters(header2, type, index, len, stopFlags) {
  const parameters = new NullObject();
  parameter: while (index < len) {
    index++;
    while ((CHAR_MAP[header2.charCodeAt(index)] & OWS) !== 0) {
      index++;
    }
    const keyStart = index;
    let keyFlags = 0;
    let keyWhitespace = -1;
    while (index < len) {
      const code = header2.charCodeAt(index);
      const flags = CHAR_MAP[code];
      if ((flags & stopFlags) !== 0) {
        if ((flags & COMMA_FLAG) !== 0)
          break parameter;
        continue parameter;
      }
      if (code === EQ) {
        const keyEnd = keyWhitespace === -1 ? index : keyWhitespace;
        const value = header2.slice(keyStart, keyEnd);
        const key = (keyFlags & CASE_FLAGS) === 0 ? value : value.toLowerCase();
        index++;
        while ((CHAR_MAP[header2.charCodeAt(index)] & OWS) !== 0) {
          index++;
        }
        if (index < len && header2.charCodeAt(index) === DQUOTE) {
          const quotedStart = ++index;
          let escaped = false;
          while (index < len) {
            const code2 = header2.charCodeAt(index);
            if (code2 === DQUOTE) {
              if (parameters[key] === void 0) {
                parameters[key] = escaped ? unescapeQuotedPairs(header2, quotedStart, index) : header2.slice(quotedStart, index);
              }
              index++;
              let stop2 = 0;
              while (index < len) {
                const code3 = header2.charCodeAt(index);
                const flags2 = CHAR_MAP[code3];
                if ((flags2 & stopFlags) !== 0) {
                  stop2 = flags2 & COMMA_FLAG;
                  break;
                }
                index++;
              }
              if (stop2 !== 0)
                break parameter;
              continue parameter;
            }
            if (code2 === BSLASH && index + 1 < len) {
              escaped = true;
              index += 2;
              continue;
            }
            index++;
          }
          continue parameter;
        }
        const valueStart = index;
        let stop = 0;
        let valueWhitespace = -1;
        while (index < len) {
          const code2 = header2.charCodeAt(index);
          const flags2 = CHAR_MAP[code2];
          if ((flags2 & stopFlags) !== 0) {
            stop = flags2 & COMMA_FLAG;
            break;
          }
          if ((flags2 & OWS) !== 0) {
            if (valueWhitespace === -1)
              valueWhitespace = index;
          } else {
            valueWhitespace = -1;
          }
          index++;
        }
        if (parameters[key] === void 0) {
          const valueEnd = valueWhitespace === -1 ? index : valueWhitespace;
          parameters[key] = header2.slice(valueStart, valueEnd);
        }
        if (stop !== 0)
          break parameter;
        continue parameter;
      }
      if ((flags & OWS) !== 0) {
        if (keyWhitespace === -1)
          keyWhitespace = index;
      } else {
        keyWhitespace = -1;
      }
      keyFlags |= code & NON_ASCII | flags;
      index++;
    }
  }
  return { type, index, parameters };
}
function unescapeQuotedPairs(str, start, end) {
  let result = "";
  for (let index = start; index < end; index++) {
    if (str.charCodeAt(index) === BSLASH) {
      result += str.slice(start, index);
      start = ++index;
    }
  }
  return result + str.slice(start, end);
}

// ../../node_modules/music-metadata/lib/ParserFactory.js
var import_debug = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/node_modules/media-typer/dist/index.js
var typeRegExp = /^[A-Za-z0-9][A-Za-z0-9!#$&^_-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}$/;
function parse2(str) {
  if (!typeRegExp.test(str)) {
    throw new TypeError(`Invalid media type: ${str}`);
  }
  const slashIndex = str.indexOf("/");
  const type = str.slice(0, slashIndex).toLowerCase();
  let subtype = str.slice(slashIndex + 1).toLowerCase();
  let suffix;
  const index = subtype.lastIndexOf("+");
  if (index !== -1) {
    suffix = subtype.slice(index + 1);
    subtype = subtype.slice(0, index);
  }
  return { type, subtype, suffix };
}

// ../../node_modules/music-metadata/lib/aiff/AiffLoader.js
var aiffParserLoader = {
  parserType: "aiff",
  extensions: [".aif", "aiff", "aifc"],
  mimeTypes: ["audio/aiff", "audio/aif", "audio/aifc", "application/aiff"],
  async load() {
    return (await import("./AiffParser-RDCSZ3CT.js")).AIFFParser;
  }
};

// ../../node_modules/music-metadata/lib/apev2/Apev2Loader.js
var apeParserLoader = {
  parserType: "apev2",
  extensions: [".ape"],
  mimeTypes: ["audio/ape", "audio/monkeys-audio"],
  async load() {
    return (await import("./APEv2Parser-RVW5PT4Q.js")).APEv2Parser;
  }
};

// ../../node_modules/music-metadata/lib/asf/AsfLoader.js
var asfParserLoader = {
  parserType: "asf",
  extensions: [".asf", ".wma", ".wmv"],
  mimeTypes: ["audio/ms-wma", "video/ms-wmv", "audio/ms-asf", "video/ms-asf", "application/vnd.ms-asf"],
  async load() {
    return (await import("./AsfParser-4RUEFESJ.js")).AsfParser;
  }
};

// ../../node_modules/music-metadata/lib/caf/CafLoader.js
var cafParserLoader = {
  parserType: "caf",
  extensions: [".caf", ".caff"],
  mimeTypes: ["audio/caf", "application/caf"],
  async load() {
    return (await import("./CafParser-TYWN6AAP.js")).CafParser;
  }
};

// ../../node_modules/music-metadata/lib/dsdiff/DsdiffLoader.js
var dsdiffParserLoader = {
  parserType: "dsdiff",
  extensions: [".dff"],
  mimeTypes: ["audio/dsf", "audio/dsd", "audio/dff"],
  async load() {
    return (await import("./DsdiffParser-XM27BHCI.js")).DsdiffParser;
  }
};

// ../../node_modules/music-metadata/lib/dsf/DsfLoader.js
var dsfParserLoader = {
  parserType: "dsf",
  extensions: [".dsf"],
  mimeTypes: ["audio/dsf"],
  async load() {
    return (await import("./DsfParser-O7WDLHSA.js")).DsfParser;
  }
};

// ../../node_modules/music-metadata/lib/flac/FlacLoader.js
var flacParserLoader = {
  parserType: "flac",
  extensions: [".flac"],
  mimeTypes: ["audio/flac"],
  async load() {
    return (await import("./FlacParser-P4QLVAOS.js")).FlacParser;
  }
};

// ../../node_modules/music-metadata/lib/matroska/MatroskaLoader.js
var matroskaParserLoader = {
  parserType: "matroska",
  extensions: [".mka", ".mkv", ".mk3d", ".mks", "webm"],
  mimeTypes: ["audio/matroska", "video/matroska", "audio/webm", "video/webm"],
  async load() {
    return (await import("./MatroskaParser-GEKW7SYE.js")).MatroskaParser;
  }
};

// ../../node_modules/music-metadata/lib/mp4/Mp4Loader.js
var mp4ParserLoader = {
  parserType: "mp4",
  extensions: [".mp4", ".m4a", ".m4b", ".m4pa", "m4v", "m4r", "3gp", ".mov", ".movie", ".qt"],
  mimeTypes: ["audio/mp4", "audio/m4a", "video/m4v", "video/mp4", "video/quicktime"],
  async load() {
    return (await import("./MP4Parser-OAELRODP.js")).MP4Parser;
  }
};

// ../../node_modules/music-metadata/lib/mpeg/MpegLoader.js
var mpegParserLoader = {
  parserType: "mpeg",
  extensions: [".mp1", ".mp2", ".mp3", ".m2a", ".aac", "aacp"],
  mimeTypes: ["audio/mpeg", "audio/mp3", "audio/aacs", "audio/aacp"],
  async load() {
    return (await import("./MpegParser-LL2BY4TA.js")).MpegParser;
  }
};

// ../../node_modules/music-metadata/lib/musepack/MusepackLoader.js
var musepackParserLoader = {
  parserType: "musepack",
  extensions: [".mpc"],
  mimeTypes: ["audio/musepack"],
  async load() {
    return (await import("./MusepackParser-KTSIMYQ3.js")).MusepackParser;
  }
};

// ../../node_modules/music-metadata/lib/ogg/OggLoader.js
var oggParserLoader = {
  parserType: "ogg",
  extensions: [".ogg", ".ogv", ".oga", ".ogm", ".ogx", ".opus", ".spx"],
  mimeTypes: ["application/ogg", "audio/ogg", "audio/opus", "audio/speex", "video/ogg"],
  // RFC 5334, RFC 7845, RFC 6716, RFC 5574
  async load() {
    return (await import("./OggParser-BD6ILPAK.js")).OggParser;
  }
};

// ../../node_modules/music-metadata/lib/wav/WaveLoader.js
var riffParserLoader = {
  parserType: "riff",
  extensions: [".wav", "wave", ".bwf"],
  mimeTypes: ["audio/vnd.wave", "audio/wav", "audio/wave"],
  async load() {
    return (await import("./WaveParser-SFBSDN3P.js")).WaveParser;
  }
};

// ../../node_modules/music-metadata/lib/wavpack/WavPackLoader.js
var wavpackParserLoader = {
  parserType: "wavpack",
  extensions: [".wv", ".wvp"],
  mimeTypes: ["audio/wavpack"],
  async load() {
    return (await import("./WavPackParser-ABMEBXBA.js")).WavPackParser;
  }
};

// ../../node_modules/music-metadata/lib/ParserFactory.js
var debug = (0, import_debug.default)("music-metadata:parser:factory");
function parseHttpContentType(contentType) {
  const type = parse(contentType);
  const mime = parse2(type.type);
  return {
    type: mime.type,
    subtype: mime.subtype,
    suffix: mime.suffix,
    parameters: type.parameters
  };
}
var ParserFactory = class {
  constructor() {
    __publicField(this, "parsers", []);
    [
      flacParserLoader,
      mpegParserLoader,
      apeParserLoader,
      mp4ParserLoader,
      matroskaParserLoader,
      riffParserLoader,
      oggParserLoader,
      asfParserLoader,
      aiffParserLoader,
      wavpackParserLoader,
      musepackParserLoader,
      dsfParserLoader,
      dsdiffParserLoader,
      cafParserLoader
    ].forEach((parser) => {
      this.registerParser(parser);
    });
  }
  registerParser(parser) {
    this.parsers.push(parser);
  }
  async parse(tokenizer, parserLoader, opts = {}) {
    const maxBufferSize = getMaxMemoryAllocation(opts);
    getMaxMetadataEntries(opts);
    getMaxChapterCount(opts);
    if (isRandomAccessTokenizer(tokenizer)) {
      debug("tokenizer supports random-access, scanning for appending headers");
      await scanAppendingHeaders(tokenizer, opts);
    } else {
      debug("tokenizer does not support random-access, cannot scan for appending headers");
    }
    if (!parserLoader) {
      const buf = new Uint8Array(4100);
      if (tokenizer.fileInfo.mimeType) {
        parserLoader = this.findLoaderForContentType(tokenizer.fileInfo.mimeType);
      }
      if (!parserLoader && tokenizer.fileInfo.path) {
        parserLoader = this.findLoaderForExtension(tokenizer.fileInfo.path);
      }
      if (!parserLoader) {
        debug("Guess parser on content...");
        await tokenizer.peekBuffer(buf, { mayBeLess: true });
        const guessedType = await fileTypeFromBuffer(buf, { mpegOffsetTolerance: 10, maxBufferSize });
        if (!(guessedType == null ? void 0 : guessedType.mime)) {
          throw new CouldNotDetermineFileTypeError("Failed to determine audio format");
        }
        debug(`Guessed file type is mime=${guessedType.mime}, extension=${guessedType.ext}`);
        parserLoader = this.findLoaderForContentType(guessedType.mime);
        if (!parserLoader) {
          throw new UnsupportedFileTypeError(`Guessed MIME-type not supported: ${guessedType.mime}`);
        }
      }
    }
    debug(`Loading ${parserLoader.parserType} parser...`);
    const metadata = new MetadataCollector(opts);
    const ParserImpl = await parserLoader.load();
    const parser = new ParserImpl(metadata, tokenizer, opts);
    debug(`Parser ${parserLoader.parserType} loaded`);
    await parser.parse();
    if (metadata.format.trackInfo.length === 0 && metadata.format.hasAudio === true) {
      metadata.addStreamInfo(createAudioTrackInfo(metadata.format));
    }
    if (metadata.format.trackInfo) {
      if (metadata.format.hasAudio === void 0) {
        metadata.setFormat("hasAudio", !!metadata.format.trackInfo.find((track) => track.type === TrackType.audio));
      }
      if (metadata.format.hasVideo === void 0) {
        metadata.setFormat("hasVideo", !!metadata.format.trackInfo.find((track) => track.type === TrackType.video));
      }
    }
    finalizeContainerInfo(metadata, tokenizer.fileInfo.size);
    return metadata.toCommonMetadata();
  }
  /**
   * @param filePath - Path, filename or extension to audio file
   * @return Parser submodule name
   */
  findLoaderForExtension(filePath) {
    if (!filePath) {
      return;
    }
    const extension = getExtension(filePath).toLocaleLowerCase() || filePath;
    return this.parsers.find((parser) => parser.extensions.indexOf(extension) !== -1);
  }
  findLoaderForContentType(httpContentType) {
    let mime;
    if (!httpContentType) {
      return;
    }
    try {
      mime = parseHttpContentType(httpContentType);
    } catch (_err) {
      debug(`Invalid HTTP Content-Type header value: ${httpContentType}`);
      return;
    }
    const subType = mime.subtype.indexOf("x-") === 0 ? mime.subtype.substring(2) : mime.subtype;
    return this.parsers.find((parser) => parser.mimeTypes.find((loader) => loader.indexOf(`${mime.type}/${subType}`) !== -1));
  }
  getSupportedMimeTypes() {
    const mimeTypeSet = /* @__PURE__ */ new Set();
    this.parsers.forEach((loader) => {
      loader.mimeTypes.forEach((mimeType) => {
        mimeTypeSet.add(mimeType);
        mimeTypeSet.add(mimeType.replace("/", "/x-"));
      });
    });
    return Array.from(mimeTypeSet);
  }
};
function getExtension(fname) {
  const i = fname.lastIndexOf(".");
  return i === -1 ? "" : fname.substring(i);
}

// ../../node_modules/music-metadata/lib/write/core/errors.js
var MetadataEditorError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "MetadataEditorError";
  }
};
var UnsupportedFormatError = class extends MetadataEditorError {
  constructor(message, options) {
    super(message, options);
    this.name = "UnsupportedFormatError";
  }
};
var InvalidFileError = class extends MetadataEditorError {
  constructor(message, options) {
    super(message, options);
    this.name = "InvalidFileError";
  }
};
var InvalidPatchError = class extends MetadataEditorError {
  constructor(message, options) {
    super(message, options);
    this.name = "InvalidPatchError";
  }
};
var UnsupportedFeatureError = class extends MetadataEditorError {
  constructor(message, options) {
    super(message, options);
    this.name = "UnsupportedFeatureError";
  }
};
var WriteError = class extends MetadataEditorError {
  constructor(message, options) {
    super(message, options);
    this.name = "WriteError";
  }
};

// ../../node_modules/music-metadata/lib/write/core/bytes.js
function decodeAscii(data2) {
  return textDecode(data2, "latin1");
}
function encodeUtf8(value) {
  return textEncode(value, "utf-8");
}
function concatBytes(...chunks) {
  let length = 0;
  for (const chunk of chunks) {
    length += chunk.length;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// ../../node_modules/music-metadata/lib/write/core/detect.js
async function detectFormat(source) {
  var _a;
  if (source.size >= 12) {
    const header2 = await source.read(0, 12);
    if (decodeAscii(header2.subarray(0, 4)) === "OggS") {
      return "ogg";
    }
    if (decodeAscii(header2.subarray(0, 4)) === "RIFF" && decodeAscii(header2.subarray(8, 12)) === "WAVE") {
      return "wav";
    }
  }
  let extension;
  try {
    const tokenizer = source.tokenizer;
    tokenizer.setPosition(0);
    const borrowed = {
      fileInfo: tokenizer.fileInfo,
      get position() {
        return tokenizer.position;
      },
      readBuffer: tokenizer.readBuffer.bind(tokenizer),
      peekBuffer: tokenizer.peekBuffer.bind(tokenizer),
      readToken: tokenizer.readToken.bind(tokenizer),
      peekToken: tokenizer.peekToken.bind(tokenizer),
      readNumber: tokenizer.readNumber.bind(tokenizer),
      peekNumber: tokenizer.peekNumber.bind(tokenizer),
      ignore: tokenizer.ignore.bind(tokenizer),
      supportsRandomAccess: tokenizer.supportsRandomAccess.bind(tokenizer),
      abort: tokenizer.abort.bind(tokenizer),
      close: async () => {
      }
    };
    extension = (_a = await fileTypeFromTokenizer(borrowed)) == null ? void 0 : _a.ext;
  } catch (error) {
    if (!(error instanceof EndOfStreamError)) {
      throw error;
    }
  }
  if (extension === "m4a" || extension === "mp4" || extension === "m4b") {
    return "mp4";
  }
  if (extension === "flac" || extension === "mp3" || extension === "aac" || extension === "wav") {
    return extension;
  }
  if (source.size >= 3) {
    const signature = await source.read(0, 3);
    if (signature[0] === 73 && signature[1] === 68 && signature[2] === 51) {
      return "id3";
    }
  }
  return "unknown";
}

// ../../node_modules/music-metadata/lib/write/mp4/atoms.js
var limit = 64 * 1024 * 1024;
var maxAtoms = 1e5;
var fourcc = (bytes, offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
var u32 = (n) => {
  const b = new Uint8Array(4);
  UINT32_BE.put(b, 0, n);
  return b;
};
var zeros = new Uint8Array(4);
function atom(type, ...parts) {
  if (parts.reduce((sum, part) => sum + part.length, 8) > limit) {
    throw new UnsupportedFeatureError("MP4 metadata atom exceeds 64 MiB");
  }
  const body = concatBytes(...parts);
  if (type.length !== 4 || body.length > 4294967287) {
    throw new InvalidPatchError("Invalid MP4 atom");
  }
  return concatBytes(u32(body.length + 8), Uint8Array.from(type, (c) => c.charCodeAt(0)), body);
}
function header(bytes, start, end) {
  if (end - start < 8) {
    throw new InvalidFileError("Truncated MP4 atom header");
  }
  let size = UINT32_BE.get(bytes, start);
  let length = 8;
  if (size === 1) {
    if (end - start < 16) {
      throw new InvalidFileError("Truncated MP4 extended size");
    }
    const big = UINT64_BE.get(bytes, start + 8);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new InvalidFileError("MP4 atom exceeds safe offset range");
    }
    size = Number(big);
    length = 16;
  } else if (size === 0) {
    size = end - start;
  }
  if (size < length || size > end - start) {
    throw new InvalidFileError("Invalid MP4 atom size");
  }
  return { type: fourcc(bytes, start + 4), start, end: start + size, header: length };
}
function boxes(bytes, start = 0, end = bytes.length, budget = { remaining: maxAtoms }) {
  const result = [];
  while (start < end) {
    if (--budget.remaining < 0) {
      throw new UnsupportedFeatureError("MP4 atom count exceeds limit");
    }
    const box = header(bytes, start, end);
    result.push(box);
    start = box.end;
  }
  return result;
}
function copyBox(bytes, box) {
  return UINT32_BE.get(bytes, box.start) === 0 ? atom(box.type, bytes.subarray(box.start + box.header, box.end)) : bytes.subarray(box.start, box.end);
}

// ../../node_modules/music-metadata/lib/write/mp4/chapters.js
function trackHeader(bytes, children) {
  const headers = children.filter((b) => b.type === "tkhd");
  if (headers.length !== 1) {
    throw new InvalidFileError("MP4 track requires one header");
  }
  const header2 = headers[0];
  const start = header2.start + header2.header;
  const version = bytes[start];
  const offset = version === 0 ? 12 : version === 1 ? 20 : -1;
  if (offset < 0 || header2.end - start < (version === 1 ? 50 : 38)) {
    throw new InvalidFileError("Invalid MP4 track header");
  }
  const id = UINT32_BE.get(bytes, start + offset);
  if (id === 0) {
    throw new InvalidFileError("Invalid MP4 track ID");
  }
  return { id, flags: UINT24_BE.get(bytes, start + 1) };
}
function chapterUpdate(bytes, root, chapters) {
  if (chapters !== null && (!Array.isArray(chapters) || chapters.length > 255)) {
    throw new InvalidPatchError("Nero chapter lists support an array of at most 255 chapters");
  }
  const budget = { remaining: maxAtoms };
  const children = boxes(bytes, root.start + root.header, root.end, budget);
  const tracks = children.filter((box) => box.type === "trak");
  const removedTracks = /* @__PURE__ */ new Set();
  const nonChapterTargets = /* @__PURE__ */ new Set();
  const ids = /* @__PURE__ */ new Map();
  for (const track of tracks) {
    const trackChildren = boxes(bytes, track.start + track.header, track.end, budget);
    const { id, flags } = trackHeader(bytes, trackChildren);
    if (ids.has(id)) {
      throw new InvalidFileError("Duplicate MP4 track ID");
    }
    ids.set(id, { box: track, children: trackChildren, flags });
    for (const ref of trackChildren.filter((b) => b.type === "tref")) {
      for (const group of boxes(bytes, ref.start + ref.header, ref.end, budget)) {
        if ((group.end - group.start - group.header) % 4) {
          throw new InvalidFileError("Invalid MP4 track reference");
        }
        for (let p = group.start + group.header; p < group.end; p += 4) {
          if (--budget.remaining < 0) {
            throw new UnsupportedFeatureError("MP4 chapter reference count exceeds limit");
          }
          const target = UINT32_BE.get(bytes, p);
          if (group.type === "chap") {
            removedTracks.add(target);
          } else {
            nonChapterTargets.add(target);
          }
        }
      }
    }
  }
  const removedTrackStarts = /* @__PURE__ */ new Set();
  for (const id of removedTracks) {
    const track = ids.get(id);
    if (!track) {
      throw new InvalidFileError("Missing referenced chapter track");
    }
    const media = track.children.filter((b) => b.type === "mdia");
    const handlers = media.length === 1 ? boxes(bytes, media[0].start + media[0].header, media[0].end, budget).filter((b) => b.type === "hdlr") : [];
    const handler = handlers[0];
    if (handlers.length !== 1 || handler.end - handler.start < handler.header + 12) {
      throw new InvalidFileError("Invalid chapter track handler");
    }
    const type = fourcc(bytes, handler.start + handler.header + 8);
    if (!["text", "sbtl"].includes(type) || nonChapterTargets.has(id) || (track.flags & 1) !== 0) {
      throw new UnsupportedFeatureError("Chapter track is shared with a non-chapter purpose");
    }
    removedTrackStarts.add(track.box.start);
  }
  if (chapters === null || chapters.length === 0) {
    return { removedTrackStarts, list: null };
  }
  const timestamp = (value, scale) => {
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(scale) || scale <= 0) {
      throw new InvalidPatchError("Invalid chapter timestamp or timescale");
    }
    const ticks = Math.round(value * (1e7 / scale));
    if (!Number.isSafeInteger(ticks)) {
      throw new InvalidPatchError("Chapter timestamp exceeds safe range");
    }
    return ticks;
  };
  const movieHeaders = children.filter((box) => box.type === "mvhd");
  if (movieHeaders.length !== 1) {
    throw new InvalidFileError("MP4 movie requires one duration header");
  }
  const movieHeader = movieHeaders[0];
  const start = movieHeader.start + movieHeader.header;
  const version = bytes[start];
  const wide = version === 1;
  if (version !== 0 && version !== 1 || movieHeader.end - start < (wide ? 112 : 100)) {
    throw new InvalidFileError("Invalid MP4 movie header");
  }
  const timeScale = UINT32_BE.get(bytes, start + (wide ? 20 : 12));
  if (timeScale === 0) {
    throw new InvalidFileError("Invalid MP4 movie timescale");
  }
  const duration = wide ? UINT64_BE.get(bytes, start + 24) : BigInt(UINT32_BE.get(bytes, start + 16));
  if (duration === (wide ? 0xffffffffffffffffn : 0xffffffffn)) {
    throw new UnsupportedFeatureError("MP4 movie duration is unknown");
  }
  if (duration > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new UnsupportedFeatureError("Movie duration exceeds safe range");
  }
  const movieEnd = Math.round(Number(duration) * (1e7 / timeScale));
  if (!Number.isSafeInteger(movieEnd)) {
    throw new UnsupportedFeatureError("Movie duration exceeds safe Nero timestamp range");
  }
  const starts = Array.from(chapters, (chapter) => {
    if (typeof chapter !== "object" || chapter === null || Array.isArray(chapter)) {
      throw new InvalidPatchError("Chapter must be an object");
    }
    return timestamp(chapter.start, chapter.timeScale ?? 1);
  });
  const entries = chapters.map((chapter, i) => {
    const time = starts[i];
    if (i > 0 && time <= starts[i - 1] || time >= movieEnd) {
      throw new InvalidPatchError("Chapters must have increasing starts before the movie ends");
    }
    if (chapter.url !== void 0 || chapter.image !== void 0) {
      throw new UnsupportedFeatureError("Nero chapters do not support URLs or pictures");
    }
    if (chapter.end !== void 0) {
      const end = timestamp(chapter.end, chapter.timeScale ?? 1);
      if (end <= time || Math.abs(end - (starts[i + 1] ?? movieEnd)) > 1) {
        throw new UnsupportedFeatureError("Nero chapter ends must match the next start or movie duration");
      }
    }
    if (typeof chapter.title !== "string") {
      throw new InvalidPatchError("Chapter title must be a string");
    }
    if (chapter.title.length > 255) {
      throw new InvalidPatchError("Nero chapter titles support at most 255 UTF-8 bytes");
    }
    const title = encodeUtf8(chapter.title);
    if (title.length > 255) {
      throw new InvalidPatchError("Nero chapter titles support at most 255 UTF-8 bytes");
    }
    const prefix2 = new Uint8Array(9);
    UINT64_BE.put(prefix2, 0, BigInt(time));
    prefix2[8] = title.length;
    return concatBytes(prefix2, title);
  });
  const prefix = new Uint8Array(9);
  prefix[0] = 1;
  prefix[8] = chapters.length;
  return { removedTrackStarts, list: atom("chpl", prefix, ...entries) };
}

// ../../node_modules/music-metadata/lib/write/core/lyrics.js
function normalizeLyrics(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value.length === 0 ? null : [{ text: value, syncText: [] }];
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? null : value.map((entry, index) => normalizeEntry(entry, index));
  }
  if (typeof value === "object") {
    return [normalizeEntry(value, 0)];
  }
  throw new InvalidPatchError("lyrics must be a string, a lyrics entry, an array of lyrics entries, or null");
}
function lyricsText(entry) {
  if (entry.text !== void 0) {
    return entry.text;
  }
  return entry.syncText.map((line) => line.text).join("\n");
}
function lyricsToLrc(entry) {
  if (entry.timeStampFormat !== 2) {
    throw new InvalidPatchError("Vorbis synchronized lyrics require millisecond timestamps");
  }
  return entry.syncText.map((line) => {
    if (line.timestamp === void 0) {
      throw new InvalidPatchError("Vorbis synchronized lyrics require millisecond timestamps");
    }
    if (/[\r\n]/.test(line.text)) {
      throw new InvalidPatchError("Vorbis synchronized lyrics line text must not contain CR or LF");
    }
    const ms = line.timestamp;
    const seconds = (ms % 6e4 / 1e3).toFixed(3).padStart(6, "0");
    return `[${String(Math.floor(ms / 6e4)).padStart(2, "0")}:${seconds}]${line.text}`;
  }).join("\n");
}
function normalizeEntry(entry, index) {
  if (typeof entry === "string") {
    return { text: entry, syncText: [] };
  }
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new InvalidPatchError(`lyrics[${index}] must be a string or a lyrics entry`);
  }
  const text = optionalString(entry.text, `lyrics[${index}].text`);
  const language = optionalString(entry.language, `lyrics[${index}].language`);
  const descriptor = optionalString(entry.descriptor, `lyrics[${index}].descriptor`);
  if (entry.contentType !== void 0 && !Number.isInteger(entry.contentType)) {
    throw new InvalidPatchError(`lyrics[${index}].contentType must be an integer`);
  }
  if (entry.timeStampFormat !== void 0 && !Number.isInteger(entry.timeStampFormat)) {
    throw new InvalidPatchError(`lyrics[${index}].timeStampFormat must be an integer`);
  }
  return {
    text,
    language,
    descriptor,
    contentType: entry.contentType,
    timeStampFormat: entry.timeStampFormat,
    syncText: normalizeSyncText(entry.syncText, index)
  };
}
function normalizeSyncText(value, index) {
  if (value === void 0) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new InvalidPatchError(`lyrics[${index}].syncText must be an array`);
  }
  return value.map((line, lineIndex) => {
    if (typeof line !== "object" || line === null || Array.isArray(line) || typeof line.text !== "string") {
      throw new InvalidPatchError(`lyrics[${index}].syncText[${lineIndex}] must have a text property`);
    }
    if (line.timestamp !== void 0 && (!Number.isInteger(line.timestamp) || line.timestamp < 0)) {
      throw new InvalidPatchError(`lyrics[${index}].syncText[${lineIndex}].timestamp must be a non-negative integer`);
    }
    return { text: line.text, timestamp: line.timestamp ?? void 0 };
  });
}
function optionalString(value, label) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value !== "string") {
    throw new InvalidPatchError(`${label} must be a string`);
  }
  return value;
}

// ../../node_modules/music-metadata/lib/write/mp4/tags.js
var u322 = (n) => {
  const b = new Uint8Array(4);
  UINT32_BE.put(b, 0, n);
  return b;
};
var textAtoms = {
  title: "©nam",
  artist: "©ART",
  artists: "©ART",
  albumartist: "aART",
  albumartists: "aART",
  album: "©alb",
  date: "©day",
  year: "©day",
  genre: "©gen",
  composer: "©wrt",
  comment: "©cmt",
  copyright: "cprt",
  description: "desc",
  longDescription: "ldes",
  work: "©wrk",
  encodedby: "©too",
  grouping: "©grp",
  albumsort: "soal",
  titlesort: "sonm",
  artistsort: "soar",
  albumartistsort: "soaa",
  composersort: "soco"
};
var freeform = {
  lyricist: "LYRICIST",
  conductor: "CONDUCTOR",
  remixer: "REMIXER",
  engineer: "ENGINEER",
  producer: "PRODUCER",
  originaldate: "ORIGINALDATE",
  originalyear: "ORIGINALYEAR",
  releasedate: "RELEASEDATE",
  releasestatus: "MusicBrainz Album Status",
  releasetype: "MusicBrainz Album Type",
  releasecountry: "MusicBrainz Album Release Country",
  mood: "MOOD",
  media: "MEDIA",
  subtitle: "SUBTITLE",
  discsubtitle: "DISCSUBTITLE",
  script: "SCRIPT",
  asin: "ASIN",
  mixer: "MIXER",
  label: "LABEL",
  language: "LANGUAGE",
  key: "initialkey",
  isrc: "ISRC",
  catalognumber: "CATALOGNUMBER",
  barcode: "BARCODE",
  license: "LICENSE",
  performer: "PERFORMER",
  musicbrainz_recordingid: "MusicBrainz Track Id",
  musicbrainz_trackid: "MusicBrainz Release Track Id",
  musicbrainz_albumid: "MusicBrainz Album Id",
  musicbrainz_artistid: "MusicBrainz Artist Id",
  musicbrainz_albumartistid: "MusicBrainz Album Artist Id",
  musicbrainz_releasegroupid: "MusicBrainz Release Group Id",
  musicbrainz_workid: "MusicBrainz Work Id",
  musicbrainz_discid: "MusicBrainz Disc Id",
  replaygain_track_gain: "replaygain_track_gain",
  replaygain_track_peak: "replaygain_track_peak",
  replaygain_album_gain: "replaygain_album_gain",
  replaygain_album_peak: "replaygain_album_peak"
};
var data = (type, value) => atom("data", u322(type), zeros, value);
function values(value) {
  if (typeof value === "string" || typeof value === "number" && Number.isFinite(value)) {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(values);
  }
  if (value && typeof value === "object" && "text" in value) {
    return values(value.text);
  }
  throw new InvalidPatchError("MP4 text must be a string, number or text array");
}
function item(key, value) {
  const payload = values(value).map((v) => data(1, encodeUtf8(v)));
  if (key.startsWith("----:")) {
    const [, mean, ...name] = key.split(":");
    if (!mean || !name.length) {
      throw new InvalidPatchError("Use ----:mean:name for MP4 freeform tags");
    }
    return atom("----", atom("mean", zeros, encodeUtf8(mean)), atom("name", zeros, encodeUtf8(name.join(":"))), ...payload);
  }
  if (key === "----" || !/^[\x20-\xff]{4}$/.test(key)) {
    throw new InvalidPatchError("Invalid MP4 metadata key");
  }
  return atom(key, ...payload);
}
function itemKey(bytes, box, budget) {
  if (box.type !== "----") {
    return box.type;
  }
  const fields = boxes(bytes, box.start + box.header, box.end, budget);
  const text = (type) => {
    const field = fields.find((b) => b.type === type);
    if (!field || field.end - field.start < field.header + 4) {
      throw new InvalidFileError("Invalid MP4 freeform item");
    }
    return new TextDecoder().decode(bytes.subarray(field.start + field.header + 4, field.end));
  };
  return `----:${text("mean")}:${text("name")}`;
}
function rawItem(key, body) {
  const bytes = atom(key.startsWith("----:") ? "----" : key, body);
  if (key.startsWith("----:")) {
    let actual;
    try {
      actual = itemKey(bytes, header(bytes, 0, bytes.length), { remaining: maxAtoms });
    } catch (error) {
      if (!(error instanceof InvalidFileError)) {
        throw error;
      }
      throw new InvalidPatchError("Raw MP4 freeform bodies require mean and name children", { cause: error });
    }
    if (actual.toLowerCase() !== key.toLowerCase()) {
      throw new InvalidPatchError("Raw MP4 freeform identity must match its native key");
    }
  }
  return bytes;
}
function editItems(bytes, patch, budget = { remaining: maxAtoms }) {
  const existing = boxes(bytes, 0, bytes.length, budget).map((box) => ({
    key: itemKey(bytes, box, budget),
    bytes: copyBox(bytes, box)
  }));
  const replacements = /* @__PURE__ */ new Map();
  const canonical = (key) => key.startsWith("----:") ? key.toLowerCase() : key;
  const replace = (key, value) => replacements.set(canonical(key), value);
  const entries = patch;
  const aliases = /* @__PURE__ */ new Set(["totaltracks", "totaldiscs", "replaygain_track_gain_ratio", "replaygain_track_peak_ratio"]);
  for (const [field, value] of Object.entries(entries)) {
    if (aliases.has(field) || value === void 0 || field === "native" || field === "chapters" || field === "picture" || field === "lyrics" || field === "track" || field === "disk" || field === "bpm" || field === "compilation" || field === "gapless") {
      continue;
    }
    const key = textAtoms[field] ?? (freeform[field] ? `----:com.apple.iTunes:${freeform[field]}` : void 0);
    if (!key) {
      throw new UnsupportedFeatureError(`MP4 common field is not writable: ${field}`);
    }
    if (field === "artist" && entries.artists !== void 0 || field === "albumartist" && entries.albumartists !== void 0) {
      continue;
    }
    if (field === "year" && entries.date !== void 0) {
      continue;
    }
    replace(key, value === null || value === "" ? null : item(key, value));
  }
  if (patch.lyrics !== void 0) {
    const lyrics = normalizeLyrics(patch.lyrics);
    replace("©lyr", lyrics ? item("©lyr", lyrics.map(lyricsText)) : null);
  }
  for (const field of ["track", "disk"]) {
    const value = patch[field];
    if (value === void 0) {
      continue;
    }
    const key = field === "track" ? "trkn" : "disk";
    if (value === null) {
      replace(key, null);
      continue;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new InvalidPatchError("MP4 track/disc must be a number pair");
    }
    const old = existing.find((e) => e.key === key);
    let no = 0;
    let of = 0;
    if (old) {
      const child = boxes(old.bytes, header(old.bytes, 0, old.bytes.length).header, old.bytes.length, budget).find((b) => b.type === "data");
      if (child && child.end - child.start >= 22) {
        no = UINT16_BE.get(old.bytes, child.start + child.header + 10);
        of = UINT16_BE.get(old.bytes, child.start + child.header + 12);
      }
    }
    no = value.no === void 0 ? no : value.no ?? 0;
    of = value.of === void 0 ? of : value.of ?? 0;
    if (![no, of].every((n) => Number.isInteger(n) && n >= 0 && n <= 65535)) {
      throw new InvalidPatchError("MP4 track/disc exceeds uint16");
    }
    const pair = new Uint8Array(field === "track" ? 8 : 6);
    UINT16_BE.put(pair, 2, no);
    UINT16_BE.put(pair, 4, of);
    replace(key, atom(key, data(0, pair)));
  }
  if (patch.bpm !== void 0) {
    if (patch.bpm === null) {
      replace("tmpo", null);
    } else {
      const bpm = Number(patch.bpm);
      if (!Number.isInteger(bpm) || bpm < 0 || bpm > 65535) {
        throw new InvalidPatchError("MP4 BPM exceeds uint16");
      }
      const b = new Uint8Array(2);
      UINT16_BE.put(b, 0, bpm);
      replace("tmpo", atom("tmpo", data(21, b)));
    }
  }
  for (const [field, key] of [
    ["compilation", "cpil"],
    ["gapless", "pgap"]
  ]) {
    const value = patch[field];
    if (value === void 0) {
      continue;
    }
    if (value !== null && typeof value !== "boolean") {
      throw new InvalidPatchError(`MP4 ${field} must be a boolean`);
    }
    replace(key, value === null ? null : atom(key, data(21, Uint8Array.of(value ? 1 : 0))));
  }
  if (patch.picture !== void 0) {
    replace("covr", patch.picture === null || patch.picture.length === 0 ? null : atom("covr", ...patch.picture.map((picture) => {
      const type = picture.format.toLowerCase() === "image/png" ? 14 : /^image\/(jpeg|jpg)$/i.test(picture.format) ? 13 : 0;
      if (!type) {
        throw new UnsupportedFeatureError("MP4 artwork must be JPEG or PNG");
      }
      return data(type, picture.data);
    })));
  }
  if (patch.genre !== void 0) {
    replace("gnre", null);
  }
  if (patch.comment !== void 0) {
    replace("©com", null);
  }
  if (patch.copyright !== void 0) {
    replace("©cpy", null);
  }
  for (const [key, value] of Object.entries(patch.native ?? {})) {
    if (value === void 0) {
      continue;
    }
    if (!/^[\x20-\xff]{4}$/.test(key) && !/^----:[^:]+:.+$/.test(key)) {
      throw new InvalidPatchError("Invalid MP4 native key");
    }
    if (["trkn", "disk", "tmpo", "cpil", "pgap", "covr"].includes(key) && value !== null && !(value instanceof Uint8Array)) {
      throw new InvalidPatchError(`Native MP4 ${key} requires a raw item body`);
    }
    replace(key, value === null ? null : value instanceof Uint8Array ? rawItem(key, value) : item(key, value));
  }
  return atom("ilst", ...existing.filter((e) => !replacements.has(canonical(e.key))).map((e) => e.bytes), ...[...replacements.values()].filter((v) => v !== null));
}

// ../../node_modules/music-metadata/lib/write/mp4/mp4.js
async function buildMp4Update(source, patch, options) {
  if (options.padding !== void 0) {
    throw new UnsupportedFeatureError("MP4 padding options are not supported");
  }
  if (options.replaceId3) {
    throw new UnsupportedFeatureError("replaceId3 is not supported for MP4");
  }
  const top = [];
  let start = 0;
  while (start < source.size) {
    const bytes = await source.read(start, Math.min(16, source.size - start));
    if (bytes.length < 8) {
      throw new InvalidFileError("Truncated MP4 header");
    }
    const raw = UINT32_BE.get(bytes, 0);
    const size = raw === 1 ? bytes.length < 16 ? 0 : Number(UINT64_BE.get(bytes, 8)) : raw === 0 ? source.size - start : raw;
    const h = raw === 1 ? 16 : 8;
    if (!Number.isSafeInteger(size) || size < h || size > source.size - start) {
      throw new InvalidFileError("Invalid MP4 top-level size");
    }
    const box = { type: fourcc(bytes, 4), start, end: start + size, header: h };
    if (["moof", "sidx", "mfra"].includes(box.type)) {
      throw new UnsupportedFeatureError("Fragmented/indexed MP4 is not supported");
    }
    if (["meta", "meco", "iloc", "saio", "cmov"].includes(box.type)) {
      throw new UnsupportedFeatureError("Top-level MP4 metadata is not supported");
    }
    if (top.length >= maxAtoms) {
      throw new UnsupportedFeatureError("MP4 atom count exceeds limit");
    }
    top.push(box);
    start += size;
  }
  const movies = top.filter((b) => b.type === "moov");
  if (movies.length !== 1 || !top.some((b) => b.type === "mdat")) {
    throw new InvalidFileError("MP4 requires one moov and media data");
  }
  const movie = movies[0];
  if (movie.end - movie.start > limit) {
    throw new UnsupportedFeatureError("MP4 movie metadata exceeds 64 MiB");
  }
  const original = await source.read(movie.start, movie.end - movie.start);
  const chapterEdit = patch.chapters === void 0 ? void 0 : chapterUpdate(original, header(original, 0, original.length), patch.chapters);
  const containers = /* @__PURE__ */ new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "udta"]);
  let metadataCount = 0;
  let budget = { remaining: maxAtoms };
  let offsetTables = 0;
  let offsetCount = 0;
  const media = top.filter((b) => b.type === "mdat");
  const containsMedia = (offset) => {
    let low = 0;
    let high = media.length - 1;
    while (low <= high) {
      const mid = low + high >>> 1;
      const box = media[mid];
      if (offset < box.start + box.header) {
        high = mid - 1;
      } else if (offset >= box.end) {
        low = mid + 1;
      } else {
        return true;
      }
    }
    return false;
  };
  const preflightBudget = { remaining: maxAtoms };
  const rootChildren = boxes(original, movie.header, original.length, preflightBudget);
  const userData = rootChildren.filter((b) => b.type === "udta");
  const existingMeta = rootChildren.some((b) => b.type === "meta") || userData.some((b) => boxes(original, b.start + b.header, b.end, preflightBudget).some((c) => c.type === "meta"));
  const newMeta = () => {
    const handler = atom("hdlr", zeros, zeros, Uint8Array.from("mdir", (c) => c.charCodeAt(0)), new Uint8Array(12), new Uint8Array(1));
    return atom("meta", zeros, handler, editItems(new Uint8Array(), patch, budget));
  };
  const rebuild = (bytes, box, delta, depth = 0, path = "") => {
    var _a;
    path = `${path}/${box.type}`;
    if (depth > 32) {
      throw new InvalidFileError("MP4 nesting exceeds limit");
    }
    if (chapterEdit) {
      if (path === "/moov/trak" && chapterEdit.removedTrackStarts.has(box.start)) {
        return new Uint8Array();
      }
      if (path === "/moov/udta/chpl") {
        return new Uint8Array();
      }
      if (path === "/moov/trak/tref") {
        const references = boxes(bytes, box.start + box.header, box.end, budget).filter((ref) => ref.type !== "chap");
        return references.length ? atom("tref", ...references.map((ref) => copyBox(bytes, ref))) : new Uint8Array();
      }
    }
    if (["mvex", "iloc", "saio", "cmov", "meco"].includes(box.type)) {
      throw new UnsupportedFeatureError(`Unsupported MP4 offset structure: ${box.type}`);
    }
    if (box.type === "dref") {
      const start2 = box.start + box.header;
      if (box.end - start2 < 8 || UINT32_BE.get(bytes, start2) !== 0) {
        throw new InvalidFileError("Invalid MP4 data reference");
      }
      const references = boxes(bytes, start2 + 8, box.end, budget);
      if (references.length !== UINT32_BE.get(bytes, start2 + 4)) {
        throw new InvalidFileError("Invalid MP4 data reference count");
      }
      for (const ref of references) {
        if (ref.type !== "url " || ref.end - ref.start !== ref.header + 4 || UINT32_BE.get(bytes, ref.start + ref.header) !== 1) {
          throw new UnsupportedFeatureError("External MP4 data references are not supported");
        }
      }
    }
    if (box.type === "stco" || box.type === "co64") {
      offsetTables++;
      const body = bytes.subarray(box.start + box.header, box.end);
      if (body.length < 8 || UINT32_BE.get(body, 0) !== 0) {
        throw new InvalidFileError("Invalid chunk-offset table");
      }
      const count = UINT32_BE.get(body, 4);
      const width = box.type === "stco" ? 4 : 8;
      if (count > (body.length - 8) / width || body.length !== 8 + count * width) {
        throw new InvalidFileError("Truncated chunk-offset table");
      }
      offsetCount += count;
      if (offsetCount > 5e6) {
        throw new UnsupportedFeatureError("MP4 chunk-offset count exceeds limit");
      }
      let wide = width === 8;
      for (let i = 0; i < count; i++) {
        const pos = 8 + i * width;
        const offset = width === 4 ? BigInt(UINT32_BE.get(body, pos)) : UINT64_BE.get(body, pos);
        if (offset > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new UnsupportedFeatureError("MP4 offset exceeds safe range");
        }
        const physical = Number(offset);
        if (!containsMedia(physical)) {
          throw new UnsupportedFeatureError("MP4 chunk references external or non-media data");
        }
        const updated2 = offset + BigInt(physical >= movie.end ? delta : 0);
        if (updated2 > 0xffffffffn) {
          wide = true;
        }
      }
      const output = new Uint8Array(8 + count * (wide ? 8 : 4));
      UINT32_BE.put(output, 4, count);
      for (let i = 0; i < count; i++) {
        const pos = 8 + i * width;
        const original2 = width === 4 ? BigInt(UINT32_BE.get(body, pos)) : UINT64_BE.get(body, pos);
        const offset = original2 + BigInt(original2 >= BigInt(movie.end) ? delta : 0);
        if (wide) {
          UINT64_BE.put(output, 8 + i * 8, offset);
        } else {
          UINT32_BE.put(output, 8 + i * 4, Number(offset));
        }
      }
      return atom(wide ? "co64" : "stco", output);
    }
    if (box.type === "meta") {
      if (!["/moov/meta", "/moov/udta/meta"].includes(path)) {
        throw new UnsupportedFeatureError("Track-level MP4 metadata is not supported");
      }
      if (++metadataCount > 1) {
        throw new UnsupportedFeatureError("Multiple MP4 metadata containers are not supported");
      }
      const body = box.start + box.header;
      if (box.end - body < 4 || UINT32_BE.get(bytes, body) !== 0) {
        throw new UnsupportedFeatureError("Unsupported MP4 meta version");
      }
      const children = boxes(bytes, body + 4, box.end, budget);
      if (children.some((child) => ["iloc", "saio", "keys"].includes(child.type))) {
        throw new UnsupportedFeatureError("Unsupported MP4 metadata offset/key structure");
      }
      const handler = children.find((c) => c.type === "hdlr");
      if (!handler || handler.end - handler.start < handler.header + 12 || fourcc(bytes, handler.start + handler.header + 8) !== "mdir") {
        throw new UnsupportedFeatureError("Only iTunes mdir metadata is writable");
      }
      const lists = children.filter((c) => c.type === "ilst");
      if (lists.length > 1) {
        throw new InvalidFileError("Duplicate MP4 item lists");
      }
      return atom("meta", zeros, ...children.map((c) => c.type === "ilst" ? editItems(bytes.subarray(c.start + c.header, c.end), patch, budget) : copyBox(bytes, c)), ...lists.length ? [] : [editItems(new Uint8Array(), patch, budget)]);
    }
    if (containers.has(box.type)) {
      const parts = boxes(bytes, box.start + box.header, box.end, budget).map((c) => rebuild(bytes, c, delta, depth + 1, path));
      if (path === "/moov/udta" && box.start === ((_a = userData[0]) == null ? void 0 : _a.start)) {
        if (!existingMeta) {
          parts.push(newMeta());
        }
        if (chapterEdit == null ? void 0 : chapterEdit.list) {
          parts.push(chapterEdit.list);
        }
      }
      if (path === "/moov" && userData.length === 0 && ((chapterEdit == null ? void 0 : chapterEdit.list) || !existingMeta)) {
        parts.push(atom("udta", ...(chapterEdit == null ? void 0 : chapterEdit.list) ? [chapterEdit.list] : [], ...!existingMeta ? [newMeta()] : []));
      }
      return atom(box.type, ...parts);
    }
    return copyBox(bytes, box);
  };
  const build = (delta) => {
    metadataCount = 0;
    budget = { remaining: maxAtoms };
    offsetTables = 0;
    offsetCount = 0;
    const result = rebuild(original, header(original, 0, original.length), delta);
    if (!offsetTables) {
      throw new UnsupportedFeatureError("MP4 requires a chunk-offset table");
    }
    if (result.length > limit) {
      throw new UnsupportedFeatureError("MP4 movie metadata exceeds 64 MiB");
    }
    return result;
  };
  let updated = build(0);
  for (let pass = 0; ; pass++) {
    if (pass === 16) {
      throw new UnsupportedFeatureError("MP4 chunk offset promotion did not converge");
    }
    const next = build(updated.length - original.length);
    if (next.length === updated.length) {
      updated = next;
      break;
    }
    updated = next;
  }
  return {
    chunks: [
      { source, offset: 0, length: movie.start },
      updated,
      { source, offset: movie.end, length: source.size - movie.end }
    ],
    paddingBytes: 0
  };
}

// ../../node_modules/music-metadata/lib/write/core/patch.js
function textValues(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value)) {
    throw new InvalidPatchError(`Expected a string, an array of strings, or null; got ${typeof value}`);
  }
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new InvalidPatchError(`Expected an array of strings; got ${typeof entry}`);
    }
  }
  return [...value];
}
function numberValue(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new InvalidPatchError(`Expected a finite number; got '${String(value)}'`);
  }
  return parsed;
}
function normalizeComments(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return [{ text: value }];
  }
  const entries = Array.isArray(value) ? value : [value];
  return entries.map((entry) => {
    if (typeof entry === "string") {
      return { text: entry };
    }
    if (typeof entry !== "object" || entry === null || entry.text !== void 0 && typeof entry.text !== "string") {
      throw new InvalidPatchError("Each comment must be a string or an object with a text property");
    }
    return { ...entry, text: entry.text ?? "" };
  });
}
function validatePictures(value) {
  if (value === void 0) {
    return void 0;
  }
  if (value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new InvalidPatchError("picture must be an array of pictures or null");
  }
  return value.map((picture, index) => {
    if (typeof picture !== "object" || picture === null) {
      throw new InvalidPatchError(`picture[${index}] must be an object`);
    }
    if (typeof picture.format !== "string" || picture.format.length === 0) {
      throw new InvalidPatchError(`picture[${index}].format must be a non-empty string`);
    }
    if (!(picture.data instanceof Uint8Array)) {
      throw new InvalidPatchError(`picture[${index}].data must be a Uint8Array`);
    }
    return {
      ...picture,
      data: picture.data
    };
  });
}
function normalizeNumberPair(value, label) {
  if (value === void 0 || value === null) {
    return value;
  }
  if (typeof value !== "object") {
    throw new InvalidPatchError(`${label} must be an object with no/of properties, or null`);
  }
  const result = {};
  if (value.no !== void 0) {
    result.no = requireNonNegativeIntegerOrNull(value.no, `${label}.no`);
  }
  if (value.of !== void 0) {
    result.of = requireNonNegativeIntegerOrNull(value.of, `${label}.of`);
  }
  return result;
}
function requireNonNegativeIntegerOrNull(value, label) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new InvalidPatchError(`${label} must be a non-negative integer or null`);
  }
  return value;
}

// ../../node_modules/music-metadata/lib/write/flac/write.js
var MAX_UINT32 = 4294967295;
function assertLength(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new RangeError(`${label} length must be between 0 and ${MAX_UINT32}, got ${value}`);
  }
}
function pictureValue(value, label) {
  const result = value ?? 0;
  assertLength(result, label);
  return result;
}
function encodePicture(picture) {
  const format = textEncode(normalizePictureMimeType(picture.format), "utf-8");
  const description = textEncode(picture.description ?? "", "utf-8");
  const typeId = picture.typeId ?? pictureTypeToNumber(picture.type);
  const width = pictureValue(picture.width, "Picture width");
  const height = pictureValue(picture.height, "Picture height");
  const colourDepth = pictureValue(picture.colourDepth ?? picture.colour_depth, "Picture colour depth");
  const colours = pictureValue(picture.colours ?? picture.indexed_color, "Picture colour count");
  assertLength(typeId, "Picture type");
  assertLength(format.length, "Picture MIME type");
  assertLength(description.length, "Picture description");
  assertLength(picture.data.length, "Picture data");
  const size = 32 + format.length + description.length + picture.data.length;
  const writer = new TokenWriter(size);
  writer.writeToken(UINT32_BE, typeId);
  writer.writeToken(UINT32_BE, format.length);
  writer.writeBuffer(format);
  writer.writeToken(UINT32_BE, description.length);
  writer.writeBuffer(description);
  writer.writeToken(UINT32_BE, width);
  writer.writeToken(UINT32_BE, height);
  writer.writeToken(UINT32_BE, colourDepth);
  writer.writeToken(UINT32_BE, colours);
  writer.writeToken(UINT32_BE, picture.data.length);
  writer.writeBuffer(picture.data);
  return writer.toUint8Array();
}

// ../../node_modules/music-metadata/lib/write/mapping/common.js
var COMMON_FIELDS = {
  track: { id3: "TRCK", vorbis: "TRACKNUMBER" },
  disk: { id3: "TPOS", vorbis: "DISCNUMBER" },
  year: { id3: "TDRC", vorbis: "DATE" },
  title: { id3: "TIT2", vorbis: "TITLE" },
  artist: { id3: "TPE1", vorbis: "ARTIST" },
  artists: { id3: "TXXX:Artists", vorbis: "ARTISTS" },
  albumartist: { id3: "TPE2", vorbis: "ALBUMARTIST" },
  albumartists: { id3: "TXXX:DISCOGS_ALBUM_ARTISTS", vorbis: "DISCOGS_ALBUM_ARTISTS" },
  album: { id3: "TALB", vorbis: "ALBUM" },
  date: { id3: "TDRC", vorbis: "DATE" },
  originaldate: { id3: "TDOR", vorbis: "ORIGINALDATE" },
  originalyear: { id3: "TXXX:originalyear", vorbis: "ORIGINALYEAR" },
  releasedate: { id3: "TDRL", vorbis: "RELEASEDATE" },
  comment: { id3: "COMM", vorbis: "COMMENT" },
  genre: { id3: "TCON", vorbis: "GENRE" },
  picture: { id3: "APIC", vorbis: "METADATA_BLOCK_PICTURE" },
  composer: { id3: "TCOM", vorbis: "COMPOSER" },
  lyrics: { id3: "USLT", vorbis: "LYRICS" },
  albumsort: { id3: "TSOA", vorbis: "ALBUMSORT" },
  titlesort: { id3: "TSOT", vorbis: "TITLESORT" },
  work: { id3: "TXXX:WORK", vorbis: "WORK" },
  artistsort: { id3: "TSOP", vorbis: "ARTISTSORT" },
  albumartistsort: { id3: "TSO2", vorbis: "ALBUMARTISTSORT" },
  composersort: { id3: "TSOC", vorbis: "COMPOSERSORT" },
  lyricist: { id3: "TEXT", vorbis: "LYRICIST" },
  writer: { id3: "TXXX:Writer", vorbis: "WRITER" },
  conductor: { id3: "TPE3", vorbis: "CONDUCTOR" },
  remixer: { id3: "TPE4", vorbis: "REMIXER" },
  arranger: { id3: "TIPL:arranger", vorbis: "ARRANGER" },
  engineer: { id3: "TIPL:engineer", vorbis: "ENGINEER" },
  publisher: { id3: "TPUB", vorbis: "PUBLISHER" },
  producer: { id3: "TIPL:producer", vorbis: "PRODUCER" },
  djmixer: { id3: "TIPL:DJ-mix", vorbis: "DJMIXER" },
  mixer: { id3: "TIPL:mix", vorbis: "MIXER" },
  technician: { id3: "TXXX:TECHNICIAN", vorbis: "TECHNICIAN" },
  label: { id3: "TPUB", vorbis: "LABEL" },
  grouping: { id3: "TIT1", vorbis: "GROUPING" },
  subtitle: { id3: "TIT3", vorbis: "SUBTITLE" },
  description: { id3: "TDES", vorbis: "DESCRIPTION" },
  longDescription: { id3: "TXXX:LONGDESCRIPTION", vorbis: "LONGDESCRIPTION" },
  discsubtitle: { id3: "TSST", vorbis: "DISCSUBTITLE" },
  totaltracks: { id3: "TRCK", vorbis: "TRACKTOTAL" },
  totaldiscs: { id3: "TPOS", vorbis: "DISCTOTAL" },
  movementTotal: { id3: "MVIN", vorbis: "MOVEMENTTOTAL" },
  compilation: { id3: "TCMP", vorbis: "COMPILATION" },
  rating: { id3: "POPM", vorbis: "RATING" },
  bpm: { id3: "TBPM", vorbis: "BPM" },
  mood: { id3: "TMOO", vorbis: "MOOD" },
  media: { id3: "TMED", vorbis: "MEDIA" },
  catalognumber: { id3: "TXXX:CATALOGNUMBER", vorbis: "CATALOGNUMBER" },
  tvShow: { id3: "TXXX:TVSHOW", vorbis: "TVSHOW" },
  tvShowSort: { id3: "TXXX:TVSHOWSORT", vorbis: "TVSHOWSORT" },
  tvSeason: { id3: "TXXX:TVSEASON", vorbis: "TVSEASON" },
  tvEpisode: { id3: "TXXX:TVEPISODE", vorbis: "TVEPISODE" },
  tvEpisodeId: { id3: "TXXX:TVEPISODEID", vorbis: "TVEPISODEID" },
  tvNetwork: { id3: "TXXX:TVNETWORK", vorbis: "TVNETWORK" },
  podcast: { id3: "PCST", vorbis: "PODCAST" },
  podcasturl: { id3: "WFED", vorbis: "PODCASTURL" },
  releasestatus: { id3: "TXXX:MusicBrainz Album Status", vorbis: "RELEASESTATUS" },
  releasetype: { id3: "TXXX:MusicBrainz Album Type", vorbis: "RELEASETYPE" },
  releasecountry: { id3: "TXXX:MusicBrainz Album Release Country", vorbis: "RELEASECOUNTRY" },
  script: { id3: "TXXX:SCRIPT", vorbis: "SCRIPT" },
  language: { id3: "TLAN", vorbis: "LANGUAGE" },
  copyright: { id3: "TCOP", vorbis: "COPYRIGHT" },
  license: { id3: "WCOP", vorbis: "LICENSE" },
  encodedby: { id3: "TENC", vorbis: "ENCODEDBY" },
  encodersettings: { id3: "TSSE", vorbis: "ENCODERSETTINGS" },
  gapless: { id3: "TXXX:GAPLESS", vorbis: "GAPLESS" },
  barcode: { id3: "TXXX:BARCODE", vorbis: "BARCODE" },
  isrc: { id3: "TXXX:ISRC", vorbis: "ISRC" },
  asin: { id3: "TXXX:ASIN", vorbis: "ASIN" },
  musicbrainz_recordingid: { id3: "UFID", vorbis: "MUSICBRAINZ_TRACKID" },
  musicbrainz_trackid: { id3: "TXXX:MusicBrainz Release Track Id", vorbis: "MUSICBRAINZ_RELEASETRACKID" },
  musicbrainz_albumid: { id3: "TXXX:MusicBrainz Album Id", vorbis: "MUSICBRAINZ_ALBUMID" },
  musicbrainz_artistid: { id3: "TXXX:MusicBrainz Artist Id", vorbis: "MUSICBRAINZ_ARTISTID" },
  musicbrainz_albumartistid: { id3: "TXXX:MusicBrainz Album Artist Id", vorbis: "MUSICBRAINZ_ALBUMARTISTID" },
  musicbrainz_releasegroupid: { id3: "TXXX:MusicBrainz Release Group Id", vorbis: "MUSICBRAINZ_RELEASEGROUPID" },
  musicbrainz_workid: { id3: "TXXX:MusicBrainz Work Id", vorbis: "MUSICBRAINZ_WORKID" },
  musicbrainz_trmid: { id3: "TXXX:MusicBrainz TRM Id", vorbis: "MUSICBRAINZ_TRMID" },
  musicbrainz_discid: { id3: "TXXX:MusicBrainz Disc Id", vorbis: "MUSICBRAINZ_DISCID" },
  acoustid_id: { id3: "TXXX:ACOUSTID_ID", vorbis: "ACOUSTID_ID" },
  acoustid_fingerprint: { id3: "TXXX:Acoustid Fingerprint", vorbis: "ACOUSTID_ID_FINGERPRINT" },
  musicip_puid: { id3: "TXXX:MusicIP PUID", vorbis: "MUSICIP_PUID" },
  musicip_fingerprint: { id3: "TXXX:MusicMagic Fingerprint", vorbis: "MUSICIP_FINGERPRINT" },
  website: { id3: "WOAR", vorbis: "WEBSITE" },
  "performer:instrument": { id3: "TXXX:PERFORMER:INSTRUMENT", vorbis: "PERFORMER:INSTRUMENT" },
  averageLevel: { id3: "PRIV:AverageLevel", vorbis: "AVERAGELEVEL" },
  peakLevel: { id3: "PRIV:PeakLevel", vorbis: "PEAKLEVEL" },
  notes: { id3: "TXXX:NOTES", vorbis: "NOTES" },
  originalalbum: { id3: "TOAL", vorbis: "ORIGINALALBUM" },
  originalartist: { id3: "TOPE", vorbis: "ORIGINALARTIST" },
  discogs_artist_id: { id3: "TXXX:DISCOGS_ARTIST_ID", vorbis: "DISCOGS_ARTIST_ID" },
  discogs_release_id: { id3: "TXXX:DISCOGS_RELEASE_ID", vorbis: "DISCOGS_RELEASE_ID" },
  discogs_label_id: { id3: "TXXX:DISCOGS_LABEL_ID", vorbis: "DISCOGS_LABEL_ID" },
  discogs_master_release_id: { id3: "TXXX:DISCOGS_MASTER_RELEASE_ID", vorbis: "DISCOGS_MASTER_RELEASE_ID" },
  discogs_votes: { id3: "TXXX:DISCOGS_VOTES", vorbis: "DISCOGS_VOTES" },
  discogs_rating: { id3: "TXXX:DISCOGS_RATING", vorbis: "DISCOGS_RATING" },
  replaygain_track_gain_ratio: { id3: "TXXX:REPLAYGAIN_TRACK_GAIN_RATIO", vorbis: "REPLAYGAIN_TRACK_GAIN_RATIO" },
  replaygain_track_peak_ratio: { id3: "TXXX:REPLAYGAIN_TRACK_PEAK_RATIO", vorbis: "REPLAYGAIN_TRACK_PEAK_RATIO" },
  replaygain_track_gain: { id3: "TXXX:REPLAYGAIN_TRACK_GAIN", vorbis: "REPLAYGAIN_TRACK_GAIN" },
  replaygain_track_peak: { id3: "TXXX:REPLAYGAIN_TRACK_PEAK", vorbis: "REPLAYGAIN_TRACK_PEAK" },
  replaygain_album_gain: { id3: "TXXX:REPLAYGAIN_ALBUM_GAIN", vorbis: "REPLAYGAIN_ALBUM_GAIN" },
  replaygain_album_peak: { id3: "TXXX:REPLAYGAIN_ALBUM_PEAK", vorbis: "REPLAYGAIN_ALBUM_PEAK" },
  replaygain_undo: { id3: "TXXX:MP3GAIN_UNDO", vorbis: "REPLAYGAIN_UNDO" },
  replaygain_track_minmax: { id3: "TXXX:MP3GAIN_MINMAX", vorbis: "REPLAYGAIN_MINMAX" },
  replaygain_album_minmax: { id3: "TXXX:MP3GAIN_ALBUM_MINMAX", vorbis: "REPLAYGAIN_ALBUM_MINMAX" },
  key: { id3: "TKEY", vorbis: "KEY" },
  category: { id3: "TCAT", vorbis: "CATEGORY" },
  hdVideo: { id3: "TXXX:HDVIDEO", vorbis: "HDVIDEO" },
  keywords: { id3: "TKWD", vorbis: "KEYWORDS" },
  movement: { id3: "MVNM", vorbis: "MOVEMENT" },
  movementIndex: { id3: "MVIN", vorbis: "MOVEMENTNUMBER" },
  podcastId: { id3: "TGID", vorbis: "PODCASTID" },
  showMovement: { id3: "TXXX:SHOWMOVEMENT", vorbis: "SHOWMOVEMENT" },
  stik: { id3: "TXXX:STIK", vorbis: "STIK" },
  playCounter: { id3: "PCNT", vorbis: "PLAYCOUNTER" }
};
function normalizeCommonPatch(input) {
  var _a;
  const patch = { ...input };
  for (const key of [
    "replaygain_track_gain",
    "replaygain_track_peak",
    "replaygain_album_gain",
    "replaygain_album_peak"
  ]) {
    const value = patch[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const ratio = value;
      const number = key.endsWith("gain") ? ratio.dB : ratio.ratio;
      if (!Number.isFinite(number)) {
        throw new InvalidPatchError(`Invalid ${key}`);
      }
      patch[key] = `${number}${key.endsWith("gain") ? " dB" : ""}`;
    }
  }
  if (patch.year !== void 0 && patch.date === void 0) {
    patch.date = patch.year === null ? null : String(patch.year);
  }
  for (const [alias, key] of [
    ["totaltracks", "track"],
    ["totaldiscs", "disk"],
    ["movementTotal", "movementIndex"]
  ]) {
    if (patch[alias] !== void 0 && patch[key] !== null && ((_a = patch[key]) == null ? void 0 : _a.of) === void 0) {
      const value = patch[alias];
      const total = value === null ? null : Number(value);
      if (total !== null && (!Number.isSafeInteger(total) || total < 0)) {
        throw new InvalidPatchError(`Invalid ${alias}`);
      }
      patch[key] = { ...patch[key], of: total };
    }
  }
  if (patch.replaygain_track_gain_ratio !== void 0 && patch.replaygain_track_gain === void 0) {
    const ratio = patch.replaygain_track_gain_ratio;
    if (ratio !== null && !(typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0)) {
      throw new InvalidPatchError("Invalid replaygain_track_gain_ratio");
    }
    patch.replaygain_track_gain = ratio === null ? null : `${ratioToDb(ratio)} dB`;
  }
  if (patch.replaygain_track_peak_ratio !== void 0 && patch.replaygain_track_peak === void 0) {
    const ratio = patch.replaygain_track_peak_ratio;
    patch.replaygain_track_peak = ratio === null ? null : String(ratio);
  }
  return patch;
}
function commonText(value, field) {
  if (value === null) {
    return null;
  }
  const values2 = Array.isArray(value) ? value : [value];
  return values2.map((entry) => {
    if (typeof entry === "string") {
      return entry;
    }
    if (typeof entry === "boolean") {
      return entry ? "1" : "0";
    }
    if (typeof entry === "number" && Number.isFinite(entry)) {
      return String(entry);
    }
    throw new InvalidPatchError(`Invalid common field ${field}`);
  });
}
var EXTRA_COMMON_FIELDS = [
  "albumsort",
  "titlesort",
  "work",
  "composersort",
  "publisher",
  "djmixer",
  "description",
  "longDescription",
  "discsubtitle",
  "compilation",
  "tvShow",
  "tvShowSort",
  "tvSeason",
  "tvEpisode",
  "tvEpisodeId",
  "tvNetwork",
  "podcast",
  "podcasturl",
  "language",
  "license",
  "encodedby",
  "encodersettings",
  "gapless",
  "musicbrainz_trmid",
  "musicbrainz_discid",
  "acoustid_fingerprint",
  "musicip_puid",
  "musicip_fingerprint",
  "averageLevel",
  "peakLevel",
  "originalalbum",
  "originalartist",
  "discogs_artist_id",
  "discogs_release_id",
  "discogs_label_id",
  "discogs_master_release_id",
  "discogs_votes",
  "discogs_rating",
  "key",
  "category",
  "hdVideo",
  "keywords",
  "movement",
  "podcastId",
  "showMovement",
  "stik",
  "playCounter"
];
function structuredText(patch) {
  const fields = {};
  for (const key of ["replaygain_track_minmax", "replaygain_album_minmax"]) {
    const value = patch[key];
    if (value !== void 0) {
      if (value !== null && (value.length !== 2 || value.some((n) => !Number.isSafeInteger(n)))) {
        throw new InvalidPatchError(`Invalid ${key}`);
      }
      fields[key] = value === null ? null : value.join(",");
    }
  }
  if (patch.replaygain_undo !== void 0) {
    const value = patch.replaygain_undo;
    if (value !== null && (!Number.isSafeInteger(value.leftChannel) || !Number.isSafeInteger(value.rightChannel))) {
      throw new InvalidPatchError("Invalid replaygain_undo");
    }
    fields.replaygain_undo = value === null ? null : `${value.leftChannel},${value.rightChannel}`;
  }
  return fields;
}

// ../../node_modules/music-metadata/lib/write/mapping/vorbis.js
var TEXT_FIELDS = [
  { patch: "notes", field: "NOTES", multiple: true },
  { patch: "barcode", field: "BARCODE", multiple: false },
  { patch: "releasecountry", field: "RELEASECOUNTRY", multiple: false },
  { patch: "asin", field: "ASIN", multiple: false },
  { patch: "albumartistsort", field: "ALBUMARTISTSORT", multiple: false },
  { patch: "artistsort", field: "ARTISTSORT", multiple: false },
  { patch: "script", field: "SCRIPT", multiple: false },
  { patch: "releasestatus", field: "RELEASESTATUS", multiple: false },
  { patch: "releasetype", field: "RELEASETYPE", multiple: true },
  { patch: "acoustid_id", field: "ACOUSTID_ID", multiple: false },
  { patch: "title", field: "TITLE", multiple: false },
  { patch: "artist", field: "ARTIST", multiple: false },
  { patch: "artists", field: "ARTIST", multiple: true },
  { patch: "albumartist", field: "ALBUMARTIST", multiple: false },
  { patch: "albumartists", field: "ALBUMARTIST", multiple: true },
  { patch: "album", field: "ALBUM", multiple: false },
  { patch: "date", field: "DATE", multiple: false },
  { patch: "originaldate", field: "ORIGINALDATE", multiple: false },
  { patch: "releasedate", field: "RELEASEDATE", multiple: false },
  { patch: "genre", field: "GENRE", multiple: true },
  { patch: "composer", field: "COMPOSER", multiple: true },
  { patch: "lyricist", field: "LYRICIST", multiple: true },
  { patch: "writer", field: "WRITER", multiple: true },
  { patch: "conductor", field: "CONDUCTOR", multiple: true },
  { patch: "remixer", field: "REMIXER", multiple: true },
  { patch: "arranger", field: "ARRANGER", multiple: true },
  { patch: "engineer", field: "ENGINEER", multiple: true },
  { patch: "producer", field: "PRODUCER", multiple: true },
  { patch: "mixer", field: "MIXER", multiple: true },
  { patch: "technician", field: "TECHNICIAN", multiple: true },
  { patch: "label", field: "LABEL", multiple: true },
  { patch: "catalognumber", field: "CATALOGNUMBER", multiple: true },
  { patch: "isrc", field: "ISRC", multiple: true },
  { patch: "copyright", field: "COPYRIGHT", multiple: false },
  { patch: "media", field: "MEDIA", multiple: false },
  { patch: "mood", field: "MOOD", multiple: false },
  { patch: "grouping", field: "GROUPING", multiple: false },
  { patch: "subtitle", field: "SUBTITLE", multiple: true },
  { patch: "website", field: "WEBSITE", multiple: false },
  { patch: "musicbrainz_recordingid", field: "MUSICBRAINZ_TRACKID", multiple: false },
  { patch: "musicbrainz_trackid", field: "MUSICBRAINZ_RELEASETRACKID", multiple: false },
  { patch: "musicbrainz_albumid", field: "MUSICBRAINZ_ALBUMID", multiple: false },
  { patch: "musicbrainz_artistid", field: "MUSICBRAINZ_ARTISTID", multiple: true },
  { patch: "musicbrainz_albumartistid", field: "MUSICBRAINZ_ALBUMARTISTID", multiple: true },
  { patch: "musicbrainz_releasegroupid", field: "MUSICBRAINZ_RELEASEGROUPID", multiple: false },
  { patch: "musicbrainz_workid", field: "MUSICBRAINZ_WORKID", multiple: false },
  { patch: "replaygain_track_gain", field: "REPLAYGAIN_TRACK_GAIN", multiple: false },
  { patch: "replaygain_track_peak", field: "REPLAYGAIN_TRACK_PEAK", multiple: false },
  { patch: "replaygain_album_gain", field: "REPLAYGAIN_ALBUM_GAIN", multiple: false },
  { patch: "replaygain_album_peak", field: "REPLAYGAIN_ALBUM_PEAK", multiple: false }
];
function applyVorbisPatch(fields, patch, options = {}) {
  var _a, _b;
  const comments = fields.comments.map((comment) => ({ ...comment }));
  for (const key of EXTRA_COMMON_FIELDS) {
    if (patch[key] !== void 0) {
      setField(comments, COMMON_FIELDS[key].vorbis, commonText(patch[key], key));
    }
  }
  for (const [key, value] of Object.entries(structuredText(patch))) {
    setField(comments, COMMON_FIELDS[key].vorbis, value === null ? null : [value]);
  }
  if (patch["performer:instrument"] !== void 0) {
    setField(comments, "PERFORMER:INSTRUMENT", commonText(patch["performer:instrument"], "performer:instrument"));
  }
  if (patch.movementIndex !== void 0) {
    const pair = normalizeNumberPair(patch.movementIndex, "movementIndex");
    if (pair === null) {
      removeField(comments, "MOVEMENTNUMBER");
      removeField(comments, "MOVEMENTTOTAL");
    } else {
      if ((pair == null ? void 0 : pair.no) !== void 0) {
        setField(comments, "MOVEMENTNUMBER", pair.no === null ? null : [String(pair.no)]);
      }
      if ((pair == null ? void 0 : pair.of) !== void 0) {
        setField(comments, "MOVEMENTTOTAL", pair.of === null ? null : [String(pair.of)]);
      }
    }
  }
  const lyrics = normalizeLyrics(patch.lyrics);
  if (lyrics !== void 0) {
    if (lyrics === null) {
      removeField(comments, "LYRICS");
    } else {
      setField(comments, "LYRICS", lyrics.map((entry) => entry.syncText.length > 0 ? lyricsToLrc(entry) : entry.text ?? ""));
    }
  }
  for (const mapping of TEXT_FIELDS) {
    const value = patch[mapping.patch];
    if (value === void 0) {
      continue;
    }
    const values2 = textValues(value);
    if (values2 === void 0) {
      continue;
    }
    if (values2 === null) {
      removeField(comments, mapping.field);
      continue;
    }
    if (!mapping.multiple && values2.length > 1) {
      throw new InvalidPatchError(`${String(mapping.patch)} accepts a single value`);
    }
    const field = mapping.patch === "artists" && patch.artist !== void 0 ? "ARTISTS" : mapping.field;
    setField(comments, field, values2);
  }
  if (patch.rating !== void 0) {
    for (let index = comments.length - 1; index >= 0; index--) {
      const key = (_a = comments[index]) == null ? void 0 : _a.key.toUpperCase();
      if (key === "RATING" || key.startsWith("RATING:")) {
        comments.splice(index, 1);
      }
    }
    for (const rating of patch.rating ?? []) {
      if (rating.rating === void 0 || !Number.isFinite(rating.rating) || rating.rating < 0 || rating.rating > 1) {
        throw new InvalidPatchError("rating must be a number between 0 and 1");
      }
      if ((_b = rating.source) == null ? void 0 : _b.includes(":")) {
        throw new InvalidPatchError("rating source must not contain a colon");
      }
      const key = rating.source ? `RATING:${rating.source}` : "RATING";
      validateFieldName(key);
      setField(comments, key, [String(rating.source ? rating.rating : rating.rating * 100)]);
    }
  }
  const commentsPatch = normalizeComments(patch.comment);
  if (commentsPatch !== void 0) {
    if (commentsPatch === null || commentsPatch.length === 0) {
      removeField(comments, "COMMENT");
    } else {
      setField(comments, "COMMENT", commentsPatch.map((comment) => comment.text ?? ""));
    }
  }
  const bpm = numberValue(patch.bpm);
  if (bpm !== void 0) {
    if (bpm === null) {
      removeField(comments, "BPM");
    } else {
      setField(comments, "BPM", [String(bpm)]);
    }
  }
  const originalYear = numberValue(patch.originalyear);
  if (originalYear !== void 0) {
    if (originalYear === null) {
      removeField(comments, "ORIGINALYEAR");
    } else {
      setField(comments, "ORIGINALYEAR", [String(Math.trunc(originalYear))]);
    }
  }
  const track = normalizeNumberPair(patch.track, "track");
  if (track !== void 0) {
    if (track === null) {
      removeField(comments, "TRACKNUMBER");
      removeField(comments, "TRACKTOTAL");
      removeField(comments, "TOTALTRACKS");
    } else {
      if (track.no !== void 0) {
        setField(comments, "TRACKNUMBER", track.no === null ? null : [String(track.no)]);
      }
      if (track.of !== void 0) {
        setField(comments, "TRACKTOTAL", track.of === null ? null : [String(track.of)]);
        setField(comments, "TOTALTRACKS", track.of === null ? null : [String(track.of)]);
      }
    }
  }
  const disk = normalizeNumberPair(patch.disk, "disk");
  if (disk !== void 0) {
    if (disk === null) {
      removeField(comments, "DISCNUMBER");
      removeField(comments, "DISCTOTAL");
      removeField(comments, "TOTALDISCS");
    } else {
      if (disk.no !== void 0) {
        setField(comments, "DISCNUMBER", disk.no === null ? null : [String(disk.no)]);
      }
      if (disk.of !== void 0) {
        setField(comments, "DISCTOTAL", disk.of === null ? null : [String(disk.of)]);
        setField(comments, "TOTALDISCS", disk.of === null ? null : [String(disk.of)]);
      }
    }
  }
  if (patch.picture !== void 0) {
    removeField(comments, "METADATA_BLOCK_PICTURE");
    removeField(comments, "COVERART");
    removeField(comments, "COVERARTMIME");
    if (options.pictureComments) {
      for (const comment of options.pictureComments) {
        comments.push(comment);
      }
    }
  }
  if (patch.native !== void 0) {
    if (patch.native === null) {
    } else {
      for (const [key, value] of Object.entries(patch.native)) {
        validateFieldName(key);
        if (value === null) {
          removeField(comments, key);
          continue;
        }
        if (typeof value !== "string" && !Array.isArray(value)) {
          throw new InvalidPatchError(`native.${key} must be a string, an array of strings, or null`);
        }
        const values2 = typeof value === "string" ? [value] : [...value];
        for (const entry of values2) {
          if (typeof entry !== "string") {
            throw new InvalidPatchError(`native.${key} must contain only strings`);
          }
        }
        setField(comments, key, values2);
      }
    }
  }
  const nativeKeys = patch.native && typeof patch.native === "object" ? new Set(Object.keys(patch.native)) : /* @__PURE__ */ new Set();
  if (nativeKeys.has("TRACKTOTAL") || nativeKeys.has("TOTALTRACKS")) {
    const trackTotalValue = findFieldValue(comments, "TRACKTOTAL");
    const totalTracksValue = findFieldValue(comments, "TOTALTRACKS");
    const resolvedValue = trackTotalValue ?? totalTracksValue;
    if (resolvedValue !== void 0) {
      setField(comments, "TRACKTOTAL", resolvedValue === null ? null : [resolvedValue]);
      setField(comments, "TOTALTRACKS", resolvedValue === null ? null : [resolvedValue]);
    }
  }
  if (nativeKeys.has("DISCTOTAL") || nativeKeys.has("TOTALDISCS")) {
    const discTotalValue = findFieldValue(comments, "DISCTOTAL");
    const totalDiscsValue = findFieldValue(comments, "TOTALDISCS");
    const resolvedValue = discTotalValue ?? totalDiscsValue;
    if (resolvedValue !== void 0) {
      setField(comments, "DISCTOTAL", resolvedValue === null ? null : [resolvedValue]);
      setField(comments, "TOTALDISCS", resolvedValue === null ? null : [resolvedValue]);
    }
  }
  for (const comment of comments) {
    validateFieldName(comment.key);
    if (comment.value.includes("\0")) {
      throw new InvalidPatchError(`Vorbis Comment field '${comment.key}' contains a NUL character`);
    }
  }
  return { vendor: fields.vendor, comments };
}
function findFieldValue(comments, key) {
  const upper = key.toUpperCase();
  for (const comment of comments) {
    if (comment.key.toUpperCase() === upper) {
      return comment.value;
    }
  }
  return void 0;
}
function setField(comments, key, values2) {
  const upper = key.toUpperCase();
  let firstIndex = -1;
  for (let index = comments.length - 1; index >= 0; index--) {
    const comment = comments[index];
    if (comment !== void 0 && comment.key.toUpperCase() === upper) {
      firstIndex = index;
    }
  }
  if (firstIndex >= 0) {
    comments.splice(firstIndex, 1);
  }
  for (let index = comments.length - 1; index >= 0; index--) {
    const comment = comments[index];
    if (comment !== void 0 && comment.key.toUpperCase() === upper) {
      comments.splice(index, 1);
    }
  }
  if (values2 === null || values2.length === 0) {
    return;
  }
  const insertAt = firstIndex >= 0 ? Math.min(firstIndex, comments.length) : comments.length;
  const newComments = values2.map((value) => ({ key, value }));
  comments.splice(insertAt, 0, ...newComments);
}
function removeField(comments, key) {
  const upper = key.toUpperCase();
  for (let index = comments.length - 1; index >= 0; index--) {
    const comment = comments[index];
    if (comment !== void 0 && comment.key.toUpperCase() === upper) {
      comments.splice(index, 1);
    }
  }
}
function validateFieldName(key) {
  if (key.length === 0) {
    throw new InvalidPatchError("Vorbis Comment field name must not be empty");
  }
  for (const character of key) {
    const code = character.charCodeAt(0);
    if (code < 32 || code > 125 || character === "=") {
      throw new InvalidPatchError(`Invalid Vorbis Comment field name '${key}'`);
    }
  }
}

// ../../node_modules/music-metadata/lib/write/vorbis/write.js
var MAX_COMMENTS = 1e6;
var MAX_UINT322 = 4294967295;
function assertLength2(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT322) {
    throw new RangeError(`${label} must be between 0 and ${MAX_UINT322}, got ${value}`);
  }
}
function serializeVorbisComment(fields) {
  if (fields.comments.length > MAX_COMMENTS) {
    throw new InvalidPatchError(`Vorbis comment count ${fields.comments.length} exceeds entry limit ${MAX_COMMENTS}`);
  }
  const vendor = textEncode(fields.vendor, "utf-8");
  assertLength2(vendor.length, "Vorbis vendor length");
  assertLength2(fields.comments.length, "Vorbis comment count");
  const comments = fields.comments.map((comment) => {
    const value = textEncode(`${comment.key}=${comment.value}`, "utf-8");
    assertLength2(value.length, `Vorbis comment '${comment.key}' length`);
    return value;
  });
  let size = 4 + vendor.length + 4;
  for (const comment of comments) {
    size += 4 + comment.length;
  }
  const writer = new TokenWriter(size);
  writer.writeToken(UINT32_LE, vendor.length);
  writer.writeBuffer(vendor);
  writer.writeToken(UINT32_LE, comments.length);
  for (const comment of comments) {
    writer.writeToken(UINT32_LE, comment.length);
    writer.writeBuffer(comment);
  }
  return writer.toUint8Array();
}

// ../../node_modules/music-metadata/lib/write/vorbis/comment.js
function parseVorbisComment2(data2) {
  return parseShared(data2, {
    maxComments: MAX_COMMENTS,
    createError: (message) => new InvalidFileError(message)
  });
}
function parseVorbisCommentWithSuffix(data2) {
  const view = new DataView(data2.buffer, data2.byteOffset, data2.byteLength);
  let offset = 0;
  const readLength = (label) => {
    if (offset + 4 > data2.length) {
      throw new InvalidFileError(`Truncated Vorbis comment ${label} length`);
    }
    const length = view.getUint32(offset, true);
    offset += 4;
    if (length > data2.length - offset) {
      throw new InvalidFileError(`Vorbis comment ${label} length ${length} exceeds remaining data ${data2.length - offset}`);
    }
    return length;
  };
  const vendorLength = readLength("vendor");
  offset += vendorLength;
  const count = readLength("comment count");
  if (count > MAX_COMMENTS) {
    throw new InvalidFileError(`Vorbis comment count ${count} exceeds entry limit ${MAX_COMMENTS}`);
  }
  if (count > Math.floor((data2.length - offset) / 4)) {
    throw new InvalidFileError(`Vorbis comment count ${count} exceeds remaining data`);
  }
  for (let index = 0; index < count; index++) {
    const length = readLength(`entry ${index}`);
    offset += length;
  }
  const fields = parseShared(data2.subarray(0, offset), {
    maxComments: MAX_COMMENTS,
    createError: (message) => new InvalidFileError(message)
  });
  return { ...fields, suffix: data2.subarray(offset) };
}
function parseShared(data2, options) {
  return parseVorbisComment(data2, options);
}

// ../../node_modules/music-metadata/lib/write/ogg/ogg.js
var MAX_PAGES = 1e5;
var MAX_HEADER_PACKET = 64 * 1024 * 1024;
var CRC_POLYNOMIAL = 79764919;
var CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index << 24;
    for (let bit = 0; bit < 8; bit++) {
      value = value << 1 ^ (value & 2147483648 ? CRC_POLYNOMIAL : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
})();
function crc(data2) {
  let value = 0;
  for (const byte of data2) {
    value = (value << 8 ^ CRC_TABLE[(value >>> 24 ^ byte) & 255]) >>> 0;
  }
  return value;
}
function checkPageCount(count) {
  if (count >= MAX_PAGES) {
    throw new UnsupportedFeatureError("Ogg page count exceeds limit of 100000");
  }
}
async function buildOggUpdate(source, patch, options = {}) {
  if (options.padding !== void 0 || options.replaceId3 || options.stripFlacId3) {
    throw new UnsupportedFeatureError("Ogg does not support padding or ID3 options");
  }
  const chunks = [];
  let offset = 0;
  let serial;
  let expectedSequence = 0;
  let outputSequence = 0;
  let packetIndex = 0;
  let opus = false;
  let headerCount = 3;
  let pending = [];
  let pendingSize = 0;
  let continued = false;
  let audioPages = 0;
  let ended = false;
  while (offset < source.size) {
    checkPageCount(expectedSequence);
    if (ended) {
      throw new UnsupportedFeatureError("Chained or multiplexed Ogg streams are not supported");
    }
    if (offset + 27 > source.size) {
      throw new InvalidFileError("Truncated Ogg header");
    }
    const header2 = await source.read(offset, 27);
    if (decodeAscii(header2.subarray(0, 4)) !== "OggS" || header2[4] !== 0 || (header2[5] & ~7) !== 0) {
      throw new InvalidFileError("Invalid Ogg header");
    }
    const view = new DataView(header2.buffer, header2.byteOffset, header2.byteLength);
    const pageSerial = view.getUint32(14, true);
    if (serial !== void 0 && pageSerial !== serial) {
      throw new UnsupportedFeatureError("Multiplexed Ogg streams are not supported");
    }
    serial = pageSerial;
    const pageSequence = view.getUint32(18, true);
    const isBos = Boolean(header2[5] & 2);
    const isContinued = Boolean(header2[5] & 1);
    const allowsJoiningContinuation = packetIndex >= headerCount && audioPages === 0;
    if (pageSequence !== expectedSequence || isBos !== (expectedSequence === 0) || isContinued !== continued && !(allowsJoiningContinuation && isContinued)) {
      throw new InvalidFileError("Invalid Ogg page sequence or continuation");
    }
    expectedSequence++;
    const laces = await source.read(offset + 27, header2[26]);
    const size = laces.reduce((a, b) => a + b, 0);
    if (offset + 27 + laces.length + size > source.size) {
      throw new InvalidFileError("Truncated Ogg page");
    }
    const body = await source.read(offset + 27 + laces.length, size);
    const page = concatBytes(header2, laces, body);
    const expectedCrc = view.getUint32(22, true);
    page.fill(0, 22, 26);
    if (crc(page) !== expectedCrc) {
      throw new InvalidFileError("Invalid Ogg checksum");
    }
    if (packetIndex >= headerCount) {
      const pageView = new DataView(page.buffer, page.byteOffset, page.byteLength);
      checkPageCount(outputSequence);
      pageView.setUint32(18, outputSequence++, true);
      pageView.setUint32(22, crc(page), true);
      chunks.push(page.slice(0, 27 + laces.length), { source, offset: offset + 27 + laces.length, length: size });
      continued = laces.length > 0 ? laces[laces.length - 1] === 255 : isContinued;
      audioPages++;
    } else {
      let position = 0;
      for (let i = 0; i < laces.length; i++) {
        const length = laces[i];
        pending.push(body.subarray(position, position + length));
        pendingSize += length;
        if (pendingSize > MAX_HEADER_PACKET) {
          throw new UnsupportedFeatureError("Ogg header packet exceeds 64 MiB");
        }
        position += length;
        if (length === 255) {
          continue;
        }
        let packet = new Uint8Array(pendingSize);
        let packetOffset = 0;
        for (const fragment of pending) {
          packet.set(fragment, packetOffset);
          packetOffset += fragment.length;
        }
        pending = [];
        pendingSize = 0;
        if (packetIndex === 0) {
          opus = decodeAscii(packet.subarray(0, 8)) === "OpusHead";
          headerCount = opus ? 2 : 3;
        }
        if (opus) {
          if (decodeAscii(packet.subarray(0, 8)) !== (packetIndex === 0 ? "OpusHead" : "OpusTags")) {
            throw new InvalidFileError("Invalid Opus header");
          }
          if (packetIndex === 0 && (packet.length < 19 || packet[8] > 15 || packet[9] === 0 || packet[18] !== 0 && packet.length < 21 + packet[9])) {
            throw new InvalidFileError("Invalid Opus identification header");
          }
          if (i !== laces.length - 1) {
            throw new UnsupportedFeatureError("Shared Opus header/audio pages are not supported");
          }
        } else if (packet[0] !== [1, 3, 5][packetIndex] || decodeAscii(packet.subarray(1, 7)) !== "vorbis") {
          throw new UnsupportedFeatureError("Expected Ogg Vorbis or Opus headers");
        } else if (packetIndex === 0 && packet.length < 30) {
          throw new InvalidFileError("Invalid Vorbis identification header");
        }
        if (packetIndex === 1) {
          const pictures = validatePictures(patch.picture);
          const pictureComments = (pictures == null ? void 0 : pictures.map((picture) => ({
            key: "METADATA_BLOCK_PICTURE",
            value: encodeBase64(encodePicture(picture))
          }))) ?? [];
          const prefixLength = opus ? 8 : 7;
          const parsed = parseVorbisCommentWithSuffix(packet.subarray(prefixLength));
          if (!opus && (!parsed.suffix.length || !(parsed.suffix[0] & 1))) {
            throw new InvalidFileError("Missing Vorbis comment framing bit");
          }
          const fields = applyVorbisPatch(parsed, patch, { pictureComments });
          const comments = serializeVorbisComment(fields);
          if (prefixLength + comments.length + parsed.suffix.length > MAX_HEADER_PACKET) {
            throw new UnsupportedFeatureError("Ogg header packet exceeds 64 MiB");
          }
          packet = concatBytes(packet.subarray(0, prefixLength), comments, parsed.suffix);
        }
        if (packetIndex === 2 && i !== laces.length - 1) {
          throw new UnsupportedFeatureError("Shared setup/audio pages are not supported");
        }
        let start = 0;
        const segments = [...new Array(Math.floor(packet.length / 255)).fill(255), packet.length % 255];
        for (let n = 0; n < segments.length; n += 255) {
          checkPageCount(outputSequence);
          const table = Uint8Array.from(segments.slice(n, n + 255));
          const count = table.reduce((a, b) => a + b, 0);
          const h = new Uint8Array(27);
          h.set([79, 103, 103, 83]);
          h[5] = (n ? 1 : 0) | (packetIndex === 0 && n === 0 ? 2 : 0);
          if ((header2[5] & 4) !== 0 && i === laces.length - 1 && n + 255 >= segments.length) {
            h[5] |= 4;
          }
          if (n + 255 < segments.length) {
            h.fill(255, 6, 14);
          }
          const v = new DataView(h.buffer);
          v.setUint32(14, serial, true);
          v.setUint32(18, outputSequence++, true);
          h[26] = table.length;
          const out = concatBytes(h, table, packet.subarray(start, start + count));
          new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(22, crc(out), true);
          chunks.push(out);
          start += count;
        }
        packetIndex++;
      }
      continued = pending.length > 0;
    }
    ended = Boolean(header2[5] & 4);
    offset += page.length;
  }
  if (!ended || continued || packetIndex < headerCount) {
    throw new InvalidFileError("Incomplete Ogg stream");
  }
  return { chunks, paddingBytes: 0 };
}

// ../../node_modules/music-metadata/lib/write/core/source.browser.js
var TokenizerSource = class {
  constructor(tokenizer) {
    __publicField(this, "tokenizer");
    this.tokenizer = tokenizer;
  }
  get size() {
    return this.tokenizer.fileInfo.size;
  }
  async read(offset, length) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0) {
      throw new InvalidFileError(`Invalid read range: offset=${offset}, length=${length}`);
    }
    if (offset + length > this.size) {
      throw new InvalidFileError(`Unexpected end of file: need ${length} byte(s) at offset ${offset}, but only ${this.size - offset} available`);
    }
    if (length === 0) {
      return new Uint8Array(0);
    }
    const result = new Uint8Array(length);
    let read = 0;
    while (read < length) {
      const bytesRead = await this.tokenizer.readBuffer(result.subarray(read), {
        position: offset + read,
        length: length - read,
        mayBeLess: true
      });
      if (bytesRead === 0) {
        throw new InvalidFileError(`Unexpected end of file while reading at offset ${offset + read}`);
      }
      read += bytesRead;
    }
    return result;
  }
  async close() {
    await this.tokenizer.close();
  }
};
function isBlob(input) {
  return input instanceof Blob || "size" in input;
}
async function openSource(input) {
  if (isBlob(input)) {
    const tokenizer2 = fromBlob(input);
    return new TokenizerSource(tokenizer2);
  }
  const tokenizer = fromBuffer(input);
  return new TokenizerSource(tokenizer);
}

// ../../node_modules/music-metadata/lib/write/id3v2/frames.js
function syncSafe(data2, offset) {
  if (offset + 4 > data2.length || data2.subarray(offset, offset + 4).some((byte) => byte > 127)) {
    throw new InvalidFileError("Invalid ID3 sync-safe integer");
  }
  return UINT32SYNCSAFE.get(data2, offset);
}
function encodeFrame(frame) {
  const writer = new TokenWriter(10 + frame.data.length);
  writer.writeBuffer(textEncode(frame.id, "latin1"));
  writer.writeToken(UINT32SYNCSAFE, frame.data.length);
  writer.writeToken(UINT16_BE, frame.flags);
  writer.writeBuffer(frame.data);
  return writer.toUint8Array();
}
function decodeText(data2) {
  const encoding2 = data2[0];
  const bytes = data2.subarray(1);
  switch (encoding2) {
    case 0:
      return textDecode(bytes, "latin1");
    case 1:
      return new TextDecoder(bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-16le").decode(bytes);
    case 2:
      return new TextDecoder("utf-16be").decode(bytes);
    case 3:
      return textDecode(bytes, "utf-8");
    default:
      throw new InvalidFileError("Invalid ID3 text encoding");
  }
}
function utf8(value) {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new InvalidPatchError("ID3 text must be a string without NUL characters");
  }
  return textEncode(value, "utf-8");
}
function latin(value) {
  if (typeof value !== "string" || value.includes("\0") || [...value].some((c) => c.charCodeAt(0) > 255)) {
    throw new InvalidPatchError("ID3 identifier must be Latin-1 without NUL characters");
  }
  return textEncode(value, "latin1");
}
function join(...parts) {
  const writer = new TokenWriter();
  for (const part of parts) {
    writer.writeBuffer(part);
  }
  return writer.toUint8Array();
}
var zero = Uint8Array.of(0);
var encoding = Uint8Array.of(3);
function makeFrames(key, value) {
  const [id, ...descriptionParts] = key.split(":");
  if (!id || !/^[A-Z0-9]{4}$/.test(id)) {
    throw new InvalidPatchError(`Invalid ID3 frame ID: ${key}`);
  }
  if (descriptionParts.length && id !== "TXXX" && id !== "WXXX") {
    throw new InvalidPatchError("Only TXXX and WXXX accept a description in the frame key");
  }
  const description = descriptionParts.join(":");
  if (value === null) {
    return [];
  }
  if (value instanceof Uint8Array) {
    return [{ id, flags: 0, data: value }];
  }
  const values2 = Array.isArray(value) ? value : [value];
  if (id.startsWith("T") && id !== "TIPL" && id !== "TMCL") {
    const strings = values2.map(utf8);
    const payload = join(...strings.flatMap((s, i) => i ? [zero, s] : [s]));
    return [
      { id, flags: 0, data: id === "TXXX" ? join(encoding, utf8(description), zero, payload) : join(encoding, payload) }
    ];
  }
  return values2.map((value2) => {
    if (value2 instanceof Uint8Array) {
      return { id, flags: 0, data: value2 };
    }
    let data2;
    if (["APIC", "COMM", "USLT", "SYLT", "UFID", "POPM", "TIPL", "TMCL"].includes(id) && (typeof value2 !== "object" || value2 === null || Array.isArray(value2))) {
      throw new InvalidPatchError(`${id} requires a structured native value`);
    }
    const object = value2;
    switch (id) {
      case "APIC": {
        if (!object || !(object.data instanceof Uint8Array)) {
          throw new InvalidPatchError("APIC requires picture data");
        }
        const format = normalizePictureMimeType(String(object.format));
        const description2 = utf8(object.description ?? "");
        const pictureEncoding = description2.length === 0 ? zero : encoding;
        data2 = join(pictureEncoding, latin(format), zero, Uint8Array.of(pictureTypeToNumber(object.type)), description2, zero, object.data);
        break;
      }
      case "COMM":
      case "USLT": {
        if (!object) {
          throw new InvalidPatchError(`${id} requires text`);
        }
        const language = object.language ?? "eng";
        if (typeof language !== "string" || !/^[a-zA-Z]{3}$/.test(language)) {
          throw new InvalidPatchError("Invalid ID3 language");
        }
        data2 = join(encoding, latin(language), utf8(object.descriptor ?? ""), zero, utf8(object.text));
        break;
      }
      case "SYLT": {
        const language = object.language ?? "eng";
        const format = object.timeStampFormat;
        const contentType = object.contentType;
        if (typeof language !== "string" || !/^[a-zA-Z]{3}$/.test(language) || ![1, 2].includes(Number(format)) || !Number.isInteger(contentType) || Number(contentType) < 0 || Number(contentType) > 8 || !Array.isArray(object.syncText)) {
          throw new InvalidPatchError("Invalid synchronized lyrics");
        }
        const parts = [
          encoding,
          latin(language),
          Uint8Array.of(Number(format), Number(contentType)),
          utf8(object.descriptor ?? ""),
          zero
        ];
        for (const line of object.syncText) {
          if (!Number.isInteger(line.timestamp) || line.timestamp < 0 || line.timestamp > 4294967295) {
            throw new InvalidPatchError("Invalid lyric timestamp");
          }
          const timestamp = new Uint8Array(4);
          UINT32_BE.put(timestamp, 0, line.timestamp);
          parts.push(utf8(line.text), zero, timestamp);
        }
        data2 = join(...parts);
        break;
      }
      case "PCNT": {
        const counter = Number(value2);
        if (!Number.isSafeInteger(counter) || counter < 0) {
          throw new InvalidPatchError("Invalid play counter");
        }
        let n = BigInt(counter);
        const bytes = [];
        do {
          bytes.unshift(Number(n & 255n));
          n >>= 8n;
        } while (n || bytes.length < 4);
        data2 = Uint8Array.from(bytes);
        break;
      }
      case "PCST":
        data2 = Uint8Array.of(0, ...String(value2) === "1" ? [] : [48]);
        break;
      case "MVNM":
      case "MVIN":
        data2 = join(encoding, utf8(value2));
        break;
      case "UFID": {
        if (!object || !(object.identifier instanceof Uint8Array) || object.identifier.length > 64) {
          throw new InvalidPatchError("UFID requires at most 64 identifier bytes");
        }
        data2 = join(latin(object.owner_identifier), zero, object.identifier);
        break;
      }
      case "POPM": {
        if (!object || !Number.isInteger(object.rating) || Number(object.rating) < 0 || Number(object.rating) > 255) {
          throw new InvalidPatchError("POPM rating must be between 0 and 255");
        }
        const counter = object.counter ?? 0;
        if (!Number.isSafeInteger(counter) || Number(counter) < 0 || Number(counter) > 4294967295) {
          throw new InvalidPatchError("POPM counter must be an unsigned 32-bit integer");
        }
        const bytes = new Uint8Array(4);
        UINT32_BE.put(bytes, 0, Number(counter));
        data2 = join(latin(object.email ?? ""), zero, Uint8Array.of(Number(object.rating)), bytes);
        break;
      }
      case "TIPL":
      case "TMCL": {
        if (!object || typeof object !== "object") {
          throw new InvalidPatchError(`${id} requires a role map`);
        }
        const pairs = [];
        for (const [role, people] of Object.entries(object)) {
          if (!Array.isArray(people)) {
            throw new InvalidPatchError("ID3 role values must be arrays");
          }
          for (const person of people) {
            pairs.push(utf8(role), zero, utf8(person), zero);
          }
        }
        data2 = join(encoding, ...pairs);
        break;
      }
      default:
        if (!id.startsWith("W")) {
          throw new UnsupportedFeatureError(`Writing ${id} requires a raw Uint8Array body`);
        }
        data2 = id === "WXXX" ? join(encoding, utf8(description), zero, latin(value2)) : latin(value2);
    }
    return { id, flags: 0, data: data2 };
  });
}

// ../../node_modules/music-metadata/lib/write/mapping/id3v2.js
var textFields = {
  title: "TIT2",
  artist: "TPE1",
  artists: "TXXX:Artists",
  albumartist: "TPE2",
  albumartists: "TPE2",
  album: "TALB",
  date: "TDRC",
  originaldate: "TDOR",
  releasedate: "TDRL",
  genre: "TCON",
  composer: "TCOM",
  lyricist: "TEXT",
  writer: "TXXX:Writer",
  conductor: "TPE3",
  remixer: "TPE4",
  label: "TPUB",
  catalognumber: "TXXX:CATALOGNUMBER",
  isrc: "TSRC",
  copyright: "TCOP",
  media: "TMED",
  mood: "TMOO",
  grouping: "TIT1",
  subtitle: "TIT3",
  website: "WOAR",
  barcode: "TXXX:BARCODE",
  asin: "TXXX:ASIN",
  script: "TXXX:SCRIPT",
  releasestatus: "TXXX:MusicBrainz Album Status",
  releasetype: "TXXX:MusicBrainz Album Type",
  releasecountry: "TXXX:MusicBrainz Album Release Country",
  acoustid_id: "TXXX:Acoustid Id",
  artistsort: "TSOP",
  albumartistsort: "TSO2",
  musicbrainz_trackid: "TXXX:MusicBrainz Release Track Id",
  musicbrainz_albumid: "TXXX:MusicBrainz Album Id",
  musicbrainz_artistid: "TXXX:MusicBrainz Artist Id",
  musicbrainz_albumartistid: "TXXX:MusicBrainz Album Artist Id",
  musicbrainz_releasegroupid: "TXXX:MusicBrainz Release Group Id",
  musicbrainz_workid: "TXXX:MusicBrainz Work Id",
  replaygain_track_gain: "TXXX:REPLAYGAIN_TRACK_GAIN",
  replaygain_track_peak: "TXXX:REPLAYGAIN_TRACK_PEAK",
  replaygain_album_gain: "TXXX:REPLAYGAIN_ALBUM_GAIN",
  replaygain_album_peak: "TXXX:REPLAYGAIN_ALBUM_PEAK"
};
function applyId3Patch(frames, patch, replace) {
  var _a, _b;
  for (const key of EXTRA_COMMON_FIELDS) {
    if (patch[key] !== void 0) {
      if (key === "djmixer") {
        continue;
      }
      if (key === "averageLevel" || key === "peakLevel") {
        const value = patch[key];
        const owner = key === "averageLevel" ? "AverageLevel" : "PeakLevel";
        const prefix = textEncode(`${owner}\0`, "latin1");
        if (value !== null && (!Number.isInteger(value) || value < 0 || value > 4294967295)) {
          throw new InvalidPatchError(`Invalid ${key}`);
        }
        for (let i = frames.length - 1; i >= 0; i--) {
          const frame = frames[i];
          if (frame.id === "PRIV" && prefix.every((byte, index) => frame.data[index] === byte)) {
            frames.splice(i, 1);
          }
        }
        if (value !== null) {
          const data2 = new Uint8Array(prefix.length + 4);
          data2.set(prefix);
          new DataView(data2.buffer).setUint32(prefix.length, value, true);
          frames.push({ id: "PRIV", flags: 0, data: data2 });
        }
        continue;
      }
      const values2 = commonText(patch[key], key);
      replace(COMMON_FIELDS[key].id3, values2);
    }
  }
  for (const [key, frame] of Object.entries(textFields)) {
    const value = patch[key];
    if (value !== void 0) {
      replace(frame, textValues(value));
    }
  }
  if (patch.notes !== void 0) {
    replace("TXXX:NOTES", textValues(patch.notes));
  }
  if (patch.technician !== void 0) {
    replace("TXXX:TECHNICIAN", textValues(patch.technician));
  }
  if (patch["performer:instrument"] !== void 0) {
    replace("TXXX:PERFORMER:INSTRUMENT", commonText(patch["performer:instrument"], "performer:instrument"));
  }
  for (const [key, value] of Object.entries(structuredText(patch))) {
    replace(COMMON_FIELDS[key].id3, value);
  }
  if (patch.movementIndex !== void 0) {
    const pair = normalizeNumberPair(patch.movementIndex, "movementIndex");
    const frame = frames.find((frame2) => frame2.id === "MVIN");
    const previous = frame ? decodeText(frame.data).split("/") : [];
    replace("MVIN", pair === null ? null : `${(pair == null ? void 0 : pair.no) === void 0 ? previous[0] ?? "" : pair.no ?? ""}/${(pair == null ? void 0 : pair.of) === void 0 ? previous[1] ?? "" : pair.of ?? ""}`);
  }
  for (const [key, frame] of [
    ["bpm", "TBPM"],
    ["originalyear", "TXXX:originalyear"]
  ]) {
    const value = patch[key];
    if (value !== void 0) {
      if (value !== null && !Number.isFinite(Number(value))) {
        throw new InvalidPatchError(`Invalid ${key}`);
      }
      replace(frame, value === null ? null : String(value));
    }
  }
  for (const [key, id] of [
    ["track", "TRCK"],
    ["disk", "TPOS"]
  ]) {
    const pair = normalizeNumberPair(patch[key], key);
    if (pair === void 0) {
      continue;
    }
    if (pair === null) {
      replace(id, null);
      continue;
    }
    const frame = frames.find((frame2) => frame2.id === id);
    if (frame && frame.flags & 79) {
      throw new UnsupportedFeatureError(`Cannot edit flagged ${id}`);
    }
    const previous = frame ? decodeText(frame.data).split("/") : [];
    const no = pair.no === void 0 ? previous[0] : pair.no;
    const of = pair.of === void 0 ? previous[1] : pair.of;
    replace(id, no == null && of == null ? null : `${no ?? ""}${of == null ? "" : `/${of}`}`);
  }
  if (patch.comment !== void 0) {
    replace("COMM", normalizeComments(patch.comment));
  }
  if (patch.lyrics !== void 0) {
    const lyrics = normalizeLyrics(patch.lyrics) ?? [];
    replace("USLT", lyrics.filter((entry) => entry.text !== void 0 || entry.syncText.length === 0).map((entry) => ({ language: entry.language, descriptor: entry.descriptor, text: entry.text ?? "" })));
    replace("SYLT", lyrics.filter((entry) => entry.syncText.length > 0).map((entry) => ({
      language: entry.language,
      descriptor: entry.descriptor,
      contentType: entry.contentType ?? 1,
      timeStampFormat: entry.timeStampFormat ?? 2,
      syncText: entry.syncText
    })));
  }
  if (patch.picture !== void 0) {
    replace("APIC", validatePictures(patch.picture));
  }
  if (patch.musicbrainz_recordingid !== void 0) {
    const values2 = textValues(patch.musicbrainz_recordingid);
    if (values2 && values2.length !== 1) {
      throw new InvalidPatchError("musicbrainz_recordingid requires one value");
    }
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i];
      if (frame.id !== "UFID") {
        continue;
      }
      if (frame.flags & 79) {
        throw new UnsupportedFeatureError("Cannot edit flagged UFID");
      }
      const end = frame.data.indexOf(0);
      const owner = String.fromCharCode(...frame.data.subarray(0, end < 0 ? frame.data.length : end));
      if (owner === "http://musicbrainz.org") {
        frames.splice(i, 1);
      }
    }
    if (values2) {
      const owner = textEncode("http://musicbrainz.org\0", "latin1");
      const identifier = textEncode(values2[0], "latin1");
      if (identifier.length > 64) {
        throw new InvalidPatchError("MusicBrainz identifier exceeds 64 bytes");
      }
      const data2 = new Uint8Array(owner.length + identifier.length);
      data2.set(owner);
      data2.set(identifier, owner.length);
      frames.push({ id: "UFID", flags: 0, data: data2 });
    }
  }
  if (patch.rating !== void 0) {
    replace("POPM", ((_a = patch.rating) == null ? void 0 : _a.map((value) => {
      if (value.rating === void 0 || !Number.isFinite(value.rating) || value.rating < 0 || value.rating > 1) {
        throw new InvalidPatchError("rating must be between 0 and 1");
      }
      return { email: value.source ?? "", rating: Math.round(value.rating * 254) + 1, counter: 0 };
    })) ?? null);
  }
  const roles = ["producer", "engineer", "arranger", "mixer", "djmixer"];
  if (roles.some((role) => patch[role] !== void 0)) {
    const people = /* @__PURE__ */ Object.create(null);
    for (const frame of frames.filter((frame2) => frame2.id === "TIPL")) {
      if (frame.flags & 79) {
        throw new UnsupportedFeatureError("Cannot edit flagged TIPL");
      }
      const pairs = decodeText(frame.data).split("\0");
      for (let i = 0; i + 1 < pairs.length; i += 2) {
        (people[_b = pairs[i]] ?? (people[_b] = [])).push(pairs[i + 1]);
      }
    }
    for (const role of roles) {
      if (patch[role] === void 0) {
        continue;
      }
      const name = role === "mixer" ? "mix" : role === "djmixer" ? "DJ-mix" : role;
      const values2 = textValues(patch[role]);
      delete people[name];
      if (values2 == null ? void 0 : values2.length) {
        people[name] = values2;
      }
    }
    replace("TIPL", Object.keys(people).length ? people : null);
  }
}

// ../../node_modules/music-metadata/lib/write/id3v2/id3v2.js
var MAX_TAG_SIZE = 64 * 1024 * 1024;
function validateAudioHeader(audio, audioLength) {
  if (audio.length >= 2 && audio[0] === 255 && (audio[1] & 246) === 240) {
    if (audio.length < 7) {
      throw new InvalidFileError("Truncated ADTS header");
    }
    const header2 = new AdtsFrameHeader(audio);
    if (header2.samplingRate === null) {
      throw new InvalidFileError("Invalid ADTS sampling-frequency index");
    }
    const frameLength = header2.frameLength | audio[4] << 3 | audio[5] >> 5;
    if (frameLength <= header2.headerLength) {
      throw new InvalidFileError("Invalid ADTS frame length");
    }
    if (frameLength > audioLength) {
      throw new InvalidFileError("ADTS frame exceeds file size");
    }
    return "aac";
  }
  if (audio.length < 4 || audio[0] !== 255 || (audio[1] & 224) !== 224 || (audio[1] & 24) === 8 || (audio[1] & 6) === 0 || (audio[2] & 240) === 240 || (audio[2] & 12) === 12) {
    throw new UnsupportedFormatError("ID3 tag is not followed by MPEG audio or ADTS AAC");
  }
  return "mp3";
}
async function buildId3Update(source, patch, options, embedded = false) {
  let audioOffset = 0;
  let oldLength = 0;
  const frames = [];
  let audioEnd = source.size;
  if (!embedded && options.replaceId3 && source.size >= 128) {
    const tail = await source.read(source.size - 128, 3);
    if (tail[0] === 84 && tail[1] === 65 && tail[2] === 71) {
      audioEnd -= 128;
    }
  }
  const header2 = await source.read(0, Math.min(10, source.size));
  if (header2[0] === 73 && header2[1] === 68 && header2[2] === 51) {
    if (header2.length < 10) {
      throw new InvalidFileError("Truncated ID3 header");
    }
    if (options.replaceId3) {
      if (![2, 3, 4].includes(header2[3])) {
        throw new UnsupportedFeatureError("Unsupported ID3 version");
      }
      const allowedFlags = header2[3] === 2 ? 192 : header2[3] === 3 ? 224 : 240;
      if (header2[4] === 255 || (header2[5] & ~allowedFlags) !== 0) {
        throw new InvalidFileError("Invalid ID3 header");
      }
      const length2 = syncSafe(header2, 6);
      if (length2 > MAX_TAG_SIZE) {
        throw new InvalidFileError("ID3 tag exceeds 64 MiB");
      }
      const hasFooter = header2[3] === 4 && (header2[5] & 16) !== 0;
      audioOffset = 10 + length2 + (hasFooter ? 10 : 0);
      if (audioOffset > audioEnd) {
        throw new InvalidFileError("ID3 tag exceeds file size");
      }
      if (hasFooter) {
        const footer = await source.read(audioOffset - 10, 10);
        if (footer[0] !== 51 || footer[1] !== 68 || footer[2] !== 73 || !footer.subarray(3).every((value, index) => value === header2[index + 3])) {
          throw new InvalidFileError("Invalid ID3 footer");
        }
      }
    } else {
      if (header2[3] !== 4) {
        throw new UnsupportedFeatureError("Only ID3v2.4 tags are writable");
      }
      if (header2[4] !== 0 || (header2[5] & ~32) !== 0) {
        throw new UnsupportedFeatureError("ID3 tag flags, extended headers and footers are not supported");
      }
      oldLength = syncSafe(header2, 6);
      if (oldLength > MAX_TAG_SIZE) {
        throw new InvalidFileError("ID3 tag exceeds 64 MiB");
      }
      audioOffset = 10 + oldLength;
      if (audioOffset > source.size) {
        throw new InvalidFileError("ID3 tag exceeds file size");
      }
      const data2 = await source.read(10, oldLength);
      let offset = 0;
      while (offset < data2.length) {
        if (data2[offset] === 0) {
          if (data2.subarray(offset).some((byte) => byte !== 0)) {
            throw new InvalidFileError("Nonzero ID3 padding");
          }
          break;
        }
        if (offset + 10 > data2.length) {
          throw new InvalidFileError("Truncated ID3 frame header");
        }
        const id = String.fromCharCode(...data2.subarray(offset, offset + 4));
        if (!/^[A-Z0-9]{4}$/.test(id)) {
          throw new InvalidFileError("Invalid ID3 frame ID");
        }
        const size = syncSafe(data2, offset + 4);
        if (size === 0) {
          throw new InvalidFileError("Empty ID3 frame");
        }
        const flags = data2[offset + 8] << 8 | data2[offset + 9];
        if ((flags & ~28751) !== 0) {
          throw new InvalidFileError("Reserved ID3 frame flags");
        }
        if (offset + 10 + size > data2.length) {
          throw new InvalidFileError("ID3 frame exceeds tag size");
        }
        frames.push({ id, flags, data: data2.slice(offset + 10, offset + 10 + size) });
        offset += 10 + size;
        if (frames.length > 1e5) {
          throw new InvalidFileError("Too many ID3 frames");
        }
      }
    }
  }
  const format = embedded ? "wav" : validateAudioHeader(await source.read(audioOffset, Math.min(7, audioEnd - audioOffset)), audioEnd - audioOffset);
  const replace = (key, value) => {
    const [id, ...description] = key.split(":");
    const matches = (frame) => {
      var _a;
      if (frame.id !== id) {
        return false;
      }
      if (description.length === 0) {
        return true;
      }
      if (frame.flags & 79) {
        throw new UnsupportedFeatureError(`Cannot identify flagged ${id} frames safely`);
      }
      return ((_a = decodeText(frame.data).split("\0")[0]) == null ? void 0 : _a.toLowerCase()) === description.join(":").toLowerCase();
    };
    const index = frames.findIndex(matches);
    const retained = frames.filter((frame) => !matches(frame));
    retained.splice(index < 0 ? retained.length : Math.min(index, retained.length), 0, ...makeFrames(key, value));
    frames.splice(0, frames.length, ...retained);
  };
  applyId3Patch(frames, patch, replace);
  for (const [key, value] of Object.entries(patch.native ?? {})) {
    replace(key, value);
  }
  const encoded = frames.map(encodeFrame);
  const length = encoded.reduce((sum, frame) => sum + frame.length, 0);
  const padding = options.padding ?? 8192;
  if (!Number.isSafeInteger(padding) || padding < 0) {
    throw new InvalidPatchError("padding must be a non-negative integer");
  }
  const bodyLength = padding === 0 ? length : Math.max(oldLength, length + padding);
  if (bodyLength > MAX_TAG_SIZE) {
    throw new InvalidPatchError("ID3 tag exceeds 64 MiB");
  }
  const writer = new TokenWriter(bodyLength + 10);
  writer.writeBuffer(Uint8Array.of(73, 68, 51, 4, 0));
  writer.writeToken(UINT8, 0);
  writer.writeToken(UINT32SYNCSAFE, bodyLength);
  for (const frame of encoded) {
    writer.writeBuffer(frame);
  }
  writer.writeZeros(bodyLength - length);
  return {
    format,
    metadata: writer.toUint8Array(),
    audioOffset,
    audioLength: audioEnd - audioOffset,
    paddingBytes: bodyLength - length
  };
}

// ../../node_modules/music-metadata/lib/write/wav/wav.js
async function buildWavUpdate(source, patch, options) {
  const header2 = await source.read(0, 12);
  if (String.fromCharCode(...header2.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...header2.subarray(8, 12)) !== "WAVE") {
    throw new UnsupportedFeatureError("Only RIFF/WAVE containers are supported");
  }
  const view = new DataView(header2.buffer, header2.byteOffset, header2.byteLength);
  const end = view.getUint32(4, true) + 8;
  if (end < 12 || end > source.size) {
    throw new InvalidFileError("Invalid RIFF size");
  }
  const chunks = [];
  let tag = new Uint8Array(0);
  let hasTag = false;
  let hasFormat = false;
  let hasData = false;
  let count = 0;
  for (let offset = 12; offset < end; ) {
    if (++count > 1e5) {
      throw new InvalidFileError("Too many RIFF chunks");
    }
    if (offset + 8 > end) {
      throw new InvalidFileError("Truncated RIFF chunk header");
    }
    const chunk = await source.read(offset, 8);
    const id = String.fromCharCode(...chunk.subarray(0, 4));
    const size = new DataView(chunk.buffer, chunk.byteOffset, 8).getUint32(4, true);
    const length = 8 + size + size % 2;
    if (offset + length > end) {
      throw new InvalidFileError("RIFF chunk exceeds container size");
    }
    if (id === "id3 " || id === "ID3 ") {
      if (hasTag) {
        throw new UnsupportedFeatureError("Multiple WAV ID3 chunks are not supported");
      }
      if (size > 64 * 1024 * 1024 + 20) {
        throw new InvalidFileError("WAV ID3 chunk exceeds 64 MiB");
      }
      tag = await source.read(offset + 8, size);
      if (size < 10 || String.fromCharCode(...tag.subarray(0, 3)) !== "ID3") {
        throw new InvalidFileError("Invalid WAV ID3 chunk");
      }
      hasTag = true;
    } else {
      if (id === "fmt ") {
        if (size < 16) {
          throw new InvalidFileError("Truncated WAV format chunk");
        }
        hasFormat = true;
      }
      if (id === "data") {
        hasData = true;
      }
      chunks.push({ source, offset, length });
    }
    offset += length;
  }
  if (!hasFormat || !hasData) {
    throw new InvalidFileError("WAV requires fmt and data chunks");
  }
  const tagSource = await openSource(tag);
  let update;
  try {
    update = await buildId3Update(tagSource, patch, options, true);
    if (update.audioLength !== 0) {
      throw new InvalidFileError("Unexpected bytes after WAV ID3 tag");
    }
  } finally {
    await tagSource.close();
  }
  const id3Header = new Uint8Array(8);
  id3Header.set([105, 100, 51, 32]);
  new DataView(id3Header.buffer).setUint32(4, update.metadata.length, true);
  chunks.push(id3Header, update.metadata);
  if (update.metadata.length % 2) {
    chunks.push(new Uint8Array(1));
  }
  const riffSize = 4 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (riffSize > 4294967295) {
    throw new UnsupportedFeatureError("WAV exceeds RIFF 32-bit size limit");
  }
  view.setUint32(4, riffSize, true);
  if (end < source.size) {
    chunks.push({ source, offset: end, length: source.size - end });
  }
  return { chunks: [header2, ...chunks], paddingBytes: update.paddingBytes };
}

// ../../node_modules/music-metadata/lib/write/core/shared.js
function buildStreamedUpdate(format, source, patch, options) {
  switch (format) {
    case "wav":
      return buildWavUpdate(source, patch, options);
    case "mp4":
      return buildMp4Update(source, patch, options);
    case "ogg":
      return buildOggUpdate(source, patch, options);
  }
}
function assertPatch(patch) {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    throw new InvalidPatchError("patch must be an object");
  }
}
function assertSupported(format) {
  if (format === "unknown") {
    throw new UnsupportedFormatError("Unsupported audio format; supported formats are FLAC, Ogg Vorbis/Opus, WAV, MP4, MP3 and ADTS AAC (ID3v2.4)");
  }
}

// ../../node_modules/music-metadata/lib/write/core/writer.browser.js
async function writeBuffer(chunks, options = {}) {
  const totalBytes = chunks.reduce((sum, chunk) => sum + chunkLength(chunk), 0);
  if (options.dryRun) {
    return new Uint8Array(totalBytes);
  }
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    const bytes = chunk instanceof Uint8Array ? chunk : await chunk.source.read(chunk.offset, chunk.length);
    output.set(bytes, offset);
    offset += bytes.length;
  }
  return output;
}
function chunkLength(chunk) {
  return chunk.length;
}

// ../../node_modules/music-metadata/lib/write/flac/flac.js
var FLAC_MARKER_BYTES = Uint8Array.of(102, 76, 97, 67);
var DEFAULT_VENDOR = "music-metadata";
var DEFAULT_PADDING = 8192;
var MAX_BLOCKS = 1e4;
var STREAMINFO_LENGTH = 34;
async function parseFlac(source) {
  if (source.size < 4) {
    throw new InvalidFileError("File is too small to be a FLAC file");
  }
  let offset = 0;
  let id3Prefix = new Uint8Array(0);
  const first = await source.read(0, Math.min(10, source.size));
  if (first.length >= 3 && first[0] === 73 && first[1] === 68 && first[2] === 51) {
    if (first.length < 10) {
      throw new InvalidFileError("Truncated ID3v2 header before FLAC stream");
    }
    const tagSize = readSyncSafeUInt32(first, 6);
    const hasFooter = first[3] >= 4 && (first[5] & 16) !== 0;
    const prefixLength = 10 + tagSize + (hasFooter ? 10 : 0);
    if (prefixLength > source.size) {
      throw new InvalidFileError("ID3v2 tag before FLAC stream exceeds file size");
    }
    id3Prefix = await source.read(0, prefixLength);
    offset = prefixLength;
  }
  const marker = await source.read(offset, 4);
  if (marker[0] !== 102 || marker[1] !== 76 || marker[2] !== 97 || marker[3] !== 67) {
    throw new UnsupportedFormatError("Not a FLAC stream");
  }
  offset += 4;
  const blocks = [];
  let last = false;
  while (!last) {
    if (blocks.length >= MAX_BLOCKS) {
      throw new InvalidFileError(`FLAC metadata block count exceeds limit ${MAX_BLOCKS}`);
    }
    if (offset + 4 > source.size) {
      throw new InvalidFileError("Truncated FLAC metadata block header");
    }
    const header2 = await source.read(offset, 4);
    const { lastBlock, type, length } = BlockHeader.get(header2, 0);
    last = lastBlock;
    offset += 4;
    if (offset + length > source.size) {
      throw new InvalidFileError(`FLAC metadata block type ${type} length ${length} exceeds file size`);
    }
    const data2 = await source.read(offset, length);
    offset += length;
    blocks.push({ type, data: data2 });
  }
  const streamInfo = blocks[0];
  if (streamInfo === void 0 || streamInfo.type !== BlockType.STREAMINFO) {
    throw new InvalidFileError("FLAC STREAMINFO block must be the first metadata block");
  }
  if (streamInfo.data.length !== STREAMINFO_LENGTH) {
    throw new InvalidFileError(`FLAC STREAMINFO block must be ${STREAMINFO_LENGTH} bytes, got ${streamInfo.data.length}`);
  }
  return {
    id3Prefix,
    blocks,
    audioOffset: offset,
    audioLength: source.size - offset
  };
}
async function buildFlacUpdate(source, patch, options = {}) {
  var _a;
  const parsed = await parseFlac(source);
  const id3Prefix = options.stripFlacId3 ? new Uint8Array(0) : parsed.id3Prefix;
  const paddingTarget = validatePadding(options.padding);
  let blocks = parsed.blocks.map((block) => ({ type: block.type, data: block.data }));
  const commentIndex = blocks.findIndex((block) => block.type === BlockType.VORBIS_COMMENT);
  const currentFields = commentIndex >= 0 ? parseVorbisComment2((_a = blocks[commentIndex]) == null ? void 0 : _a.data) : { vendor: DEFAULT_VENDOR, comments: [] };
  const updatedFields = applyVorbisPatch(currentFields, patch);
  let pictures = patch.picture;
  if (hasNativePicture(patch.native)) {
    pictures = updatedFields.comments.filter((comment) => comment.key.toUpperCase() === "METADATA_BLOCK_PICTURE").map((comment) => decodeNativePicture(comment.value));
    updatedFields.comments = updatedFields.comments.filter((comment) => comment.key.toUpperCase() !== "METADATA_BLOCK_PICTURE");
  }
  const commentData = serializeVorbisComment(updatedFields);
  if (commentIndex >= 0) {
    blocks[commentIndex] = { type: BlockType.VORBIS_COMMENT, data: commentData };
  } else {
    blocks.splice(1, 0, { type: BlockType.VORBIS_COMMENT, data: commentData });
  }
  blocks = applyPicturePatch(blocks, pictures);
  const oldMetadataSize = parsed.audioOffset - parsed.id3Prefix.length;
  const nonPadding = blocks.filter((block) => block.type !== BlockType.PADDING);
  const nonPaddingSize = 4 + nonPadding.reduce((sum, block) => sum + 4 + block.data.length, 0);
  const padding = calculatePadding(oldMetadataSize, nonPaddingSize, paddingTarget);
  if (padding.length > 0) {
    nonPadding.push({ type: BlockType.PADDING, data: padding });
  }
  const metadata = serializeFlac(id3Prefix, nonPadding);
  return {
    id3Prefix,
    blocks: nonPadding,
    metadata,
    audioOffset: parsed.audioOffset,
    audioLength: parsed.audioLength,
    paddingBytes: padding.length,
    bytesWritten: metadata.length + parsed.audioLength
  };
}
function hasNativePicture(native) {
  return native != null && Object.keys(native).some((key) => key.toUpperCase() === "METADATA_BLOCK_PICTURE");
}
function decodeNativePicture(value) {
  const errorMessage = "native.METADATA_BLOCK_PICTURE must contain valid base64 FLAC PICTURE data";
  const normalized = value.replace(/\s/g, "");
  const data2 = decodeBase64(normalized);
  if (encodeBase64(data2) !== normalized) {
    throw new InvalidPatchError(errorMessage);
  }
  const picture = decodePicture(data2, 0, {
    requireExactData: true,
    createError: () => new InvalidPatchError(errorMessage)
  });
  return { ...picture, type: picture.type ?? "Other" };
}
function applyPicturePatch(blocks, pictures) {
  const validated = validatePictures(pictures);
  if (validated === void 0) {
    return blocks;
  }
  const replacement = validated === null ? [] : validated.map((picture) => ({ type: BlockType.PICTURE, data: encodePicture(picture) }));
  const result = [];
  let inserted = false;
  for (const block of blocks) {
    if (block.type === BlockType.PICTURE) {
      if (!inserted) {
        result.push(...replacement);
        inserted = true;
      }
      continue;
    }
    result.push(block);
  }
  if (!inserted && replacement.length > 0) {
    const commentIndex = result.findIndex((block) => block.type === BlockType.VORBIS_COMMENT);
    const insertAt = commentIndex >= 0 ? commentIndex + 1 : 1;
    result.splice(insertAt, 0, ...replacement);
  }
  return result;
}
function calculatePadding(oldMetadataSize, newMetadataSize, target) {
  if (target === 0) {
    return new Uint8Array(0);
  }
  let total = Math.max(oldMetadataSize, newMetadataSize + 4 + target);
  if (total > newMetadataSize && total - newMetadataSize < 4) {
    total = newMetadataSize + 4 + target;
  }
  let paddingLength = total - newMetadataSize - 4;
  if (paddingLength > 16777215) {
    paddingLength = Math.min(target, 16777215);
  }
  return paddingLength > 0 ? new Uint8Array(paddingLength) : new Uint8Array(0);
}
function serializeFlac(id3Prefix, blocks) {
  let size = id3Prefix.length + 4;
  for (const block of blocks) {
    size += 4 + block.data.length;
  }
  const writer = new TokenWriter(size);
  writer.writeBuffer(id3Prefix);
  writer.writeBuffer(FLAC_MARKER_BYTES);
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const isLast = index === blocks.length - 1;
    if (block.data.length > 16777215) {
      throw new InvalidFileError(`FLAC metadata block is too large: ${block.data.length} bytes`);
    }
    writer.writeToken(BlockHeader, { lastBlock: isLast, type: block.type, length: block.data.length });
    writer.writeBuffer(block.data);
  }
  return writer.toUint8Array();
}
function validatePadding(padding) {
  if (padding === void 0) {
    return DEFAULT_PADDING;
  }
  if (!Number.isSafeInteger(padding) || padding < 0) {
    throw new InvalidPatchError("padding must be a non-negative integer");
  }
  return padding;
}
function readSyncSafeUInt32(data2, offset) {
  if (offset + 4 > data2.length) {
    throw new InvalidFileError("Truncated sync-safe integer");
  }
  return (data2[offset] & 127) << 21 | (data2[offset + 1] & 127) << 14 | (data2[offset + 2] & 127) << 7 | data2[offset + 3] & 127;
}

// ../../node_modules/music-metadata/lib/write/browser.js
async function updateBuffer(data2, patch, options = {}) {
  assertPatch(patch);
  patch = normalizeCommonPatch(patch);
  const source = await openSource(data2);
  try {
    const format = await detectFormat(source);
    assertSupported(format);
    if (format === "flac" && options.replaceId3) {
      throw new UnsupportedFeatureError("replaceId3 is only supported for MP3, ADTS AAC and WAV");
    }
    if (format === "wav" || format === "mp4" || format === "ogg") {
      const update2 = await buildStreamedUpdate(format, source, patch, options);
      return writeBuffer(update2.chunks);
    }
    const update = await (format === "flac" ? buildFlacUpdate : buildId3Update)(source, patch, options);
    const audio = await source.read(update.audioOffset, update.audioLength);
    return concatBytes(update.metadata, audio);
  } finally {
    await source.close();
  }
}

// ../../node_modules/music-metadata/lib/core.js
async function parseBlob(blob, options = {}) {
  const tokenizer = fromBlob(blob, getTokenizerOptions(options));
  try {
    return await parseFromTokenizer(tokenizer, options);
  } finally {
    await tokenizer.close();
  }
}
async function parseWebStream(webStream, fileInfo, options = {}) {
  const tokenizer = fromWebStream(webStream, getTokenizerOptions(options, typeof fileInfo === "string" ? { mimeType: fileInfo } : fileInfo));
  try {
    return await parseFromTokenizer(tokenizer, options);
  } finally {
    await tokenizer.close();
  }
}
async function parseBuffer(uint8Array, fileInfo, options = {}) {
  const tokenizer = fromBuffer(uint8Array, getTokenizerOptions(options, typeof fileInfo === "string" ? { mimeType: fileInfo } : fileInfo));
  return parseFromTokenizer(tokenizer, options);
}
function parseFromTokenizer(tokenizer, options) {
  const parserFactory = new ParserFactory();
  return parserFactory.parse(tokenizer, void 0, options);
}
function ratingToStars(rating) {
  return rating === void 0 ? 0 : 1 + Math.round(rating * 4);
}
function selectCover(pictures) {
  return (pictures == null ? void 0 : pictures.find((picture) => picture.type && ["front", "cover", "cover (front)"].includes(picture.type.toLowerCase()))) ?? (pictures == null ? void 0 : pictures[0]) ?? null;
}
async function scanAppendingHeaders(tokenizer, options = {}) {
  let apeOffset = tokenizer.fileInfo.size;
  if (await hasID3v1Header(tokenizer)) {
    apeOffset -= 128;
    const lyricsLen = await getLyricsHeaderLength(tokenizer);
    apeOffset -= lyricsLen;
  }
  options.apeHeader = await APEv2Parser.findApeFooterOffset(tokenizer, apeOffset);
}
async function parseFile(_filePath, _options = {}) {
  throw new Error("This function require a Node engine. To load Web API File objects use parseBlob instead.");
}
async function parseStream(_stream, _fileInfo, _options = {}) {
  throw new Error("This function require a Node engine.");
}
function getSupportedMimeTypes() {
  return new ParserFactory().getSupportedMimeTypes();
}
export {
  CouldNotDetermineFileTypeError,
  FieldDecodingError,
  InternalParserError,
  InvalidFileError,
  InvalidPatchError,
  LyricsContentType,
  MetadataEditorError,
  PICTURE_TYPES,
  TimestampFormat,
  TrackType,
  UnexpectedFileContentError,
  UnsupportedFeatureError,
  UnsupportedFileTypeError,
  UnsupportedFormatError,
  WriteError,
  getSupportedMimeTypes,
  makeParseError,
  makeUnexpectedFileContentError,
  orderTags,
  parseBlob,
  parseBuffer,
  parseFile,
  parseFromTokenizer,
  parseStream,
  parseWebStream,
  ratingToStars,
  scanAppendingHeaders,
  selectCover,
  updateBuffer
};
/*! Bundled license information:

content-type/dist/index.js:
  (*!
   * content-type
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)
*/
//# sourceMappingURL=music-metadata.js.map
