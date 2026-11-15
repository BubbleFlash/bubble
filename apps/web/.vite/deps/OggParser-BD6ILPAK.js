import {
  BlockStreamInfo,
  FlacParser,
  VorbisPictureToken,
  VorbisStream
} from "./chunk-O2L3JF53.js";
import "./chunk-EBAAFBLW.js";
import "./chunk-7DCDJDGP.js";
import {
  MetadataCollector,
  createAudioTrackInfo
} from "./chunk-6PCIRQPE.js";
import {
  TrackType
} from "./chunk-XS2AH7GC.js";
import {
  BlockHeader,
  BlockType
} from "./chunk-ZTPD4JNR.js";
import "./chunk-47WSSSOY.js";
import {
  FourCcToken
} from "./chunk-E7VQDEJP.js";
import "./chunk-GQBXDRBH.js";
import {
  getBit,
  trimRightNull
} from "./chunk-O76RKEBI.js";
import {
  BasicParser,
  EndOfStreamError,
  INT32_LE,
  StringType,
  UINT16_BE,
  UINT16_LE,
  UINT24_BE,
  UINT32_BE,
  UINT32_LE,
  UINT64_LE,
  UINT8,
  Uint8ArrayType,
  getMaxMetadataEntries,
  makeUnexpectedFileContentError,
  readToken,
  validateAllocation
} from "./chunk-3HBPJLK7.js";
import {
  require_browser
} from "./chunk-ZGKN2RSD.js";
import {
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/ogg/OggParser.js
var import_debug4 = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/ogg/flac/FlacStream.js
var import_debug = __toESM(require_browser(), 1);
var FlacContentError = class extends makeUnexpectedFileContentError("FLAC") {
};
var debug = (0, import_debug.default)("music-metadata:parser:ogg:flac");
var FlacStream = class {
  constructor(metadata, options, tokenizer) {
    __publicField(this, "metadata");
    __publicField(this, "options");
    __publicField(this, "flacParser");
    __publicField(this, "lastPageHeader");
    __publicField(this, "lastGranulePosition");
    __publicField(this, "durationOnLastPage", true);
    __publicField(this, "isMetadataComplete", false);
    __publicField(this, "identified", false);
    __publicField(this, "packetParts", []);
    __publicField(this, "packetLength", 0);
    this.metadata = metadata;
    this.options = options;
    this.flacParser = new FlacParser(this.metadata, tokenizer, options);
  }
  /** Assemble metadata packets using the page lacing table. */
  async parsePage(header, pageData, lacingValues = new Uint8Array()) {
    this.lastPageHeader = header;
    if (header.absoluteGranulePosition >= 0) {
      this.lastGranulePosition = header.absoluteGranulePosition;
    }
    if (this.isMetadataComplete) {
      return;
    }
    if (header.headerType.continued !== this.packetLength > 0) {
      throw new FlacContentError("Invalid Ogg/FLAC packet continuation");
    }
    if (lacingValues.reduce((sum, length) => sum + length, 0) !== pageData.length) {
      throw new FlacContentError("Ogg/FLAC lacing does not match page data");
    }
    let offset = 0;
    for (const length of lacingValues) {
      validateAllocation(this.packetLength + length, this.options);
      if (length > 0) {
        if (this.packetParts.length >= getMaxMetadataEntries(this.options)) {
          throw new FlacContentError("Buffered Ogg/FLAC segment count exceeds entry limit");
        }
        this.packetParts.push(pageData.subarray(offset, offset + length));
        this.packetLength += length;
      }
      offset += length;
      if (length < 255) {
        const packet = new Uint8Array(this.packetLength);
        let position = 0;
        for (const part of this.packetParts) {
          packet.set(part, position);
          position += part.length;
        }
        this.packetParts = [];
        this.packetLength = 0;
        await this.parsePacket(packet);
        if (this.isMetadataComplete) {
          break;
        }
      }
    }
    if (header.headerType.lastPage) {
      await this.flush();
    }
  }
  async parsePacket(packet) {
    if (!this.identified) {
      await this.parseFirstPage(packet);
      this.identified = true;
      return;
    }
    if (packet.length < BlockHeader.len) {
      throw new FlacContentError("Truncated Ogg/FLAC metadata header");
    }
    const header = BlockHeader.get(packet, 0);
    if (header.type === BlockType.STREAMINFO) {
      throw new FlacContentError("Unexpected repeated Ogg/FLAC STREAMINFO");
    }
    if (header.length !== packet.length - BlockHeader.len) {
      throw new FlacContentError("Ogg/FLAC metadata block length does not match packet");
    }
    await this.parseDataBlock(header, packet.subarray(BlockHeader.len));
    this.isMetadataComplete = header.lastBlock;
  }
  calculateDuration(enfOfStream) {
    if (this.lastPageHeader && (enfOfStream || this.lastPageHeader.headerType.lastPage) && this.metadata.format.sampleRate && this.lastGranulePosition !== void 0) {
      this.metadata.setFormat("numberOfSamples", this.lastGranulePosition);
      this.metadata.setFormat("duration", this.lastGranulePosition / this.metadata.format.sampleRate);
    }
  }
  async parseFirstPage(packet) {
    debug("First Ogg/FLAC packet");
    if (packet.length !== 13 + BlockHeader.len + BlockStreamInfo.len) {
      throw new FlacContentError("Invalid Ogg/FLAC identification packet length");
    }
    if (packet[0] !== 127 || FourCcToken.get(packet, 1) !== "FLAC" || packet[5] !== 1 || FourCcToken.get(packet, 9) !== "fLaC") {
      throw new FlacContentError("Invalid Ogg/FLAC preamble or mapping version");
    }
    const header = BlockHeader.get(packet, 13);
    if (header.type !== BlockType.STREAMINFO || header.length !== BlockStreamInfo.len) {
      throw new FlacContentError("Invalid Ogg/FLAC STREAMINFO header");
    }
    await this.parseDataBlock(header, packet.subarray(17));
    this.isMetadataComplete = header.lastBlock;
  }
  async parseDataBlock(blockHeader, pageData) {
    debug(`blockHeader type=${blockHeader.type}, length=${blockHeader.length}`);
    switch (blockHeader.type) {
      case BlockType.STREAMINFO: {
        const streamInfo = BlockStreamInfo.get(pageData, 0);
        return this.flacParser.processsStreamInfo(streamInfo);
      }
      case BlockType.PADDING:
        break;
      case BlockType.APPLICATION:
        break;
      case BlockType.SEEKTABLE:
      case BlockType.CUESHEET:
        break;
      case BlockType.VORBIS_COMMENT:
        return this.flacParser.parseComment(pageData);
      case BlockType.PICTURE:
        if (!this.options.skipCovers) {
          this.validatePicture(pageData);
          const picture = new VorbisPictureToken(pageData.length).get(pageData, 0);
          return this.flacParser.addPictureTag(picture);
        }
        break;
      default:
        this.metadata.addWarning(`Unknown block type: ${blockHeader.type}`);
    }
  }
  validatePicture(data) {
    if (data.length < 32) {
      throw new FlacContentError("Truncated Ogg/FLAC picture");
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const mimeLength = view.getUint32(4);
    if (mimeLength > data.length - 32) {
      throw new FlacContentError("Ogg/FLAC picture MIME length exceeds block");
    }
    const descriptionLength = view.getUint32(8 + mimeLength);
    if (descriptionLength > data.length - 32 - mimeLength) {
      throw new FlacContentError("Ogg/FLAC picture description length exceeds block");
    }
    const headerLength = 32 + mimeLength + descriptionLength;
    if (view.getUint32(headerLength - 4) !== data.length - headerLength) {
      throw new FlacContentError("Ogg/FLAC picture data length does not match block");
    }
  }
  async flush() {
    if (this.packetLength > 0 || this.identified && !this.isMetadataComplete) {
      throw new FlacContentError("Truncated Ogg/FLAC metadata packet");
    }
  }
};

// ../../node_modules/music-metadata/lib/ogg/OggStreamMetadata.js
var OggStreamMetadata = class extends MetadataCollector {
  constructor(parent) {
    super();
    __publicField(this, "parent");
    this.parent = parent;
    this.native = parent.native;
    this.quality = parent.quality;
  }
  setFormat(key, value) {
    super.setFormat(key, value);
    if (key !== "hasAudio" && key !== "hasVideo" || value === true) {
      this.parent.setFormat(key, value);
    }
  }
  registerTagType(tagType) {
    this.parent.registerTagType(tagType);
  }
  addTag(tagType, tagId, value) {
    return this.parent.addTag(tagType, tagId, value);
  }
  addWarning(warning) {
    this.parent.addWarning(warning);
  }
};

// ../../node_modules/music-metadata/lib/ogg/OggToken.js
var PageHeader = {
  len: 27,
  get: (buf, off) => {
    const granulePosition = UINT64_LE.get(buf, off + 6);
    return {
      capturePattern: new StringType(4, "latin1").get(buf, off),
      version: UINT8.get(buf, off + 4),
      headerType: {
        continued: getBit(buf, off + 5, 0),
        firstPage: getBit(buf, off + 5, 1),
        lastPage: getBit(buf, off + 5, 2)
      },
      // packet_flag: Token.UINT8.get(buf, off + 5),
      absoluteGranulePosition: granulePosition === 0xffffffffffffffffn ? -1 : Number(granulePosition),
      streamSerialNumber: UINT32_LE.get(buf, off + 14),
      pageSequenceNo: UINT32_LE.get(buf, off + 18),
      pageChecksum: UINT32_LE.get(buf, off + 22),
      page_segments: UINT8.get(buf, off + 26)
    };
  }
};
var SegmentTable = class {
  constructor(header) {
    __publicField(this, "len");
    this.len = header.page_segments;
  }
  get(buf, off) {
    const lacingValues = Uint8Array.from(buf.subarray(off, off + this.len));
    return {
      totalPageSize: lacingValues.reduce((sum, length) => sum + length, 0),
      lacingValues
    };
  }
};

// ../../node_modules/music-metadata/lib/ogg/opus/Opus.js
var OpusContentError = class extends makeUnexpectedFileContentError("Opus") {
};
var IdHeader = class {
  constructor(len) {
    __publicField(this, "len");
    if (len < 19) {
      throw new OpusContentError("ID-header-page 0 should be at least 19 bytes long");
    }
    this.len = len;
  }
  get(buf, off) {
    return {
      magicSignature: new StringType(8, "ascii").get(buf, off + 0),
      version: UINT8.get(buf, off + 8),
      channelCount: UINT8.get(buf, off + 9),
      preSkip: UINT16_LE.get(buf, off + 10),
      inputSampleRate: UINT32_LE.get(buf, off + 12),
      outputGain: UINT16_LE.get(buf, off + 16),
      channelMapping: UINT8.get(buf, off + 18)
    };
  }
};

// ../../node_modules/music-metadata/lib/ogg/opus/OpusStream.js
var OpusStream = class extends VorbisStream {
  constructor(metadata, options, tokenizer) {
    super(metadata, options);
    __publicField(this, "idHeader", null);
    __publicField(this, "lastPos", -1);
    __publicField(this, "tokenizer");
    this.tokenizer = tokenizer;
    this.durationOnLastPage = true;
  }
  /**
   * Parse first Opus Ogg page
   * @param {IPageHeader} header
   * @param {Uint8Array} pageData
   */
  parseFirstPage(_header, pageData) {
    this.metadata.setFormat("codec", "Opus");
    this.metadata.setFormat("lossless", false);
    this.idHeader = new IdHeader(pageData.length).get(pageData, 0);
    if (this.idHeader.magicSignature !== "OpusHead") {
      throw new OpusContentError("Illegal ogg/Opus magic-signature");
    }
    this.metadata.setFormat("sampleRate", this.idHeader.inputSampleRate);
    this.metadata.setFormat("numberOfChannels", this.idHeader.channelCount);
    this.metadata.setAudioOnly();
  }
  async parseFullPage(pageData) {
    const magicSignature = new StringType(8, "ascii").get(pageData, 0);
    switch (magicSignature) {
      case "OpusTags":
        await this.parseUserCommentList(pageData, 8);
        this.lastPos = this.tokenizer.position - pageData.length;
        break;
      default:
        break;
    }
  }
  calculateDuration(enfOfStream) {
    if (this.lastPageHeader && (enfOfStream || this.lastPageHeader.headerType.lastPage) && this.metadata.format.sampleRate && this.lastPageHeader.absoluteGranulePosition >= 0) {
      const pos_48bit = this.lastPageHeader.absoluteGranulePosition - this.idHeader.preSkip;
      this.metadata.setFormat("numberOfSamples", pos_48bit);
      this.metadata.setFormat("duration", pos_48bit / 48e3);
      if (this.lastPos !== -1 && this.tokenizer.fileInfo.size && this.metadata.format.duration) {
        const dataSize = this.tokenizer.fileInfo.size - this.lastPos;
        this.metadata.setFormat("bitrate", 8 * dataSize / this.metadata.format.duration);
      }
    }
  }
};

// ../../node_modules/music-metadata/lib/ogg/speex/SpeexStream.js
var import_debug2 = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/ogg/speex/Speex.js
var Header = {
  len: 80,
  get: (buf, off) => {
    return {
      speex: new StringType(8, "ascii").get(buf, off + 0),
      version: trimRightNull(new StringType(20, "ascii").get(buf, off + 8)),
      version_id: INT32_LE.get(buf, off + 28),
      header_size: INT32_LE.get(buf, off + 32),
      rate: INT32_LE.get(buf, off + 36),
      mode: INT32_LE.get(buf, off + 40),
      mode_bitstream_version: INT32_LE.get(buf, off + 44),
      nb_channels: INT32_LE.get(buf, off + 48),
      bitrate: INT32_LE.get(buf, off + 52),
      frame_size: INT32_LE.get(buf, off + 56),
      vbr: INT32_LE.get(buf, off + 60),
      frames_per_packet: INT32_LE.get(buf, off + 64),
      extra_headers: INT32_LE.get(buf, off + 68),
      reserved1: INT32_LE.get(buf, off + 72),
      reserved2: INT32_LE.get(buf, off + 76)
    };
  }
};

// ../../node_modules/music-metadata/lib/ogg/speex/SpeexStream.js
var SpeexContentError = class extends makeUnexpectedFileContentError("Speex") {
};
var debug2 = (0, import_debug2.default)("music-metadata:parser:ogg:speex");
var SpeexStream = class extends VorbisStream {
  constructor(metadata, options, _tokenizer) {
    super(metadata, options);
    __publicField(this, "commentHeaderParsed", false);
  }
  /**
   * Parse first Speex Ogg page
   * @param {IPageHeader} header
   * @param {Uint8Array} pageData
   */
  parseFirstPage(_header, pageData) {
    debug2("First Ogg/Speex page");
    if (pageData.length < Header.len) {
      throw new SpeexContentError("Truncated Speex identification header");
    }
    const speexHeader = Header.get(pageData, 0);
    this.metadata.setFormat("codec", `Speex ${speexHeader.version}`);
    this.metadata.setFormat("lossless", false);
    this.metadata.setFormat("numberOfChannels", speexHeader.nb_channels);
    this.metadata.setFormat("sampleRate", speexHeader.rate);
    if (speexHeader.bitrate !== -1) {
      this.metadata.setFormat("bitrate", speexHeader.bitrate);
    }
    this.metadata.setAudioOnly();
  }
  /**
   * The packet following the identification header is the comment header, in
   * Vorbis comment format but without a packet type or magic signature.
   * Ref: https://tools.ietf.org/html/rfc5574#section-3
   */
  async parseFullPage(pageData) {
    if (this.commentHeaderParsed) {
      return;
    }
    this.commentHeaderParsed = true;
    debug2("Parse Ogg/Speex comment header");
    await this.parseUserCommentList(pageData, 0);
  }
};

// ../../node_modules/music-metadata/lib/ogg/theora/TheoraStream.js
var import_debug3 = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/ogg/theora/Theora.js
var IdentificationHeader = {
  len: 42,
  get: (buf, off) => {
    return {
      id: new StringType(7, "ascii").get(buf, off),
      vmaj: UINT8.get(buf, off + 7),
      vmin: UINT8.get(buf, off + 8),
      vrev: UINT8.get(buf, off + 9),
      vmbw: UINT16_BE.get(buf, off + 10),
      vmbh: UINT16_BE.get(buf, off + 12),
      picw: UINT24_BE.get(buf, off + 14),
      pich: UINT24_BE.get(buf, off + 17),
      frn: UINT32_BE.get(buf, off + 22),
      frd: UINT32_BE.get(buf, off + 26),
      nombr: UINT24_BE.get(buf, off + 37),
      nqual: UINT16_BE.get(buf, off + 40) >> 10,
      keyframeGranuleShift: UINT16_BE.get(buf, off + 40) >> 5 & 31
    };
  }
};

// ../../node_modules/music-metadata/lib/ogg/theora/TheoraStream.js
var TheoraContentError = class extends makeUnexpectedFileContentError("Theora") {
};
var debug3 = (0, import_debug3.default)("music-metadata:parser:ogg:theora");
var TheoraStream = class {
  constructor(metadata, _options, _tokenizer) {
    __publicField(this, "metadata");
    __publicField(this, "durationOnLastPage", true);
    __publicField(this, "identification");
    __publicField(this, "lastPageHeader");
    __publicField(this, "lastGranulePosition");
    this.metadata = metadata;
  }
  /**
   * Vorbis 1 parser
   * @param header Ogg Page Header
   * @param pageData Page data
   */
  async parsePage(header, pageData) {
    this.lastPageHeader = header;
    if (Number.isSafeInteger(header.absoluteGranulePosition) && header.absoluteGranulePosition >= 0) {
      this.lastGranulePosition = header.absoluteGranulePosition;
    }
    if (header.headerType.firstPage) {
      await this.parseFirstPage(header, pageData);
    }
  }
  calculateDuration(endOfStream) {
    const info = this.identification;
    const granule = this.lastGranulePosition;
    if (!info || !this.lastPageHeader || !(endOfStream || this.lastPageHeader.headerType.lastPage) || granule === void 0 || info.frn <= 0 || info.frd <= 0) {
      return;
    }
    const scale = 2 ** info.keyframeGranuleShift;
    const legacy = info.vmaj * 65536 + info.vmin * 256 + info.vrev < 197121;
    const frames = Math.floor(granule / scale) + granule % scale + Number(legacy);
    if (frames > 0) {
      const duration = frames * info.frd / info.frn;
      this.metadata.format.trackInfo[0].duration = duration;
    }
  }
  /**
   * Parse first Theora Ogg page. the initial identification header packet
   */
  async parseFirstPage(_header, pageData) {
    debug3("First Ogg/Theora page");
    this.metadata.setFormat("codec", "Theora");
    if (pageData.length < IdentificationHeader.len) {
      throw new TheoraContentError("Truncated Theora identification header");
    }
    const idHeader = IdentificationHeader.get(pageData, 0);
    this.identification = idHeader;
    this.metadata.setFormat("bitrate", idHeader.nombr);
    this.metadata.setFormat("hasVideo", true);
    this.metadata.addStreamInfo({
      type: TrackType.video,
      codecName: "Theora",
      ...idHeader.nombr > 0 ? { bitrate: idHeader.nombr } : {},
      video: {
        pixelWidth: idHeader.vmbw * 16,
        pixelHeight: idHeader.vmbh * 16,
        displayWidth: idHeader.picw,
        displayHeight: idHeader.pich,
        ...idHeader.frd > 0 && idHeader.frn > 0 ? { frameRate: idHeader.frn / idHeader.frd } : {}
      }
    });
  }
  flush() {
    return Promise.resolve();
  }
};

// ../../node_modules/music-metadata/lib/ogg/OggParser.js
var OggContentError = class extends makeUnexpectedFileContentError("Ogg") {
};
var debug4 = (0, import_debug4.default)("music-metadata:parser:ogg");
var OggStream = class {
  constructor(metadata, streamSerial, options) {
    __publicField(this, "metadata");
    __publicField(this, "streamSerial");
    __publicField(this, "pageNumber", 0);
    __publicField(this, "payloadBytes", 0);
    __publicField(this, "closed", false);
    __publicField(this, "options");
    __publicField(this, "pageConsumer");
    __publicField(this, "isSkeleton", false);
    this.metadata = new OggStreamMetadata(metadata);
    this.streamSerial = streamSerial;
    this.options = options;
  }
  async parsePage(tokenizer, header) {
    this.pageNumber = header.pageSequenceNo;
    debug4("serial=%s page#=%s, Ogg.id=%s", header.streamSerialNumber, header.pageSequenceNo, header.capturePattern);
    const segmentTable = await tokenizer.readToken(new SegmentTable(header));
    debug4("totalPageSize=%s", segmentTable.totalPageSize);
    const pageData = await readToken(tokenizer, new Uint8ArrayType(segmentTable.totalPageSize), this.options);
    this.payloadBytes += pageData.length;
    debug4("firstPage=%s, lastPage=%s, continued=%s", header.headerType.firstPage, header.headerType.lastPage, header.headerType.continued);
    if (header.headerType.firstPage) {
      this.metadata.setFormat("container", "Ogg");
      const idData = pageData.subarray(0, 7);
      const asciiId = Array.from(idData).filter((b) => b >= 32 && b <= 126).map((b) => String.fromCharCode(b)).join("");
      switch (asciiId) {
        case "vorbis":
          debug4(`Set Ogg stream serial ${header.streamSerialNumber}, codec=Vorbis`);
          this.pageConsumer = new VorbisStream(this.metadata, this.options);
          break;
        case "OpusHea":
          debug4("Set page consumer to Ogg/Opus");
          this.pageConsumer = new OpusStream(this.metadata, this.options, tokenizer);
          break;
        case "Speex  ":
          debug4("Set page consumer to Ogg/Speex");
          this.pageConsumer = new SpeexStream(this.metadata, this.options, tokenizer);
          break;
        case "fishead":
          this.isSkeleton = true;
          break;
        case "theora":
          debug4("Set page consumer to Ogg/Theora");
          this.pageConsumer = new TheoraStream(this.metadata, this.options, tokenizer);
          break;
        case "FLAC":
          debug4("Set page consumer to Vorbis");
          this.pageConsumer = new FlacStream(this.metadata, this.options, tokenizer);
          break;
        default:
          throw new OggContentError(`Ogg codec not recognized (id=${asciiId}`);
      }
    }
    if (header.headerType.lastPage) {
      this.closed = true;
    }
    if (this.isSkeleton) {
      return;
    }
    if (this.pageConsumer) {
      await this.pageConsumer.parsePage(header, pageData, segmentTable.lacingValues);
    } else {
      throw new Error("pageConsumer should be initialized");
    }
  }
};
var OggParser = class extends BasicParser {
  constructor() {
    super(...arguments);
    __publicField(this, "streams", /* @__PURE__ */ new Map());
  }
  /**
   * Parse page
   * @returns {Promise<void>}
   */
  async parse() {
    var _a, _b;
    this.streams = /* @__PURE__ */ new Map();
    const maxLogicalStreams = getMaxMetadataEntries(this.options);
    let enfOfStream = false;
    let stoppedEarly = false;
    let header;
    try {
      do {
        header = await this.tokenizer.readToken(PageHeader);
        if (header.capturePattern !== "OggS") {
          throw new OggContentError("Invalid Ogg capture pattern");
        }
        let stream = this.streams.get(header.streamSerialNumber);
        if (!stream) {
          if (this.streams.size >= maxLogicalStreams) {
            throw new OggContentError("Logical stream count exceeds entry limit");
          }
          stream = new OggStream(this.metadata, header.streamSerialNumber, this.options);
          this.streams.set(header.streamSerialNumber, stream);
        }
        await stream.parsePage(this.tokenizer, header);
        if (stream.pageNumber > 12 && // A comment (including its cover art) may span more than 13 pages.
        [...this.streams.values()].every((stream2) => {
          var _a2;
          return ((_a2 = stream2.pageConsumer) == null ? void 0 : _a2.isMetadataComplete) !== false;
        }) && !(this.options.duration && [...this.streams.values()].find((stream2) => {
          var _a2;
          return (_a2 = stream2.pageConsumer) == null ? void 0 : _a2.durationOnLastPage;
        }))) {
          stoppedEarly = true;
          debug4("Stop processing Ogg stream");
          break;
        }
      } while (![...this.streams.values()].every((item) => item.closed));
    } catch (err) {
      if (err instanceof EndOfStreamError) {
        debug4("Reached end-of-stream");
        enfOfStream = true;
      } else if (err instanceof OggContentError) {
        this.metadata.addWarning(`Corrupt Ogg content at ${this.tokenizer.position}`);
      } else {
        throw err;
      }
    }
    for (const stream of this.streams.values()) {
      if (!stream.closed) {
        if (!stoppedEarly) {
          this.metadata.addWarning(`End-of-stream reached before reaching last page in Ogg stream serial=${stream.streamSerial}`);
        }
        await ((_a = stream.pageConsumer) == null ? void 0 : _a.flush());
      }
      (_b = stream.pageConsumer) == null ? void 0 : _b.calculateDuration(enfOfStream);
      const format = stream.metadata.format;
      if (format.hasAudio) {
        const track = createAudioTrackInfo(format);
        track.id = stream.streamSerial;
        if (format.codec === "Opus") {
          delete track.bitrate;
          if (track.duration && track.duration > 0 && stream.closed) {
            track.bitrate = stream.payloadBytes * 8 / track.duration;
          }
        }
        if (format.codec === "Opus" && track.audio) {
          track.audio.outputSamplingFrequency = 48e3;
        }
        this.metadata.addStreamInfo(track);
      } else if (format.hasVideo) {
        const track = format.trackInfo[0] ?? { type: TrackType.video, codecName: format.codec };
        track.id = stream.streamSerial;
        if (track.duration && track.duration > 0 && (stream.closed || enfOfStream)) {
          track.bitrate = stream.payloadBytes * 8 / track.duration;
        }
        this.metadata.addStreamInfo(track);
      }
    }
    for (const flag of ["hasAudio", "hasVideo"]) {
      const present = [...this.streams.values()].some((stream) => stream.metadata.format[flag] === true);
      if (this.metadata.format[flag] !== present) {
        this.metadata.setFormat(flag, present);
      }
    }
  }
};
export {
  OggContentError,
  OggParser
};
//# sourceMappingURL=OggParser-BD6ILPAK.js.map
