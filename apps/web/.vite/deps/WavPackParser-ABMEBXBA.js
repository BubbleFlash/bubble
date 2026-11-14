import {
  FourCcToken,
  tryParseApeHeader
} from "./chunk-E7VQDEJP.js";
import {
  uint8ArrayToHex
} from "./chunk-O76RKEBI.js";
import {
  BasicParser,
  EndOfStreamError,
  UINT16_LE,
  UINT24_LE,
  UINT32_LE,
  UINT8,
  Uint8ArrayType,
  makeUnexpectedFileContentError
} from "./chunk-3HBPJLK7.js";
import {
  require_browser
} from "./chunk-ZGKN2RSD.js";
import {
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/wavpack/WavPackParser.js
var import_debug = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/wavpack/WavPackToken.js
var SampleRates = [
  6e3,
  8e3,
  9600,
  11025,
  12e3,
  16e3,
  22050,
  24e3,
  32e3,
  44100,
  48e3,
  64e3,
  88200,
  96e3,
  192e3,
  -1
];
var BlockHeaderToken = {
  len: 32,
  get: (buf, off) => {
    const flags = UINT32_LE.get(buf, off + 24);
    const totalSamples = UINT32_LE.get(buf, off + 12);
    const res = {
      // should equal 'wvpk'
      BlockID: FourCcToken.get(buf, off),
      //  0x402 to 0x410 are valid for decode
      blockSize: UINT32_LE.get(buf, off + 4),
      //  0x402 (1026) to 0x410 are valid for decode
      version: UINT16_LE.get(buf, off + 8),
      //  40-bit total samples for entire file (if block_index == 0 and a value of -1 indicates an unknown length)
      // The low-word sentinel is unknown regardless of the high byte; the total uses radix 0xffffffff.
      totalSamples: totalSamples === 4294967295 ? -1 : totalSamples + buf[off + 11] * 4294967295,
      // 40-bit block_index
      blockIndex: UINT32_LE.get(buf, off + 16) + buf[off + 10] * 4294967296,
      // 40-bit total samples for entire file (if block_index == 0 and a value of -1 indicates an unknown length)
      blockSamples: UINT32_LE.get(buf, off + 20),
      // various flags for id and decoding
      flags: {
        bitsPerSample: (1 + getBitAllignedNumber(flags, 0, 2)) * 8,
        isMono: isBitSet(flags, 2),
        isHybrid: isBitSet(flags, 3),
        isJointStereo: isBitSet(flags, 4),
        crossChannel: isBitSet(flags, 5),
        hybridNoiseShaping: isBitSet(flags, 6),
        floatingPoint: isBitSet(flags, 7),
        samplingRate: SampleRates[getBitAllignedNumber(flags, 23, 4)],
        isDSD: isBitSet(flags, 31),
        isInitialBlock: isBitSet(flags, 11),
        isFinalBlock: isBitSet(flags, 12)
      },
      // crc for actual decoded data
      crc: new Uint8ArrayType(4).get(buf, off + 28)
    };
    if (res.flags.isDSD && res.totalSamples >= 0) {
      res.totalSamples *= 8;
    }
    return res;
  }
};
var MetadataIdToken = {
  len: 1,
  get: (buf, off) => {
    return {
      functionId: getBitAllignedNumber(buf[off], 0, 6),
      // functionId overlaps with isOptional flag
      isOptional: isBitSet(buf[off], 5),
      isOddSize: isBitSet(buf[off], 6),
      largeBlock: isBitSet(buf[off], 7)
    };
  }
};
function isBitSet(flags, bitOffset) {
  return getBitAllignedNumber(flags, bitOffset, 1) === 1;
}
function getBitAllignedNumber(flags, bitOffset, len) {
  return flags >>> bitOffset & 4294967295 >>> 32 - len;
}

// ../../node_modules/music-metadata/lib/wavpack/WavPackParser.js
var debug = (0, import_debug.default)("music-metadata:parser:WavPack");
var WavPackContentError = class extends makeUnexpectedFileContentError("WavPack") {
};
var WavPackParser = class extends BasicParser {
  constructor() {
    super(...arguments);
    __publicField(this, "audioDataSize", 0);
    __publicField(this, "sampleRate", 0);
    __publicField(this, "dsdMultiplier", 1);
    __publicField(this, "physicalEof", false);
  }
  async parse() {
    this.metadata.setAudioOnly();
    this.audioDataSize = 0;
    await this.parseWavPackBlocks();
    if (this.physicalEof) {
      return;
    }
    return tryParseApeHeader(this.metadata, this.tokenizer, this.options);
  }
  async parseWavPackBlocks() {
    let totalSamples;
    let sampleExtent = 0;
    let groupIndex;
    let groupSamples = 0;
    let complete = true;
    let isDsd = false;
    const preamble = new Uint8Array(4);
    while (true) {
      if (await this.tokenizer.peekBuffer(preamble, { mayBeLess: true }) < 4) {
        this.physicalEof = true;
        break;
      }
      const blockId = FourCcToken.get(preamble, 0);
      if (blockId !== "wvpk") {
        break;
      }
      const header = await this.tokenizer.readToken(BlockHeaderToken);
      if (header.BlockID !== "wvpk") {
        throw new WavPackContentError("Invalid WavPack Block-ID");
      }
      debug(`WavPack header blockIndex=${header.blockIndex}, len=${BlockHeaderToken.len}`);
      if (header.blockIndex === 0 && !this.metadata.format.container) {
        this.metadata.setFormat("container", "WavPack");
        this.metadata.setFormat("lossless", !header.flags.isHybrid);
        this.metadata.setFormat("bitsPerSample", header.flags.bitsPerSample);
        this.sampleRate = header.flags.samplingRate;
        isDsd = header.flags.isDSD;
        totalSamples = header.totalSamples > 0 ? header.totalSamples : void 0;
        this.metadata.setFormat("numberOfChannels", header.flags.isMono ? 1 : 2);
        this.metadata.setFormat("codec", header.flags.isDSD ? "DSD" : "PCM");
      }
      const ignoreBytes = header.blockSize - (BlockHeaderToken.len - 8);
      if (ignoreBytes < 0 || this.tokenizer.fileInfo.size !== void 0 && ignoreBytes > this.tokenizer.fileInfo.size - this.tokenizer.position) {
        throw new WavPackContentError("WavPack block exceeds available input");
      }
      if (header.blockIndex === 0) {
        await this.parseMetadataSubBlock(header, ignoreBytes);
      } else if (await this.tokenizer.ignore(ignoreBytes) !== ignoreBytes) {
        throw new EndOfStreamError();
      }
      if (header.blockSamples > 0) {
        if (header.flags.isInitialBlock) {
          complete && (complete = groupIndex === void 0 && header.blockIndex === sampleExtent);
          groupIndex = header.blockIndex;
          groupSamples = header.blockSamples;
        }
        complete && (complete = groupIndex === header.blockIndex && groupSamples === header.blockSamples && isDsd === header.flags.isDSD);
        if (header.flags.isFinalBlock) {
          sampleExtent = header.blockIndex + header.blockSamples;
          groupIndex = void 0;
        }
        this.audioDataSize += header.blockSize;
      }
    }
    if (totalSamples === void 0 && complete && groupIndex === void 0 && sampleExtent > 0) {
      totalSamples = sampleExtent * (isDsd ? 8 : 1);
    } else if (totalSamples === void 0 && (!complete || groupIndex !== void 0)) {
      this.metadata.addWarning("Cannot determine WavPack duration from incomplete or non-contiguous blocks");
    }
    const samplingRate = this.sampleRate * this.dsdMultiplier;
    if (samplingRate > 0 && Number.isSafeInteger(samplingRate)) {
      this.metadata.setFormat("sampleRate", samplingRate);
    }
    if (totalSamples !== void 0) {
      this.metadata.setFormat("numberOfSamples", totalSamples);
      const rate = this.metadata.format.sampleRate;
      if (rate && rate > 0) {
        this.metadata.setFormat("duration", totalSamples / rate);
      }
    }
    if (this.metadata.format.duration) {
      this.metadata.setFormat("bitrate", this.audioDataSize * 8 / this.metadata.format.duration);
    }
  }
  /**
   * Ref: http://www.wavpack.com/WavPack5FileFormat.pdf, 3.0 Metadata Sub-blocks
   * @param header Header
   * @param remainingLength Remaining length
   */
  async parseMetadataSubBlock(header, remainingLength) {
    let remaining = remainingLength;
    while (remaining > MetadataIdToken.len) {
      const id = await this.tokenizer.readToken(MetadataIdToken);
      const dataSizeInWords = await this.tokenizer.readNumber(id.largeBlock ? UINT24_LE : UINT8);
      const headerSize = MetadataIdToken.len + (id.largeBlock ? UINT24_LE.len : UINT8.len);
      if (dataSizeInWords * 2 > remaining - headerSize) {
        throw new WavPackContentError("Metadata sub-block exceeds its enclosing block");
      }
      const data = await this.readToken(new Uint8ArrayType(dataSizeInWords * 2 - (id.isOddSize ? 1 : 0)));
      debug(`Metadata Sub-Blocks functionId=0x${id.functionId.toString(16)}, id.largeBlock=${id.largeBlock},data-size=${data.length}`);
      switch (id.functionId) {
        case 0:
          break;
        case 14: {
          debug("ID_DSD_BLOCK");
          if (data.length < 1) {
            throw new WavPackContentError("Truncated WavPack DSD metadata");
          }
          const mp = 2 ** UINT8.get(data, 0);
          this.dsdMultiplier = mp * 8;
          if (!header.flags.isDSD) {
            throw new WavPackContentError("Only expect DSD block if DSD-flag is set");
          }
          break;
        }
        case 39:
          if (data.length < 3) {
            throw new WavPackContentError("Truncated WavPack sample rate");
          }
          this.sampleRate = UINT24_LE.get(data, 0);
          break;
        case 36:
          debug("ID_ALT_TRAILER: trailer for non-wav files");
          break;
        case 38:
          this.metadata.setFormat("audioMD5", data);
          break;
        case 47:
          debug(`ID_BLOCK_CHECKSUM: checksum=${uint8ArrayToHex(data)}`);
          break;
        default:
          debug(`Ignore unsupported meta-sub-block-id functionId=0x${id.functionId.toString(16)}`);
          break;
      }
      remaining -= MetadataIdToken.len + (id.largeBlock ? UINT24_LE.len : UINT8.len) + dataSizeInWords * 2;
      debug(`remainingLength=${remaining}`);
      if (id.isOddSize) {
        await this.tokenizer.ignore(1);
      }
    }
    if (remaining !== 0) {
      throw new WavPackContentError("metadata-sub-block should fit it remaining length");
    }
  }
};
export {
  WavPackContentError,
  WavPackParser
};
//# sourceMappingURL=WavPackParser-ABMEBXBA.js.map
