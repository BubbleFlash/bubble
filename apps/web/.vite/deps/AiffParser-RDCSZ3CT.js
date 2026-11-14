import {
  parseEmbeddedID3v2
} from "./chunk-D6JX6GJO.js";
import "./chunk-7DCDJDGP.js";
import "./chunk-47WSSSOY.js";
import {
  FourCcToken
} from "./chunk-E7VQDEJP.js";
import "./chunk-GQBXDRBH.js";
import "./chunk-O76RKEBI.js";
import {
  BasicParser,
  EndOfStreamError,
  StringType,
  UINT16_BE,
  UINT32_BE,
  UINT8,
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

// ../../node_modules/music-metadata/lib/aiff/AiffParser.js
var import_debug = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/iff/index.js
var Header = {
  len: 8,
  get: (buf, off) => {
    return {
      // Chunk type ID
      chunkID: FourCcToken.get(buf, off),
      // Chunk size
      chunkSize: Number(BigInt(UINT32_BE.get(buf, off + 4)))
    };
  }
};

// ../../node_modules/music-metadata/lib/aiff/AiffToken.js
var compressionTypes = {
  ima4: "IMA4 ADPCM",
  NONE: "not compressed	PCM	Apple Computer",
  sowt: "PCM (byte swapped)",
  fl32: "32-bit floating point IEEE 32-bit float",
  fl64: "64-bit floating point IEEE 64-bit float	Apple Computer",
  alaw: "ALaw 2:1	8-bit ITU-T G.711 A-law",
  ulaw: "µLaw 2:1	8-bit ITU-T G.711 µ-law	Apple Computer",
  ULAW: "CCITT G.711 u-law 8-bit ITU-T G.711 µ-law",
  ALAW: "CCITT G.711 A-law 8-bit ITU-T G.711 A-law",
  FL32: "Float 32	IEEE 32-bit float "
};
var AiffContentError = class extends makeUnexpectedFileContentError("AIFF") {
};
var SoundDataHeader = {
  len: 8,
  get: (buf, off) => ({
    offset: UINT32_BE.get(buf, off),
    blockSize: UINT32_BE.get(buf, off + 4)
  })
};
var Common = class {
  constructor(header, isAifc) {
    __publicField(this, "len");
    __publicField(this, "isAifc");
    this.isAifc = isAifc;
    const minimumChunkSize = isAifc ? 22 : 18;
    if (header.chunkSize < minimumChunkSize) {
      throw new AiffContentError(`COMMON CHUNK size should always be at least ${minimumChunkSize}`);
    }
    this.len = header.chunkSize;
  }
  get(buf, off) {
    const shift = UINT16_BE.get(buf, off + 8) - 16398;
    const baseSampleRate = UINT16_BE.get(buf, off + 8 + 2);
    const res = {
      numChannels: UINT16_BE.get(buf, off),
      numSampleFrames: UINT32_BE.get(buf, off + 2),
      sampleSize: UINT16_BE.get(buf, off + 6),
      sampleRate: shift < 0 ? baseSampleRate >> Math.abs(shift) : baseSampleRate << shift
    };
    if (this.isAifc) {
      res.compressionType = FourCcToken.get(buf, off + 18);
      if (this.len > 22) {
        const strLen = UINT8.get(buf, off + 22);
        if (strLen > 0) {
          const padding = (strLen + 1) % 2;
          if (23 + strLen + padding === this.len) {
            res.compressionName = new StringType(strLen, "latin1").get(buf, off + 23);
          } else {
            throw new AiffContentError("Illegal pstring length");
          }
        } else {
          res.compressionName = void 0;
        }
      }
    } else {
      res.compressionName = "PCM";
    }
    return res;
  }
};

// ../../node_modules/music-metadata/lib/aiff/AiffParser.js
var debug = (0, import_debug.default)("music-metadata:parser:aiff");
var AIFFParser = class extends BasicParser {
  constructor() {
    super(...arguments);
    __publicField(this, "isCompressed", null);
    __publicField(this, "soundDataBytes");
    __publicField(this, "soundDataComplete", false);
    __publicField(this, "common");
  }
  async parse() {
    const header = await this.readToken(Header);
    if (header.chunkID !== "FORM") {
      throw new AiffContentError("Invalid Chunk-ID, expected 'FORM'");
    }
    const type = await this.readToken(FourCcToken);
    switch (type) {
      case "AIFF":
        this.metadata.setFormat("container", type);
        this.isCompressed = false;
        break;
      case "AIFC":
        this.metadata.setFormat("container", "AIFF-C");
        this.isCompressed = true;
        break;
      default:
        throw new AiffContentError(`Unsupported AIFF type: ${type}`);
    }
    this.metadata.setFormat("lossless", !this.isCompressed);
    this.metadata.setAudioOnly();
    let remaining = header.chunkSize - FourCcToken.len;
    if (remaining < 0) {
      throw new AiffContentError(`Invalid FORM chunk size: ${header.chunkSize}`);
    }
    try {
      while (remaining >= Header.len) {
        debug(`Reading AIFF chunk at offset=${this.tokenizer.position}`);
        const chunkHeader = await this.readToken(Header);
        remaining -= Header.len;
        const available = this.tokenizer.fileInfo.size;
        if (chunkHeader.chunkSize > remaining || available !== void 0 && chunkHeader.chunkSize > available - this.tokenizer.position) {
          throw new AiffContentError(`Chunk ${chunkHeader.chunkID} size ${chunkHeader.chunkSize} exceeds remaining FORM data`);
        }
        const nextChunk = 2 * Math.round(chunkHeader.chunkSize / 2);
        const bytesRead = await this.readData(chunkHeader);
        const ignored = await this.tokenizer.ignore(nextChunk - bytesRead);
        if (chunkHeader.chunkID === "SSND") {
          this.soundDataComplete = ignored === nextChunk - bytesRead;
        }
        remaining -= nextChunk;
      }
    } catch (err) {
      if (err instanceof EndOfStreamError) {
        debug("End-of-stream");
      } else {
        throw err;
      }
    }
    const common = this.common;
    if ((common == null ? void 0 : common.compressionType) === "ima4" && common.numChannels > 0 && common.numSampleFrames > 0 && common.sampleRate > 0 && this.soundDataComplete && this.soundDataBytes === common.numSampleFrames * common.numChannels * 34) {
      const samples = common.numSampleFrames * 64;
      this.metadata.setFormat("numberOfSamples", samples);
      this.metadata.setFormat("duration", samples / common.sampleRate);
    }
    const duration = this.metadata.format.duration;
    if (this.soundDataBytes !== void 0 && duration !== void 0 && Number.isFinite(duration) && duration > 0) {
      this.metadata.setFormat("bitrate", 8 * this.soundDataBytes / duration);
    }
  }
  async readData(header) {
    switch (header.chunkID) {
      case "COMM": {
        if (this.isCompressed === null) {
          throw new AiffContentError("Failed to parse AIFF.COMM chunk when compression type is unknown");
        }
        const common = await this.readToken(new Common(header, this.isCompressed));
        this.common = common;
        this.metadata.setFormat("bitsPerSample", common.sampleSize);
        this.metadata.setFormat("sampleRate", common.sampleRate);
        this.metadata.setFormat("numberOfChannels", common.numChannels);
        this.metadata.setFormat("numberOfSamples", common.numSampleFrames);
        this.metadata.setFormat("duration", common.numSampleFrames / common.sampleRate);
        if (common.compressionName || common.compressionType) {
          this.metadata.setFormat("codec", common.compressionName ?? compressionTypes[common.compressionType]);
        }
        return header.chunkSize;
      }
      case "ID3 ": {
        await parseEmbeddedID3v2(this.metadata, this.tokenizer, this.options, header.chunkSize);
        return header.chunkSize;
      }
      case "SSND": {
        this.soundDataComplete = false;
        if (header.chunkSize < SoundDataHeader.len) {
          throw new AiffContentError("SSND chunk is too small to contain its header");
        }
        const sound = await this.readToken(SoundDataHeader);
        const payloadSize = header.chunkSize - SoundDataHeader.len;
        if (sound.offset > payloadSize) {
          throw new AiffContentError("SSND alignment offset exceeds its payload size");
        }
        this.soundDataBytes = payloadSize - sound.offset;
        return SoundDataHeader.len;
      }
      case "NAME":
      // Sample name chunk
      case "AUTH":
      // Author chunk
      case "(c) ":
      // Copyright chunk
      case "ANNO":
        return this.readTextChunk(header);
      default:
        debug(`Ignore chunk id=${header.chunkID}, size=${header.chunkSize}`);
        return 0;
    }
  }
  async readTextChunk(header) {
    const value = await this.readToken(new StringType(header.chunkSize, "ascii"));
    let valueCount = 1;
    for (let offset = value.indexOf("\0"); offset >= 0; offset = value.indexOf("\0", offset + 1)) {
      ++valueCount;
    }
    if (valueCount > getMaxMetadataEntries(this.options)) {
      throw new AiffContentError(`Text value count ${valueCount} exceeds entry limit ${getMaxMetadataEntries(this.options)}`);
    }
    const values = value.split("\0").map((v) => v.trim()).filter((v) => v == null ? void 0 : v.length);
    await Promise.all(values.map((v) => this.metadata.addTag("AIFF", header.chunkID, v)));
    return header.chunkSize;
  }
};
export {
  AIFFParser
};
//# sourceMappingURL=AiffParser-RDCSZ3CT.js.map
