import {
  parseEmbeddedID3v2
} from "./chunk-D6JX6GJO.js";
import "./chunk-7DCDJDGP.js";
import "./chunk-47WSSSOY.js";
import {
  FourCcToken
} from "./chunk-E7VQDEJP.js";
import "./chunk-GQBXDRBH.js";
import {
  stripNulls
} from "./chunk-O76RKEBI.js";
import {
  BasicParser,
  EndOfStreamError,
  INT16_LE,
  StringType,
  UINT16_LE,
  UINT32_LE,
  Uint8ArrayType,
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

// ../../node_modules/music-metadata/lib/wav/WaveParser.js
var import_debug = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/riff/RiffChunk.js
var Header = {
  len: 8,
  get: (buf, off) => {
    return {
      // Group-ID
      chunkID: new StringType(4, "latin1").get(buf, off),
      // Size
      chunkSize: UINT32_LE.get(buf, off + 4)
    };
  }
};
var ListInfoTagValue = class {
  constructor(tagHeader, encoding = "latin1") {
    __publicField(this, "encoding");
    __publicField(this, "len");
    __publicField(this, "tagHeader");
    this.encoding = encoding;
    this.tagHeader = tagHeader;
    this.len = tagHeader.chunkSize;
    this.len += this.len & 1;
  }
  get(buf, off) {
    return new StringType(this.tagHeader.chunkSize, this.encoding).get(buf, off).split("\0", 1)[0];
  }
};

// ../../node_modules/music-metadata/lib/wav/WaveChunk.js
var WaveContentError = class extends makeUnexpectedFileContentError("Wave") {
};
var WaveFormat = {
  PCM: 1,
  ADPCM: 2,
  IEEE_FLOAT: 3,
  ALAW: 6,
  MULAW: 7,
  DVI_ADPCM: 17,
  GSM610: 49,
  // MPEG-4 and AAC Audio Types
  MPEG_ADTS_AAC: 5632,
  MPEG_LOAS: 5634,
  RAW_AAC1: 255,
  // Dolby Audio Types
  DOLBY_AC3_SPDIF: 146,
  DVM: 8192,
  RAW_SPORT: 576,
  ESST_AC3: 577,
  DRM: 9,
  DTS2: 8193,
  MPEG: 80,
  MPEGLAYER3: 85,
  FLAC: 61868,
  // The actual format is identified by the SubFormat GUID
  EXTENSIBLE: 65534
};
var WaveFormatNameMap = {
  [WaveFormat.PCM]: "PCM",
  [WaveFormat.ADPCM]: "ADPCM",
  [WaveFormat.IEEE_FLOAT]: "IEEE_FLOAT",
  [WaveFormat.ALAW]: "ALAW",
  [WaveFormat.MULAW]: "MULAW",
  [WaveFormat.DVI_ADPCM]: "DVI_ADPCM",
  [WaveFormat.GSM610]: "GSM610",
  [WaveFormat.MPEG_ADTS_AAC]: "MPEG_ADTS_AAC",
  [WaveFormat.MPEG_LOAS]: "MPEG_LOAS",
  [WaveFormat.RAW_AAC1]: "RAW_AAC1",
  [WaveFormat.DOLBY_AC3_SPDIF]: "DOLBY_AC3_SPDIF",
  [WaveFormat.DVM]: "DVM",
  [WaveFormat.RAW_SPORT]: "RAW_SPORT",
  [WaveFormat.ESST_AC3]: "ESST_AC3",
  [WaveFormat.DRM]: "DRM",
  [WaveFormat.DTS2]: "DTS2",
  [WaveFormat.MPEG]: "MPEG",
  [WaveFormat.MPEGLAYER3]: "MPEGLAYER3",
  [WaveFormat.FLAC]: "FLAC"
};
var WaveFormatExtensibleSubFormatSuffix = new Uint8Array([
  0,
  0,
  0,
  0,
  16,
  0,
  128,
  0,
  0,
  170,
  0,
  56,
  155,
  113
]);
function hasStandardSubFormatGuid(buf, off) {
  for (let i = 0; i < WaveFormatExtensibleSubFormatSuffix.length; i++) {
    if (buf[off + i] !== WaveFormatExtensibleSubFormatSuffix[i]) {
      return false;
    }
  }
  return true;
}
function isLosslessWaveFormat(wFormatTag) {
  return wFormatTag === WaveFormat.PCM || wFormatTag === WaveFormat.IEEE_FLOAT || wFormatTag === WaveFormat.FLAC;
}
function getBitsPerSample(format) {
  if (format.wFormatTag === WaveFormat.PCM && format.wValidBitsPerSample !== void 0 && format.wValidBitsPerSample > 0 && format.wValidBitsPerSample <= format.wBitsPerSample) {
    return format.wValidBitsPerSample;
  }
  return format.wBitsPerSample;
}
var Format = class {
  constructor(header) {
    __publicField(this, "len");
    if (header.chunkSize < 16) {
      throw new WaveContentError("Invalid chunk size");
    }
    this.len = header.chunkSize;
  }
  get(buf, off) {
    let wFormatTag = UINT16_LE.get(buf, off);
    let wValidBitsPerSample;
    if (wFormatTag === WaveFormat.EXTENSIBLE && this.len >= 40 && off + 40 <= buf.length) {
      const cbSize = UINT16_LE.get(buf, off + 16);
      if (cbSize >= 22) {
        wValidBitsPerSample = UINT16_LE.get(buf, off + 18);
        if (hasStandardSubFormatGuid(buf, off + 26)) {
          wFormatTag = UINT16_LE.get(buf, off + 24);
        }
      }
    }
    return {
      wFormatTag,
      nChannels: UINT16_LE.get(buf, off + 2),
      nSamplesPerSec: UINT32_LE.get(buf, off + 4),
      nAvgBytesPerSec: UINT32_LE.get(buf, off + 8),
      nBlockAlign: UINT16_LE.get(buf, off + 12),
      wBitsPerSample: UINT16_LE.get(buf, off + 14),
      wValidBitsPerSample
    };
  }
};
var FactChunk = class {
  constructor(header) {
    __publicField(this, "len");
    if (header.chunkSize < 4) {
      throw new WaveContentError("Invalid fact chunk size.");
    }
    this.len = header.chunkSize;
  }
  get(buf, off) {
    return {
      dwSampleLength: UINT32_LE.get(buf, off)
    };
  }
};

// ../../node_modules/music-metadata/lib/wav/BwfChunk.js
var BroadcastAudioExtensionChunk = class {
  constructor(length) {
    __publicField(this, "len");
    if (length < 348) {
      throw new WaveContentError("BWF extension is shorter than its 348-byte base header");
    }
    this.len = Math.min(length, 422);
  }
  get(uint8array, off) {
    const version = UINT16_LE.get(uint8array, off + 346);
    if (version >= 2 && this.len < 422) {
      throw new WaveContentError("BWF v2 extension is missing loudness fields");
    }
    const result = {
      description: stripNulls(new StringType(256, "ascii").get(uint8array, off)).trim(),
      originator: stripNulls(new StringType(32, "ascii").get(uint8array, off + 256)).trim(),
      originatorReference: stripNulls(new StringType(32, "ascii").get(uint8array, off + 288)).trim(),
      originationDate: stripNulls(new StringType(10, "ascii").get(uint8array, off + 320)).trim(),
      originationTime: stripNulls(new StringType(8, "ascii").get(uint8array, off + 330)).trim(),
      timeReferenceLow: UINT32_LE.get(uint8array, off + 338),
      timeReferenceHigh: UINT32_LE.get(uint8array, off + 342),
      version
    };
    if (version >= 1 && this.len >= 412) {
      result.umid = new Uint8ArrayType(64).get(uint8array, off + 348);
    }
    if (version >= 2) {
      const fields = [
        "loudnessValue",
        "loudnessRange",
        "maxTruePeakLevel",
        "maxMomentaryLoudness",
        "maxShortTermLoudness"
      ];
      for (const [index, field] of fields.entries()) {
        const value = INT16_LE.get(uint8array, off + 412 + index * 2);
        if (value >= (field === "loudnessRange" ? 0 : -9999) && value <= 9999) {
          result[field] = value;
        }
      }
    }
    return result;
  }
};

// ../../node_modules/music-metadata/lib/wav/WaveParser.js
var debug = (0, import_debug.default)("music-metadata:parser:RIFF");
var WaveParser = class extends BasicParser {
  constructor() {
    super(...arguments);
    // CSET applies to the whole file, including INFO chunks preceding it.
    __publicField(this, "codePage");
    __publicField(this, "pendingInfoTags", []);
    __publicField(this, "fact");
    __publicField(this, "blockAlign", 0);
    __publicField(this, "avgBytesPerSec", 0);
  }
  async parse() {
    const riffHeader = await this.readToken(Header);
    debug(`pos=${this.tokenizer.position}, parse: chunkID=${riffHeader.chunkID}`);
    if (riffHeader.chunkID !== "RIFF") {
      return;
    }
    this.metadata.setAudioOnly();
    await this.parseRiffChunk(riffHeader.chunkSize).catch((err) => {
      if (!(err instanceof EndOfStreamError)) {
        throw err;
      }
    });
    await this.flushInfoTags();
  }
  async parseRiffChunk(chunkSize) {
    const type = await this.readToken(FourCcToken);
    this.metadata.setFormat("container", type);
    switch (type) {
      case "WAVE":
        return this.readWaveChunk(chunkSize - FourCcToken.len);
      default:
        throw new WaveContentError(`Unsupported RIFF format: RIFF/${type}`);
    }
  }
  async readWaveChunk(remaining) {
    while (remaining >= Header.len) {
      const header = await this.readToken(Header);
      remaining -= Header.len;
      if (header.chunkSize > remaining) {
        this.metadata.addWarning("Data chunk size exceeds file size");
        if (["CSET", "LIST", "fact", "fmt ", "id3 ", "ID3 ", "bext"].includes(header.chunkID)) {
          throw new WaveContentError(`Chunk ${header.chunkID} size ${header.chunkSize} exceeds remaining RIFF data ${remaining}`);
        }
      }
      remaining -= header.chunkSize + (header.chunkSize & 1);
      debug(`pos=${this.tokenizer.position}, readChunk: chunkID=RIFF/WAVE/${header.chunkID}`);
      switch (header.chunkID) {
        case "CSET": {
          if (header.chunkSize < 8) {
            throw new WaveContentError("CSET chunk must contain at least 8 bytes");
          }
          const cset = await this.readToken(new Uint8ArrayType(header.chunkSize));
          this.codePage = UINT16_LE.get(cset, 0);
          if (!this.getInfoEncoding()) {
            this.metadata.addWarning(`Unsupported RIFF CSET code page: ${this.codePage}; LIST/INFO tags will be omitted`);
          }
          await this.flushInfoTags();
          break;
        }
        case "LIST":
          await this.parseListTag(header);
          break;
        case "fact":
          this.fact = await this.readToken(new FactChunk(header));
          break;
        case "fmt ": {
          const fmt = await this.readToken(new Format(header));
          let subFormat = WaveFormatNameMap[fmt.wFormatTag];
          if (!subFormat) {
            debug(`WAVE/non-PCM format=${fmt.wFormatTag}`);
            subFormat = `non-PCM (${fmt.wFormatTag})`;
          }
          this.metadata.setFormat("codec", subFormat);
          this.metadata.setFormat("lossless", isLosslessWaveFormat(fmt.wFormatTag));
          this.metadata.setFormat("bitsPerSample", getBitsPerSample(fmt));
          this.metadata.setFormat("sampleRate", fmt.nSamplesPerSec);
          this.metadata.setFormat("numberOfChannels", fmt.nChannels);
          this.blockAlign = fmt.nBlockAlign;
          this.avgBytesPerSec = fmt.nAvgBytesPerSec;
          break;
        }
        case "id3 ":
        // The way Picard, FooBar currently stores, ID3 meta-data
        case "ID3 ": {
          await parseEmbeddedID3v2(this.metadata, this.tokenizer, this.options, header.chunkSize);
          break;
        }
        case "data": {
          let chunkSize = header.chunkSize;
          if (this.tokenizer.fileInfo.size) {
            const calcRemaining = this.tokenizer.fileInfo.size - this.tokenizer.position;
            if (calcRemaining < chunkSize) {
              this.metadata.addWarning("data chunk length exceeding file length");
              chunkSize = calcRemaining;
            }
          }
          const numberOfSamples = this.fact ? this.fact.dwSampleLength : chunkSize === 4294967295 ? void 0 : chunkSize / this.blockAlign;
          if (numberOfSamples) {
            this.metadata.setFormat("numberOfSamples", numberOfSamples);
            if (this.metadata.format.sampleRate) {
              this.metadata.setFormat("duration", numberOfSamples / this.metadata.format.sampleRate);
            }
          }
          if (this.avgBytesPerSec > 0) {
            this.metadata.setFormat("bitrate", this.avgBytesPerSec * 8);
          } else if (this.metadata.format.duration) {
            this.metadata.setFormat("bitrate", chunkSize * 8 / this.metadata.format.duration);
          }
          await this.tokenizer.ignore(header.chunkSize);
          break;
        }
        case "bext": {
          const token = new BroadcastAudioExtensionChunk(header.chunkSize);
          const bext = await this.readToken(token);
          for (const key of Object.keys(bext)) {
            await this.metadata.addTag("exif", `bext.${key}`, bext[key]);
          }
          const bextRemaining = header.chunkSize - token.len;
          await this.tokenizer.ignore(bextRemaining);
          break;
        }
        case "\0\0\0\0":
          debug(`Ignore padding chunk: RIFF/${header.chunkID} of ${header.chunkSize} bytes`);
          this.metadata.addWarning(`Ignore chunk: RIFF/${header.chunkID}`);
          await this.tokenizer.ignore(header.chunkSize);
          break;
        default:
          debug(`Ignore chunk: RIFF/${header.chunkID} of ${header.chunkSize} bytes`);
          this.metadata.addWarning(`Ignore chunk: RIFF/${header.chunkID}`);
          await this.tokenizer.ignore(header.chunkSize);
      }
      if (header.chunkSize % 2 === 1) {
        debug("Read odd padding byte");
        await this.tokenizer.ignore(1);
      }
    }
  }
  async parseListTag(listHeader) {
    const listType = await this.readToken(new StringType(4, "latin1"));
    debug("pos=%s, parseListTag: chunkID=RIFF/WAVE/LIST/%s", this.tokenizer.position, listType);
    switch (listType) {
      case "INFO":
        return this.parseRiffInfoTags(listHeader.chunkSize - 4);
      default:
        this.metadata.addWarning(`Ignore chunk: RIFF/WAVE/LIST/${listType}`);
        debug(`Ignoring chunkID=RIFF/WAVE/LIST/${listType}`);
        return this.tokenizer.ignore(listHeader.chunkSize - 4).then();
    }
  }
  async parseRiffInfoTags(chunkSize) {
    while (chunkSize >= 8) {
      const header = await this.readToken(Header);
      const valueToken = new ListInfoTagValue(header);
      if (this.codePage === void 0 && this.pendingInfoTags.length >= getMaxMetadataEntries(this.options)) {
        throw new WaveContentError("Pending RIFF INFO tag count exceeds entry limit");
      }
      if (valueToken.len > chunkSize - 8) {
        throw new WaveContentError("RIFF INFO tag size exceeds remaining LIST data");
      }
      const bytes = await this.readToken(new Uint8ArrayType(valueToken.len));
      if (this.codePage === void 0) {
        this.metadata.registerTagType("exif");
        this.pendingInfoTags.push({ header, bytes });
      } else {
        await this.addInfoTag(header, bytes);
      }
      chunkSize -= 8 + valueToken.len;
    }
    if (chunkSize !== 0) {
      throw new WaveContentError(`Illegal remaining size: ${chunkSize}`);
    }
  }
  async addInfoTag(header, bytes) {
    const encoding = this.getInfoEncoding();
    if (encoding) {
      const value = new ListInfoTagValue(header, encoding).get(bytes, 0);
      await this.metadata.addTag("exif", header.chunkID, value);
    }
  }
  async flushInfoTags() {
    for (const { header, bytes } of this.pendingInfoTags.splice(0)) {
      await this.addInfoTag(header, bytes);
    }
  }
  getInfoEncoding() {
    switch (this.codePage) {
      case void 0:
      case 0:
      case 28591:
        return "latin1";
      case 1252:
        return "windows-1252";
      case 65001:
        return "utf-8";
      default:
        return void 0;
    }
  }
};
export {
  WaveParser
};
//# sourceMappingURL=WaveParser-SFBSDN3P.js.map
