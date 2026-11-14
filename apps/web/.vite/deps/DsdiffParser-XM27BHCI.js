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
  INT64_BE,
  StringType,
  UINT16_BE,
  UINT32_BE,
  UINT32_LE,
  UINT8,
  createTokenizerView,
  makeUnexpectedFileContentError,
  readToken
} from "./chunk-3HBPJLK7.js";
import {
  require_browser
} from "./chunk-ZGKN2RSD.js";
import {
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/dsdiff/DsdiffParser.js
var import_debug = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/dsdiff/DsdiffToken.js
var ChunkHeader64 = {
  len: 12,
  get: (buf, off) => {
    return {
      // Group-ID
      chunkID: FourCcToken.get(buf, off),
      // Size
      chunkSize: INT64_BE.get(buf, off + 4)
    };
  }
};

// ../../node_modules/music-metadata/lib/dsdiff/DsdiffParser.js
var debug = (0, import_debug.default)("music-metadata:parser:dsdiff");
var DsdiffContentParseError = class extends makeUnexpectedFileContentError("DSDIFF") {
};
var DsdiffParser = class extends BasicParser {
  constructor() {
    super(...arguments);
    __publicField(this, "input", this.tokenizer);
  }
  readToken(token) {
    return readToken(this.input, token, this.options);
  }
  async parse() {
    const header = await this.readToken(ChunkHeader64);
    if (header.chunkID !== "FRM8") {
      throw new DsdiffContentParseError("Unexpected chunk-ID");
    }
    this.validateChunkSize(header);
    this.requireChunkSize(header, FourCcToken.len);
    this.metadata.setAudioOnly();
    const type = (await this.readToken(FourCcToken)).trim();
    switch (type) {
      case "DSD":
        this.metadata.setFormat("container", `DSDIFF/${type}`);
        this.metadata.setFormat("lossless", true);
        await this.readChunks(header.chunkSize - BigInt(FourCcToken.len), (child) => this.readData(child));
        return;
      default:
        throw new DsdiffContentParseError(`Unsupported DSDIFF type: ${type}`);
    }
  }
  validateChunkSize(header, remainingSize) {
    const size = header.chunkSize;
    if (size < 0n || size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new DsdiffContentParseError(`Invalid chunk size: ${size}`);
    }
    const paddedSize = size + (size & 1n);
    if (remainingSize !== void 0 && paddedSize > remainingSize) {
      throw new DsdiffContentParseError(`Chunk ${header.chunkID} size ${size} exceeds its enclosing chunk`);
    }
    const fileSize = this.input.fileInfo.size;
    if (fileSize !== void 0 && paddedSize > BigInt(fileSize - this.input.position)) {
      throw new DsdiffContentParseError(`Chunk ${header.chunkID} size ${size} exceeds remaining file size`);
    }
  }
  requireChunkSize(header, minimum) {
    if (header.chunkSize < BigInt(minimum)) {
      throw new DsdiffContentParseError(`Chunk ${header.chunkID} is too small: ${header.chunkSize}`);
    }
  }
  async ignoreBytes(length) {
    if (await this.input.ignore(Number(length)) !== Number(length)) {
      throw new DsdiffContentParseError("Unexpected end of chunk");
    }
  }
  async readChunks(remainingSize, handle) {
    while (remainingSize >= ChunkHeader64.len) {
      const header = await this.readToken(ChunkHeader64);
      this.validateChunkSize(header, remainingSize - BigInt(ChunkHeader64.len));
      const source = this.input;
      const payload = createTokenizerView(source, Number(header.chunkSize));
      this.input = payload;
      try {
        await handle(header);
        await this.ignoreBytes(BigInt(payload.remaining));
      } finally {
        this.input = source;
        await payload.close();
      }
      const padding = header.chunkSize & 1n;
      await this.ignoreBytes(padding);
      remainingSize -= BigInt(ChunkHeader64.len) + header.chunkSize + padding;
    }
    return remainingSize;
  }
  async readData(header) {
    debug(`Reading data of chunk[ID=${header.chunkID}, size=${header.chunkSize}]`);
    switch (header.chunkID.trim()) {
      case "FVER": {
        this.requireChunkSize(header, UINT32_LE.len);
        const version = await this.readToken(UINT32_LE);
        debug(`DSDIFF version=${version}`);
        break;
      }
      case "PROP": {
        this.requireChunkSize(header, FourCcToken.len);
        const propType = await this.readToken(FourCcToken);
        if (propType !== "SND ") {
          throw new DsdiffContentParseError("Unexpected PROP-chunk ID");
        }
        await this.handleSoundPropertyChunks(header.chunkSize - BigInt(FourCcToken.len));
        break;
      }
      case "ID3": {
        await parseEmbeddedID3v2(this.metadata, this.input, this.options, Number(header.chunkSize));
        break;
      }
      case "DSD":
        if (this.metadata.format.numberOfChannels) {
          this.metadata.setFormat("numberOfSamples", Number(header.chunkSize * BigInt(8) / BigInt(this.metadata.format.numberOfChannels)));
        }
        if (this.metadata.format.numberOfSamples && this.metadata.format.sampleRate) {
          this.metadata.setFormat("duration", this.metadata.format.numberOfSamples / this.metadata.format.sampleRate);
        }
        break;
      default:
        debug(`Ignore chunk[ID=${header.chunkID}, size=${header.chunkSize}]`);
        break;
    }
  }
  async handleSoundPropertyChunks(remainingSize) {
    remainingSize = await this.readChunks(remainingSize, async (sndPropHeader) => {
      switch (sndPropHeader.chunkID.trim()) {
        case "FS": {
          this.requireChunkSize(sndPropHeader, UINT32_BE.len);
          const sampleRate = await this.readToken(UINT32_BE);
          this.metadata.setFormat("sampleRate", sampleRate);
          break;
        }
        case "CHNL": {
          this.requireChunkSize(sndPropHeader, UINT16_BE.len);
          const numChannels = await this.readToken(UINT16_BE);
          this.metadata.setFormat("numberOfChannels", numChannels);
          await this.handleChannelChunks(sndPropHeader.chunkSize - BigInt(UINT16_BE.len));
          break;
        }
        case "CMPR": {
          this.requireChunkSize(sndPropHeader, FourCcToken.len + UINT8.len);
          const compressionIdCode = (await this.readToken(FourCcToken)).trim();
          const count = await this.readToken(UINT8);
          this.requireChunkSize(sndPropHeader, FourCcToken.len + UINT8.len + count);
          const compressionName = await this.readToken(new StringType(count, "ascii"));
          if (compressionIdCode === "DSD") {
            this.metadata.setFormat("lossless", true);
            this.metadata.setFormat("bitsPerSample", 1);
          }
          this.metadata.setFormat("codec", `${compressionIdCode} (${compressionName})`);
          break;
        }
        case "ABSS": {
          this.requireChunkSize(sndPropHeader, 8);
          const hours = await this.readToken(UINT16_BE);
          const minutes = await this.readToken(UINT8);
          const seconds = await this.readToken(UINT8);
          const samples = await this.readToken(UINT32_BE);
          debug(`ABSS ${hours}:${minutes}:${seconds}.${samples}`);
          break;
        }
        case "LSCO": {
          this.requireChunkSize(sndPropHeader, UINT16_BE.len);
          const lsConfig = await this.readToken(UINT16_BE);
          debug(`LSCO lsConfig=${lsConfig}`);
          break;
        }
        default:
          debug(`Unknown sound-property-chunk[ID=${sndPropHeader.chunkID}, size=${sndPropHeader.chunkSize}]`);
      }
    });
    if (remainingSize !== 0n) {
      throw new DsdiffContentParseError("Incomplete sound-property chunk header");
    }
    if (this.metadata.format.lossless && this.metadata.format.sampleRate && this.metadata.format.numberOfChannels && this.metadata.format.bitsPerSample) {
      const bitrate = this.metadata.format.sampleRate * this.metadata.format.numberOfChannels * this.metadata.format.bitsPerSample;
      this.metadata.setFormat("bitrate", bitrate);
    }
  }
  async handleChannelChunks(remainingSize) {
    debug(`Parsing channel-chunks, remainingSize=${remainingSize}`);
    while (remainingSize >= FourCcToken.len) {
      const channelId = await this.readToken(FourCcToken);
      debug(`Channel[ID=${channelId}]`);
      remainingSize -= BigInt(FourCcToken.len);
    }
  }
};
export {
  DsdiffContentParseError,
  DsdiffParser
};
//# sourceMappingURL=DsdiffParser-XM27BHCI.js.map
