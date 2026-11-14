import {
  AbstractID3Parser
} from "./chunk-EBAAFBLW.js";
import "./chunk-7DCDJDGP.js";
import {
  AdtsFrameHeader
} from "./chunk-5QXUL7QG.js";
import {
  hasID3v1Header
} from "./chunk-47WSSSOY.js";
import "./chunk-E7VQDEJP.js";
import "./chunk-GQBXDRBH.js";
import {
  getBitAllignedNumber,
  isBitSet,
  stripNulls
} from "./chunk-O76RKEBI.js";
import {
  EndOfStreamError,
  StringType,
  UINT16_BE,
  UINT32_BE,
  UINT8,
  isRandomAccessTokenizer,
  makeUnexpectedFileContentError
} from "./chunk-3HBPJLK7.js";
import {
  require_browser
} from "./chunk-ZGKN2RSD.js";
import {
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/mpeg/MpegParser.js
var import_debug = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/mpeg/MpegFrameHeader.js
var MpegContentError = class extends makeUnexpectedFileContentError("MPEG") {
};
var _MpegFrameHeader = class _MpegFrameHeader {
  constructor(buf) {
    __publicField(this, "container", "MPEG");
    __publicField(this, "codec");
    __publicField(this, "layer");
    __publicField(this, "isProtectedByCRC");
    __publicField(this, "bitrate");
    __publicField(this, "samplingRate");
    __publicField(this, "numberOfChannels");
    __publicField(this, "samplesPerFrame");
    __publicField(this, "frameSize");
    __publicField(this, "sideInfoLength");
    var _a;
    const version = _MpegFrameHeader.versions[getBitAllignedNumber(buf, 1, 3, 2)];
    if (version === null) {
      throw new MpegContentError("Cannot determine bit-rate");
    }
    this.layer = _MpegFrameHeader.layers[getBitAllignedNumber(buf, 1, 5, 2)];
    this.isProtectedByCRC = !isBitSet(buf, 1, 7);
    const bitrateIndex = getBitAllignedNumber(buf, 2, 0, 4);
    const samplingRateIndex = getBitAllignedNumber(buf, 2, 4, 2);
    const padding = isBitSet(buf, 2, 6);
    this.numberOfChannels = getBitAllignedNumber(buf, 3, 0, 2) === 3 ? 1 : 2;
    this.codec = `MPEG ${version} Layer ${this.layer}`;
    const bitrate = (_a = _MpegFrameHeader.bitrates[bitrateIndex]) == null ? void 0 : _a[10 * Math.floor(version) + this.layer];
    if (!bitrate) {
      throw new MpegContentError("Cannot determine bit-rate");
    }
    this.bitrate = bitrate * 1e3;
    const samplingRate = _MpegFrameHeader.samplingRates[version][samplingRateIndex];
    if (samplingRate == null) {
      throw new MpegContentError("Cannot determine sampling-rate");
    }
    this.samplingRate = samplingRate;
    this.samplesPerFrame = _MpegFrameHeader.samplesInFrameTable[version === 1 ? 0 : 1][this.layer];
    const slotSize = this.layer === 1 ? 4 : 1;
    this.frameSize = Math.floor(this.samplesPerFrame / 8 * this.bitrate / samplingRate + (padding ? slotSize : 0));
    this.sideInfoLength = this.layer !== 3 ? 2 : _MpegFrameHeader.sideInfoLengths[version === 1 ? 0 : 1][this.numberOfChannels === 1 ? 0 : 1];
  }
};
__publicField(_MpegFrameHeader, "len", 4);
__publicField(_MpegFrameHeader, "versions", [2.5, null, 2, 1]);
__publicField(_MpegFrameHeader, "layers", [0, 3, 2, 1]);
__publicField(_MpegFrameHeader, "sideInfoLengths", [
  [17, 32],
  [9, 17]
]);
__publicField(_MpegFrameHeader, "bitrates", {
  1: { 11: 32, 12: 32, 13: 32, 21: 32, 22: 8, 23: 8 },
  2: { 11: 64, 12: 48, 13: 40, 21: 48, 22: 16, 23: 16 },
  3: { 11: 96, 12: 56, 13: 48, 21: 56, 22: 24, 23: 24 },
  4: { 11: 128, 12: 64, 13: 56, 21: 64, 22: 32, 23: 32 },
  5: { 11: 160, 12: 80, 13: 64, 21: 80, 22: 40, 23: 40 },
  6: { 11: 192, 12: 96, 13: 80, 21: 96, 22: 48, 23: 48 },
  7: { 11: 224, 12: 112, 13: 96, 21: 112, 22: 56, 23: 56 },
  8: { 11: 256, 12: 128, 13: 112, 21: 128, 22: 64, 23: 64 },
  9: { 11: 288, 12: 160, 13: 128, 21: 144, 22: 80, 23: 80 },
  10: { 11: 320, 12: 192, 13: 160, 21: 160, 22: 96, 23: 96 },
  11: { 11: 352, 12: 224, 13: 192, 21: 176, 22: 112, 23: 112 },
  12: { 11: 384, 12: 256, 13: 224, 21: 192, 22: 128, 23: 128 },
  13: { 11: 416, 12: 320, 13: 256, 21: 224, 22: 144, 23: 144 },
  14: { 11: 448, 12: 384, 13: 320, 21: 256, 22: 160, 23: 160 }
});
__publicField(_MpegFrameHeader, "samplingRates", {
  1: { 0: 44100, 1: 48e3, 2: 32e3 },
  2: { 0: 22050, 1: 24e3, 2: 16e3 },
  2.5: { 0: 11025, 1: 12e3, 2: 8e3 }
});
__publicField(_MpegFrameHeader, "samplesInFrameTable", [
  /* Layer   I    II   III */
  [0, 384, 1152, 1152],
  // MPEG-1
  [0, 384, 1152, 576]
  // MPEG-2/2.5
]);
var MpegFrameHeader = _MpegFrameHeader;

// ../../node_modules/music-metadata/lib/mpeg/ReplayGainDataFormat.js
var ReplayGain = {
  len: 2,
  get: (buf, off) => {
    const gain_type = getBitAllignedNumber(buf, off, 0, 3);
    const sign = getBitAllignedNumber(buf, off, 6, 1);
    const gain_adj = getBitAllignedNumber(buf, off, 7, 9) / 10;
    if (gain_type > 0) {
      return {
        type: getBitAllignedNumber(buf, off, 0, 3),
        origin: getBitAllignedNumber(buf, off, 3, 3),
        adjustment: sign ? -gain_adj : gain_adj
      };
    }
    return void 0;
  }
};

// ../../node_modules/music-metadata/lib/mpeg/ExtendedLameHeader.js
var ExtendedLameHeader = {
  len: 27,
  get: (buf, off) => {
    const track_peak = UINT32_BE.get(buf, off + 2);
    return {
      revision: getBitAllignedNumber(buf, off, 0, 4),
      vbr_method: getBitAllignedNumber(buf, off, 4, 4),
      lowpass_filter: 100 * UINT8.get(buf, off + 1),
      track_peak: track_peak === 0 ? null : track_peak / 2 ** 23,
      track_gain: ReplayGain.get(buf, 6),
      album_gain: ReplayGain.get(buf, 8),
      music_length: UINT32_BE.get(buf, off + 20),
      music_crc: UINT8.get(buf, off + 24),
      header_crc: UINT16_BE.get(buf, off + 24)
    };
  }
};

// ../../node_modules/music-metadata/lib/mpeg/XingTag.js
var InfoTagHeaderTag = new StringType(4, "ascii");
var LameEncoderVersion = new StringType(6, "ascii");
var XingHeaderFlags = {
  len: 4,
  get: (buf, off) => {
    return {
      frames: isBitSet(buf, off, 31),
      bytes: isBitSet(buf, off, 30),
      toc: isBitSet(buf, off, 29),
      vbrScale: isBitSet(buf, off, 28)
    };
  }
};
async function readXingHeader(tokenizer) {
  const flags = await tokenizer.readToken(XingHeaderFlags);
  const xingInfoTag = { numFrames: null, streamSize: null, vbrScale: null };
  if (flags.frames) {
    xingInfoTag.numFrames = await tokenizer.readToken(UINT32_BE);
  }
  if (flags.bytes) {
    xingInfoTag.streamSize = await tokenizer.readToken(UINT32_BE);
  }
  if (flags.toc) {
    xingInfoTag.toc = new Uint8Array(100);
    await tokenizer.readBuffer(xingInfoTag.toc);
  }
  if (flags.vbrScale) {
    xingInfoTag.vbrScale = await tokenizer.readToken(UINT32_BE);
  }
  const lameTag = await tokenizer.peekToken(new StringType(4, "ascii"));
  if (lameTag === "LAME") {
    await tokenizer.ignore(4);
    xingInfoTag.lame = {
      version: await tokenizer.readToken(new StringType(5, "ascii"))
    };
    const match = xingInfoTag.lame.version.match(/\d+.\d+/g);
    if (match !== null) {
      const majorMinorVersion = match[0];
      const version = majorMinorVersion.split(".").map((n) => Number.parseInt(n, 10));
      if (version[0] >= 3 && version[1] >= 90) {
        xingInfoTag.lame.extended = await tokenizer.readToken(ExtendedLameHeader);
      }
    }
  }
  return xingInfoTag;
}

// ../../node_modules/music-metadata/lib/mpeg/MpegParser.js
var debug = (0, import_debug.default)("music-metadata:parser:mpeg");
var maxPeekLen = 1024;
function getVbrCodecProfile(vbrScale) {
  return `V${Math.floor((100 - vbrScale) / 10)}`;
}
var MpegParser = class extends AbstractID3Parser {
  constructor() {
    super(...arguments);
    __publicField(this, "frameCount", 0);
    __publicField(this, "syncFrameCount", -1);
    __publicField(this, "totalDataLength", 0);
    __publicField(this, "audioFrameHeader");
    __publicField(this, "firstBitrate");
    __publicField(this, "constantBitrate", true);
    __publicField(this, "offset", 0);
    __publicField(this, "frameSize", 0);
    __publicField(this, "audioEnd");
    __publicField(this, "calculateEofDuration", false);
    __publicField(this, "samplesPerFrame", null);
    __publicField(this, "frameHeaderBuffer", new Uint8Array(MpegFrameHeader.len));
    __publicField(this, "frameHeaderTail", this.frameHeaderBuffer.subarray(1));
    __publicField(this, "adtsHeaderBuffer", new Uint8Array(3));
    __publicField(this, "sideInfoBuffer", new Uint8Array(32));
    // Maximum side information size (MPEG-1 stereo).
    /**
     * Number of bytes already parsed since beginning of stream / file
     */
    __publicField(this, "mpegOffset", null);
    __publicField(this, "syncPeek", {
      buf: new Uint8Array(maxPeekLen),
      len: 0
    });
  }
  /**
   * Called after ID3 headers have been parsed
   */
  async postId3v2Parse() {
    this.metadata.setFormat("lossless", false);
    this.metadata.setAudioOnly();
    if (this.options.duration && isRandomAccessTokenizer(this.tokenizer)) {
      this.audioEnd = this.tokenizer.fileInfo.size - (await hasID3v1Header(this.tokenizer) ? 128 : 0);
    }
    try {
      let quit = false;
      while (!quit) {
        await this.sync();
        quit = await this.parseFrameHeader();
      }
    } catch (err) {
      if (err instanceof EndOfStreamError) {
        debug("End-of-stream");
        if (this.calculateEofDuration) {
          if (this.samplesPerFrame !== null) {
            const numberOfSamples = this.frameCount * this.samplesPerFrame;
            this.metadata.setFormat("numberOfSamples", numberOfSamples);
            if (this.metadata.format.sampleRate) {
              const duration = numberOfSamples / this.metadata.format.sampleRate;
              debug(`Calculate duration at EOF: ${duration} sec.`, duration);
              this.metadata.setFormat("duration", duration);
            }
          }
        }
      } else {
        throw err;
      }
    }
  }
  /**
   * Called after file has been fully parsed, this allows, if present, to exclude the ID3v1.1 header length
   */
  finalize() {
    const format = this.metadata.format;
    const hasID3v1 = !!this.metadata.native.ID3v1;
    if (this.mpegOffset !== null) {
      if (format.duration && this.tokenizer.fileInfo.size) {
        const mpegSize = this.tokenizer.fileInfo.size - this.mpegOffset - (hasID3v1 ? 128 : 0);
        if (format.codecProfile && format.codecProfile[0] === "V") {
          this.metadata.setFormat("bitrate", mpegSize * 8 / format.duration);
        }
      }
      if (this.tokenizer.fileInfo.size && format.codecProfile === "CBR" && !this.calculateEofDuration) {
        const mpegSize = this.tokenizer.fileInfo.size - this.mpegOffset - (hasID3v1 ? 128 : 0);
        if (this.samplesPerFrame !== null) {
          const numberOfSamples = Math.round(mpegSize / this.frameSize) * this.samplesPerFrame;
          this.metadata.setFormat("numberOfSamples", numberOfSamples);
          if (format.sampleRate && !format.duration) {
            const duration = numberOfSamples / format.sampleRate;
            debug("Calculate CBR duration based on file size: %s", duration);
            this.metadata.setFormat("duration", duration);
          }
        }
      }
    }
  }
  async sync() {
    let gotFirstSync = false;
    while (true) {
      let bo = 0;
      this.syncPeek.len = await this.tokenizer.peekBuffer(this.syncPeek.buf, { length: maxPeekLen, mayBeLess: true });
      if (this.syncPeek.len >= 128 && this.syncPeek.len < maxPeekLen) {
        const footer = this.syncPeek.len - 128;
        const end = this.tokenizer.position + this.syncPeek.len;
        if ((this.tokenizer.fileInfo.size === void 0 || this.tokenizer.fileInfo.size === end) && this.syncPeek.buf[footer] === 84 && this.syncPeek.buf[footer + 1] === 65 && this.syncPeek.buf[footer + 2] === 71) {
          this.audioEnd = end - 128;
        }
      }
      const audioEndReached = this.audioEnd !== void 0 && this.tokenizer.position >= this.audioEnd;
      const fullMpegScan = this.calculateEofDuration && this.audioFrameHeader !== void 0;
      const id3v1Tail = this.syncPeek.len >= 3 && this.syncPeek.buf[0] === 84 && this.syncPeek.buf[1] === 65 && this.syncPeek.buf[2] === 71;
      if (this.syncPeek.len < 2 || audioEndReached || this.syncPeek.len <= 163 && this.audioFrameHeader !== void 0 && (!fullMpegScan || id3v1Tail)) {
        throw new EndOfStreamError();
      }
      while (true) {
        if (gotFirstSync && bo === this.syncPeek.len) {
          await this.tokenizer.ignore(bo - 1);
          gotFirstSync = false;
          break;
        }
        if (gotFirstSync && (this.syncPeek.buf[bo] & 224) === 224) {
          this.frameHeaderBuffer[0] = 255;
          this.frameHeaderBuffer[1] = this.syncPeek.buf[bo];
          if (this.syncPeek.len <= 163 && !AdtsFrameHeader.matches(this.frameHeaderBuffer) && (!fullMpegScan || id3v1Tail)) {
            throw new EndOfStreamError();
          }
          await this.tokenizer.ignore(bo);
          debug(`Sync at offset=${this.tokenizer.position - 1}, frameCount=${this.frameCount}`);
          if (this.syncFrameCount === this.frameCount) {
            debug(`Re-synced MPEG stream, frameCount=${this.frameCount}`);
            this.frameCount = 0;
            this.frameSize = 0;
          }
          this.syncFrameCount = this.frameCount;
          return;
        }
        gotFirstSync = false;
        bo = this.syncPeek.buf.indexOf(255, bo);
        if (bo === -1) {
          if (this.syncPeek.len < this.syncPeek.buf.length) {
            throw new EndOfStreamError();
          }
          await this.tokenizer.ignore(this.syncPeek.len);
          break;
        }
        ++bo;
        gotFirstSync = true;
      }
    }
  }
  /**
   * Read the shared four-byte prefix, then dispatch to ADTS or MPEG audio.
   * @return {Promise<boolean>} true if parser should quit
   */
  async parseFrameHeader() {
    if (this.frameCount === 0) {
      this.mpegOffset = this.tokenizer.position - 1;
    }
    await this.tokenizer.peekBuffer(this.frameHeaderTail, { length: 3 });
    let header;
    try {
      header = AdtsFrameHeader.matches(this.frameHeaderBuffer) ? new AdtsFrameHeader(this.frameHeaderBuffer) : new MpegFrameHeader(this.frameHeaderBuffer);
    } catch (err) {
      await this.tokenizer.ignore(1);
      if (err instanceof Error) {
        this.metadata.addWarning(`Parse error: ${err.message}`);
        return false;
      }
      throw err;
    }
    if (header instanceof MpegFrameHeader && this.options.duration && this.audioEnd !== void 0 && this.tokenizer.position - 1 + header.frameSize > this.audioEnd) {
      throw new EndOfStreamError();
    }
    await this.tokenizer.ignore(3);
    if (header instanceof AdtsFrameHeader) {
      this.metadata.setFormat("container", header.container);
      this.metadata.setFormat("codec", header.codec);
      this.metadata.setFormat("lossless", false);
      return this.parseAdts(header);
    }
    this.metadata.setFormat("container", header.container);
    this.metadata.setFormat("codec", header.codec);
    this.metadata.setFormat("lossless", false);
    this.frameCount++;
    try {
      return await this.parseMpegFrame(header);
    } catch (error) {
      if (error instanceof EndOfStreamError) {
        --this.frameCount;
      }
      throw error;
    }
  }
  /**
   * @return {Promise<boolean>} true if parser should quit
   */
  async parseMpegFrame(header) {
    if (this.frameCount < 20 * 1e4) {
      debug("offset=%s MP%s bitrate=%s sample-rate=%s", this.tokenizer.position - 4, header.layer, header.bitrate, header.samplingRate);
    }
    this.frameSize = header.frameSize;
    this.audioFrameHeader = header;
    if (this.frameCount === 1) {
      this.offset = MpegFrameHeader.len;
      await this.skipSideInformation();
      this.applyMpegFormat(header);
      return false;
    }
    if (this.frameCount === 4) {
      this.samplesPerFrame = header.samplesPerFrame;
      if (this.metadata.format.duration) {
        this.applyMpegFormat(header);
        return true;
      }
      if (!this.options.duration) {
        this.applyMpegFormat(header);
      }
      if (this.constantBitrate) {
        this.samplesPerFrame = header.samplesPerFrame;
        this.metadata.setFormat("codecProfile", "CBR");
      }
      if (!this.options.duration) {
        return true;
      }
    }
    if (this.options.duration && this.frameCount === 4) {
      this.samplesPerFrame = header.samplesPerFrame;
      this.calculateEofDuration = true;
    }
    this.offset = MpegFrameHeader.len;
    if (header.isProtectedByCRC) {
      await this.tokenizer.ignore(2);
      this.offset += 2;
    }
    await this.skipSideInformation();
    this.applyMpegFormat(header);
    if (this.calculateEofDuration && !this.constantBitrate && this.metadata.format.codecProfile === "CBR") {
      this.metadata.setFormat("codecProfile", "VBR");
    }
    return false;
  }
  applyMpegFormat(header) {
    this.metadata.setFormat("container", header.container);
    this.metadata.setFormat("codec", header.codec);
    this.metadata.setFormat("lossless", false);
    this.metadata.setFormat("sampleRate", header.samplingRate);
    this.metadata.setFormat("numberOfChannels", header.numberOfChannels);
    this.metadata.setFormat("bitrate", header.bitrate);
    this.firstBitrate ?? (this.firstBitrate = header.bitrate);
    this.constantBitrate && (this.constantBitrate = header.bitrate === this.firstBitrate);
  }
  async parseAdts(header) {
    await this.tokenizer.readBuffer(this.adtsHeaderBuffer);
    const frameLength = header.frameLength + getBitAllignedNumber(this.adtsHeaderBuffer, 0, 0, 11);
    if (frameLength <= header.headerLength) {
      throw new MpegContentError(`Invalid ADTS frame length: ${frameLength}`);
    }
    const remaining = frameLength - 7;
    if (isRandomAccessTokenizer(this.tokenizer)) {
      const count = await this.tokenizer.readBuffer(this.adtsHeaderBuffer, {
        position: this.tokenizer.position + remaining - 1,
        length: 1
      });
      if (count !== 1) {
        throw new EndOfStreamError();
      }
    } else if (await this.tokenizer.ignore(remaining) !== remaining) {
      throw new EndOfStreamError();
    }
    this.metadata.setFormat("sampleRate", header.samplingRate ?? void 0);
    this.frameCount++;
    this.totalDataLength += frameLength;
    this.samplesPerFrame = 1024;
    this.calculateEofDuration = this.options.duration ?? false;
    if (header.samplingRate !== null) {
      const framesPerSec = header.samplingRate / this.samplesPerFrame;
      const bytesPerFrame = this.totalDataLength / this.frameCount;
      const bitrate = 8 * bytesPerFrame * framesPerSec + 0.5;
      this.metadata.setFormat("bitrate", bitrate);
      debug(`frame-count=${this.frameCount}, size=${frameLength} bytes, bit-rate=${bitrate}`);
    }
    if (this.frameCount === 1) {
      this.metadata.setFormat("codecProfile", header.codecProfile);
      if (header.numberOfChannels) {
        this.metadata.setFormat("numberOfChannels", header.numberOfChannels);
      }
    }
    return this.frameCount === 3 && !this.options.duration;
  }
  async skipSideInformation() {
    if (this.audioFrameHeader) {
      const sideInfoLength = this.audioFrameHeader.sideInfoLength;
      await this.tokenizer.readBuffer(this.sideInfoBuffer, { length: sideInfoLength });
      this.offset += sideInfoLength;
      await this.readXtraInfoHeader();
    }
  }
  async readXtraInfoHeader() {
    const headerTag = await this.tokenizer.readToken(InfoTagHeaderTag);
    this.offset += InfoTagHeaderTag.len;
    switch (headerTag) {
      case "Info":
        this.metadata.setFormat("codecProfile", "CBR");
        return this.readXingInfoHeader();
      case "Xing": {
        const infoTag = await this.readXingInfoHeader();
        if (infoTag.vbrScale !== null) {
          const codecProfile = getVbrCodecProfile(infoTag.vbrScale);
          this.metadata.setFormat("codecProfile", codecProfile);
        }
        return null;
      }
      case "Xtra":
        break;
      case "LAME": {
        const version = await this.tokenizer.readToken(LameEncoderVersion);
        if (this.frameSize >= this.offset + LameEncoderVersion.len) {
          this.offset += LameEncoderVersion.len;
          this.metadata.setFormat("tool", `LAME ${version}`);
          await this.skipFrameData(this.frameSize - this.offset);
          return null;
        }
        this.metadata.addWarning("Corrupt LAME header");
        break;
      }
    }
    const frameDataLeft = this.frameSize - this.offset;
    if (frameDataLeft < 0) {
      this.metadata.addWarning(`Frame ${this.frameCount}corrupt: negative frameDataLeft`);
    } else {
      await this.skipFrameData(frameDataLeft);
    }
    return null;
  }
  /**
   * Ref: http://gabriel.mp3-tech.org/mp3infotag.html
   */
  async readXingInfoHeader() {
    const offset = this.tokenizer.position;
    const infoTag = await readXingHeader(this.tokenizer);
    this.offset += this.tokenizer.position - offset;
    if (infoTag.lame) {
      this.metadata.setFormat("tool", `LAME ${stripNulls(infoTag.lame.version)}`);
      if (infoTag.lame.extended) {
        this.metadata.setFormat("trackPeakLevel", infoTag.lame.extended.track_peak ?? void 0);
        if (infoTag.lame.extended.track_gain) {
          this.metadata.setFormat("trackGain", infoTag.lame.extended.track_gain.adjustment);
        }
        if (infoTag.lame.extended.album_gain) {
          this.metadata.setFormat("albumGain", infoTag.lame.extended.album_gain.adjustment);
        }
        this.metadata.setFormat("duration", infoTag.lame.extended.music_length / 1e3);
      }
    }
    if (infoTag.streamSize && this.audioFrameHeader && infoTag.numFrames !== null) {
      const duration = infoTag.numFrames * this.audioFrameHeader.samplesPerFrame / this.audioFrameHeader.samplingRate;
      this.metadata.setFormat("duration", duration);
      debug("Get duration from Xing header: %s", this.metadata.format.duration);
      return infoTag;
    }
    const frameDataLeft = this.frameSize - this.offset;
    await this.skipFrameData(frameDataLeft);
    return infoTag;
  }
  async skipFrameData(frameDataLeft) {
    if (frameDataLeft < 0) {
      throw new MpegContentError("frame-data-left cannot be negative");
    }
    if (frameDataLeft > 0 && this.calculateEofDuration && isRandomAccessTokenizer(this.tokenizer)) {
      const count = await this.tokenizer.readBuffer(this.sideInfoBuffer, {
        position: this.tokenizer.position + frameDataLeft - 1,
        length: 1
      });
      if (count !== 1) {
        throw new EndOfStreamError();
      }
    } else if (await this.tokenizer.ignore(frameDataLeft) !== frameDataLeft) {
      throw new EndOfStreamError();
    }
  }
};
export {
  MpegContentError,
  MpegParser
};
//# sourceMappingURL=MpegParser-LL2BY4TA.js.map
