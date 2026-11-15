import {
  AbstractID3Parser
} from "./chunk-EBAAFBLW.js";
import {
  BlockHeader,
  BlockType,
  VorbisDecoder,
  decodeBase64,
  decodePicture
} from "./chunk-ZTPD4JNR.js";
import {
  FourCcToken
} from "./chunk-E7VQDEJP.js";
import {
  getBitAllignedNumber
} from "./chunk-O76RKEBI.js";
import {
  INT32_LE,
  StringType,
  UINT16_BE,
  UINT24_BE,
  UINT32_LE,
  UINT8,
  Uint8ArrayType,
  defaultMaxMetadataEntries,
  getMaxMetadataEntries,
  makeUnexpectedFileContentError,
  validateAllocation
} from "./chunk-3HBPJLK7.js";
import {
  require_browser
} from "./chunk-ZGKN2RSD.js";
import {
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/flac/FlacParser.js
var import_debug2 = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/ogg/vorbis/Vorbis.js
var VorbisPictureToken = class _VorbisPictureToken {
  constructor(len, options = {}) {
    __publicField(this, "options");
    __publicField(this, "len");
    this.options = options;
    this.len = len;
  }
  static fromBase64(base64str) {
    return _VorbisPictureToken.fromBuffer(decodeBase64(base64str));
  }
  static fromBuffer(buffer) {
    const pic = new _VorbisPictureToken(buffer.length);
    return pic.get(buffer, 0);
  }
  get(buffer, offset) {
    return decodePicture(buffer.subarray(offset, offset + this.len), 0, this.options);
  }
};
var CommonHeader = {
  len: 7,
  get: (buf, off) => {
    return {
      packetType: UINT8.get(buf, off),
      vorbis: new StringType(6, "ascii").get(buf, off + 1)
    };
  }
};
var IdentificationHeader = {
  len: 23,
  get: (uint8Array, off) => {
    return {
      version: UINT32_LE.get(uint8Array, off + 0),
      channelMode: UINT8.get(uint8Array, off + 4),
      sampleRate: UINT32_LE.get(uint8Array, off + 5),
      bitrateMax: INT32_LE.get(uint8Array, off + 9),
      bitrateNominal: INT32_LE.get(uint8Array, off + 13),
      bitrateMin: INT32_LE.get(uint8Array, off + 17)
    };
  }
};

// ../../node_modules/music-metadata/lib/ogg/vorbis/VorbisDecoder.js
var VorbisCommentError = class extends makeUnexpectedFileContentError("Vorbis") {
};
var VorbisDecoder2 = class extends VorbisDecoder {
  constructor(data, offset = 0, options = {}) {
    super(data, offset, {
      createError: (message) => new VorbisCommentError(message),
      maxComments: options.maxComments ?? defaultMaxMetadataEntries
    });
  }
  parseUserComment() {
    const tag = super.parseUserComment();
    return { ...tag, key: tag.key.toUpperCase() };
  }
  parseCommentList(createCountError, maxComments) {
    return super.parseCommentList(createCountError, maxComments);
  }
};

// ../../node_modules/music-metadata/lib/ogg/vorbis/VorbisStream.js
var import_debug = __toESM(require_browser(), 1);
var debug = (0, import_debug.default)("music-metadata:parser:ogg:vorbis1");
var VorbisContentError = class extends makeUnexpectedFileContentError("Vorbis") {
};
var VorbisStream = class {
  constructor(metadata, options) {
    __publicField(this, "pageSegments", []);
    __publicField(this, "bufferedPageLength", 0);
    __publicField(this, "metadata");
    __publicField(this, "options");
    __publicField(this, "lastPageHeader");
    __publicField(this, "maxBufferedSegments");
    __publicField(this, "durationOnLastPage", true);
    __publicField(this, "isMetadataComplete", false);
    this.metadata = metadata;
    this.options = options;
    this.maxBufferedSegments = getMaxMetadataEntries(options);
  }
  /**
   * Vorbis 1 parser
   * @param header Ogg Page Header
   * @param pageData Page data
   */
  async parsePage(header, pageData) {
    this.lastPageHeader = header;
    if (header.headerType.firstPage) {
      this.parseFirstPage(header, pageData);
    } else {
      if (header.headerType.continued) {
        if (this.pageSegments.length === 0) {
          throw new VorbisContentError("Cannot continue on previous page");
        }
        validateAllocation(this.bufferedPageLength + pageData.length, this.options);
        if (this.pageSegments.length >= this.maxBufferedSegments) {
          throw new VorbisContentError("Buffered Ogg page count exceeds entry limit");
        }
        this.pageSegments.push(pageData);
        this.bufferedPageLength += pageData.length;
      }
      if (header.headerType.lastPage || !header.headerType.continued) {
        if (this.pageSegments.length > 0) {
          const fullPage = this.mergeUint8Arrays(this.pageSegments);
          await this.parseFullPage(fullPage);
        }
        this.bufferedPageLength = header.headerType.lastPage ? 0 : pageData.length;
        validateAllocation(this.bufferedPageLength, this.options);
        this.pageSegments = header.headerType.lastPage ? [] : [pageData];
      }
    }
  }
  mergeUint8Arrays(arrays) {
    const totalSize = arrays.reduce((acc, e) => acc + e.length, 0);
    validateAllocation(totalSize, this.options);
    const merged = new Uint8Array(totalSize);
    let offset = 0;
    for (const array of arrays) {
      merged.set(array, offset);
      offset += array.length;
    }
    return merged;
  }
  async flush() {
    if (this.pageSegments.length === 0) {
      return;
    }
    await this.parseFullPage(this.mergeUint8Arrays(this.pageSegments));
  }
  async parseUserComment(pageData, offset) {
    const decoder = new VorbisDecoder2(pageData, offset);
    const tag = decoder.parseUserComment();
    await this.addTag(tag.key, tag.value);
    return tag.len;
  }
  async addTag(id, value) {
    if (id === "METADATA_BLOCK_PICTURE" && typeof value === "string") {
      if (this.options.skipCovers) {
        debug("Ignore picture");
        return;
      }
      value = VorbisPictureToken.fromBase64(value);
      debug(`Push picture: id=${id}, format=${value.format}`);
    } else {
      debug(`Push tag: id=${id}, value=${value}`);
    }
    await this.metadata.addTag("vorbis", id, value);
  }
  calculateDuration(enfOfStream) {
    if (this.lastPageHeader && (enfOfStream || this.lastPageHeader.headerType.lastPage) && this.metadata.format.sampleRate && this.lastPageHeader.absoluteGranulePosition >= 0) {
      this.metadata.setFormat("numberOfSamples", this.lastPageHeader.absoluteGranulePosition);
      this.metadata.setFormat("duration", this.lastPageHeader.absoluteGranulePosition / this.metadata.format.sampleRate);
    }
  }
  /**
   * Parse first Ogg/Vorbis page
   * @param _header
   * @param pageData
   */
  parseFirstPage(_header, pageData) {
    this.metadata.setFormat("codec", "Vorbis I");
    this.metadata.setFormat("lossless", false);
    this.metadata.setFormat("hasAudio", true);
    debug("Parse first page");
    if (pageData.length < CommonHeader.len) {
      throw new VorbisContentError("Truncated Vorbis packet header");
    }
    const commonHeader = CommonHeader.get(pageData, 0);
    if (commonHeader.vorbis !== "vorbis") {
      throw new VorbisContentError("Metadata does not look like Vorbis");
    }
    if (commonHeader.packetType === 1) {
      if (pageData.length < CommonHeader.len + IdentificationHeader.len) {
        throw new VorbisContentError("Truncated Vorbis identification header");
      }
      const idHeader = IdentificationHeader.get(pageData, CommonHeader.len);
      this.metadata.setFormat("sampleRate", idHeader.sampleRate);
      this.metadata.setFormat("bitrate", idHeader.bitrateNominal);
      this.metadata.setFormat("numberOfChannels", idHeader.channelMode);
      debug("sample-rate=%s[hz], bitrate=%s[b/s], channel-mode=%s", idHeader.sampleRate, idHeader.bitrateNominal, idHeader.channelMode);
    } else {
      throw new VorbisContentError("First Ogg page should be type 1: the identification header");
    }
  }
  async parseFullPage(pageData) {
    if (pageData.length > 0 && (pageData[0] & 1) === 0) {
      return;
    }
    if (pageData.length < CommonHeader.len) {
      throw new VorbisContentError("Truncated Vorbis packet header");
    }
    const commonHeader = CommonHeader.get(pageData, 0);
    debug("Parse full page: type=%s, byteLength=%s", commonHeader.packetType, pageData.byteLength);
    switch (commonHeader.packetType) {
      case 3:
        return this.parseUserCommentList(pageData, CommonHeader.len);
      case 1:
      // type 1: the identification header
      case 5:
        break;
    }
  }
  /**
   * Ref: https://xiph.org/vorbis/doc/Vorbis_I_spec.html#x1-840005.2
   */
  async parseUserCommentList(pageData, offset) {
    const { comments } = new VorbisDecoder2(pageData, offset).parseCommentList((message) => new VorbisContentError(message), getMaxMetadataEntries(this.options));
    for (const tag of comments) {
      await this.addTag(tag.key, tag.value);
    }
    this.isMetadataComplete = true;
  }
};

// ../../node_modules/music-metadata/lib/flac/FlacToken.js
var BlockStreamInfo = {
  len: 34,
  get: (buf, off) => {
    return {
      // The minimum block size (in samples) used in the stream.
      minimumBlockSize: UINT16_BE.get(buf, off),
      // The maximum block size (in samples) used in the stream.
      // (Minimum blocksize == maximum blocksize) implies a fixed-blocksize stream.
      maximumBlockSize: UINT16_BE.get(buf, off + 2),
      // The minimum frame size (in bytes) used in the stream.
      // May be 0 to imply the value is not known.
      minimumFrameSize: UINT24_BE.get(buf, off + 4),
      // The maximum frame size (in bytes) used in the stream.
      // May be 0 to imply the value is not known.
      maximumFrameSize: UINT24_BE.get(buf, off + 7),
      // Sample rate in Hz. Though 20 bits are available,
      // the maximum sample rate is limited by the structure of frame headers to 655350Hz.
      // Also, a value of 0 is invalid.
      sampleRate: UINT24_BE.get(buf, off + 10) >> 4,
      // probably slower: sampleRate: common.getBitAllignedNumber(buf, off + 10, 0, 20),
      // (number of channels)-1. FLAC supports from 1 to 8 channels
      channels: getBitAllignedNumber(buf, off + 12, 4, 3) + 1,
      // bits per sample)-1.
      // FLAC supports from 4 to 32 bits per sample. Currently the reference encoder and decoders only support up to 24 bits per sample.
      bitsPerSample: getBitAllignedNumber(buf, off + 12, 7, 5) + 1,
      // Total samples in stream.
      // 'Samples' means inter-channel sample, i.e. one second of 44.1Khz audio will have 44100 samples regardless of the number of channels.
      // A value of zero here means the number of total samples is unknown.
      totalSamples: getBitAllignedNumber(buf, off + 13, 4, 36),
      // the MD5 hash of the file (see notes for usage... it's a littly tricky)
      fileMD5: new Uint8ArrayType(16).get(buf, off + 18)
    };
  }
};

// ../../node_modules/music-metadata/lib/flac/FlacParser.js
var debug2 = (0, import_debug2.default)("music-metadata:parser:FLAC");
var FlacContentError = class extends makeUnexpectedFileContentError("FLAC") {
};
var FlacParser = class extends AbstractID3Parser {
  constructor() {
    super(...arguments);
    __publicField(this, "vorbisParser", new VorbisStream(this.metadata, this.options));
  }
  async postId3v2Parse() {
    const fourCC = await this.readToken(FourCcToken);
    if (fourCC.toString() !== "fLaC") {
      throw new FlacContentError("Invalid FLAC preamble");
    }
    let blockHeader;
    do {
      blockHeader = await this.readToken(BlockHeader);
      await this.parseDataBlock(blockHeader);
    } while (!blockHeader.lastBlock);
    if (this.tokenizer.fileInfo.size && this.metadata.format.duration) {
      const dataSize = this.tokenizer.fileInfo.size - this.tokenizer.position;
      this.metadata.setFormat("bitrate", 8 * dataSize / this.metadata.format.duration);
    }
  }
  async parseDataBlock(blockHeader) {
    debug2(`blockHeader type=${blockHeader.type}, length=${blockHeader.length}`);
    switch (blockHeader.type) {
      case BlockType.STREAMINFO:
        return this.readBlockStreamInfo(blockHeader.length);
      case BlockType.PADDING:
        break;
      case BlockType.APPLICATION:
        break;
      case BlockType.SEEKTABLE:
        break;
      case BlockType.VORBIS_COMMENT:
        return this.readComment(blockHeader.length);
      case BlockType.CUESHEET:
        break;
      case BlockType.PICTURE:
        await this.parsePicture(blockHeader.length);
        return;
      default:
        this.metadata.addWarning(`Unknown block type: ${blockHeader.type}`);
    }
    return this.tokenizer.ignore(blockHeader.length).then();
  }
  /**
   * Parse STREAMINFO
   */
  async readBlockStreamInfo(dataLen) {
    if (dataLen !== BlockStreamInfo.len) {
      throw new FlacContentError("Unexpected block-stream-info length");
    }
    const streamInfo = await this.readToken(BlockStreamInfo);
    this.metadata.setFormat("container", "FLAC");
    this.processsStreamInfo(streamInfo);
  }
  /**
   * Parse STREAMINFO
   */
  processsStreamInfo(streamInfo) {
    this.metadata.setFormat("codec", "FLAC");
    this.metadata.setFormat("hasAudio", true);
    this.metadata.setFormat("lossless", true);
    this.metadata.setFormat("numberOfChannels", streamInfo.channels);
    this.metadata.setFormat("bitsPerSample", streamInfo.bitsPerSample);
    this.metadata.setFormat("sampleRate", streamInfo.sampleRate);
    if (streamInfo.totalSamples > 0) {
      this.metadata.setFormat("duration", streamInfo.totalSamples / streamInfo.sampleRate);
    }
  }
  /**
   * Read VORBIS_COMMENT from tokenizer
   * Ref: https://www.xiph.org/vorbis/doc/Vorbis_I_spec.html#x1-640004.2.3
   */
  async readComment(dataLen) {
    const data = await this.readToken(new Uint8ArrayType(dataLen));
    return this.parseComment(data);
  }
  /**
   * Parse VORBIS_COMMENT
   * Ref: https://www.xiph.org/vorbis/doc/Vorbis_I_spec.html#x1-640004.2.3
   */
  async parseComment(data) {
    const decoder = new VorbisDecoder2(data, 0);
    const { vendor, comments } = decoder.parseCommentList((message) => new FlacContentError(message), getMaxMetadataEntries(this.options));
    if (vendor.length > 0) {
      this.metadata.setFormat("tool", vendor);
    }
    for (const tag of comments) {
      if (tag.key === "ENCODER") {
        this.metadata.setFormat("tool", tag.value);
      }
      await this.addTag(tag.key, tag.value);
    }
  }
  async parsePicture(dataLen) {
    if (this.options.skipCovers) {
      return this.tokenizer.ignore(dataLen);
    }
    return this.addPictureTag(await this.readToken(new VorbisPictureToken(dataLen, { createError: (message) => new FlacContentError(message) })));
  }
  addPictureTag(picture) {
    return this.addTag("METADATA_BLOCK_PICTURE", picture);
  }
  addTag(id, value) {
    return this.vorbisParser.addTag(id, value);
  }
};

export {
  VorbisPictureToken,
  VorbisStream,
  BlockStreamInfo,
  FlacParser
};
//# sourceMappingURL=chunk-O2L3JF53.js.map
