import {
  TrackType,
  TrackTypeValueToKeyMap
} from "./chunk-XS2AH7GC.js";
import {
  LyricsContentType,
  TimestampFormat
} from "./chunk-GQBXDRBH.js";
import {
  concatUint8Arrays,
  decodeString,
  getUintBE,
  toNativeTyped,
  toRatio
} from "./chunk-O76RKEBI.js";
import {
  EndOfStreamError,
  INT32_BE,
  InternalParserError,
  StringType,
  TokenizerBoundaryError,
  UINT16_BE,
  UINT16_LE,
  UINT32_BE,
  UINT32_LE,
  UINT64_LE,
  UINT8,
  createTokenizerView,
  defaultMaxMetadataEntries,
  fromBlob,
  fromBuffer,
  fromWebStream,
  getMaxMemoryAllocation,
  getMaxMetadataEntries,
  makeUnexpectedFileContentError
} from "./chunk-3HBPJLK7.js";
import {
  require_browser
} from "./chunk-ZGKN2RSD.js";
import {
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/common/TrackInfo.js
function normalizeBitrate(bitrate) {
  return bitrate !== void 0 && Number.isFinite(bitrate) && bitrate > 0 ? bitrate : void 0;
}
function createAudioTrackInfo(format) {
  const audio = {};
  const track = { type: TrackType.audio, audio };
  if (format.codec !== void 0) {
    track.codecName = format.codec;
  }
  if (format.codecProfile !== void 0) {
    track.codecProfile = format.codecProfile;
  }
  if (format.duration !== void 0) {
    track.duration = format.duration;
  }
  const bitrate = normalizeBitrate(format.bitrate);
  if (bitrate !== void 0) {
    track.bitrate = bitrate;
  }
  if (format.lossless !== void 0) {
    track.lossless = format.lossless;
  }
  if (format.sampleRate !== void 0) {
    audio.samplingFrequency = format.sampleRate;
  }
  if (format.numberOfChannels !== void 0) {
    audio.channels = format.numberOfChannels;
  }
  if (format.bitsPerSample !== void 0) {
    audio.bitDepth = format.bitsPerSample;
  }
  if (format.numberOfSamples !== void 0) {
    audio.numberOfSamples = format.numberOfSamples;
  }
  return track;
}
function finalizeContainerInfo(metadata, fileSize) {
  const { format } = metadata;
  let duration = format.containerDuration;
  if (duration === void 0) {
    const durations = format.trackInfo.filter((track) => track.type === TrackType.audio || track.type === TrackType.video).map((track) => track.duration);
    if (durations.length > 0 && durations.every((duration2) => duration2 !== void 0 && duration2 > 0 && Number.isFinite(duration2))) {
      duration = durations.reduce((maximum, trackDuration) => Math.max(maximum, trackDuration), 0);
    } else if (!format.hasVideo) {
      duration = format.duration;
    }
  }
  if (duration !== void 0 && Number.isFinite(duration) && duration > 0) {
    metadata.setFormat("containerDuration", duration);
    if (format.duration === void 0) {
      metadata.setFormat("duration", duration);
    }
    if (fileSize !== void 0 && Number.isSafeInteger(fileSize) && fileSize > 0) {
      const bitrate = 8 * fileSize / duration;
      if (Number.isFinite(bitrate)) {
        metadata.setFormat("overallBitrate", bitrate);
      }
    }
  }
}

// ../../node_modules/@tokenizer/inflate/lib/GzipHandler.js
var GzipHandler = class {
  constructor(tokenizer) {
    this.tokenizer = tokenizer;
  }
  inflate() {
    const tokenizer = this.tokenizer;
    return new ReadableStream({
      async pull(controller) {
        const buffer = new Uint8Array(1024);
        const size = await tokenizer.readBuffer(buffer, { mayBeLess: true });
        if (size === 0) {
          controller.close();
          return;
        }
        controller.enqueue(buffer.subarray(0, size));
      }
    }).pipeThrough(new DecompressionStream("gzip"));
  }
};

// ../../node_modules/@tokenizer/inflate/lib/ZipHandler.js
var import_debug = __toESM(require_browser(), 1);

// ../../node_modules/@tokenizer/inflate/lib/ZipLimitError.js
var ZipLimitError = class extends RangeError {
  constructor(limit, requestedSize, maxSize) {
    super(`ZIP ${limit} exceeded: ${requestedSize} exceeds limit of ${maxSize}`);
    this.limit = limit;
    this.requestedSize = requestedSize;
    this.maxSize = maxSize;
    this.name = "ZipLimitError";
  }
};

// ../../node_modules/@tokenizer/inflate/lib/ZipToken.js
var Signature = {
  LocalFileHeader: 67324752,
  DataDescriptor: 134695760,
  CentralFileHeader: 33639248,
  EndOfCentralDirectory: 101010256
};
var DataDescriptor = {
  get(array) {
    return {
      signature: UINT32_LE.get(array, 0),
      compressedSize: UINT32_LE.get(array, 8),
      uncompressedSize: UINT32_LE.get(array, 12)
    };
  },
  len: 16
};
var LocalFileHeaderToken = {
  get(array) {
    const flags = UINT16_LE.get(array, 6);
    return {
      signature: UINT32_LE.get(array, 0),
      minVersion: UINT16_LE.get(array, 4),
      dataDescriptor: !!(flags & 8),
      compressedMethod: UINT16_LE.get(array, 8),
      compressedSize: UINT32_LE.get(array, 18),
      uncompressedSize: UINT32_LE.get(array, 22),
      filenameLength: UINT16_LE.get(array, 26),
      extraFieldLength: UINT16_LE.get(array, 28),
      filename: null
    };
  },
  len: 30
};
var EndOfCentralDirectoryRecordToken = {
  get(array) {
    return {
      signature: UINT32_LE.get(array, 0),
      nrOfThisDisk: UINT16_LE.get(array, 4),
      nrOfThisDiskWithTheStart: UINT16_LE.get(array, 6),
      nrOfEntriesOnThisDisk: UINT16_LE.get(array, 8),
      nrOfEntriesOfSize: UINT16_LE.get(array, 10),
      sizeOfCd: UINT32_LE.get(array, 12),
      offsetOfStartOfCd: UINT32_LE.get(array, 16),
      zipFileCommentLength: UINT16_LE.get(array, 20)
    };
  },
  len: 22
};
var FileHeader = {
  get(array) {
    const flags = UINT16_LE.get(array, 8);
    return {
      signature: UINT32_LE.get(array, 0),
      minVersion: UINT16_LE.get(array, 6),
      dataDescriptor: !!(flags & 8),
      compressedMethod: UINT16_LE.get(array, 10),
      compressedSize: UINT32_LE.get(array, 20),
      uncompressedSize: UINT32_LE.get(array, 24),
      filenameLength: UINT16_LE.get(array, 28),
      extraFieldLength: UINT16_LE.get(array, 30),
      fileCommentLength: UINT16_LE.get(array, 32),
      relativeOffsetOfLocalHeader: UINT32_LE.get(array, 42),
      filename: null
    };
  },
  len: 46
};

// ../../node_modules/@tokenizer/inflate/lib/ZipHandler.js
function signatureToArray(signature) {
  const signatureBytes = new Uint8Array(UINT32_LE.len);
  UINT32_LE.put(signatureBytes, 0, signature);
  return signatureBytes;
}
var debug = (0, import_debug.default)("tokenizer:inflate");
var syncBufferSize = 256 * 1024;
var eocdSignatureBytes = signatureToArray(Signature.EndOfCentralDirectory);
var ZipHandler = class {
  constructor(tokenizer, options = {}) {
    this.tokenizer = tokenizer;
    this.syncBuffer = new Uint8Array(syncBufferSize);
    this.scannedBytes = 0;
    this.descriptorScannedBytes = 0;
    this.limits = {
      maxEntryCount: options.maxEntryCount ?? Number.POSITIVE_INFINITY,
      maxTotalScanBytes: options.maxTotalScanBytes ?? Number.POSITIVE_INFINITY,
      maxTotalDataDescriptorScanBytes: options.maxTotalDataDescriptorScanBytes ?? Number.POSITIVE_INFINITY,
      maxSkippedEntrySize: options.maxSkippedEntrySize ?? Number.POSITIVE_INFINITY,
      maxDataDescriptorScanBytes: options.maxDataDescriptorScanBytes ?? Number.POSITIVE_INFINITY,
      maxCompressedSize: options.maxCompressedSize ?? Number.POSITIVE_INFINITY,
      maxUncompressedSize: options.maxUncompressedSize ?? Number.POSITIVE_INFINITY
    };
    this.useCentralDirectory = options.useCentralDirectory ?? true;
    this.allowTruncatedDataDescriptor = options.allowTruncatedDataDescriptor ?? false;
    if (typeof this.useCentralDirectory !== "boolean") {
      throw new TypeError("useCentralDirectory must be a boolean");
    }
    if (typeof this.allowTruncatedDataDescriptor !== "boolean") {
      throw new TypeError("allowTruncatedDataDescriptor must be a boolean");
    }
    for (const [name, limit] of Object.entries(this.limits)) {
      if (limit !== Number.POSITIVE_INFINITY && (!Number.isSafeInteger(limit) || limit <= 0)) {
        throw new RangeError(`${name} must be a positive safe integer or Infinity`);
      }
    }
  }
  /** Reject oversized entries before retaining data or allocating a combined buffer. */
  checkLimit(limit, size) {
    if (size > this.limits[limit]) {
      throw new ZipLimitError(limit, size, this.limits[limit]);
    }
  }
  resetTraversal() {
    this.scannedBytes = 0;
    this.descriptorScannedBytes = 0;
  }
  consumeBytes(length) {
    this.checkLimit("maxTotalScanBytes", this.scannedBytes + length);
    this.scannedBytes += length;
  }
  readToken(token, input = this.tokenizer) {
    this.consumeBytes(token.len);
    return input.readToken(token);
  }
  ignore(length, input = this.tokenizer) {
    this.consumeBytes(length);
    return input.ignore(length);
  }
  readData(length) {
    this.consumeBytes(length);
    const data = new Uint8Array(length);
    return this.tokenizer.readBuffer(data).then(() => data);
  }
  checkEntrySize(header) {
    this.checkLimit("maxCompressedSize", header.compressedSize);
    this.checkLimit("maxUncompressedSize", header.uncompressedSize);
    if (header.compressedMethod === 0) {
      this.checkLimit("maxUncompressedSize", header.compressedSize);
    }
  }
  async isZip() {
    return await this.peekSignature() === Signature.LocalFileHeader;
  }
  peekSignature() {
    return this.tokenizer.peekToken(UINT32_LE);
  }
  async findEndOfCentralDirectoryLocator() {
    const randomReadTokenizer = this.tokenizer;
    const chunkLength = Math.min(16 * 1024, randomReadTokenizer.fileInfo.size);
    const buffer = this.syncBuffer.subarray(0, chunkLength);
    this.consumeBytes(chunkLength);
    await this.tokenizer.readBuffer(buffer, { position: randomReadTokenizer.fileInfo.size - chunkLength });
    for (let i = buffer.length - 4; i >= 0; i--) {
      if (buffer[i] === eocdSignatureBytes[0] && buffer[i + 1] === eocdSignatureBytes[1] && buffer[i + 2] === eocdSignatureBytes[2] && buffer[i + 3] === eocdSignatureBytes[3]) {
        return randomReadTokenizer.fileInfo.size - chunkLength + i;
      }
    }
    return -1;
  }
  async readCentralDirectory() {
    this.resetTraversal();
    const entries = await this.centralDirectoryEntries();
    if (!entries) {
      return;
    }
    const files = [];
    for await (const entry of entries) {
      files.push(entry);
    }
    return files;
  }
  async centralDirectoryEntries() {
    if (!this.tokenizer.supportsRandomAccess()) {
      debug("Cannot reading central-directory without random-read support");
      return;
    }
    debug("Reading central-directory...");
    const pos = this.tokenizer.position;
    try {
      const offset = await this.findEndOfCentralDirectoryLocator();
      if (offset > 0) {
        debug("Central-directory 32-bit signature found");
        this.tokenizer.setPosition(offset);
        const eocdHeader = await this.readToken(EndOfCentralDirectoryRecordToken);
        return this.iterateDirectory(eocdHeader.offsetOfStartOfCd, eocdHeader.sizeOfCd, eocdHeader.nrOfEntriesOfSize);
      }
    } finally {
      this.tokenizer.setPosition(pos);
    }
  }
  async *iterateDirectory(offset, size, count) {
    const source = this.tokenizer;
    const pos = source.position;
    let directory;
    let position = 0;
    try {
      source.setPosition(offset);
      directory = createTokenizerView(source, size);
      for (let n = 0; n < count; ++n) {
        this.checkLimit("maxEntryCount", n + 1);
        directory.setPosition(position);
        const entry = await this.readToken(FileHeader, directory);
        if (entry.signature !== Signature.CentralFileHeader) {
          throw new Error("Expected Central-File-Header signature");
        }
        entry.filename = await this.readToken(new StringType(entry.filenameLength, "utf-8"), directory);
        await this.ignore(entry.extraFieldLength, directory);
        await this.ignore(entry.fileCommentLength, directory);
        position = directory.position;
        yield entry;
      }
    } finally {
      try {
        await (directory == null ? void 0 : directory.close());
      } finally {
        source.setPosition(pos);
      }
    }
  }
  async unzip(fileCb) {
    this.resetTraversal();
    const entries = this.useCentralDirectory ? await this.centralDirectoryEntries() : void 0;
    if (entries) {
      return this.iterateOverCentralDirectory(entries, fileCb);
    }
    let stop = false;
    let entryCount = 0;
    do {
      const zipHeader = await this.readLocalFileHeader();
      if (!zipHeader) {
        break;
      }
      this.checkLimit("maxEntryCount", ++entryCount);
      const next = fileCb(zipHeader);
      stop = !!next.stop;
      let fileData;
      await this.ignore(zipHeader.extraFieldLength);
      if (next.handler) {
        this.checkEntrySize(zipHeader);
      } else {
        this.checkLimit("maxSkippedEntrySize", zipHeader.compressedSize);
      }
      if (zipHeader.dataDescriptor && zipHeader.compressedSize === 0) {
        const chunks = [];
        let totalSize = 0;
        const scanLimit = Math.min(this.limits.maxDataDescriptorScanBytes, this.limits.maxTotalDataDescriptorScanBytes - this.descriptorScannedBytes, this.limits.maxTotalScanBytes - this.scannedBytes, next.handler ? Number.POSITIVE_INFINITY : this.limits.maxSkippedEntrySize, next.handler ? this.limits.maxCompressedSize : Number.POSITIVE_INFINITY, next.handler && zipHeader.compressedMethod === 0 ? this.limits.maxUncompressedSize : Number.POSITIVE_INFINITY);
        debug("Compressed-file-size unknown, scanning for next data-descriptor-signature....");
        while (true) {
          const peekLength = Math.min(syncBufferSize, scanLimit - totalSize + DataDescriptor.len);
          const len = await this.tokenizer.peekBuffer(this.syncBuffer.subarray(0, peekLength), { mayBeLess: true });
          const allowTruncated = this.allowTruncatedDataDescriptor && len < peekLength;
          const nextHeaderIndex = findDescriptor(this.syncBuffer.subarray(0, len), totalSize, allowTruncated);
          if (nextHeaderIndex < 0 && len < DataDescriptor.len && !allowTruncated) {
            throw new Error("Expected data-descriptor-signature before end of input");
          }
          const size = nextHeaderIndex >= 0 ? nextHeaderIndex : allowTruncated ? len : len - DataDescriptor.len + 1;
          if (size === 0) {
            break;
          }
          this.checkLimit("maxDataDescriptorScanBytes", totalSize + size);
          this.checkLimit("maxTotalDataDescriptorScanBytes", this.descriptorScannedBytes + size);
          if (!next.handler) {
            this.checkLimit("maxSkippedEntrySize", totalSize + size);
          }
          if (next.handler) {
            this.checkLimit("maxCompressedSize", totalSize + size);
            if (zipHeader.compressedMethod === 0) {
              this.checkLimit("maxUncompressedSize", totalSize + size);
            }
            if (size > 0) {
              const data = await this.readData(size);
              chunks.push(data);
            }
          } else {
            await this.ignore(size);
          }
          totalSize += size;
          this.descriptorScannedBytes += size;
          if (nextHeaderIndex >= 0) {
            break;
          }
        }
        debug(`Found data-descriptor-signature at pos=${this.tokenizer.position}`);
        if (next.handler) {
          this.checkLimit("maxCompressedSize", totalSize);
          await this.inflate(zipHeader, mergeArrays(chunks), next.handler);
        }
      } else {
        if (next.handler) {
          debug(`Reading compressed-file-data: ${zipHeader.compressedSize} bytes`);
          fileData = await this.readData(zipHeader.compressedSize);
          await this.inflate(zipHeader, fileData, next.handler);
        } else {
          debug(`Ignoring compressed-file-data: ${zipHeader.compressedSize} bytes`);
          await this.ignore(zipHeader.compressedSize);
        }
      }
      debug(`Reading data-descriptor at pos=${this.tokenizer.position}`);
      if (zipHeader.dataDescriptor) {
        const dataDescriptor = await this.readToken(DataDescriptor);
        if (dataDescriptor.signature !== 134695760) {
          throw new Error(`Expected data-descriptor-signature at position ${this.tokenizer.position - DataDescriptor.len}`);
        }
      }
    } while (!stop);
  }
  async iterateOverCentralDirectory(entries, fileCb) {
    for await (const fileHeader of entries) {
      const next = fileCb(fileHeader);
      if (next.handler) {
        this.tokenizer.setPosition(fileHeader.relativeOffsetOfLocalHeader);
        const zipHeader = await this.readLocalFileHeader();
        if (zipHeader) {
          await this.ignore(zipHeader.extraFieldLength);
          this.checkEntrySize(fileHeader);
          this.checkEntrySize(zipHeader);
          const fileData = await this.readData(fileHeader.compressedSize);
          await this.inflate(zipHeader, fileData, next.handler);
        }
      }
      if (next.stop) {
        break;
      }
    }
  }
  async inflate(zipHeader, fileData, cb) {
    if (zipHeader.compressedMethod === 0) {
      this.checkLimit("maxUncompressedSize", fileData.length);
      return cb(fileData);
    }
    if (zipHeader.compressedMethod !== 8) {
      throw new Error(`Unsupported ZIP compression method: ${zipHeader.compressedMethod}`);
    }
    debug(`Decompress filename=${zipHeader.filename}, compressed-size=${fileData.length}`);
    const uncompressedData = await this.decompressDeflateRaw(fileData);
    return cb(uncompressedData);
  }
  async decompressDeflateRaw(data) {
    const input = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      }
    });
    const ds = new DecompressionStream("deflate-raw");
    const output = input.pipeThrough(ds);
    const reader = output.getReader();
    const chunks = [];
    let totalSize = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        this.checkLimit("maxUncompressedSize", totalSize + value.length);
        totalSize += value.length;
        chunks.push(value);
      }
      this.checkLimit("maxUncompressedSize", totalSize);
      return mergeArrays(chunks);
    } catch (err) {
      await reader.cancel(err).catch(() => {
      });
      if (err instanceof ZipLimitError) {
        throw err;
      }
      if (err instanceof Error && "code" in err && err.code === "ERR_TRAILING_JUNK_AFTER_STREAM_END") {
        return mergeArrays(chunks);
      }
      const message = err instanceof Error ? `Failed to deflate ZIP entry: ${err.message}` : "Unknown decompression error in ZIP entry";
      throw new TypeError(message);
    } finally {
      reader.releaseLock();
    }
  }
  async readLocalFileHeader() {
    const signature = await this.tokenizer.peekToken(UINT32_LE);
    if (signature === Signature.LocalFileHeader) {
      const header = await this.readToken(LocalFileHeaderToken);
      header.filename = await this.readToken(new StringType(header.filenameLength, "utf-8"));
      return header;
    }
    if (signature === Signature.CentralFileHeader) {
      return false;
    }
    if (signature === 3759263696) {
      throw new Error("Encrypted ZIP");
    }
    throw new Error("Unexpected signature");
  }
};
function findDescriptor(buffer, consumed, allowTruncated) {
  for (let i = 0; i <= buffer.length - (allowTruncated ? 4 : DataDescriptor.len); i++) {
    if (UINT32_LE.get(buffer, i) === Signature.DataDescriptor && (buffer.length - i < 12 || UINT32_LE.get(buffer, i + 8) === consumed + i)) {
      return i;
    }
  }
  return -1;
}
function mergeArrays(chunks) {
  const totalLength = chunks.reduce((acc, curr) => acc + curr.length, 0);
  const mergedArray = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    mergedArray.set(chunk, offset);
    offset += chunk.length;
  }
  return mergedArray;
}

// ../../node_modules/file-type/source/tokens.js
function stringToBytes(string, encoding) {
  if (encoding === "utf-16le") {
    const bytes = [];
    for (let index = 0; index < string.length; index++) {
      const code = string.charCodeAt(index);
      bytes.push(code & 255, code >> 8 & 255);
    }
    return bytes;
  }
  if (encoding === "utf-16be") {
    const bytes = [];
    for (let index = 0; index < string.length; index++) {
      const code = string.charCodeAt(index);
      bytes.push(code >> 8 & 255, code & 255);
    }
    return bytes;
  }
  return [...string].map((character) => character.charCodeAt(0));
}
function tarHeaderChecksumMatches(arrayBuffer, offset = 0) {
  const readSum = Number.parseInt(new StringType(6).get(arrayBuffer, 148), 8);
  if (Number.isNaN(readSum)) {
    return false;
  }
  let sum = 8 * 32;
  for (let index = offset; index < offset + 148; index++) {
    sum += arrayBuffer[index];
  }
  for (let index = offset + 156; index < offset + 512; index++) {
    sum += arrayBuffer[index];
  }
  return readSum === sum;
}
var uint32SyncSafeToken = {
  get: (buffer, offset) => buffer[offset + 3] & 127 | (buffer[offset + 2] & 127) << 7 | (buffer[offset + 1] & 127) << 14 | (buffer[offset] & 127) << 21,
  len: 4
};

// ../../node_modules/file-type/source/supported.js
var extensions = [
  "jpg",
  "png",
  "apng",
  "gif",
  "webp",
  "flif",
  "xcf",
  "cr2",
  "cr3",
  "orf",
  "arw",
  "dng",
  "nef",
  "rw2",
  "raf",
  "tif",
  "bmp",
  "icns",
  "jxr",
  "psd",
  "indd",
  "zip",
  "tar",
  "rar",
  "gz",
  "bz2",
  "7z",
  "dmg",
  "mp4",
  "mid",
  "mkv",
  "webm",
  "mov",
  "avi",
  "mpg",
  "mp2",
  "mp3",
  "m4a",
  "oga",
  "ogg",
  "ogv",
  "opus",
  "flac",
  "wav",
  "spx",
  "amr",
  "pdf",
  "epub",
  "elf",
  "macho",
  "exe",
  "swf",
  "rtf",
  "wasm",
  "woff",
  "woff2",
  "eot",
  "ttf",
  "otf",
  "ttc",
  "ico",
  "flv",
  "ps",
  "xz",
  "sqlite",
  "nes",
  "crx",
  "xpi",
  "cab",
  "deb",
  "ar",
  "rpm",
  "Z",
  "lz",
  "cfb",
  "mxf",
  "mts",
  "blend",
  "bpg",
  "docx",
  "pptx",
  "xlsx",
  "3gp",
  "3g2",
  "j2c",
  "jp2",
  "jpm",
  "jpx",
  "mj2",
  "aif",
  "caf",
  "qcp",
  "odt",
  "ods",
  "odp",
  "xml",
  "mobi",
  "heic",
  "cur",
  "ktx",
  "ape",
  "wv",
  "dcm",
  "ics",
  "glb",
  "pcap",
  "dsf",
  "dff",
  "lnk",
  "alias",
  "voc",
  "ac3",
  "m4v",
  "m4p",
  "m4b",
  "f4v",
  "f4p",
  "f4b",
  "f4a",
  "mie",
  "asf",
  "ogm",
  "ogx",
  "mpc",
  "arrow",
  "shp",
  "aac",
  "mp1",
  "it",
  "s3m",
  "xm",
  "skp",
  "avif",
  "eps",
  "lzh",
  "pgp",
  "asar",
  "stl",
  "chm",
  "3mf",
  "zst",
  "jxl",
  "vcf",
  "jls",
  "pst",
  "dwg",
  "parquet",
  "class",
  "arj",
  "cpio",
  "ace",
  "avro",
  "icc",
  "fbx",
  "vsdx",
  "vtt",
  "apk",
  "drc",
  "lz4",
  "potx",
  "xltx",
  "dotx",
  "xltm",
  "ott",
  "ots",
  "otp",
  "odg",
  "otg",
  "xlsm",
  "docm",
  "dotm",
  "potm",
  "pptm",
  "jar",
  "jmp",
  "rm",
  "sav",
  "ppsm",
  "ppsx",
  "tar.gz",
  "reg",
  "dat",
  "key",
  "numbers",
  "pages",
  "iso"
];
var mimeTypes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/flif",
  "image/x-xcf",
  "image/x-canon-cr2",
  "image/x-canon-cr3",
  "image/tiff",
  "image/bmp",
  "image/vnd.ms-photo",
  "image/vnd.adobe.photoshop",
  "application/x-indesign",
  "application/epub+zip",
  "application/x-xpinstall",
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  "application/zip",
  "application/x-tar",
  "application/x-rar-compressed",
  "application/gzip",
  "application/x-bzip2",
  "application/x-7z-compressed",
  "application/x-apple-diskimage",
  "application/vnd.apache.arrow.file",
  "video/mp4",
  "audio/midi",
  "video/matroska",
  "video/webm",
  "video/quicktime",
  "video/vnd.avi",
  "audio/wav",
  "audio/qcelp",
  "audio/x-ms-asf",
  "video/x-ms-asf",
  "application/vnd.ms-asf",
  "video/mpeg",
  "video/3gpp",
  "audio/mpeg",
  "audio/mp4",
  // RFC 4337
  "video/ogg",
  "audio/ogg",
  "audio/ogg; codecs=opus",
  "application/ogg",
  "audio/flac",
  "audio/ape",
  "audio/wavpack",
  "audio/amr",
  "application/pdf",
  "application/x-elf",
  "application/x-mach-binary",
  "application/x-msdownload",
  "application/x-shockwave-flash",
  "application/rtf",
  "application/wasm",
  "font/woff",
  "font/woff2",
  "application/vnd.ms-fontobject",
  "font/ttf",
  "font/otf",
  "font/collection",
  "image/x-icon",
  "video/x-flv",
  "application/postscript",
  "application/eps",
  "application/x-xz",
  "application/x-sqlite3",
  "application/x-nintendo-nes-rom",
  "application/x-google-chrome-extension",
  "application/vnd.ms-cab-compressed",
  "application/x-deb",
  "application/x-unix-archive",
  "application/x-rpm",
  "application/x-compress",
  "application/lzip",
  "application/x-cfb",
  "application/x-mie",
  "application/mxf",
  "video/mp2t",
  "application/x-blender",
  "image/bpg",
  "image/j2c",
  "image/jp2",
  "image/jpx",
  "image/jpm",
  "image/mj2",
  "audio/aiff",
  "audio/x-caf",
  // Non-standard
  "application/xml",
  "application/x-mobipocket-ebook",
  "image/heif",
  "image/heif-sequence",
  "image/heic",
  "image/heic-sequence",
  "image/icns",
  "image/ktx",
  "application/dicom",
  "audio/x-musepack",
  "text/calendar",
  "text/vcard",
  "text/vtt",
  "model/gltf-binary",
  "application/vnd.tcpdump.pcap",
  "audio/x-dsf",
  // Non-standard
  "audio/x-dff",
  // Non-standard
  "application/x-ms-shortcut",
  // Informal, used by freedesktop.org shared-mime-info
  "application/x-ft-apple.alias",
  "audio/x-voc",
  "audio/vnd.dolby.dd-raw",
  "audio/x-m4a",
  "image/apng",
  "image/x-olympus-orf",
  "image/x-sony-arw",
  "image/x-adobe-dng",
  "image/x-nikon-nef",
  "image/x-panasonic-rw2",
  "image/x-fujifilm-raf",
  "video/x-m4v",
  "video/3gpp2",
  "application/x-esri-shape",
  "audio/aac",
  "audio/x-it",
  "audio/x-s3m",
  "audio/x-xm",
  "video/MP1S",
  "video/MP2P",
  "application/vnd.sketchup.skp",
  "image/avif",
  "application/x-lzh-compressed",
  "application/pgp-encrypted",
  "application/x-asar",
  "model/stl",
  "application/vnd.ms-htmlhelp",
  "model/3mf",
  "image/jxl",
  "application/zstd",
  "image/jls",
  "application/vnd.ms-outlook",
  "image/vnd.dwg",
  "application/vnd.apache.parquet",
  "application/java-vm",
  "application/x-arj",
  "application/x-cpio",
  "application/x-ace-compressed",
  "application/avro",
  "application/vnd.iccprofile",
  "application/x-ft-fbx",
  "application/vnd.visio",
  "application/vnd.android.package-archive",
  "application/x-ft-draco",
  "application/x-lz4",
  // Informal, used by freedesktop.org shared-mime-info
  "application/vnd.openxmlformats-officedocument.presentationml.template",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  "application/vnd.ms-excel.template.macroenabled.12",
  "application/vnd.oasis.opendocument.text-template",
  "application/vnd.oasis.opendocument.spreadsheet-template",
  "application/vnd.oasis.opendocument.presentation-template",
  "application/vnd.oasis.opendocument.graphics",
  "application/vnd.oasis.opendocument.graphics-template",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-word.document.macroenabled.12",
  "application/vnd.ms-word.template.macroenabled.12",
  "application/vnd.ms-powerpoint.template.macroenabled.12",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/java-archive",
  "application/vnd.rn-realmedia",
  "application/x-spss-sav",
  "application/x-ms-regedit",
  "application/x-ft-windows-registry-hive",
  "application/x-jmp-data",
  "application/vnd.apple.keynote",
  "application/vnd.apple.numbers",
  "application/vnd.apple.pages",
  "application/x-iso9660-image"
];

// ../../node_modules/file-type/source/parser.js
var maximumUntrustedSkipSizeInBytes = 16 * 1024 * 1024;
var ParserHardLimitError = class extends Error {
};
function getSafeBound(value, maximum, reason) {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new ParserHardLimitError(`${reason} has invalid size ${value} (maximum ${maximum} bytes)`);
  }
  return value;
}
async function safeIgnore(tokenizer, length, { maximumLength = maximumUntrustedSkipSizeInBytes, reason = "skip" } = {}) {
  const safeLength = getSafeBound(length, maximumLength, reason);
  await tokenizer.ignore(safeLength);
}
async function safeReadBuffer(tokenizer, buffer, options, { maximumLength = buffer.length, reason = "read" } = {}) {
  const length = (options == null ? void 0 : options.length) ?? buffer.length;
  const safeLength = getSafeBound(length, maximumLength, reason);
  return tokenizer.readBuffer(buffer, {
    ...options,
    length: safeLength
  });
}
function checkBytes(buffer, headers, options) {
  options = {
    offset: 0,
    ...options
  };
  for (const [index, header] of headers.entries()) {
    if (options.mask) {
      if (header !== (options.mask[index] & buffer[index + options.offset])) {
        return false;
      }
    } else if (header !== buffer[index + options.offset]) {
      return false;
    }
  }
  return true;
}
function hasUnknownFileSize(tokenizer) {
  const fileSize = tokenizer.fileInfo.size;
  return !Number.isFinite(fileSize) || fileSize === Number.MAX_SAFE_INTEGER;
}
function hasExceededUnknownSizeScanBudget(tokenizer, startOffset, maximumBytes) {
  return hasUnknownFileSize(tokenizer) && tokenizer.position - startOffset > maximumBytes;
}

// ../../node_modules/file-type/source/detectors/zip.js
var maximumZipEntrySizeInBytes = 1024 * 1024;
var maximumZipEntryCount = 1024;
var maximumZipTextEntrySizeInBytes = maximumZipEntrySizeInBytes;
var recoverableZipErrorMessages = /* @__PURE__ */ new Set([
  "Unexpected signature",
  "Encrypted ZIP",
  "Expected Central-File-Header signature"
]);
var recoverableZipErrorMessagePrefixes = [
  "Unsupported ZIP compression method:",
  "Expected data-descriptor-signature at position "
];
var recoverableZipErrorCodes = /* @__PURE__ */ new Set([
  "Z_BUF_ERROR",
  "Z_DATA_ERROR",
  "ERR_INVALID_STATE"
]);
function isRecoverableZipError(error) {
  if (error instanceof EndOfStreamError) {
    return true;
  }
  if (error instanceof ParserHardLimitError || error instanceof ZipLimitError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  if (error instanceof TypeError && error.message.startsWith("Failed to deflate ZIP entry:")) {
    return true;
  }
  if (recoverableZipErrorMessages.has(error.message)) {
    return true;
  }
  if (recoverableZipErrorCodes.has(error.code)) {
    return true;
  }
  for (const prefix of recoverableZipErrorMessagePrefixes) {
    if (error.message.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}
function isZipScanLimitError(error) {
  return error instanceof ZipLimitError && [
    "maxTotalScanBytes",
    "maxTotalDataDescriptorScanBytes",
    "maxDataDescriptorScanBytes",
    "maxSkippedEntrySize"
  ].includes(error.limit);
}
function canReadZipEntryForDetection(zipHeader, maximumSize = maximumZipEntrySizeInBytes) {
  const sizes = [zipHeader.compressedSize, zipHeader.uncompressedSize];
  for (const size of sizes) {
    if (!Number.isFinite(size) || size < 0 || size > maximumSize) {
      return false;
    }
  }
  return true;
}
function createIWorkZipDetectionState() {
  return {
    hasDocumentEntry: false,
    hasMasterSlideEntry: false,
    hasTablesEntry: false,
    hasCalculationEngineEntry: false
  };
}
function updateIWorkZipDetectionStateFromFilename(iWorkState, filename) {
  if (filename === "Index/Document.iwa") {
    iWorkState.hasDocumentEntry = true;
  }
  if (filename.startsWith("Index/MasterSlide")) {
    iWorkState.hasMasterSlideEntry = true;
  }
  if (filename.startsWith("Index/Tables/")) {
    iWorkState.hasTablesEntry = true;
  }
  if (filename === "Index/CalculationEngine.iwa") {
    iWorkState.hasCalculationEngineEntry = true;
  }
}
function getIWorkFileTypeFromZipEntries(iWorkState) {
  if (!iWorkState.hasDocumentEntry) {
    return;
  }
  if (iWorkState.hasMasterSlideEntry) {
    return { ext: "key", mime: "application/vnd.apple.keynote" };
  }
  if (iWorkState.hasTablesEntry) {
    return { ext: "numbers", mime: "application/vnd.apple.numbers" };
  }
  return { ext: "pages", mime: "application/vnd.apple.pages" };
}
function getFileTypeFromMimeType(mimeType) {
  mimeType = mimeType.toLowerCase();
  switch (mimeType) {
    case "application/epub+zip":
      return { ext: "epub", mime: mimeType };
    case "application/vnd.oasis.opendocument.text":
      return { ext: "odt", mime: mimeType };
    case "application/vnd.oasis.opendocument.text-template":
      return { ext: "ott", mime: mimeType };
    case "application/vnd.oasis.opendocument.spreadsheet":
      return { ext: "ods", mime: mimeType };
    case "application/vnd.oasis.opendocument.spreadsheet-template":
      return { ext: "ots", mime: mimeType };
    case "application/vnd.oasis.opendocument.presentation":
      return { ext: "odp", mime: mimeType };
    case "application/vnd.oasis.opendocument.presentation-template":
      return { ext: "otp", mime: mimeType };
    case "application/vnd.oasis.opendocument.graphics":
      return { ext: "odg", mime: mimeType };
    case "application/vnd.oasis.opendocument.graphics-template":
      return { ext: "otg", mime: mimeType };
    case "application/vnd.openxmlformats-officedocument.presentationml.slideshow":
      return { ext: "ppsx", mime: mimeType };
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return { ext: "xlsx", mime: mimeType };
    case "application/vnd.ms-excel.sheet.macroenabled":
      return { ext: "xlsm", mime: "application/vnd.ms-excel.sheet.macroenabled.12" };
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.template":
      return { ext: "xltx", mime: mimeType };
    case "application/vnd.ms-excel.template.macroenabled":
      return { ext: "xltm", mime: "application/vnd.ms-excel.template.macroenabled.12" };
    case "application/vnd.ms-powerpoint.slideshow.macroenabled":
      return { ext: "ppsm", mime: "application/vnd.ms-powerpoint.slideshow.macroenabled.12" };
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return { ext: "docx", mime: mimeType };
    case "application/vnd.ms-word.document.macroenabled":
      return { ext: "docm", mime: "application/vnd.ms-word.document.macroenabled.12" };
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.template":
      return { ext: "dotx", mime: mimeType };
    case "application/vnd.ms-word.template.macroenabledtemplate":
      return { ext: "dotm", mime: "application/vnd.ms-word.template.macroenabled.12" };
    case "application/vnd.openxmlformats-officedocument.presentationml.template":
      return { ext: "potx", mime: mimeType };
    case "application/vnd.ms-powerpoint.template.macroenabled":
      return { ext: "potm", mime: "application/vnd.ms-powerpoint.template.macroenabled.12" };
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return { ext: "pptx", mime: mimeType };
    case "application/vnd.ms-powerpoint.presentation.macroenabled":
      return { ext: "pptm", mime: "application/vnd.ms-powerpoint.presentation.macroenabled.12" };
    case "application/vnd.ms-visio.drawing":
      return { ext: "vsdx", mime: "application/vnd.visio" };
    case "application/vnd.ms-package.3dmanufacturing-3dmodel+xml":
      return { ext: "3mf", mime: "model/3mf" };
    default:
  }
}
function createOpenXmlZipDetectionState() {
  return {
    hasContentTypesEntry: false,
    hasParsedContentTypesEntry: false,
    isParsingContentTypes: false,
    hasUnparseableContentTypes: false,
    hasWordDirectory: false,
    hasPresentationDirectory: false,
    hasSpreadsheetDirectory: false,
    hasThreeDimensionalModelEntry: false
  };
}
function updateOpenXmlZipDetectionStateFromFilename(openXmlState, filename) {
  if (filename.startsWith("word/")) {
    openXmlState.hasWordDirectory = true;
  }
  if (filename.startsWith("ppt/")) {
    openXmlState.hasPresentationDirectory = true;
  }
  if (filename.startsWith("xl/")) {
    openXmlState.hasSpreadsheetDirectory = true;
  }
  if (filename.startsWith("3D/") && filename.endsWith(".model")) {
    openXmlState.hasThreeDimensionalModelEntry = true;
  }
}
function getOpenXmlFileTypeFromDirectoryNames(openXmlState) {
  if (openXmlState.hasWordDirectory) {
    return {
      ext: "docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    };
  }
  if (openXmlState.hasPresentationDirectory) {
    return {
      ext: "pptx",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    };
  }
  if (openXmlState.hasSpreadsheetDirectory) {
    return {
      ext: "xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    };
  }
  if (openXmlState.hasThreeDimensionalModelEntry) {
    return {
      ext: "3mf",
      mime: "model/3mf"
    };
  }
}
function getOpenXmlFileTypeFromZipEntries(openXmlState) {
  if (!openXmlState.hasContentTypesEntry || openXmlState.hasUnparseableContentTypes || openXmlState.isParsingContentTypes || openXmlState.hasParsedContentTypesEntry) {
    return;
  }
  return getOpenXmlFileTypeFromDirectoryNames(openXmlState);
}
function getOpenXmlMimeTypeFromContentTypesXml(xmlContent) {
  const endPosition = xmlContent.indexOf('.main+xml"');
  if (endPosition === -1) {
    const mimeType = "application/vnd.ms-package.3dmanufacturing-3dmodel+xml";
    if (xmlContent.includes(`ContentType="${mimeType}"`)) {
      return mimeType;
    }
    return;
  }
  const truncatedContent = xmlContent.slice(0, endPosition);
  const firstQuotePosition = truncatedContent.lastIndexOf('"');
  return truncatedContent.slice(firstQuotePosition + 1);
}
async function detectZip(tokenizer) {
  let fileType;
  const openXmlState = createOpenXmlZipDetectionState();
  const iWorkState = createIWorkZipDetectionState();
  try {
    await new ZipHandler(tokenizer, {
      // Keep local-header order and partial-archive detection consistent across input types.
      useCentralDirectory: false,
      allowTruncatedDataDescriptor: true,
      maxEntryCount: maximumZipEntryCount,
      // Unknown-size input is bounded before each read, including entry metadata.
      maxTotalScanBytes: hasUnknownFileSize(tokenizer) ? maximumUntrustedSkipSizeInBytes : Infinity,
      maxTotalDataDescriptorScanBytes: hasUnknownFileSize(tokenizer) ? Infinity : maximumZipEntrySizeInBytes,
      maxSkippedEntrySize: hasUnknownFileSize(tokenizer) ? maximumZipEntrySizeInBytes : Infinity,
      maxDataDescriptorScanBytes: maximumZipEntrySizeInBytes,
      maxCompressedSize: maximumZipTextEntrySizeInBytes,
      maxUncompressedSize: maximumZipTextEntrySizeInBytes
    }).unzip((zipHeader) => {
      updateOpenXmlZipDetectionStateFromFilename(openXmlState, zipHeader.filename);
      updateIWorkZipDetectionStateFromFilename(iWorkState, zipHeader.filename);
      if (iWorkState.hasDocumentEntry && (iWorkState.hasMasterSlideEntry || iWorkState.hasTablesEntry)) {
        fileType = getIWorkFileTypeFromZipEntries(iWorkState);
        return { stop: true };
      }
      const isOpenXmlContentTypesEntry = zipHeader.filename === "[Content_Types].xml";
      const openXmlFileTypeFromEntries = getOpenXmlFileTypeFromZipEntries(openXmlState);
      if (!isOpenXmlContentTypesEntry && openXmlFileTypeFromEntries) {
        fileType = openXmlFileTypeFromEntries;
        return {
          stop: true
        };
      }
      switch (zipHeader.filename) {
        case "META-INF/mozilla.rsa":
          fileType = {
            ext: "xpi",
            mime: "application/x-xpinstall"
          };
          return {
            stop: true
          };
        case "META-INF/MANIFEST.MF":
          fileType = {
            ext: "jar",
            mime: "application/java-archive"
          };
          return {
            stop: true
          };
        case "mimetype":
          if (!canReadZipEntryForDetection(zipHeader, maximumZipTextEntrySizeInBytes)) {
            return {};
          }
          return {
            async handler(fileData) {
              const mimeType = new TextDecoder("utf-8").decode(fileData).trim();
              fileType = getFileTypeFromMimeType(mimeType);
            },
            stop: true
          };
        case "[Content_Types].xml": {
          openXmlState.hasContentTypesEntry = true;
          if (!canReadZipEntryForDetection(zipHeader, maximumZipTextEntrySizeInBytes)) {
            openXmlState.hasUnparseableContentTypes = true;
            return {};
          }
          openXmlState.isParsingContentTypes = true;
          return {
            async handler(fileData) {
              const xmlContent = new TextDecoder("utf-8").decode(fileData);
              const mimeType = getOpenXmlMimeTypeFromContentTypesXml(xmlContent);
              if (mimeType) {
                fileType = getFileTypeFromMimeType(mimeType);
              }
              openXmlState.hasParsedContentTypesEntry = true;
              openXmlState.isParsingContentTypes = false;
            },
            stop: true
          };
        }
        default:
          if (new RegExp("classes\\d*\\.dex", "v").test(zipHeader.filename)) {
            fileType = {
              ext: "apk",
              mime: "application/vnd.android.package-archive"
            };
            return { stop: true };
          }
          return {};
      }
    });
  } catch (error) {
    if (!isRecoverableZipError(error)) {
      throw error;
    }
    if (openXmlState.isParsingContentTypes) {
      openXmlState.isParsingContentTypes = false;
      openXmlState.hasUnparseableContentTypes = true;
    }
    if (!fileType && (error instanceof EndOfStreamError || error instanceof ParserHardLimitError || isZipScanLimitError(error)) && !openXmlState.hasContentTypesEntry) {
      fileType = getOpenXmlFileTypeFromDirectoryNames(openXmlState);
    }
  }
  const iWorkFileType = hasUnknownFileSize(tokenizer) && iWorkState.hasDocumentEntry && !iWorkState.hasMasterSlideEntry && !iWorkState.hasTablesEntry && !iWorkState.hasCalculationEngineEntry ? void 0 : getIWorkFileTypeFromZipEntries(iWorkState);
  return fileType ?? getOpenXmlFileTypeFromZipEntries(openXmlState) ?? iWorkFileType ?? {
    ext: "zip",
    mime: "application/zip"
  };
}

// ../../node_modules/file-type/source/detectors/ebml.js
var maximumEbmlDocumentTypeSizeInBytes = 64;
var maximumEbmlElementPayloadSizeInBytes = 1024 * 1024;
var maximumEbmlElementCount = 256;
async function detectEbml(tokenizer) {
  async function readField(input) {
    const msb = await input.peekNumber(UINT8);
    let mask = 128;
    let ic = 0;
    while (mask !== 0 && (msb & mask) === 0) {
      ++ic;
      mask >>= 1;
    }
    const id = new Uint8Array(ic + 1);
    await safeReadBuffer(input, id, void 0, {
      maximumLength: id.length,
      reason: "EBML field"
    });
    return id;
  }
  async function readElement(input) {
    const idField = await readField(input);
    const lengthField = await readField(input);
    lengthField[0] ^= 128 >> lengthField.length - 1;
    const nrLength = Math.min(6, lengthField.length);
    const idView = new DataView(idField.buffer);
    const lengthView = new DataView(lengthField.buffer, lengthField.length - nrLength, nrLength);
    return {
      id: getUintBE(idView),
      len: getUintBE(lengthView)
    };
  }
  const isUnknownFileSize = hasUnknownFileSize(tokenizer);
  async function readChildren(header2) {
    let ebmlElementCount = 0;
    while (header2.remaining > 0) {
      ebmlElementCount++;
      if (ebmlElementCount > maximumEbmlElementCount) {
        return;
      }
      if (hasExceededUnknownSizeScanBudget(tokenizer, ebmlScanStart, maximumUntrustedSkipSizeInBytes)) {
        return;
      }
      const previousPosition = tokenizer.position;
      const element = await readElement(header2);
      if (element.id === 17026) {
        if (element.len > maximumEbmlDocumentTypeSizeInBytes) {
          return;
        }
        const documentTypeLength = getSafeBound(element.len, maximumEbmlDocumentTypeSizeInBytes, "EBML DocType");
        const rawValue = await header2.readToken(new StringType(documentTypeLength));
        return rawValue.split("\0", 1)[0];
      }
      if (isUnknownFileSize && (!Number.isFinite(element.len) || element.len < 0 || element.len > maximumEbmlElementPayloadSizeInBytes)) {
        return;
      }
      await safeIgnore(header2, element.len, {
        maximumLength: isUnknownFileSize ? maximumEbmlElementPayloadSizeInBytes : tokenizer.fileInfo.size,
        reason: "EBML payload"
      });
      if (tokenizer.position <= previousPosition) {
        return;
      }
    }
  }
  const rootElement = await readElement(tokenizer);
  const ebmlScanStart = tokenizer.position;
  const header = createTokenizerView(tokenizer, rootElement.len);
  let documentType;
  try {
    documentType = await readChildren(header);
  } catch (error) {
    if (error instanceof TokenizerBoundaryError) {
      return;
    }
    throw error;
  } finally {
    await header.close();
  }
  switch (documentType) {
    case "webm":
      return {
        ext: "webm",
        mime: "video/webm"
      };
    case "matroska":
      return {
        ext: "mkv",
        mime: "video/matroska"
      };
    default:
  }
}

// ../../node_modules/file-type/source/detectors/png.js
var maximumPngChunkCount = 512;
var maximumPngStreamScanBudgetInBytes = 16 * 1024 * 1024;
var maximumPngChunkSizeInBytes = 1024 * 1024;
function isPngAncillaryChunk(type) {
  return (type.codePointAt(0) & 32) !== 0;
}
async function detectPng(tokenizer) {
  const pngFileType = {
    ext: "png",
    mime: "image/png"
  };
  const apngFileType = {
    ext: "apng",
    mime: "image/apng"
  };
  await tokenizer.ignore(8);
  async function readChunkHeader() {
    return {
      length: await tokenizer.readToken(INT32_BE),
      type: await tokenizer.readToken(new StringType(4, "latin1"))
    };
  }
  const isUnknownPngStream = hasUnknownFileSize(tokenizer);
  const pngScanStart = tokenizer.position;
  let pngChunkCount = 0;
  let hasSeenImageHeader = false;
  do {
    pngChunkCount++;
    if (pngChunkCount > maximumPngChunkCount) {
      break;
    }
    if (hasExceededUnknownSizeScanBudget(tokenizer, pngScanStart, maximumPngStreamScanBudgetInBytes)) {
      break;
    }
    const previousPosition = tokenizer.position;
    const chunk = await readChunkHeader();
    if (chunk.length < 0) {
      return;
    }
    if (chunk.type === "IHDR") {
      if (chunk.length !== 13) {
        return;
      }
      hasSeenImageHeader = true;
    }
    switch (chunk.type) {
      case "IDAT":
        return pngFileType;
      case "acTL":
        return apngFileType;
      default:
        if (!hasSeenImageHeader && chunk.type !== "CgBI") {
          return;
        }
        if (isUnknownPngStream && chunk.length > maximumPngChunkSizeInBytes) {
          return hasSeenImageHeader && isPngAncillaryChunk(chunk.type) ? pngFileType : void 0;
        }
        try {
          await safeIgnore(tokenizer, chunk.length + 4, {
            maximumLength: isUnknownPngStream ? maximumPngChunkSizeInBytes + 4 : tokenizer.fileInfo.size,
            reason: "PNG chunk payload"
          });
        } catch (error) {
          if (!isUnknownPngStream && (error instanceof ParserHardLimitError || error instanceof EndOfStreamError)) {
            return pngFileType;
          }
          throw error;
        }
    }
    if (tokenizer.position <= previousPosition) {
      break;
    }
  } while (tokenizer.position + 8 < tokenizer.fileInfo.size);
  return pngFileType;
}

// ../../node_modules/file-type/source/detectors/asf.js
var maximumAsfHeaderObjectCount = 512;
var maximumAsfHeaderPayloadSizeInBytes = 1024 * 1024;
async function detectAsf(tokenizer) {
  let isMalformedAsf = false;
  try {
    async function readHeader() {
      const guid = new Uint8Array(16);
      await safeReadBuffer(tokenizer, guid, void 0, {
        maximumLength: guid.length,
        reason: "ASF header GUID"
      });
      return {
        id: guid,
        size: Number(await tokenizer.readToken(UINT64_LE))
      };
    }
    await safeIgnore(tokenizer, 30, {
      maximumLength: 30,
      reason: "ASF header prelude"
    });
    const isUnknownFileSize = hasUnknownFileSize(tokenizer);
    const asfHeaderScanStart = tokenizer.position;
    let asfHeaderObjectCount = 0;
    while (tokenizer.position + 24 < tokenizer.fileInfo.size) {
      asfHeaderObjectCount++;
      if (asfHeaderObjectCount > maximumAsfHeaderObjectCount) {
        break;
      }
      if (hasExceededUnknownSizeScanBudget(tokenizer, asfHeaderScanStart, maximumUntrustedSkipSizeInBytes)) {
        break;
      }
      const previousPosition = tokenizer.position;
      const header = await readHeader();
      let payload = header.size - 24;
      if (!Number.isFinite(payload) || payload < 0) {
        isMalformedAsf = true;
        break;
      }
      if (checkBytes(header.id, [145, 7, 220, 183, 183, 169, 207, 17, 142, 230, 0, 192, 12, 32, 83, 101])) {
        const typeId = new Uint8Array(16);
        payload -= await safeReadBuffer(tokenizer, typeId, void 0, {
          maximumLength: typeId.length,
          reason: "ASF stream type GUID"
        });
        if (checkBytes(typeId, [64, 158, 105, 248, 77, 91, 207, 17, 168, 253, 0, 128, 95, 92, 68, 43])) {
          return {
            ext: "asf",
            mime: "audio/x-ms-asf"
          };
        }
        if (checkBytes(typeId, [192, 239, 25, 188, 77, 91, 207, 17, 168, 253, 0, 128, 95, 92, 68, 43])) {
          return {
            ext: "asf",
            mime: "video/x-ms-asf"
          };
        }
        break;
      }
      if (isUnknownFileSize && payload > maximumAsfHeaderPayloadSizeInBytes) {
        isMalformedAsf = true;
        break;
      }
      await safeIgnore(tokenizer, payload, {
        maximumLength: isUnknownFileSize ? maximumAsfHeaderPayloadSizeInBytes : tokenizer.fileInfo.size,
        reason: "ASF header payload"
      });
      if (tokenizer.position <= previousPosition) {
        isMalformedAsf = true;
        break;
      }
    }
  } catch (error) {
    if (error instanceof EndOfStreamError || error instanceof ParserHardLimitError) {
      if (hasUnknownFileSize(tokenizer)) {
        isMalformedAsf = true;
      }
    } else {
      throw error;
    }
  }
  if (isMalformedAsf) {
    return;
  }
  return {
    ext: "asf",
    mime: "application/vnd.ms-asf"
  };
}

// ../../node_modules/file-type/source/index.js
var reasonableDetectionSizeInBytes = 4100;
var maximumMpegOffsetTolerance = reasonableDetectionSizeInBytes - 4;
var maximumNestedGzipDetectionSizeInBytes = maximumUntrustedSkipSizeInBytes;
var maximumNestedGzipProbeDepth = 1;
var unknownSizeGzipProbeTimeoutInMilliseconds = 100;
var maximumId3HeaderSizeInBytes = maximumUntrustedSkipSizeInBytes;
var maximumTiffTagCount = 512;
var maximumDetectionReentryCount = 256;
var maximumTiffStreamIfdOffsetInBytes = 1024 * 1024;
var maximumTiffIfdOffsetInBytes = maximumUntrustedSkipSizeInBytes;
function normalizeSampleSize(sampleSize) {
  if (!Number.isFinite(sampleSize)) {
    return reasonableDetectionSizeInBytes;
  }
  return Math.max(1, Math.trunc(sampleSize));
}
function normalizeMpegOffsetTolerance(mpegOffsetTolerance) {
  if (!Number.isFinite(mpegOffsetTolerance)) {
    return 0;
  }
  return Math.max(0, Math.min(maximumMpegOffsetTolerance, Math.trunc(mpegOffsetTolerance)));
}
function getKnownFileSizeOrMaximum(fileSize) {
  if (!Number.isFinite(fileSize)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(0, fileSize);
}
function importAtRuntime(specifier) {
  return import(
    /* @vite-ignore */
    /* webpackIgnore: true */
    specifier
  );
}
function toDefaultStream(stream) {
  return stream.pipeThrough(new TransformStream());
}
function readWithSignal(reader, signal) {
  if (signal === void 0) {
    return reader.read();
  }
  signal.throwIfAborted();
  return Promise.race([
    reader.read(),
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        reject(signal.reason);
        reader.cancel(signal.reason).catch(() => {
        });
      }, { once: true });
    })
  ]);
}
function createByteLimitedReadableStream(stream, maximumBytes) {
  const reader = stream.getReader();
  let emittedBytes = 0;
  let isSourceDone = false;
  let isSourceCanceled = false;
  const cancelSource = async (reason) => {
    if (isSourceDone || isSourceCanceled) {
      return;
    }
    isSourceCanceled = true;
    await reader.cancel(reason);
  };
  return new ReadableStream({
    async pull(controller) {
      if (emittedBytes >= maximumBytes) {
        controller.close();
        await cancelSource();
        return;
      }
      const { done, value } = await reader.read();
      if (done || !value) {
        isSourceDone = true;
        controller.close();
        return;
      }
      const remainingBytes = maximumBytes - emittedBytes;
      if (value.length > remainingBytes) {
        controller.enqueue(value.subarray(0, remainingBytes));
        emittedBytes += remainingBytes;
        controller.close();
        await cancelSource();
        return;
      }
      controller.enqueue(value);
      emittedBytes += value.length;
    },
    async cancel(reason) {
      await cancelSource(reason);
    }
  });
}
async function fileTypeFromBuffer(input, options) {
  return new FileTypeParser(options).fromBuffer(input);
}
async function fileTypeFromTokenizer(tokenizer, options) {
  return new FileTypeParser(options).fromTokenizer(tokenizer);
}
var FileTypeParser = class _FileTypeParser {
  constructor(options) {
    __publicField(this, "buffer");
    __publicField(this, "tokenizer");
    __publicField(this, "detectionReentryCount");
    const normalizedMpegOffsetTolerance = normalizeMpegOffsetTolerance(options == null ? void 0 : options.mpegOffsetTolerance);
    const maxBufferSize = (options == null ? void 0 : options.maxBufferSize) ?? Infinity;
    if (maxBufferSize !== Infinity && (!Number.isSafeInteger(maxBufferSize) || maxBufferSize <= 0)) {
      throw new RangeError("maxBufferSize must be a positive safe integer or Infinity");
    }
    this.options = {
      ...options,
      mpegOffsetTolerance: normalizedMpegOffsetTolerance
    };
    this.detectors = [
      ...this.options.customDetectors ?? [],
      { id: "core", detect: (tokenizer) => this.detectConfident(tokenizer) },
      { id: "core.imprecise", detect: (tokenizer) => this.detectImprecise(tokenizer) }
    ];
    this.tokenizerOptions = {
      abortSignal: this.options.signal,
      maxBufferSize
    };
    this.gzipProbeDepth = 0;
  }
  getTokenizerOptions() {
    return {
      ...this.tokenizerOptions
    };
  }
  createTokenizerFromWebStream(stream) {
    return fromWebStream(toDefaultStream(stream), this.getTokenizerOptions());
  }
  async parseTokenizer(tokenizer, detectionReentryCount = 0) {
    this.detectionReentryCount = detectionReentryCount;
    const initialPosition = tokenizer.position;
    for (const detector of this.detectors) {
      let fileType;
      try {
        fileType = await detector.detect(tokenizer);
      } catch (error) {
        if (error instanceof EndOfStreamError) {
          return;
        }
        if (error instanceof ParserHardLimitError) {
          return;
        }
        throw error;
      }
      if (fileType) {
        return fileType;
      }
      if (initialPosition !== tokenizer.position) {
        return void 0;
      }
    }
  }
  async fromTokenizer(tokenizer) {
    try {
      return await this.parseTokenizer(tokenizer);
    } finally {
      await tokenizer.close();
    }
  }
  async fromBuffer(input) {
    if (!(input instanceof Uint8Array || input instanceof ArrayBuffer)) {
      throw new TypeError(`Expected the \`input\` argument to be of type \`Uint8Array\` or \`ArrayBuffer\`, got \`${typeof input}\``);
    }
    const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!((buffer == null ? void 0 : buffer.length) > 1)) {
      return;
    }
    return this.fromTokenizer(fromBuffer(buffer, this.getTokenizerOptions()));
  }
  async fromBlob(blob) {
    var _a;
    (_a = this.options.signal) == null ? void 0 : _a.throwIfAborted();
    const tokenizer = fromBlob(blob, this.getTokenizerOptions());
    return this.fromTokenizer(tokenizer);
  }
  async fromStream(stream) {
    var _a;
    (_a = this.options.signal) == null ? void 0 : _a.throwIfAborted();
    const tokenizer = this.createTokenizerFromWebStream(stream);
    return this.fromTokenizer(tokenizer);
  }
  async fromFile(path) {
    var _a;
    (_a = this.options.signal) == null ? void 0 : _a.throwIfAborted();
    const { fromFile, NotRegularFileError } = await importAtRuntime("strtok3");
    let tokenizer;
    try {
      tokenizer = await fromFile(path, {
        ...this.getTokenizerOptions(),
        regularFileOnly: true
      });
    } catch (error) {
      if (error instanceof NotRegularFileError) {
        return;
      }
      throw error;
    }
    return this.fromTokenizer(tokenizer);
  }
  async toDetectionStream(stream, options) {
    var _a;
    (_a = this.options.signal) == null ? void 0 : _a.throwIfAborted();
    const sampleSize = normalizeSampleSize((options == null ? void 0 : options.sampleSize) ?? reasonableDetectionSizeInBytes);
    let detectedFileType;
    let hasStreamEnded = false;
    const reader = stream.getReader();
    const chunks = [];
    let totalSize = 0;
    try {
      while (totalSize < sampleSize) {
        const { value, done } = await readWithSignal(reader, this.options.signal);
        if (done || !value) {
          hasStreamEnded = true;
          break;
        }
        chunks.push(value);
        totalSize += value.length;
      }
      if (!hasStreamEnded && totalSize === sampleSize) {
        const { value, done } = await readWithSignal(reader, this.options.signal);
        if (done || !value) {
          hasStreamEnded = true;
        } else {
          chunks.push(value);
          totalSize += value.length;
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (totalSize > 0) {
      const sample = chunks.length === 1 ? chunks[0] : concatUint8Arrays(chunks);
      try {
        detectedFileType = await this.fromBuffer(sample.subarray(0, sampleSize));
      } catch (error) {
        if (!(error instanceof EndOfStreamError)) {
          throw error;
        }
        detectedFileType = void 0;
      }
      if (!hasStreamEnded && (detectedFileType == null ? void 0 : detectedFileType.ext) === "pages") {
        detectedFileType = {
          ext: "zip",
          mime: "application/zip"
        };
      }
    }
    const transformStream = new TransformStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
      },
      transform(chunk, controller) {
        controller.enqueue(chunk);
      }
    });
    const newStream = stream.pipeThrough(transformStream);
    newStream.fileType = detectedFileType;
    return newStream;
  }
  async detectGzip(tokenizer) {
    var _a;
    if (this.gzipProbeDepth >= maximumNestedGzipProbeDepth) {
      return {
        ext: "gz",
        mime: "application/gzip"
      };
    }
    const gzipHandler = new GzipHandler(tokenizer);
    const limitedInflatedStream = createByteLimitedReadableStream(gzipHandler.inflate(), maximumNestedGzipDetectionSizeInBytes);
    const hasUnknownSize = hasUnknownFileSize(tokenizer);
    let timeout;
    let probeSignal;
    let probeParser;
    let compressedFileType;
    if (hasUnknownSize) {
      const timeoutController = new AbortController();
      timeout = setTimeout(() => {
        timeoutController.abort(new DOMException(`Operation timed out after ${unknownSizeGzipProbeTimeoutInMilliseconds} ms`, "TimeoutError"));
      }, unknownSizeGzipProbeTimeoutInMilliseconds);
      probeSignal = this.options.signal === void 0 ? timeoutController.signal : AbortSignal.any([this.options.signal, timeoutController.signal]);
      probeParser = new _FileTypeParser({
        ...this.options,
        signal: probeSignal
      });
      probeParser.gzipProbeDepth = this.gzipProbeDepth + 1;
    } else {
      this.gzipProbeDepth++;
    }
    try {
      compressedFileType = await (probeParser ?? this).fromStream(limitedInflatedStream);
    } catch (error) {
      if ((error == null ? void 0 : error.name) === "AbortError" && ((_a = probeSignal == null ? void 0 : probeSignal.reason) == null ? void 0 : _a.name) !== "TimeoutError") {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
      if (!hasUnknownSize) {
        this.gzipProbeDepth--;
      }
    }
    if ((compressedFileType == null ? void 0 : compressedFileType.ext) === "tar") {
      return {
        ext: "tar.gz",
        mime: "application/gzip"
      };
    }
    return {
      ext: "gz",
      mime: "application/gzip"
    };
  }
  check(header, options) {
    return checkBytes(this.buffer, header, options);
  }
  checkString(header, options) {
    return this.check(stringToBytes(header, options == null ? void 0 : options.encoding), options);
  }
  // Detections with a high degree of certainty in identifying the correct file type
  async detectConfident(tokenizer) {
    this.buffer = new Uint8Array(reasonableDetectionSizeInBytes);
    if (tokenizer.fileInfo.size === void 0) {
      tokenizer.fileInfo.size = Number.MAX_SAFE_INTEGER;
    }
    this.tokenizer = tokenizer;
    if (hasUnknownFileSize(tokenizer)) {
      await tokenizer.peekBuffer(this.buffer, { length: 3, mayBeLess: true });
      if (this.check([31, 139, 8])) {
        return this.detectGzip(tokenizer);
      }
    }
    await tokenizer.peekBuffer(this.buffer, { length: 32, mayBeLess: true });
    if (this.check([66, 77])) {
      return {
        ext: "bmp",
        mime: "image/bmp"
      };
    }
    if (this.check([11, 119])) {
      return {
        ext: "ac3",
        mime: "audio/vnd.dolby.dd-raw"
      };
    }
    if (this.check([120, 1])) {
      return {
        ext: "dmg",
        mime: "application/x-apple-diskimage"
      };
    }
    if (this.check([77, 90])) {
      return {
        ext: "exe",
        mime: "application/x-msdownload"
      };
    }
    if (this.check([37, 33])) {
      await tokenizer.peekBuffer(this.buffer, { length: 24, mayBeLess: true });
      if (this.checkString("PS-Adobe-", { offset: 2 }) && this.checkString(" EPSF-", { offset: 14 })) {
        return {
          ext: "eps",
          mime: "application/eps"
        };
      }
      return {
        ext: "ps",
        mime: "application/postscript"
      };
    }
    if (this.check([31, 160]) || this.check([31, 157])) {
      return {
        ext: "Z",
        mime: "application/x-compress"
      };
    }
    if (this.check([199, 113])) {
      return {
        ext: "cpio",
        mime: "application/x-cpio"
      };
    }
    if (this.check([96, 234])) {
      return {
        ext: "arj",
        mime: "application/x-arj"
      };
    }
    if (this.check([239, 187, 191])) {
      if (this.detectionReentryCount >= maximumDetectionReentryCount) {
        return;
      }
      this.detectionReentryCount++;
      await this.tokenizer.ignore(3);
      return this.detectConfident(tokenizer);
    }
    if (this.check([71, 73, 70])) {
      return {
        ext: "gif",
        mime: "image/gif"
      };
    }
    if (this.check([73, 73, 188])) {
      return {
        ext: "jxr",
        mime: "image/vnd.ms-photo"
      };
    }
    if (this.check([31, 139, 8])) {
      return this.detectGzip(tokenizer);
    }
    if (this.check([66, 90, 104])) {
      return {
        ext: "bz2",
        mime: "application/x-bzip2"
      };
    }
    if (this.checkString("ID3")) {
      await safeIgnore(tokenizer, 6, {
        maximumLength: 6,
        reason: "ID3 header prefix"
      });
      const id3HeaderLength = await tokenizer.readToken(uint32SyncSafeToken);
      const isUnknownFileSize = hasUnknownFileSize(tokenizer);
      if (!Number.isFinite(id3HeaderLength) || id3HeaderLength < 0 || isUnknownFileSize && (id3HeaderLength > maximumId3HeaderSizeInBytes || tokenizer.position + id3HeaderLength > maximumId3HeaderSizeInBytes)) {
        return;
      }
      if (tokenizer.position + id3HeaderLength > tokenizer.fileInfo.size) {
        if (isUnknownFileSize) {
          return;
        }
        return {
          ext: "mp3",
          mime: "audio/mpeg"
        };
      }
      try {
        await safeIgnore(tokenizer, id3HeaderLength, {
          maximumLength: isUnknownFileSize ? maximumId3HeaderSizeInBytes : tokenizer.fileInfo.size,
          reason: "ID3 payload"
        });
      } catch (error) {
        if (error instanceof EndOfStreamError) {
          return;
        }
        throw error;
      }
      if (this.detectionReentryCount >= maximumDetectionReentryCount) {
        return;
      }
      this.detectionReentryCount++;
      return this.parseTokenizer(tokenizer, this.detectionReentryCount);
    }
    if (this.checkString("MP+")) {
      return {
        ext: "mpc",
        mime: "audio/x-musepack"
      };
    }
    if ((this.buffer[0] === 67 || this.buffer[0] === 70) && this.check([87, 83], { offset: 1 })) {
      return {
        ext: "swf",
        mime: "application/x-shockwave-flash"
      };
    }
    if (this.check([255, 216, 255])) {
      if (this.check([247], { offset: 3 })) {
        return {
          ext: "jls",
          mime: "image/jls"
        };
      }
      return {
        ext: "jpg",
        mime: "image/jpeg"
      };
    }
    if (this.check([79, 98, 106, 1])) {
      return {
        ext: "avro",
        mime: "application/avro"
      };
    }
    if (this.checkString("FLIF")) {
      return {
        ext: "flif",
        mime: "image/flif"
      };
    }
    if (this.checkString("8BPS")) {
      return {
        ext: "psd",
        mime: "image/vnd.adobe.photoshop"
      };
    }
    if (this.checkString("MPCK")) {
      return {
        ext: "mpc",
        mime: "audio/x-musepack"
      };
    }
    if (this.checkString("FORM")) {
      return {
        ext: "aif",
        mime: "audio/aiff"
      };
    }
    if (this.checkString("caff") && this.check([0, 1], { offset: 4 }) && this.checkString("desc", { offset: 8 })) {
      return {
        ext: "caf",
        mime: "audio/x-caf"
        // Non-standard
      };
    }
    if (this.checkString("icns", { offset: 0 })) {
      return {
        ext: "icns",
        mime: "image/icns"
      };
    }
    if (this.check([80, 75, 3, 4])) {
      return detectZip(tokenizer);
    }
    if (this.checkString("OggS")) {
      await tokenizer.ignore(28);
      const type = new Uint8Array(8);
      await tokenizer.readBuffer(type);
      if (checkBytes(type, [79, 112, 117, 115, 72, 101, 97, 100])) {
        return {
          ext: "opus",
          mime: "audio/ogg; codecs=opus"
        };
      }
      if (checkBytes(type, [128, 116, 104, 101, 111, 114, 97])) {
        return {
          ext: "ogv",
          mime: "video/ogg"
        };
      }
      if (checkBytes(type, [1, 118, 105, 100, 101, 111, 0])) {
        return {
          ext: "ogm",
          mime: "video/ogg"
        };
      }
      if (checkBytes(type, [127, 70, 76, 65, 67])) {
        return {
          ext: "oga",
          mime: "audio/ogg"
        };
      }
      if (checkBytes(type, [83, 112, 101, 101, 120, 32, 32])) {
        return {
          ext: "spx",
          mime: "audio/ogg"
        };
      }
      if (checkBytes(type, [1, 118, 111, 114, 98, 105, 115])) {
        return {
          ext: "ogg",
          mime: "audio/ogg"
        };
      }
      return {
        ext: "ogx",
        mime: "application/ogg"
      };
    }
    if (this.check([80, 75]) && [3, 5, 7].includes(this.buffer[2]) && [4, 6, 8].includes(this.buffer[3])) {
      return {
        ext: "zip",
        mime: "application/zip"
      };
    }
    if (this.checkString("MThd")) {
      return {
        ext: "mid",
        mime: "audio/midi"
      };
    }
    if (this.checkString("wOFF") && (this.check([0, 1, 0, 0], { offset: 4 }) || this.checkString("OTTO", { offset: 4 }))) {
      return {
        ext: "woff",
        mime: "font/woff"
      };
    }
    if (this.checkString("wOF2") && (this.check([0, 1, 0, 0], { offset: 4 }) || this.checkString("OTTO", { offset: 4 }))) {
      return {
        ext: "woff2",
        mime: "font/woff2"
      };
    }
    if (this.check([212, 195, 178, 161]) || this.check([161, 178, 195, 212])) {
      return {
        ext: "pcap",
        mime: "application/vnd.tcpdump.pcap"
      };
    }
    if (this.checkString("DSD ")) {
      return {
        ext: "dsf",
        mime: "audio/x-dsf"
        // Non-standard
      };
    }
    if (this.checkString("LZIP")) {
      return {
        ext: "lz",
        mime: "application/lzip"
      };
    }
    if (this.checkString("fLaC")) {
      return {
        ext: "flac",
        mime: "audio/flac"
      };
    }
    if (this.check([66, 80, 71, 251])) {
      return {
        ext: "bpg",
        mime: "image/bpg"
      };
    }
    if (this.checkString("wvpk")) {
      return {
        ext: "wv",
        mime: "audio/wavpack"
      };
    }
    if (this.checkString("%PDF")) {
      return {
        ext: "pdf",
        mime: "application/pdf"
      };
    }
    if (this.check([0, 97, 115, 109])) {
      return {
        ext: "wasm",
        mime: "application/wasm"
      };
    }
    if (this.check([73, 73])) {
      const fileType = await this.readTiffHeader(false);
      if (fileType) {
        return fileType;
      }
    }
    if (this.check([77, 77])) {
      const fileType = await this.readTiffHeader(true);
      if (fileType) {
        return fileType;
      }
    }
    if (this.checkString("MAC ")) {
      return {
        ext: "ape",
        mime: "audio/ape"
      };
    }
    if (this.check([26, 69, 223, 163])) {
      return detectEbml(tokenizer);
    }
    if (this.checkString("SQLi")) {
      return {
        ext: "sqlite",
        mime: "application/x-sqlite3"
      };
    }
    if (this.check([78, 69, 83, 26])) {
      return {
        ext: "nes",
        mime: "application/x-nintendo-nes-rom"
      };
    }
    if (this.checkString("Cr24")) {
      return {
        ext: "crx",
        mime: "application/x-google-chrome-extension"
      };
    }
    if (this.checkString("MSCF") || this.checkString("ISc(")) {
      return {
        ext: "cab",
        mime: "application/vnd.ms-cab-compressed"
      };
    }
    if (this.check([237, 171, 238, 219])) {
      return {
        ext: "rpm",
        mime: "application/x-rpm"
      };
    }
    if (this.check([197, 208, 211, 198])) {
      return {
        ext: "eps",
        mime: "application/eps"
      };
    }
    if (this.check([40, 181, 47, 253])) {
      return {
        ext: "zst",
        mime: "application/zstd"
      };
    }
    if (this.check([127, 69, 76, 70])) {
      return {
        ext: "elf",
        mime: "application/x-elf"
      };
    }
    if (this.check([33, 66, 68, 78])) {
      return {
        ext: "pst",
        mime: "application/vnd.ms-outlook"
      };
    }
    if (this.checkString("PAR1") || this.checkString("PARE")) {
      return {
        ext: "parquet",
        mime: "application/vnd.apache.parquet"
      };
    }
    if (this.checkString("ttcf")) {
      return {
        ext: "ttc",
        mime: "font/collection"
      };
    }
    if (this.check([254, 237, 250, 206]) || this.check([254, 237, 250, 207]) || this.check([206, 250, 237, 254]) || this.check([207, 250, 237, 254])) {
      return {
        ext: "macho",
        mime: "application/x-mach-binary"
      };
    }
    if (this.check([4, 34, 77, 24])) {
      return {
        ext: "lz4",
        mime: "application/x-lz4"
        // Informal, used by freedesktop.org shared-mime-info
      };
    }
    if (this.checkString("regf")) {
      return {
        ext: "dat",
        mime: "application/x-ft-windows-registry-hive"
      };
    }
    if (this.checkString("$FL2") || this.checkString("$FL3")) {
      return {
        ext: "sav",
        mime: "application/x-spss-sav"
      };
    }
    if (this.check([79, 84, 84, 79, 0])) {
      return {
        ext: "otf",
        mime: "font/otf"
      };
    }
    if (this.checkString("#!AMR")) {
      return {
        ext: "amr",
        mime: "audio/amr"
      };
    }
    if (this.checkString(String.raw`{\rtf`)) {
      return {
        ext: "rtf",
        mime: "application/rtf"
      };
    }
    if (this.check([70, 76, 86, 1])) {
      return {
        ext: "flv",
        mime: "video/x-flv"
      };
    }
    if (this.checkString("IMPM")) {
      return {
        ext: "it",
        mime: "audio/x-it"
      };
    }
    if (this.checkString("-lh0-", { offset: 2 }) || this.checkString("-lh1-", { offset: 2 }) || this.checkString("-lh2-", { offset: 2 }) || this.checkString("-lh3-", { offset: 2 }) || this.checkString("-lh4-", { offset: 2 }) || this.checkString("-lh5-", { offset: 2 }) || this.checkString("-lh6-", { offset: 2 }) || this.checkString("-lh7-", { offset: 2 }) || this.checkString("-lzs-", { offset: 2 }) || this.checkString("-lz4-", { offset: 2 }) || this.checkString("-lz5-", { offset: 2 }) || this.checkString("-lhd-", { offset: 2 })) {
      return {
        ext: "lzh",
        mime: "application/x-lzh-compressed"
      };
    }
    if (this.check([0, 0, 1, 186])) {
      if (this.check([33], { offset: 4, mask: [241] })) {
        return {
          ext: "mpg",
          // May also be .ps, .mpeg
          mime: "video/MP1S"
        };
      }
      if (this.check([68], { offset: 4, mask: [196] })) {
        return {
          ext: "mpg",
          // May also be .mpg, .m2p, .vob or .sub
          mime: "video/MP2P"
        };
      }
    }
    if (this.checkString("ITSF")) {
      return {
        ext: "chm",
        mime: "application/vnd.ms-htmlhelp"
      };
    }
    if (this.check([202, 254, 186, 190])) {
      const machOArchitectureCount = UINT32_BE.get(this.buffer, 4);
      if (machOArchitectureCount > 0 && machOArchitectureCount <= 30) {
        return {
          ext: "macho",
          mime: "application/x-mach-binary"
        };
      }
      const javaClassFileMajorVersion = UINT16_BE.get(this.buffer, 6);
      if (javaClassFileMajorVersion > 30) {
        return {
          ext: "class",
          mime: "application/java-vm"
        };
      }
    }
    if (this.checkString(".RMF")) {
      return {
        ext: "rm",
        mime: "application/vnd.rn-realmedia"
      };
    }
    if (this.checkString("DRACO")) {
      return {
        ext: "drc",
        mime: "application/x-ft-draco"
      };
    }
    if (this.check([253, 55, 122, 88, 90, 0])) {
      return {
        ext: "xz",
        mime: "application/x-xz"
      };
    }
    if (this.checkString("<?xml ")) {
      return {
        ext: "xml",
        mime: "application/xml"
      };
    }
    if (this.check([55, 122, 188, 175, 39, 28])) {
      return {
        ext: "7z",
        mime: "application/x-7z-compressed"
      };
    }
    if (this.check([82, 97, 114, 33, 26, 7]) && (this.buffer[6] === 0 || this.buffer[6] === 1)) {
      return {
        ext: "rar",
        mime: "application/x-rar-compressed"
      };
    }
    if (this.checkString("solid ")) {
      return {
        ext: "stl",
        mime: "model/stl"
      };
    }
    if (this.checkString("AC")) {
      const version = new StringType(4, "latin1").get(this.buffer, 2);
      if (new RegExp("^\\d+$", "v").test(version) && version >= 1e3 && version <= 1050) {
        return {
          ext: "dwg",
          mime: "image/vnd.dwg"
        };
      }
    }
    if (this.checkString("070707")) {
      return {
        ext: "cpio",
        mime: "application/x-cpio"
      };
    }
    if (this.checkString("BLENDER")) {
      return {
        ext: "blend",
        mime: "application/x-blender"
      };
    }
    if (this.checkString("!<arch>")) {
      await tokenizer.ignore(8);
      const string = await tokenizer.readToken(new StringType(13, "ascii"));
      if (string === "debian-binary") {
        return {
          ext: "deb",
          mime: "application/x-deb"
        };
      }
      return {
        ext: "ar",
        mime: "application/x-unix-archive"
      };
    }
    if (this.checkString("WEBVTT") && // One of LF, CR, tab, space, or end of file must follow "WEBVTT" per the spec (see `fixture/fixture-vtt-*.vtt` for examples). Note that `\0` is technically the null character (there is no such thing as an EOF character). However, checking for `\0` gives us the same result as checking for the end of the stream.
    ["\n", "\r", "	", " ", "\0"].some((char7) => this.checkString(char7, { offset: 6 }))) {
      return {
        ext: "vtt",
        mime: "text/vtt"
      };
    }
    if (this.check([137, 80, 78, 71, 13, 10, 26, 10])) {
      return detectPng(tokenizer);
    }
    if (this.check([65, 82, 82, 79, 87, 49, 0, 0])) {
      return {
        ext: "arrow",
        mime: "application/vnd.apache.arrow.file"
      };
    }
    if (this.check([103, 108, 84, 70, 2, 0, 0, 0])) {
      return {
        ext: "glb",
        mime: "model/gltf-binary"
      };
    }
    if (this.check([102, 114, 101, 101], { offset: 4 }) || this.check([109, 100, 97, 116], { offset: 4 }) || this.check([109, 111, 111, 118], { offset: 4 }) || this.check([119, 105, 100, 101], { offset: 4 })) {
      return {
        ext: "mov",
        mime: "video/quicktime"
      };
    }
    if (this.check([73, 73, 82, 79, 8, 0, 0, 0, 24])) {
      return {
        ext: "orf",
        mime: "image/x-olympus-orf"
      };
    }
    if (this.checkString("gimp xcf ")) {
      return {
        ext: "xcf",
        mime: "image/x-xcf"
      };
    }
    if (this.checkString("ftyp", { offset: 4 }) && (this.buffer[8] & 96) !== 0) {
      const brandMajor = new StringType(4, "latin1").get(this.buffer, 8).replace("\0", " ").trim();
      switch (brandMajor) {
        case "avif":
        case "avis":
          return { ext: "avif", mime: "image/avif" };
        case "mif1":
          return { ext: "heic", mime: "image/heif" };
        case "msf1":
          return { ext: "heic", mime: "image/heif-sequence" };
        case "heic":
        case "heix":
          return { ext: "heic", mime: "image/heic" };
        case "hevc":
        case "hevx":
          return { ext: "heic", mime: "image/heic-sequence" };
        case "qt":
          return { ext: "mov", mime: "video/quicktime" };
        case "M4V":
        case "M4VH":
        case "M4VP":
          return { ext: "m4v", mime: "video/x-m4v" };
        case "M4P":
          return { ext: "m4p", mime: "video/mp4" };
        case "M4B":
          return { ext: "m4b", mime: "audio/mp4" };
        case "M4A":
          return { ext: "m4a", mime: "audio/x-m4a" };
        case "F4V":
          return { ext: "f4v", mime: "video/mp4" };
        case "F4P":
          return { ext: "f4p", mime: "video/mp4" };
        case "F4A":
          return { ext: "f4a", mime: "audio/mp4" };
        case "F4B":
          return { ext: "f4b", mime: "audio/mp4" };
        case "crx":
          return { ext: "cr3", mime: "image/x-canon-cr3" };
        default:
          if (brandMajor.startsWith("3g")) {
            if (brandMajor.startsWith("3g2")) {
              return { ext: "3g2", mime: "video/3gpp2" };
            }
            return { ext: "3gp", mime: "video/3gpp" };
          }
          return { ext: "mp4", mime: "video/mp4" };
      }
    }
    if (this.checkString("REGEDIT4\r\n")) {
      return {
        ext: "reg",
        mime: "application/x-ms-regedit"
      };
    }
    if (this.check([82, 73, 70, 70])) {
      if (this.checkString("WEBP", { offset: 8 })) {
        return {
          ext: "webp",
          mime: "image/webp"
        };
      }
      if (this.check([65, 86, 73], { offset: 8 })) {
        return {
          ext: "avi",
          mime: "video/vnd.avi"
        };
      }
      if (this.check([87, 65, 86, 69], { offset: 8 })) {
        return {
          ext: "wav",
          mime: "audio/wav"
        };
      }
      if (this.check([81, 76, 67, 77], { offset: 8 })) {
        return {
          ext: "qcp",
          mime: "audio/qcelp"
        };
      }
    }
    if (this.check([73, 73, 85, 0, 24, 0, 0, 0, 136, 231, 116, 216])) {
      return {
        ext: "rw2",
        mime: "image/x-panasonic-rw2"
      };
    }
    if (this.check([48, 38, 178, 117, 142, 102, 207, 17, 166, 217])) {
      return detectAsf(tokenizer);
    }
    if (this.check([171, 75, 84, 88, 32, 49, 49, 187, 13, 10, 26, 10])) {
      return {
        ext: "ktx",
        mime: "image/ktx"
      };
    }
    if ((this.check([126, 16, 4]) || this.check([126, 24, 4])) && this.check([48, 77, 73, 69], { offset: 4 })) {
      return {
        ext: "mie",
        mime: "application/x-mie"
      };
    }
    if (this.check([39, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], { offset: 2 })) {
      return {
        ext: "shp",
        mime: "application/x-esri-shape"
      };
    }
    if (this.check([255, 79, 255, 81])) {
      return {
        ext: "j2c",
        mime: "image/j2c"
      };
    }
    if (this.check([0, 0, 0, 12, 106, 80, 32, 32, 13, 10, 135, 10])) {
      await tokenizer.ignore(20);
      const type = await tokenizer.readToken(new StringType(4, "ascii"));
      switch (type) {
        case "jp2 ":
          return {
            ext: "jp2",
            mime: "image/jp2"
          };
        case "jpx ":
          return {
            ext: "jpx",
            mime: "image/jpx"
          };
        case "jpm ":
          return {
            ext: "jpm",
            mime: "image/jpm"
          };
        case "mjp2":
          return {
            ext: "mj2",
            mime: "image/mj2"
          };
        default:
          return;
      }
    }
    if (this.check([255, 10]) || this.check([0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10])) {
      return {
        ext: "jxl",
        mime: "image/jxl"
      };
    }
    if (this.check([254, 255])) {
      if (this.checkString("<?xml ", { offset: 2, encoding: "utf-16be" })) {
        return {
          ext: "xml",
          mime: "application/xml"
        };
      }
      return void 0;
    }
    if (this.check([208, 207, 17, 224, 161, 177, 26, 225])) {
      return {
        ext: "cfb",
        mime: "application/x-cfb"
      };
    }
    if (this.checkString("FRM8") && this.checkString("DSD ", { offset: 12 })) {
      return {
        ext: "dff",
        mime: "audio/x-dff"
        // Non-standard
      };
    }
    await tokenizer.peekBuffer(this.buffer, { length: Math.min(256, tokenizer.fileInfo.size), mayBeLess: true });
    if (this.check([97, 99, 115, 112], { offset: 36 })) {
      return {
        ext: "icc",
        mime: "application/vnd.iccprofile"
      };
    }
    if (this.checkString("**ACE", { offset: 7 }) && this.checkString("**", { offset: 12 })) {
      return {
        ext: "ace",
        mime: "application/x-ace-compressed"
      };
    }
    if (this.checkString("BEGIN:")) {
      if (this.checkString("VCARD", { offset: 6 })) {
        return {
          ext: "vcf",
          mime: "text/vcard"
        };
      }
      if (this.checkString("VCALENDAR", { offset: 6 })) {
        return {
          ext: "ics",
          mime: "text/calendar"
        };
      }
    }
    if (this.checkString("FUJIFILMCCD-RAW")) {
      return {
        ext: "raf",
        mime: "image/x-fujifilm-raf"
      };
    }
    if (this.checkString("Extended Module:")) {
      return {
        ext: "xm",
        mime: "audio/x-xm"
      };
    }
    if (this.checkString("Creative Voice File")) {
      return {
        ext: "voc",
        mime: "audio/x-voc"
      };
    }
    if (this.check([4, 0, 0, 0]) && this.buffer.length >= 16) {
      const jsonSize = new DataView(this.buffer.buffer).getUint32(12, true);
      if (jsonSize > 12 && this.buffer.length >= jsonSize + 16) {
        try {
          const header = new TextDecoder().decode(this.buffer.subarray(16, jsonSize + 16));
          const json = JSON.parse(header);
          if (json.files) {
            return {
              ext: "asar",
              mime: "application/x-asar"
            };
          }
        } catch {
        }
      }
    }
    if (this.check([6, 14, 43, 52, 2, 5, 1, 1, 13, 1, 2, 1, 1, 2])) {
      return {
        ext: "mxf",
        mime: "application/mxf"
      };
    }
    if (this.checkString("SCRM", { offset: 44 })) {
      return {
        ext: "s3m",
        mime: "audio/x-s3m"
      };
    }
    if (this.check([71]) && this.check([71], { offset: 188 })) {
      return {
        ext: "mts",
        mime: "video/mp2t"
      };
    }
    if (this.check([71], { offset: 4 }) && this.check([71], { offset: 196 })) {
      return {
        ext: "mts",
        mime: "video/mp2t"
      };
    }
    if (this.check([66, 79, 79, 75, 77, 79, 66, 73], { offset: 60 })) {
      return {
        ext: "mobi",
        mime: "application/x-mobipocket-ebook"
      };
    }
    if (this.check([68, 73, 67, 77], { offset: 128 })) {
      return {
        ext: "dcm",
        mime: "application/dicom"
      };
    }
    if (this.check([76, 0, 0, 0, 1, 20, 2, 0, 0, 0, 0, 0, 192, 0, 0, 0, 0, 0, 0, 70])) {
      return {
        ext: "lnk",
        mime: "application/x-ms-shortcut"
        // Informal, used by freedesktop.org shared-mime-info
      };
    }
    if (this.check([98, 111, 111, 107, 0, 0, 0, 0, 109, 97, 114, 107, 0, 0, 0, 0])) {
      return {
        ext: "alias",
        mime: "application/x-ft-apple.alias"
      };
    }
    if (this.checkString("Kaydara FBX Binary  \0")) {
      return {
        ext: "fbx",
        mime: "application/x-ft-fbx"
      };
    }
    if (this.check([76, 80], { offset: 34 }) && (this.check([0, 0, 1], { offset: 8 }) || this.check([1, 0, 2], { offset: 8 }) || this.check([2, 0, 2], { offset: 8 }))) {
      return {
        ext: "eot",
        mime: "application/vnd.ms-fontobject"
      };
    }
    if (this.check([6, 6, 237, 245, 216, 29, 70, 229, 189, 49, 239, 231, 254, 116, 183, 29])) {
      return {
        ext: "indd",
        mime: "application/x-indesign"
      };
    }
    if (this.check([255, 255, 0, 0, 7, 0, 0, 0, 4, 0, 0, 0, 1, 0, 1, 0]) || this.check([0, 0, 255, 255, 0, 0, 0, 7, 0, 0, 0, 4, 0, 1, 0, 1])) {
      return {
        ext: "jmp",
        mime: "application/x-jmp-data"
      };
    }
    await tokenizer.peekBuffer(this.buffer, { length: Math.min(512, tokenizer.fileInfo.size), mayBeLess: true });
    if (this.checkString("ustar", { offset: 257 }) && (this.checkString("\0", { offset: 262 }) || this.checkString(" ", { offset: 262 })) || this.check([0, 0, 0, 0, 0, 0], { offset: 257 }) && tarHeaderChecksumMatches(this.buffer)) {
      return {
        ext: "tar",
        mime: "application/x-tar"
      };
    }
    if (this.check([255, 254])) {
      const encoding = "utf-16le";
      if (this.checkString("<?xml ", { offset: 2, encoding })) {
        return {
          ext: "xml",
          mime: "application/xml"
        };
      }
      if (this.check([255, 14], { offset: 2 }) && this.checkString("SketchUp Model", { offset: 4, encoding })) {
        return {
          ext: "skp",
          mime: "application/vnd.sketchup.skp"
        };
      }
      if (this.checkString("Windows Registry Editor Version 5.00\r\n", { offset: 2, encoding })) {
        return {
          ext: "reg",
          mime: "application/x-ms-regedit"
        };
      }
      return void 0;
    }
    if (this.checkString("-----BEGIN PGP MESSAGE-----")) {
      return {
        ext: "pgp",
        mime: "application/pgp-encrypted"
      };
    }
    const isoStandardIdentifierOffset = 32769;
    const isoStandardIdentifierLength = 5;
    if (tokenizer.supportsRandomAccess() && tokenizer.fileInfo.size >= isoStandardIdentifierOffset + isoStandardIdentifierLength) {
      const isoStandardIdentifier = new Uint8Array(isoStandardIdentifierLength);
      await tokenizer.peekBuffer(isoStandardIdentifier, {
        position: isoStandardIdentifierOffset,
        length: isoStandardIdentifierLength,
        mayBeLess: true
      });
      if (checkBytes(isoStandardIdentifier, stringToBytes("CD001"))) {
        return {
          ext: "iso",
          mime: "application/x-iso9660-image"
        };
      }
    }
  }
  // Detections with limited supporting data, resulting in a higher likelihood of false positives
  async detectImprecise(tokenizer) {
    this.buffer = new Uint8Array(reasonableDetectionSizeInBytes);
    const fileSize = getKnownFileSizeOrMaximum(tokenizer.fileInfo.size);
    await tokenizer.peekBuffer(this.buffer, { length: Math.min(8, fileSize), mayBeLess: true });
    if (this.check([0, 0, 1, 186]) || this.check([0, 0, 1, 179])) {
      return {
        ext: "mpg",
        mime: "video/mpeg"
      };
    }
    if (this.check([0, 1, 0, 0, 0])) {
      return {
        ext: "ttf",
        mime: "font/ttf"
      };
    }
    if (this.check([0, 0, 1, 0])) {
      return {
        ext: "ico",
        mime: "image/x-icon"
      };
    }
    if (this.check([0, 0, 2, 0])) {
      return {
        ext: "cur",
        mime: "image/x-icon"
      };
    }
    await tokenizer.peekBuffer(this.buffer, { length: Math.min(4 + this.options.mpegOffsetTolerance, fileSize), mayBeLess: true });
    if (this.buffer.length >= 4 + this.options.mpegOffsetTolerance) {
      for (let depth = 0; depth <= this.options.mpegOffsetTolerance; ++depth) {
        const type = this.scanMpeg(depth);
        if (type) {
          return type;
        }
      }
    }
  }
  async readTiffTag(isBigEndian) {
    const tagId = await this.tokenizer.readToken(isBigEndian ? UINT16_BE : UINT16_LE);
    await this.tokenizer.ignore(10);
    switch (tagId) {
      case 50341:
        return {
          ext: "arw",
          mime: "image/x-sony-arw"
        };
      case 50706:
        return {
          ext: "dng",
          mime: "image/x-adobe-dng"
        };
      default:
    }
  }
  async readTiffIFD(isBigEndian) {
    const numberOfTags = await this.tokenizer.readToken(isBigEndian ? UINT16_BE : UINT16_LE);
    if (numberOfTags > maximumTiffTagCount) {
      return;
    }
    if (hasUnknownFileSize(this.tokenizer) && 2 + numberOfTags * 12 > maximumTiffIfdOffsetInBytes) {
      return;
    }
    for (let n = 0; n < numberOfTags; ++n) {
      const fileType = await this.readTiffTag(isBigEndian);
      if (fileType) {
        return fileType;
      }
    }
  }
  async readTiffHeader(isBigEndian) {
    const tiffFileType = {
      ext: "tif",
      mime: "image/tiff"
    };
    const version = (isBigEndian ? UINT16_BE : UINT16_LE).get(this.buffer, 2);
    const ifdOffset = (isBigEndian ? UINT32_BE : UINT32_LE).get(this.buffer, 4);
    if (version === 42) {
      if (ifdOffset >= 6) {
        if (this.checkString("CR", { offset: 8 })) {
          return {
            ext: "cr2",
            mime: "image/x-canon-cr2"
          };
        }
        if (ifdOffset >= 8) {
          const someId1 = (isBigEndian ? UINT16_BE : UINT16_LE).get(this.buffer, 8);
          const someId2 = (isBigEndian ? UINT16_BE : UINT16_LE).get(this.buffer, 10);
          if (someId1 === 28 && someId2 === 254 || someId1 === 31 && someId2 === 11) {
            return {
              ext: "nef",
              mime: "image/x-nikon-nef"
            };
          }
        }
      }
      if (hasUnknownFileSize(this.tokenizer) && ifdOffset > maximumTiffStreamIfdOffsetInBytes) {
        return tiffFileType;
      }
      const maximumTiffOffset = hasUnknownFileSize(this.tokenizer) ? maximumTiffIfdOffsetInBytes : this.tokenizer.fileInfo.size;
      try {
        await safeIgnore(this.tokenizer, ifdOffset, {
          maximumLength: maximumTiffOffset,
          reason: "TIFF IFD offset"
        });
      } catch (error) {
        if (error instanceof EndOfStreamError) {
          return;
        }
        throw error;
      }
      let fileType;
      try {
        fileType = await this.readTiffIFD(isBigEndian);
      } catch (error) {
        if (error instanceof EndOfStreamError) {
          return;
        }
        throw error;
      }
      return fileType ?? tiffFileType;
    }
    if (version === 43) {
      return tiffFileType;
    }
  }
  /**
  	Scan check MPEG 1 or 2 Layer 3 header, or 'layer 0' for ADTS (MPEG sync-word 0xFFE).
  
  	@param {number} offset - Offset to scan for sync-preamble.
  	@returns {{ext: string, mime: string} | undefined} The detected file type, if any.
  	*/
  scanMpeg(offset) {
    if (this.check([255, 224], { offset, mask: [255, 224] })) {
      if (this.check([16], { offset: offset + 1, mask: [22] })) {
        return {
          ext: "aac",
          mime: "audio/aac"
        };
      }
      if (this.check([255, 254], { offset })) {
        return;
      }
      if (this.check([8], { offset: offset + 1, mask: [24] })) {
        return;
      }
      if (this.check([240], { offset: offset + 2, mask: [240] })) {
        return;
      }
      if (this.check([12], { offset: offset + 2, mask: [12] })) {
        return;
      }
      if (this.check([2], { offset: offset + 1, mask: [6] })) {
        return {
          ext: "mp3",
          mime: "audio/mpeg"
        };
      }
      if (this.check([4], { offset: offset + 1, mask: [6] })) {
        return {
          ext: "mp2",
          mime: "audio/mpeg"
        };
      }
      if (this.check([6], { offset: offset + 1, mask: [6] })) {
        return {
          ext: "mp1",
          mime: "audio/mpeg"
        };
      }
    }
  }
};
var supportedExtensions = new Set(extensions);
var supportedMimeTypes = new Set(mimeTypes);

// ../../node_modules/music-metadata/lib/common/MetadataCollector.js
var import_debug2 = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/lrc/LyricsParser.js
var TIMESTAMP_REGEX = /\[(\d{2}):(\d{2})\.(\d{2,3})]/;
var LyricsContentError = class extends makeUnexpectedFileContentError("lyrics") {
};
function parseLyrics(input, maxLines = defaultMaxMetadataEntries) {
  if (TIMESTAMP_REGEX.test(input)) {
    return parseLrc(input, maxLines);
  }
  return toUnsyncedLyrics(input);
}
function normalizeLyricsTag(lyrics) {
  return {
    ...lyrics,
    contentType: lyrics.contentType ?? LyricsContentType.lyrics,
    timeStampFormat: lyrics.timeStampFormat ?? TimestampFormat.notSynchronized,
    syncText: lyrics.syncText ?? []
  };
}
function toUnsyncedLyrics(lyrics) {
  return {
    contentType: LyricsContentType.lyrics,
    timeStampFormat: TimestampFormat.notSynchronized,
    text: lyrics.trim(),
    syncText: []
  };
}
function parseLrc(lrcString, maxLines = defaultMaxMetadataEntries) {
  let lineCount = 1;
  for (let offset = lrcString.indexOf("\n"); offset >= 0; offset = lrcString.indexOf("\n", offset + 1)) {
    ++lineCount;
  }
  if (lineCount > maxLines) {
    throw new LyricsContentError(`Line count ${lineCount} exceeds entry limit ${maxLines}`);
  }
  const lines = lrcString.split("\n");
  const syncText = [];
  for (const line of lines) {
    const match = line.match(TIMESTAMP_REGEX);
    if (match) {
      const minutes = Number.parseInt(match[1], 10);
      const seconds = Number.parseInt(match[2], 10);
      const ms = match[3].length === 3 ? Number.parseInt(match[3], 10) : Number.parseInt(match[3], 10) * 10;
      const timestamp = (minutes * 60 + seconds) * 1e3 + ms;
      const text = line.replace(TIMESTAMP_REGEX, "").trim();
      syncText.push({ timestamp, text });
    }
  }
  return {
    contentType: LyricsContentType.lyrics,
    timeStampFormat: TimestampFormat.milliseconds,
    text: syncText.map((line) => line.text).join("\n"),
    syncText
  };
}

// ../../node_modules/music-metadata/lib/common/GenericTagMapper.js
var CommonTagMapper = class {
  constructor(tagTypes, tagMap2) {
    __publicField(this, "tagTypes");
    __publicField(this, "tagMap");
    this.tagTypes = tagTypes;
    this.tagMap = tagMap2;
  }
  static toIntOrNull(str) {
    const cleaned = Number.parseInt(str, 10);
    return Number.isNaN(cleaned) ? null : cleaned;
  }
  // TODO: a string of 1of1 would fail to be converted
  // converts 1/10 to no : 1, of : 10
  // or 1 to no : 1, of : 0
  static normalizeTrack(origVal) {
    const split = origVal.toString().split("/", 2);
    return {
      no: Number.parseInt(split[0], 10) || null,
      of: Number.parseInt(split[1], 10) || null
    };
  }
  /**
   * Process and set common tags
   * write common tags to
   * @param tag Native tag
   * @param warnings Register warnings
   * @return common name
   */
  mapGenericTag(tag, warnings) {
    tag = { id: tag.id, value: tag.value };
    this.postMap(tag, warnings);
    const id = this.getCommonName(tag.id);
    return id ? { id, value: tag.value } : null;
  }
  /**
   * Convert native tag key to common tag key
   * @param tag Native header tag
   * @return common tag name (alias)
   */
  getCommonName(tag) {
    return Object.hasOwn(this.tagMap, tag) ? this.tagMap[tag] : void 0;
  }
  /**
   * Handle post mapping exceptions / correction
   * @param tag Tag e.g. {"©alb", "Buena Vista Social Club")
   * @param warnings Used to register warnings
   */
  postMap(_tag, _warnings) {
    return;
  }
};
__publicField(CommonTagMapper, "maxRatingScore", 1);

// ../../node_modules/music-metadata/lib/aiff/AiffTagMap.js
var tagMap = {
  NAME: "title",
  AUTH: "artist",
  "(c) ": "copyright",
  ANNO: "comment"
};
var AiffTagMapper = class extends CommonTagMapper {
  constructor() {
    super(["AIFF"], tagMap);
  }
};

// ../../node_modules/music-metadata/lib/common/CaseInsensitiveTagMap.js
var CaseInsensitiveTagMap = class extends CommonTagMapper {
  constructor(tagTypes, tagMap2) {
    const upperCaseMap = {};
    for (const [tag, commonName] of Object.entries(tagMap2)) {
      upperCaseMap[tag.toUpperCase()] = commonName;
    }
    super(tagTypes, upperCaseMap);
  }
  /**
   * @tag  Native header tag
   * @return common tag name (alias)
   */
  getCommonName(tag) {
    return super.getCommonName(tag.toUpperCase());
  }
};

// ../../node_modules/music-metadata/lib/apev2/APEv2TagMapper.js
var apev2TagMap = {
  Title: "title",
  Artist: "artist",
  Artists: "artists",
  "Album Artist": "albumartist",
  Album: "album",
  Year: "date",
  Date: "date",
  Originalyear: "originalyear",
  Originaldate: "originaldate",
  Releasedate: "releasedate",
  Comment: "comment",
  Track: "track",
  Disc: "disk",
  DISCNUMBER: "disk",
  // ToDo: backwards compatibility', valid tag?
  Genre: "genre",
  "Cover Art (Front)": "picture",
  "Cover Art (Back)": "picture",
  Composer: "composer",
  Lyrics: "lyrics",
  ALBUMSORT: "albumsort",
  TITLESORT: "titlesort",
  WORK: "work",
  ARTISTSORT: "artistsort",
  ALBUMARTISTSORT: "albumartistsort",
  COMPOSERSORT: "composersort",
  Lyricist: "lyricist",
  Writer: "writer",
  Conductor: "conductor",
  // 'Performer=artist (instrument)': 'performer:instrument',
  MixArtist: "remixer",
  Arranger: "arranger",
  Engineer: "engineer",
  Producer: "producer",
  DJMixer: "djmixer",
  Mixer: "mixer",
  Label: "label",
  Grouping: "grouping",
  Subtitle: "subtitle",
  DiscSubtitle: "discsubtitle",
  Compilation: "compilation",
  BPM: "bpm",
  Mood: "mood",
  Media: "media",
  CatalogNumber: "catalognumber",
  MUSICBRAINZ_ALBUMSTATUS: "releasestatus",
  MUSICBRAINZ_ALBUMTYPE: "releasetype",
  RELEASECOUNTRY: "releasecountry",
  Script: "script",
  Language: "language",
  Copyright: "copyright",
  LICENSE: "license",
  EncodedBy: "encodedby",
  EncoderSettings: "encodersettings",
  Barcode: "barcode",
  ISRC: "isrc",
  ASIN: "asin",
  musicbrainz_trackid: "musicbrainz_recordingid",
  musicbrainz_releasetrackid: "musicbrainz_trackid",
  MUSICBRAINZ_ALBUMID: "musicbrainz_albumid",
  MUSICBRAINZ_ARTISTID: "musicbrainz_artistid",
  MUSICBRAINZ_ALBUMARTISTID: "musicbrainz_albumartistid",
  MUSICBRAINZ_RELEASEGROUPID: "musicbrainz_releasegroupid",
  MUSICBRAINZ_WORKID: "musicbrainz_workid",
  MUSICBRAINZ_TRMID: "musicbrainz_trmid",
  MUSICBRAINZ_DISCID: "musicbrainz_discid",
  Acoustid_Id: "acoustid_id",
  ACOUSTID_FINGERPRINT: "acoustid_fingerprint",
  MUSICIP_PUID: "musicip_puid",
  Weblink: "website",
  REPLAYGAIN_TRACK_GAIN: "replaygain_track_gain",
  REPLAYGAIN_TRACK_PEAK: "replaygain_track_peak",
  MP3GAIN_MINMAX: "replaygain_track_minmax",
  MP3GAIN_UNDO: "replaygain_undo"
};
var APEv2TagMapper = class extends CaseInsensitiveTagMap {
  constructor() {
    super(["APEv2"], apev2TagMap);
  }
};

// ../../node_modules/music-metadata/lib/asf/AsfTagMapper.js
var asfTagMap = {
  Title: "title",
  Author: "artist",
  "WM/AlbumArtist": "albumartist",
  "WM/AlbumTitle": "album",
  "WM/Year": "date",
  // changed to 'year' to 'date' based on Picard mappings; ToDo: check me
  "WM/OriginalReleaseTime": "originaldate",
  "WM/OriginalReleaseYear": "originalyear",
  Description: "comment",
  "WM/TrackNumber": "track",
  TotalTracks: "totaltracks",
  "WM/PartOfSet": "disk",
  "WM/Genre": "genre",
  "WM/Composer": "composer",
  "WM/Lyrics": "lyrics",
  "WM/AlbumSortOrder": "albumsort",
  "WM/TitleSortOrder": "titlesort",
  "WM/ArtistSortOrder": "artistsort",
  "WM/AlbumArtistSortOrder": "albumartistsort",
  "WM/ComposerSortOrder": "composersort",
  "WM/Writer": "lyricist",
  "WM/Conductor": "conductor",
  "WM/ModifiedBy": "remixer",
  "WM/Engineer": "engineer",
  "WM/Producer": "producer",
  "WM/DJMixer": "djmixer",
  "WM/Mixer": "mixer",
  "WM/Publisher": "label",
  "WM/ContentGroupDescription": "grouping",
  "WM/SubTitle": "subtitle",
  "WM/SetSubTitle": "discsubtitle",
  REPLAYGAIN_TRACK_GAIN: "replaygain_track_gain",
  REPLAYGAIN_TRACK_PEAK: "replaygain_track_peak",
  REPLAYGAIN_ALBUM_GAIN: "replaygain_album_gain",
  REPLAYGAIN_ALBUM_PEAK: "replaygain_album_peak",
  replaygain_track_gain: "replaygain_track_gain",
  replaygain_track_peak: "replaygain_track_peak",
  replaygain_album_gain: "replaygain_album_gain",
  replaygain_album_peak: "replaygain_album_peak",
  "WM/IsCompilation": "compilation",
  "WM/SharedUserRating": "rating",
  POPULARIMETER: "rating",
  "WM/BeatsPerMinute": "bpm",
  "WM/Mood": "mood",
  "WM/Media": "media",
  "WM/CatalogNo": "catalognumber",
  "MusicBrainz/Album Status": "releasestatus",
  "MusicBrainz/Album Type": "releasetype",
  "MusicBrainz/Album Release Country": "releasecountry",
  "WM/Script": "script",
  "WM/Language": "language",
  Copyright: "copyright",
  LICENSE: "license",
  "WM/EncodedBy": "encodedby",
  "WM/EncodingSettings": "encodersettings",
  "WM/Barcode": "barcode",
  "WM/ISRC": "isrc",
  "MusicBrainz/Track Id": "musicbrainz_recordingid",
  "MusicBrainz/Release Track Id": "musicbrainz_trackid",
  "MusicBrainz/Album Id": "musicbrainz_albumid",
  "MusicBrainz/Artist Id": "musicbrainz_artistid",
  "MusicBrainz/Album Artist Id": "musicbrainz_albumartistid",
  "MusicBrainz/Release Group Id": "musicbrainz_releasegroupid",
  "MusicBrainz/Work Id": "musicbrainz_workid",
  "MusicBrainz/TRM Id": "musicbrainz_trmid",
  "MusicBrainz/Disc Id": "musicbrainz_discid",
  "Acoustid/Id": "acoustid_id",
  "Acoustid/Fingerprint": "acoustid_fingerprint",
  "MusicIP/PUID": "musicip_puid",
  "WM/ARTISTS": "artists",
  "WM/InitialKey": "key",
  ASIN: "asin",
  "WM/Work": "work",
  "WM/AuthorURL": "website",
  "WM/Picture": "picture"
};
var AsfTagMapper = class _AsfTagMapper extends CommonTagMapper {
  static toRating(rating) {
    const value = typeof rating === "number" ? rating : Number.parseFloat(rating);
    if (!Number.isFinite(value) || value <= 0) {
      return { rating: void 0 };
    }
    return { rating: value / 99 };
  }
  constructor() {
    super(["asf"], asfTagMap);
  }
  postMap(tag, warnings) {
    var _a;
    if ((_a = this.getCommonName(tag.id)) == null ? void 0 : _a.startsWith("replaygain_")) {
      const value = typeof tag.value === "string" ? tag.value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(dB)?$/i) : null;
      const normalized = value ? `${value[1]}${value[2] ? " dB" : ""}` : void 0;
      const ratio = normalized ? toRatio(normalized) : void 0;
      if (!ratio || !Number.isFinite(ratio.ratio) || Number.isNaN(ratio.dB)) {
        warnings.addWarning(`Invalid ASF ReplayGain value for ${tag.id}`);
        tag.id = "";
      } else {
        tag.value = normalized;
      }
    }
    switch (tag.id) {
      case "POPULARIMETER": {
        const [email, rating] = tag.value.split("|", 2);
        const value = Number(rating);
        const valid = /^\d+$/.test(rating) && Number.isInteger(value) && value >= 0 && value <= 255;
        if (!valid) {
          warnings.addWarning(`Invalid ASF POPULARIMETER rating: ${rating}`);
        }
        tag.value = {
          source: email,
          rating: valid && value > 0 ? (value - 1) / 254 * CommonTagMapper.maxRatingScore : void 0
        };
        break;
      }
      case "WM/SharedUserRating": {
        const keys = tag.id.split(":", 2);
        tag.value = _AsfTagMapper.toRating(tag.value);
        tag.id = keys[0];
        break;
      }
    }
  }
};

// ../../node_modules/music-metadata/lib/caf/CafTagMap.js
var infoTagMap = {
  tempo: "bpm",
  "key signature": "key",
  artist: "artist",
  album: "album",
  "track number": "track",
  year: "year",
  composer: "composer",
  lyricist: "lyricist",
  genre: "genre",
  title: "title",
  "recorded date": "date",
  comments: "comment",
  copyright: "copyright",
  "source encoder": "encodersettings",
  "encoding application": "encodedby"
};
var commaSeparatedKeys = /* @__PURE__ */ new Set(["artist", "composer", "lyricist", "genre"]);
var CafTagMapper = class extends CommonTagMapper {
  constructor() {
    super(["CAF"], infoTagMap);
  }
  mapGenericTag(tag, warnings) {
    if (commaSeparatedKeys.has(tag.id) && typeof tag.value === "string") {
      tag = {
        id: tag.id,
        value: tag.value.split(",").map((value) => value.trim()).filter((value) => value.length > 0)
      };
    }
    return super.mapGenericTag(tag, warnings);
  }
};

// ../../node_modules/music-metadata/lib/id3v1/ID3v1TagMap.js
var id3v1TagMap = {
  title: "title",
  artist: "artist",
  album: "album",
  year: "year",
  comment: "comment",
  track: "track",
  genre: "genre"
};
var ID3v1TagMapper = class extends CommonTagMapper {
  constructor() {
    super(["ID3v1"], id3v1TagMap);
  }
};

// ../../node_modules/music-metadata/lib/id3v2/ID3v22TagMapper.js
var id3v22TagMap = {
  TT2: "title",
  TP1: "artist",
  TP2: "albumartist",
  TAL: "album",
  TYE: "year",
  COM: "comment",
  ULT: "lyrics",
  "IPL:arranger": "arranger",
  "IPL:engineer": "engineer",
  "IPL:producer": "producer",
  "IPL:DJ-mix": "djmixer",
  "IPL:mix": "mixer",
  TRK: "track",
  TPA: "disk",
  TCO: "genre",
  PIC: "picture",
  TCM: "composer",
  TOR: "originaldate",
  TOT: "originalalbum",
  TXT: "lyricist",
  TP3: "conductor",
  TPB: "label",
  TT1: "grouping",
  TT3: "subtitle",
  TLA: "language",
  TCR: "copyright",
  WCP: "license",
  TEN: "encodedby",
  TSS: "encodersettings",
  WAR: "website",
  PCS: "podcast",
  TCP: "compilation",
  TDR: "date",
  TS2: "albumartistsort",
  TSA: "albumsort",
  TSC: "composersort",
  TSP: "artistsort",
  TST: "titlesort",
  WFD: "podcasturl",
  TBP: "bpm",
  GP1: "grouping"
};
var ID3v22TagMapper = class extends CaseInsensitiveTagMap {
  constructor() {
    super(["ID3v2.2"], id3v22TagMap);
  }
};

// ../../node_modules/music-metadata/lib/id3v2/ID3v24TagMapper.js
var id3v24TagMap = {
  // id3v2.3
  TIT2: "title",
  TPE1: "artist",
  "TXXX:Artists": "artists",
  TPE2: "albumartist",
  TALB: "album",
  TDRV: "date",
  // [ 'date', 'year' ] ToDo: improve 'year' mapping
  /**
   * Original release year
   */
  TORY: "originalyear",
  TPOS: "disk",
  TCON: "genre",
  APIC: "picture",
  TCOM: "composer",
  USLT: "lyrics",
  TSOA: "albumsort",
  TSOT: "titlesort",
  TOAL: "originalalbum",
  TSOP: "artistsort",
  TSO2: "albumartistsort",
  TSOC: "composersort",
  TEXT: "lyricist",
  "TXXX:Writer": "writer",
  TPE3: "conductor",
  // 'IPLS:instrument': 'performer:instrument', // ToDo
  TPE4: "remixer",
  "IPLS:arranger": "arranger",
  "IPLS:engineer": "engineer",
  "IPLS:producer": "producer",
  "IPLS:DJ-mix": "djmixer",
  "IPLS:mix": "mixer",
  TPUB: "label",
  TIT1: "grouping",
  TIT3: "subtitle",
  TRCK: "track",
  TCMP: "compilation",
  POPM: "rating",
  TBPM: "bpm",
  TMED: "media",
  "TXXX:CATALOGNUMBER": "catalognumber",
  "TXXX:MusicBrainz Album Status": "releasestatus",
  "TXXX:MusicBrainz Album Type": "releasetype",
  /**
   * Release country as documented: https://picard.musicbrainz.org/docs/mappings/#cite_note-0
   */
  "TXXX:MusicBrainz Album Release Country": "releasecountry",
  /**
   * Release country as implemented // ToDo: report
   */
  "TXXX:RELEASECOUNTRY": "releasecountry",
  "TXXX:SCRIPT": "script",
  TLAN: "language",
  TCOP: "copyright",
  WCOP: "license",
  TENC: "encodedby",
  TSSE: "encodersettings",
  "TXXX:BARCODE": "barcode",
  "TXXX:ISRC": "isrc",
  TSRC: "isrc",
  "TXXX:ASIN": "asin",
  "TXXX:originalyear": "originalyear",
  "UFID:http://musicbrainz.org": "musicbrainz_recordingid",
  "TXXX:MusicBrainz Release Track Id": "musicbrainz_trackid",
  "TXXX:MusicBrainz Album Id": "musicbrainz_albumid",
  "TXXX:MusicBrainz Artist Id": "musicbrainz_artistid",
  "TXXX:MusicBrainz Album Artist Id": "musicbrainz_albumartistid",
  "TXXX:MusicBrainz Release Group Id": "musicbrainz_releasegroupid",
  "TXXX:MusicBrainz Work Id": "musicbrainz_workid",
  "TXXX:MusicBrainz TRM Id": "musicbrainz_trmid",
  "TXXX:MusicBrainz Disc Id": "musicbrainz_discid",
  "TXXX:ACOUSTID_ID": "acoustid_id",
  "TXXX:Acoustid Id": "acoustid_id",
  "TXXX:Acoustid Fingerprint": "acoustid_fingerprint",
  "TXXX:MusicIP PUID": "musicip_puid",
  "TXXX:MusicMagic Fingerprint": "musicip_fingerprint",
  WOAR: "website",
  // id3v2.4
  // ToDo: In same sequence as defined at http://id3.org/id3v2.4.0-frames
  TDRC: "date",
  // date YYYY-MM-DD
  TYER: "year",
  TDOR: "originaldate",
  // 'TMCL:instrument': 'performer:instrument',
  "TIPL:arranger": "arranger",
  "TIPL:engineer": "engineer",
  "TIPL:producer": "producer",
  "TIPL:DJ-mix": "djmixer",
  "TIPL:mix": "mixer",
  TMOO: "mood",
  // additional mappings:
  SYLT: "lyrics",
  TSST: "discsubtitle",
  TKEY: "key",
  COMM: "comment",
  TOPE: "originalartist",
  // Windows Media Player
  "PRIV:AverageLevel": "averageLevel",
  "PRIV:PeakValue": "peakLevel",
  "PRIV:PeakLevel": "peakLevel",
  // Discogs
  "TXXX:DISCOGS_ARTIST_ID": "discogs_artist_id",
  "TXXX:DISCOGS_ARTISTS": "artists",
  "TXXX:DISCOGS_ARTIST_NAME": "artists",
  "TXXX:DISCOGS_ALBUM_ARTISTS": "albumartists",
  "TXXX:DISCOGS_CATALOG": "catalognumber",
  "TXXX:DISCOGS_COUNTRY": "releasecountry",
  "TXXX:DISCOGS_DATE": "originaldate",
  "TXXX:DISCOGS_LABEL": "label",
  "TXXX:DISCOGS_LABEL_ID": "discogs_label_id",
  "TXXX:DISCOGS_MASTER_RELEASE_ID": "discogs_master_release_id",
  "TXXX:DISCOGS_RATING": "discogs_rating",
  "TXXX:DISCOGS_RELEASED": "date",
  "TXXX:DISCOGS_RELEASE_ID": "discogs_release_id",
  "TXXX:DISCOGS_VOTES": "discogs_votes",
  "TXXX:CATALOGID": "catalognumber",
  "TXXX:STYLE": "genre",
  "TXXX:REPLAYGAIN_TRACK_PEAK": "replaygain_track_peak",
  "TXXX:REPLAYGAIN_TRACK_GAIN": "replaygain_track_gain",
  "TXXX:REPLAYGAIN_ALBUM_PEAK": "replaygain_album_peak",
  "TXXX:REPLAYGAIN_ALBUM_GAIN": "replaygain_album_gain",
  "TXXX:MP3GAIN_MINMAX": "replaygain_track_minmax",
  "TXXX:MP3GAIN_ALBUM_MINMAX": "replaygain_album_minmax",
  "TXXX:MP3GAIN_UNDO": "replaygain_undo",
  MVNM: "movement",
  MVIN: "movementIndex",
  PCST: "podcast",
  TCAT: "category",
  TDES: "description",
  TDRL: "releasedate",
  TGID: "podcastId",
  TKWD: "keywords",
  WFED: "podcasturl",
  GRP1: "grouping",
  PCNT: "playCounter"
};
var ID3v24TagMapper = class _ID3v24TagMapper extends CaseInsensitiveTagMap {
  static toRating(popm) {
    return {
      source: popm.email,
      rating: popm.rating > 0 ? (popm.rating - 1) / 254 * CommonTagMapper.maxRatingScore : void 0
    };
  }
  constructor() {
    super(["ID3v2.3", "ID3v2.4"], id3v24TagMap);
  }
  /**
   * Handle post mapping exceptions / correction
   * @param tag to post map
   * @param warnings Wil be used to register (collect) warnings
   */
  postMap(tag, warnings) {
    switch (tag.id) {
      case "UFID":
        {
          const idTag = tag.value;
          if (idTag.owner_identifier === "http://musicbrainz.org") {
            tag.id += `:${idTag.owner_identifier}`;
            tag.value = decodeString(idTag.identifier, "latin1");
          }
        }
        break;
      case "PRIV":
        {
          const customTag = tag.value;
          switch (customTag.owner_identifier) {
            // decode Windows Media Player
            case "AverageLevel":
            case "PeakValue":
            case "PeakLevel":
              tag.id += `:${customTag.owner_identifier}`;
              tag.value = customTag.data.length === 4 ? UINT32_LE.get(customTag.data, 0) : null;
              if (tag.value === null) {
                warnings.addWarning(`Failed to parse PRIV:${customTag.owner_identifier}`);
              }
              break;
            default:
              warnings.addWarning(`Unknown PRIV owner-identifier: ${customTag.owner_identifier.slice(0, 128)}`);
          }
        }
        break;
      case "POPM":
        tag.value = _ID3v24TagMapper.toRating(tag.value);
        break;
      default:
        break;
    }
  }
};

// ../../node_modules/music-metadata/lib/matroska/MatroskaTagMapper.js
var ebmlTagMap = {
  "segment:title": "title",
  "album:ARTIST": "albumartist",
  "album:ARTISTSORT": "albumartistsort",
  "album:TITLE": "album",
  "album:DATE_RECORDED": "originaldate",
  "album:DATE_RELEASED": "releasedate",
  "album:PART_NUMBER": "disk",
  "album:TOTAL_PARTS": "totaltracks",
  // Flat names written by ffmpeg, and tools built on it such as yt-dlp
  "track:ALBUM": "album",
  "track:ALBUM_ARTIST": "albumartist",
  "track:COMPOSER": "composer",
  "track:DATE": "date",
  "track:DISC": "disk",
  "track:ARTIST": "artist",
  "track:ARTISTSORT": "artistsort",
  "track:TITLE": "title",
  "track:PART_NUMBER": "track",
  "track:MUSICBRAINZ_TRACKID": "musicbrainz_recordingid",
  "track:MUSICBRAINZ_ALBUMID": "musicbrainz_albumid",
  "track:MUSICBRAINZ_ARTISTID": "musicbrainz_artistid",
  "track:PUBLISHER": "label",
  "track:GENRE": "genre",
  "track:ENCODER": "encodedby",
  "track:ENCODER_OPTIONS": "encodersettings",
  "edition:TOTAL_PARTS": "totaldiscs",
  picture: "picture"
};
var MatroskaTagMapper = class extends CaseInsensitiveTagMap {
  constructor() {
    super(["matroska"], ebmlTagMap);
  }
  mapGenericTag(tag, warnings) {
    if (tag.id.toUpperCase() === "TRACK:DATE" && typeof tag.value !== "string") {
      return null;
    }
    return super.mapGenericTag(tag, warnings);
  }
};

// ../../node_modules/music-metadata/lib/mp4/MP4TagMapper.js
var mp4TagMap = {
  "mdta:title": "title",
  "mdta:album": "album",
  "mdta:artist": "artist",
  "mdta:album_artist": "albumartist",
  "mdta:albumartist": "albumartist",
  "mdta:composer": "composer",
  "mdta:date": "date",
  "mdta:comment": "comment",
  "mdta:description": "description",
  "mdta:synopsis": "longDescription",
  "mdta:genre": "genre",
  "mdta:track": "track",
  "mdta:disc": "disk",
  "mdta:publisher": "label",
  "mdta:subtitle": "subtitle",
  "mdta:language": "language",
  "mdta:copyright": "copyright",
  "mdta:encoder": "encodedby",
  "mdta:asin": "asin",
  "mdta:com.apple.quicktime.title": "title",
  "mdta:com.apple.quicktime.album": "album",
  "mdta:com.apple.quicktime.artist": "artist",
  "mdta:com.apple.quicktime.creationdate": "date",
  "mdta:com.apple.quicktime.comment": "comment",
  "mdta:com.apple.quicktime.description": "description",
  "mdta:com.apple.quicktime.genre": "genre",
  "mdta:com.apple.quicktime.copyright": "copyright",
  "©nam": "title",
  "©ART": "artist",
  aART: "albumartist",
  /**
   * ToDo: Album artist seems to be stored here while Picard documentation says: aART
   */
  "----:com.apple.iTunes:Band": "albumartist",
  "©alb": "album",
  "©day": "date",
  "©cmt": "comment",
  "©com": "comment",
  trkn: "track",
  disk: "disk",
  "©gen": "genre",
  covr: "picture",
  "©wrt": "composer",
  "©lyr": "lyrics",
  soal: "albumsort",
  sonm: "titlesort",
  soar: "artistsort",
  soaa: "albumartistsort",
  soco: "composersort",
  "----:com.apple.iTunes:LYRICIST": "lyricist",
  "----:com.apple.iTunes:CONDUCTOR": "conductor",
  "----:com.apple.iTunes:REMIXER": "remixer",
  "----:com.apple.iTunes:ENGINEER": "engineer",
  "----:com.apple.iTunes:PRODUCER": "producer",
  "----:com.apple.iTunes:DJMIXER": "djmixer",
  "----:com.apple.iTunes:MIXER": "mixer",
  "----:com.apple.iTunes:LABEL": "label",
  "©grp": "grouping",
  "----:com.apple.iTunes:SUBTITLE": "subtitle",
  "----:com.apple.iTunes:DISCSUBTITLE": "discsubtitle",
  cpil: "compilation",
  tmpo: "bpm",
  "----:com.apple.iTunes:MOOD": "mood",
  "----:com.apple.iTunes:MEDIA": "media",
  "----:com.apple.iTunes:CATALOGNUMBER": "catalognumber",
  tvsh: "tvShow",
  tvsn: "tvSeason",
  tves: "tvEpisode",
  sosn: "tvShowSort",
  tven: "tvEpisodeId",
  tvnn: "tvNetwork",
  pcst: "podcast",
  purl: "podcasturl",
  "----:com.apple.iTunes:MusicBrainz Album Status": "releasestatus",
  "----:com.apple.iTunes:MusicBrainz Album Type": "releasetype",
  "----:com.apple.iTunes:MusicBrainz Album Release Country": "releasecountry",
  "----:com.apple.iTunes:SCRIPT": "script",
  "----:com.apple.iTunes:LANGUAGE": "language",
  cprt: "copyright",
  "©cpy": "copyright",
  "----:com.apple.iTunes:LICENSE": "license",
  "©too": "encodedby",
  pgap: "gapless",
  "----:com.apple.iTunes:BARCODE": "barcode",
  "----:com.apple.iTunes:ISRC": "isrc",
  "----:com.apple.iTunes:ASIN": "asin",
  "----:com.apple.iTunes:NOTES": "comment",
  "----:com.apple.iTunes:MusicBrainz Track Id": "musicbrainz_recordingid",
  "----:com.apple.iTunes:MusicBrainz Release Track Id": "musicbrainz_trackid",
  "----:com.apple.iTunes:MusicBrainz Album Id": "musicbrainz_albumid",
  "----:com.apple.iTunes:MusicBrainz Artist Id": "musicbrainz_artistid",
  "----:com.apple.iTunes:MusicBrainz Album Artist Id": "musicbrainz_albumartistid",
  "----:com.apple.iTunes:MusicBrainz Release Group Id": "musicbrainz_releasegroupid",
  "----:com.apple.iTunes:MusicBrainz Work Id": "musicbrainz_workid",
  "----:com.apple.iTunes:MusicBrainz TRM Id": "musicbrainz_trmid",
  "----:com.apple.iTunes:MusicBrainz Disc Id": "musicbrainz_discid",
  "----:com.apple.iTunes:Acoustid Id": "acoustid_id",
  "----:com.apple.iTunes:Acoustid Fingerprint": "acoustid_fingerprint",
  "----:com.apple.iTunes:MusicIP PUID": "musicip_puid",
  "----:com.apple.iTunes:fingerprint": "musicip_fingerprint",
  "----:com.apple.iTunes:replaygain_track_gain": "replaygain_track_gain",
  "----:com.apple.iTunes:replaygain_track_peak": "replaygain_track_peak",
  "----:com.apple.iTunes:replaygain_album_gain": "replaygain_album_gain",
  "----:com.apple.iTunes:replaygain_album_peak": "replaygain_album_peak",
  "----:com.apple.iTunes:replaygain_track_minmax": "replaygain_track_minmax",
  "----:com.apple.iTunes:replaygain_album_minmax": "replaygain_album_minmax",
  "----:com.apple.iTunes:replaygain_undo": "replaygain_undo",
  "----:com.apple.iTunes:Movement Name": "movement",
  "----:com.apple.iTunes:Movement": "movementIndex",
  "----:com.apple.iTunes:Movement Total": "movementTotal",
  // Additional mappings:
  gnre: "genre",
  // ToDo: check mapping
  "----:com.apple.iTunes:ALBUMARTISTSORT": "albumartistsort",
  "----:com.apple.iTunes:ARTISTS": "artists",
  "----:com.apple.iTunes:ORIGINALDATE": "originaldate",
  "----:com.apple.iTunes:ORIGINALYEAR": "originalyear",
  "----:com.apple.iTunes:RELEASEDATE": "releasedate",
  // '----:com.apple.iTunes:PERFORMER': 'performer'
  desc: "description",
  ldes: "longDescription",
  "©mvn": "movement",
  "©mvi": "movementIndex",
  "©mvc": "movementTotal",
  "©wrk": "work",
  catg: "category",
  egid: "podcastId",
  hdvd: "hdVideo",
  keyw: "keywords",
  shwm: "showMovement",
  stik: "stik",
  rate: "rating"
};
var tagType = "iTunes";
var MP4TagMapper = class extends CaseInsensitiveTagMap {
  constructor() {
    super([tagType], mp4TagMap);
  }
  postMap(tag, _warnings) {
    switch (tag.id) {
      case "rate":
        tag.value = {
          source: void 0,
          rating: Number.parseFloat(tag.value) / 100
        };
        break;
    }
  }
};

// ../../node_modules/music-metadata/lib/ogg/vorbis/VorbisTagMapper.js
var vorbisTagMap = {
  TITLE: "title",
  ARTIST: "artist",
  ARTISTS: "artists",
  ALBUMARTIST: "albumartist",
  "ALBUM ARTIST": "albumartist",
  ALBUM: "album",
  DATE: "date",
  ORIGINALDATE: "originaldate",
  ORIGINALYEAR: "originalyear",
  RELEASEDATE: "releasedate",
  COMMENT: "comment",
  DESCRIPTION: "comment",
  TRACKNUMBER: "track",
  DISCNUMBER: "disk",
  GENRE: "genre",
  METADATA_BLOCK_PICTURE: "picture",
  COMPOSER: "composer",
  LYRICS: "lyrics",
  UNSYNCEDLYRICS: "lyrics",
  ALBUMSORT: "albumsort",
  TITLESORT: "titlesort",
  WORK: "work",
  ARTISTSORT: "artistsort",
  ALBUMARTISTSORT: "albumartistsort",
  COMPOSERSORT: "composersort",
  LYRICIST: "lyricist",
  WRITER: "writer",
  CONDUCTOR: "conductor",
  // 'PERFORMER=artist (instrument)': 'performer:instrument', // ToDo
  REMIXER: "remixer",
  ARRANGER: "arranger",
  ENGINEER: "engineer",
  PRODUCER: "producer",
  DJMIXER: "djmixer",
  MIXER: "mixer",
  LABEL: "label",
  ORGANIZATION: "label",
  PUBLISHER: "label",
  GROUPING: "grouping",
  SUBTITLE: "subtitle",
  DISCSUBTITLE: "discsubtitle",
  TRACKTOTAL: "totaltracks",
  DISCTOTAL: "totaldiscs",
  COMPILATION: "compilation",
  RATING: "rating",
  BPM: "bpm",
  KEY: "key",
  MOOD: "mood",
  MEDIA: "media",
  CATALOGNUMBER: "catalognumber",
  RELEASESTATUS: "releasestatus",
  RELEASETYPE: "releasetype",
  RELEASECOUNTRY: "releasecountry",
  SCRIPT: "script",
  LANGUAGE: "language",
  COPYRIGHT: "copyright",
  LICENSE: "license",
  ENCODEDBY: "encodedby",
  ENCODERSETTINGS: "encodersettings",
  BARCODE: "barcode",
  ISRC: "isrc",
  ASIN: "asin",
  MUSICBRAINZ_TRACKID: "musicbrainz_recordingid",
  MUSICBRAINZ_RELEASETRACKID: "musicbrainz_trackid",
  MUSICBRAINZ_ALBUMID: "musicbrainz_albumid",
  MUSICBRAINZ_ARTISTID: "musicbrainz_artistid",
  MUSICBRAINZ_ALBUMARTISTID: "musicbrainz_albumartistid",
  MUSICBRAINZ_RELEASEGROUPID: "musicbrainz_releasegroupid",
  MUSICBRAINZ_WORKID: "musicbrainz_workid",
  MUSICBRAINZ_TRMID: "musicbrainz_trmid",
  MUSICBRAINZ_DISCID: "musicbrainz_discid",
  ACOUSTID_ID: "acoustid_id",
  ACOUSTID_ID_FINGERPRINT: "acoustid_fingerprint",
  MUSICIP_PUID: "musicip_puid",
  // 'FINGERPRINT=MusicMagic Fingerprint {fingerprint}': 'musicip_fingerprint', // ToDo
  WEBSITE: "website",
  NOTES: "notes",
  TOTALTRACKS: "totaltracks",
  TOTALDISCS: "totaldiscs",
  // Discogs
  DISCOGS_ARTIST_ID: "discogs_artist_id",
  DISCOGS_ARTISTS: "artists",
  DISCOGS_ARTIST_NAME: "artists",
  DISCOGS_ALBUM_ARTISTS: "albumartists",
  DISCOGS_CATALOG: "catalognumber",
  DISCOGS_COUNTRY: "releasecountry",
  DISCOGS_DATE: "originaldate",
  DISCOGS_LABEL: "label",
  DISCOGS_LABEL_ID: "discogs_label_id",
  DISCOGS_MASTER_RELEASE_ID: "discogs_master_release_id",
  DISCOGS_RATING: "discogs_rating",
  DISCOGS_RELEASED: "date",
  DISCOGS_RELEASE_ID: "discogs_release_id",
  DISCOGS_VOTES: "discogs_votes",
  CATALOGID: "catalognumber",
  STYLE: "genre",
  //
  REPLAYGAIN_TRACK_GAIN: "replaygain_track_gain",
  REPLAYGAIN_TRACK_PEAK: "replaygain_track_peak",
  REPLAYGAIN_ALBUM_GAIN: "replaygain_album_gain",
  REPLAYGAIN_ALBUM_PEAK: "replaygain_album_peak",
  // To Sure if these (REPLAYGAIN_MINMAX, REPLAYGAIN_ALBUM_MINMAX & REPLAYGAIN_UNDO) are used for Vorbis:
  REPLAYGAIN_MINMAX: "replaygain_track_minmax",
  REPLAYGAIN_ALBUM_MINMAX: "replaygain_album_minmax",
  REPLAYGAIN_UNDO: "replaygain_undo"
};
var VorbisTagMapper = class _VorbisTagMapper extends CommonTagMapper {
  constructor() {
    super(["vorbis"], vorbisTagMap);
    __publicField(this, "hasStandardDate", false);
  }
  static toRating(email, rating, maxScore) {
    return {
      source: email ? email.toLowerCase() : void 0,
      rating: Number.parseFloat(rating) / maxScore * CommonTagMapper.maxRatingScore
    };
  }
  mapGenericTag(tag, warnings) {
    if (tag.id === "DATE") {
      if (typeof tag.value !== "string" || tag.value.trim().length === 0) {
        return null;
      }
      this.hasStandardDate = true;
    } else if (tag.id === "DISCOGS_RELEASED" && this.hasStandardDate) {
      return null;
    }
    return super.mapGenericTag(tag, warnings);
  }
  postMap(tag) {
    if (tag.id === "RATING") {
      tag.value = _VorbisTagMapper.toRating(void 0, tag.value, 100);
    } else if (tag.id.indexOf("RATING:") === 0) {
      const keys = tag.id.split(":", 2);
      tag.value = _VorbisTagMapper.toRating(keys[1], tag.value, 1);
      tag.id = keys[0];
    }
  }
};

// ../../node_modules/music-metadata/lib/riff/RiffInfoTagMap.js
var riffInfoTagMap = {
  IART: "artist",
  // Artist
  ICRD: "date",
  // DateCreated
  INAM: "title",
  // Title
  TITL: "title",
  IPRD: "album",
  // Product
  ITRK: "track",
  IPRT: "track",
  // Additional tag for track index
  COMM: "comment",
  // Comments
  ICMT: "comment",
  // Country
  ICOP: "copyright",
  ICNT: "releasecountry",
  GNRE: "genre",
  // Genre
  IWRI: "writer",
  // WrittenBy
  RATE: "rating",
  YEAR: "year",
  ISFT: "encodedby",
  // Software
  CODE: "encodedby",
  // EncodedBy
  TURL: "website",
  // URL,
  IGNR: "genre",
  // Genre
  IENG: "engineer",
  // Engineer
  ITCH: "technician",
  // Technician
  IMED: "media",
  // Original Media
  IRPD: "album"
  // Product, where the file was intended for
};
var RiffInfoTagMapper = class extends CommonTagMapper {
  constructor() {
    super(["exif"], riffInfoTagMap);
  }
};

// ../../node_modules/music-metadata/lib/common/CombinedTagMapper.js
var CombinedTagMapper = class {
  constructor() {
    __publicField(this, "tagMappers", {});
    [
      new ID3v1TagMapper(),
      new ID3v22TagMapper(),
      new ID3v24TagMapper(),
      new MP4TagMapper(),
      new VorbisTagMapper(),
      new APEv2TagMapper(),
      new AsfTagMapper(),
      new RiffInfoTagMapper(),
      new MatroskaTagMapper(),
      new AiffTagMapper(),
      new CafTagMapper()
    ].forEach((mapper) => {
      this.registerTagMapper(mapper);
    });
  }
  /**
   * Convert native to generic (common) tags
   * @param tagType Originating tag format
   * @param tag     Native tag to map to a generic tag id
   * @param warnings
   * @return Generic tag result (output of this function)
   */
  mapTag(tagType2, tag, warnings) {
    const tagMapper = this.tagMappers[tagType2];
    if (tagMapper) {
      return this.tagMappers[tagType2].mapGenericTag(tag, warnings);
    }
    throw new InternalParserError(`No generic tag mapper defined for tag-format: ${tagType2}`);
  }
  registerTagMapper(genericTagMapper) {
    for (const tagType2 of genericTagMapper.tagTypes) {
      this.tagMappers[tagType2] = genericTagMapper;
    }
  }
};

// ../../node_modules/music-metadata/lib/common/GenericTagTypes.js
var defaultTagInfo = {
  multiple: false
};
var commonTags = {
  year: defaultTagInfo,
  track: defaultTagInfo,
  disk: defaultTagInfo,
  title: defaultTagInfo,
  artist: defaultTagInfo,
  artists: { multiple: true, unique: true },
  albumartist: defaultTagInfo,
  albumartists: { multiple: true, unique: true },
  album: defaultTagInfo,
  date: defaultTagInfo,
  originaldate: defaultTagInfo,
  originalyear: defaultTagInfo,
  releasedate: defaultTagInfo,
  comment: { multiple: true, unique: false },
  genre: { multiple: true, unique: true },
  picture: { multiple: true, unique: true },
  composer: { multiple: true, unique: true },
  lyrics: { multiple: true, unique: false },
  albumsort: { multiple: false, unique: true },
  titlesort: { multiple: false, unique: true },
  work: { multiple: false, unique: true },
  artistsort: { multiple: false, unique: true },
  albumartistsort: { multiple: false, unique: true },
  composersort: { multiple: false, unique: true },
  lyricist: { multiple: true, unique: true },
  writer: { multiple: true, unique: true },
  conductor: { multiple: true, unique: true },
  remixer: { multiple: true, unique: true },
  arranger: { multiple: true, unique: true },
  engineer: { multiple: true, unique: true },
  publisher: defaultTagInfo,
  producer: { multiple: true, unique: true },
  djmixer: { multiple: true, unique: true },
  mixer: { multiple: true, unique: true },
  technician: { multiple: true, unique: true },
  label: { multiple: true, unique: true },
  grouping: defaultTagInfo,
  subtitle: { multiple: true },
  description: { multiple: true },
  longDescription: defaultTagInfo,
  discsubtitle: defaultTagInfo,
  totaltracks: defaultTagInfo,
  totaldiscs: defaultTagInfo,
  movementTotal: defaultTagInfo,
  compilation: defaultTagInfo,
  rating: { multiple: true },
  bpm: defaultTagInfo,
  mood: defaultTagInfo,
  media: defaultTagInfo,
  catalognumber: { multiple: true, unique: true },
  tvShow: defaultTagInfo,
  tvShowSort: defaultTagInfo,
  tvSeason: defaultTagInfo,
  tvEpisode: defaultTagInfo,
  tvEpisodeId: defaultTagInfo,
  tvNetwork: defaultTagInfo,
  podcast: defaultTagInfo,
  podcasturl: defaultTagInfo,
  releasestatus: defaultTagInfo,
  releasetype: { multiple: true },
  releasecountry: defaultTagInfo,
  script: defaultTagInfo,
  language: defaultTagInfo,
  copyright: defaultTagInfo,
  license: defaultTagInfo,
  encodedby: defaultTagInfo,
  encodersettings: defaultTagInfo,
  gapless: defaultTagInfo,
  barcode: defaultTagInfo,
  isrc: { multiple: true },
  asin: defaultTagInfo,
  musicbrainz_recordingid: defaultTagInfo,
  musicbrainz_trackid: defaultTagInfo,
  musicbrainz_albumid: defaultTagInfo,
  musicbrainz_artistid: { multiple: true },
  musicbrainz_albumartistid: { multiple: true },
  musicbrainz_releasegroupid: defaultTagInfo,
  musicbrainz_workid: defaultTagInfo,
  musicbrainz_trmid: defaultTagInfo,
  musicbrainz_discid: defaultTagInfo,
  acoustid_id: defaultTagInfo,
  acoustid_fingerprint: defaultTagInfo,
  musicip_puid: defaultTagInfo,
  musicip_fingerprint: defaultTagInfo,
  website: defaultTagInfo,
  "performer:instrument": { multiple: true, unique: true },
  averageLevel: defaultTagInfo,
  peakLevel: defaultTagInfo,
  notes: { multiple: true, unique: false },
  originalalbum: defaultTagInfo,
  originalartist: defaultTagInfo,
  discogs_artist_id: { multiple: true, unique: true },
  discogs_release_id: defaultTagInfo,
  discogs_label_id: defaultTagInfo,
  discogs_master_release_id: defaultTagInfo,
  discogs_votes: defaultTagInfo,
  discogs_rating: defaultTagInfo,
  replaygain_track_gain_ratio: defaultTagInfo,
  replaygain_track_peak_ratio: defaultTagInfo,
  replaygain_track_gain: defaultTagInfo,
  replaygain_track_peak: defaultTagInfo,
  replaygain_album_gain: defaultTagInfo,
  replaygain_album_peak: defaultTagInfo,
  replaygain_undo: defaultTagInfo,
  replaygain_track_minmax: defaultTagInfo,
  replaygain_album_minmax: defaultTagInfo,
  key: defaultTagInfo,
  category: { multiple: true },
  hdVideo: defaultTagInfo,
  keywords: { multiple: true },
  movement: defaultTagInfo,
  movementIndex: defaultTagInfo,
  podcastId: defaultTagInfo,
  showMovement: defaultTagInfo,
  stik: defaultTagInfo,
  playCounter: defaultTagInfo
};
var commonTagsKeys = Object.keys(commonTags);
function isSingleton(alias) {
  return !!commonTags[alias] && !commonTags[alias].multiple;
}
function isUnique(alias) {
  const info = commonTags[alias];
  return !(info == null ? void 0 : info.multiple) || info.unique || false;
}

// ../../node_modules/music-metadata/lib/common/MetadataCollector.js
var debug2 = (0, import_debug2.default)("music-metadata:collector");
var TagPriority = [
  "matroska",
  "APEv2",
  "vorbis",
  "ID3v2.4",
  "ID3v2.3",
  "ID3v2.2",
  "exif",
  "asf",
  "iTunes",
  "AIFF",
  "CAF",
  "ID3v1"
];
var MetadataCollector = class {
  constructor(opts) {
    __publicField(this, "format", {
      tagTypes: [],
      trackInfo: []
    });
    __publicField(this, "native", {});
    __publicField(this, "common", {
      track: { no: null, of: null },
      disk: { no: null, of: null },
      movementIndex: { no: null, of: null }
    });
    __publicField(this, "quality", {
      warnings: []
    });
    /**
     * Keeps track of origin priority for each mapped id
     */
    __publicField(this, "commonOrigin", {});
    /**
     * Maps a tag type to a priority
     */
    __publicField(this, "originPriority", {});
    __publicField(this, "tagMapper", new CombinedTagMapper());
    __publicField(this, "opts");
    this.opts = opts;
    let priority = 1;
    for (const tagType2 of TagPriority) {
      this.originPriority[tagType2] = priority++;
    }
    this.originPriority.artificial = 500;
    this.originPriority.id3v1 = 600;
  }
  get nativeTyped() {
    return toNativeTyped(this.native);
  }
  /**
   * @returns {boolean} true if one or more tags have been found
   */
  hasAny() {
    return Object.keys(this.native).length > 0;
  }
  addStreamInfo(streamInfo) {
    debug2(`streamInfo: type=${streamInfo.type ? TrackTypeValueToKeyMap[streamInfo.type] : "?"}, codec=${streamInfo.codecName}`);
    if (normalizeBitrate(streamInfo.bitrate) === void 0) {
      delete streamInfo.bitrate;
    }
    this.format.trackInfo.push(streamInfo);
  }
  setFormat(key, value) {
    var _a;
    if ((value === null || typeof value !== "object") && Object.is(this.format[key], value)) {
      return;
    }
    debug2(`format: ${key} = ${value}`);
    this.format[key] = value;
    if ((_a = this.opts) == null ? void 0 : _a.observer) {
      this.opts.observer({ metadata: this, tag: { type: "format", id: key, value } });
    }
  }
  setAudioOnly() {
    this.setFormat("hasAudio", true);
    this.setFormat("hasVideo", false);
  }
  registerTagType(tagType2) {
    if (!this.format.tagTypes.includes(tagType2)) {
      this.format.tagTypes.push(tagType2);
    }
  }
  async addTag(tagType2, tagId, value) {
    debug2("tag %s.%s = %o", tagType2, tagId, value);
    if (!this.native[tagType2]) {
      this.registerTagType(tagType2);
      this.native[tagType2] = [];
    }
    this.native[tagType2].push({ id: tagId, value });
    await this.toCommon(tagType2, tagId, value);
  }
  addWarning(warning) {
    this.quality.warnings.push({ message: warning });
  }
  async postMap(tagType2, tag) {
    switch (tag.id) {
      case "artist":
        return this.handleSingularArtistTag(tagType2, tag, "artist", "artists");
      case "albumartist":
        return this.handleSingularArtistTag(tagType2, tag, "albumartist", "albumartists");
      case "artists":
        return this.handlePluralArtistTag(tagType2, tag, "artist", "artists");
      case "albumartists":
        return this.handlePluralArtistTag(tagType2, tag, "albumartist", "albumartists");
      case "picture":
        return this.postFixPicture(tag.value).then((picture) => {
          if (picture !== null) {
            tag.value = picture;
            this.setGenericTag(tagType2, tag);
          }
        });
      case "totaltracks":
        this.common.track.of = CommonTagMapper.toIntOrNull(tag.value);
        this.notifyCommonTag({ id: "track", value: { ...this.common.track } });
        return;
      case "totaldiscs":
        this.common.disk.of = CommonTagMapper.toIntOrNull(tag.value);
        this.notifyCommonTag({ id: "disk", value: { ...this.common.disk } });
        return;
      case "movementTotal":
        this.common.movementIndex.of = CommonTagMapper.toIntOrNull(tag.value);
        this.notifyCommonTag({ id: "movementIndex", value: { ...this.common.movementIndex } });
        return;
      case "track":
      case "disk":
      case "movementIndex": {
        const of = this.common[tag.id].of;
        this.common[tag.id] = CommonTagMapper.normalizeTrack(tag.value);
        this.common[tag.id].of = of != null ? of : this.common[tag.id].of;
        this.notifyCommonTag({ id: tag.id, value: { ...this.common[tag.id] } });
        return;
      }
      case "bpm":
      case "year":
      case "originalyear":
        tag.value = Number.parseInt(tag.value, 10);
        break;
      case "date": {
        const year = Number.parseInt(tag.value.substr(0, 4), 10);
        if (!Number.isNaN(year)) {
          this.common.year = year;
        }
        break;
      }
      case "discogs_label_id":
      case "discogs_release_id":
      case "discogs_master_release_id":
      case "discogs_artist_id":
      case "discogs_votes":
        tag.value = typeof tag.value === "string" ? Number.parseInt(tag.value, 10) : tag.value;
        break;
      case "replaygain_track_gain":
      case "replaygain_track_peak":
      case "replaygain_album_gain":
      case "replaygain_album_peak": {
        const ratio = toRatio(tag.value);
        if (!ratio) {
          this.addWarning(`Invalid ReplayGain value for ${tagType2}.${tag.id}`);
          return;
        }
        tag.value = ratio;
        break;
      }
      case "replaygain_track_minmax":
        tag.value = tag.value.split(",", 2).map((v) => Number.parseInt(v, 10));
        break;
      case "replaygain_undo": {
        const minMix = tag.value.split(",", 2).map((v) => Number.parseInt(v, 10));
        tag.value = {
          leftChannel: minMix[0],
          rightChannel: minMix[1]
        };
        break;
      }
      case "gapless":
      // iTunes gap-less flag
      case "compilation":
      case "podcast":
      case "showMovement":
        tag.value = tag.value === "1" || tag.value === 1 || tag.value === true;
        break;
      case "isrc": {
        const commonTag = this.common[tag.id];
        if (commonTag && commonTag.indexOf(tag.value) !== -1) {
          return;
        }
        break;
      }
      case "comment":
        if (typeof tag.value === "string") {
          tag.value = { text: tag.value };
        }
        if (tag.value.descriptor === "iTunPGAP") {
          this.setGenericTag(tagType2, { id: "gapless", value: tag.value.text === "1" });
        }
        break;
      case "lyrics":
        if (typeof tag.value === "string") {
          tag.value = parseLyrics(tag.value, getMaxMetadataEntries(this.opts ?? {}));
        } else if (tag.value && typeof tag.value === "object" && !Array.isArray(tag.value)) {
          tag.value = normalizeLyricsTag(tag.value);
        }
        break;
      default:
    }
    if (tag.value !== null) {
      this.setGenericTag(tagType2, tag);
    }
  }
  /**
   * Convert native tags to common tags
   * @returns {IAudioMetadata} Native + common tags
   */
  toCommonMetadata() {
    return {
      format: this.format,
      native: this.native,
      get nativeTyped() {
        return toNativeTyped(this.native);
      },
      quality: this.quality,
      common: this.common
    };
  }
  /**
   * Handle singular artist tags (artist, albumartist) and cross-populate to plural form
   */
  handleSingularArtistTag(tagType2, tag, singularId, pluralId) {
    if (this.commonOrigin[singularId] === this.originPriority[tagType2]) {
      return this.postMap("artificial", { id: pluralId, value: tag.value });
    }
    if (!this.common[pluralId]) {
      this.setGenericTag("artificial", { id: pluralId, value: tag.value });
    }
    this.setGenericTag(tagType2, tag);
  }
  /**
   * Handle plural artist tags (artists, albumartists) and cross-populate to singular form
   */
  handlePluralArtistTag(tagType2, tag, singularId, pluralId) {
    if (!this.common[singularId] || this.commonOrigin[singularId] === this.originPriority.artificial) {
      if (!this.common[pluralId] || this.common[pluralId].indexOf(tag.value) === -1) {
        const values = (this.common[pluralId] || []).concat([tag.value]);
        const value = joinArtists(values);
        this.setGenericTag("artificial", { id: singularId, value });
      }
    }
    this.setGenericTag(tagType2, tag);
  }
  /**
   * Fix some common issues with picture object
   * @param picture Picture
   */
  async postFixPicture(picture) {
    if (picture.data && picture.data.length > 0) {
      if (!picture.format) {
        const fileType = await fileTypeFromBuffer(Uint8Array.from(picture.data), {
          maxBufferSize: getMaxMemoryAllocation(this.opts ?? {})
        });
        if (fileType) {
          picture.format = fileType.mime;
        } else {
          return null;
        }
      }
      picture.format = picture.format.toLocaleLowerCase();
      switch (picture.format) {
        case "image/jpg":
          picture.format = "image/jpeg";
      }
      return picture;
    }
    this.addWarning("Empty picture tag found");
    return null;
  }
  /**
   * Convert native tag to common tags
   */
  async toCommon(tagType2, tagId, value) {
    if ((tagType2 === "ID3v2.2" && tagId === "IPL" || tagType2 === "ID3v2.3" && tagId === "IPLS" || tagType2 === "ID3v2.4" && tagId === "TIPL") && value !== null && typeof value === "object") {
      for (const [role, people] of Object.entries(value)) {
        if (Array.isArray(people)) {
          for (const person of people) {
            if (typeof person === "string" && person.length > 0) {
              await this.toCommon(tagType2, `${tagId}:${role}`, person);
            }
          }
        }
      }
      return;
    }
    const tag = { id: tagId, value };
    const genericTag = this.tagMapper.mapTag(tagType2, tag, this);
    if (genericTag) {
      if (Array.isArray(genericTag.value)) {
        for (const value2 of genericTag.value) {
          await this.postMap(tagType2, { id: genericTag.id, value: value2 });
        }
      } else {
        await this.postMap(tagType2, genericTag);
      }
    }
  }
  /**
   * Set generic tag
   */
  setGenericTag(tagType2, tag) {
    debug2(`common.${tag.id} = ${tag.value}`);
    const prio0 = this.commonOrigin[tag.id] || 1e3;
    const prio1 = this.originPriority[tagType2];
    if (isSingleton(tag.id)) {
      if (prio1 <= prio0) {
        this.common[tag.id] = tag.value;
        this.commonOrigin[tag.id] = prio1;
      } else {
        return debug2(`Ignore native tag (singleton): ${tagType2}.${tag.id} = ${tag.value}`);
      }
    } else {
      if (prio1 === prio0) {
        if (!isUnique(tag.id) || this.common[tag.id].indexOf(tag.value) === -1) {
          this.common[tag.id].push(tag.value);
        } else {
          return debug2(`Ignore duplicate value: ${tagType2}.${tag.id} = ${tag.value}`);
        }
      } else if (prio1 < prio0) {
        this.common[tag.id] = [tag.value];
        this.commonOrigin[tag.id] = prio1;
      } else {
        return debug2(`Ignore native tag (list): ${tagType2}.${tag.id} = ${tag.value}`);
      }
    }
    this.notifyCommonTag(tag);
  }
  notifyCommonTag(tag) {
    var _a;
    if ((_a = this.opts) == null ? void 0 : _a.observer) {
      this.opts.observer({ metadata: this, tag: { type: "common", id: tag.id, value: tag.value } });
    }
  }
};
function joinArtists(artists) {
  if (artists.length > 2) {
    return `${artists.slice(0, artists.length - 1).join(", ")} & ${artists[artists.length - 1]}`;
  }
  return artists.join(" & ");
}

export {
  fileTypeFromBuffer,
  fileTypeFromTokenizer,
  createAudioTrackInfo,
  finalizeContainerInfo,
  MetadataCollector
};
//# sourceMappingURL=chunk-6PCIRQPE.js.map
