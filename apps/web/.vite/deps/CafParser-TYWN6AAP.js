import {
  BasicParser,
  EndOfStreamError,
  Float32_BE,
  Float64_BE,
  INT32_BE,
  INT64_BE,
  UINT16_BE,
  UINT32_BE,
  Uint8ArrayType,
  defaultMaxMetadataEntries,
  getMaxMetadataEntries,
  makeUnexpectedFileContentError,
  textDecode
} from "./chunk-3HBPJLK7.js";
import {
  require_browser
} from "./chunk-ZGKN2RSD.js";
import {
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/caf/CafParser.js
var import_debug = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/caf/CafToken.js
var CafContentError = class extends makeUnexpectedFileContentError("CAF") {
};
var decodeFourCC = (buf, off) => textDecode(buf.subarray(off, off + 4), "latin1");
var FileHeader = {
  len: 8,
  get: (buf, off) => {
    return {
      fileType: decodeFourCC(buf, off),
      fileVersion: UINT16_BE.get(buf, off + 4),
      fileFlags: UINT16_BE.get(buf, off + 6)
    };
  }
};
var ChunkHeader = {
  len: 12,
  get: (buf, off) => {
    return {
      chunkType: decodeFourCC(buf, off),
      chunkSize: Number(INT64_BE.get(buf, off + 4))
    };
  }
};
var AudioDescription = {
  len: 32,
  get: (buf, off) => {
    return {
      sampleRate: Float64_BE.get(buf, off),
      formatId: decodeFourCC(buf, off + 8),
      formatFlags: UINT32_BE.get(buf, off + 12),
      bytesPerPacket: UINT32_BE.get(buf, off + 16),
      framesPerPacket: UINT32_BE.get(buf, off + 20),
      channelsPerFrame: UINT32_BE.get(buf, off + 24),
      bitsPerChannel: UINT32_BE.get(buf, off + 28)
    };
  }
};
var PacketTableHeader = {
  len: 24,
  get: (buf, off) => {
    return {
      numberPackets: Number(INT64_BE.get(buf, off)),
      numberValidFrames: Number(INT64_BE.get(buf, off + 8)),
      primingFrames: INT32_BE.get(buf, off + 16),
      remainderFrames: INT32_BE.get(buf, off + 20)
    };
  }
};
function varIntsPerPacket(desc) {
  return (desc.bytesPerPacket === 0 ? 1 : 0) + (desc.framesPerPacket === 0 ? 1 : 0);
}
function decodePacketTableEntries(body, desc, numberPackets) {
  const expected = numberPackets * varIntsPerPacket(desc);
  if (expected === 0) {
    return 0;
  }
  if (expected > body.length) {
    throw new CafContentError(`Packet Table data section holds ${body.length} byte(s) for ${expected} packet table entries`);
  }
  let offset = 0;
  for (let i = 0; i < expected; ++i) {
    let byte;
    do {
      if (offset >= body.length) {
        throw new CafContentError("Packet Table data section ends in the middle of a variable length integer");
      }
      byte = body[offset++];
    } while ((byte & 128) !== 0);
  }
  return offset;
}
var ChannelLayoutHeader = {
  len: 12,
  get: (buf, off) => {
    return {
      channelLayoutTag: UINT32_BE.get(buf, off),
      channelBitmap: UINT32_BE.get(buf, off + 4),
      numberChannelDescriptions: UINT32_BE.get(buf, off + 8)
    };
  }
};
var channelDescriptionLen = 20;
function parseChannelDescriptions(body, count, maxEntries = defaultMaxMetadataEntries) {
  if (count * channelDescriptionLen > body.length) {
    throw new CafContentError(`Channel Layout chunk declares ${count} description(s) for ${body.length} byte(s)`);
  }
  if (count > maxEntries) {
    throw new CafContentError(`Channel Layout description count ${count} exceeds entry limit ${maxEntries}`);
  }
  const descriptions = [];
  for (let i = 0; i < count; ++i) {
    const off = i * channelDescriptionLen;
    descriptions.push({
      channelLabel: UINT32_BE.get(body, off),
      channelFlags: UINT32_BE.get(body, off + 4),
      coordinates: [
        Float32_BE.get(body, off + 8),
        Float32_BE.get(body, off + 12),
        Float32_BE.get(body, off + 16)
      ]
    });
  }
  return descriptions;
}
function parseInfoEntries(body, maxEntries = defaultMaxMetadataEntries) {
  const readString = (from) => {
    const end = body.indexOf(0, from);
    if (end < 0) {
      throw new CafContentError("Information chunk contains an unterminated string");
    }
    return { value: textDecode(body.subarray(from, end), "utf8"), next: end + 1 };
  };
  const numEntries = UINT32_BE.get(body, 0);
  if (numEntries > maxEntries) {
    throw new CafContentError(`Information entry count ${numEntries} exceeds entry limit ${maxEntries}`);
  }
  const entries = [];
  let offset = 4;
  for (let i = 0; i < numEntries; ++i) {
    const key = readString(offset);
    const value = readString(key.next);
    entries.push({ key: key.value, value: value.value });
    offset = value.next;
  }
  return entries;
}

// ../../node_modules/music-metadata/lib/caf/CafParser.js
var debug = (0, import_debug.default)("music-metadata:parser:caf");
var codecByFormatId = {
  lpcm: { codec: "PCM", lossless: true },
  ima4: { codec: "IMA4 ADPCM", lossless: false },
  alac: { codec: "ALAC", lossless: true },
  flac: { codec: "FLAC", lossless: true },
  ulaw: { codec: "ITU-T G.711 mu-law", lossless: false },
  alaw: { codec: "ITU-T G.711 A-law", lossless: false },
  ".mp1": { codec: "MPEG-1 Layer I", lossless: false },
  ".mp2": { codec: "MPEG-1 Layer II", lossless: false },
  ".mp3": { codec: "MPEG-1 Layer III", lossless: false },
  "aac ": { codec: "AAC", lossless: false },
  aace: { codec: "AAC", lossless: false },
  aacf: { codec: "AAC", lossless: false },
  aacg: { codec: "AAC", lossless: false },
  aach: { codec: "AAC", lossless: false },
  aacl: { codec: "AAC", lossless: false },
  aacp: { codec: "AAC", lossless: false }
};
var editCountLen = 4;
var numEntriesLen = 4;
var CafParser = class extends BasicParser {
  constructor() {
    super(...arguments);
    __publicField(this, "desc");
    __publicField(this, "packetTable");
    __publicField(this, "dataBytes");
    __publicField(this, "expectedFirstChunk", true);
    __publicField(this, "reachedEndOfFile", false);
  }
  async parse() {
    const header = await this.tokenizer.readToken(FileHeader);
    if (header.fileType !== "caff") {
      throw new CafContentError(`Invalid file-type, expected 'caff', found '${header.fileType}'`);
    }
    this.metadata.setFormat("container", "CAF");
    this.metadata.setAudioOnly();
    while (!this.reachedEndOfFile && !this.endOfFileReached()) {
      let chunkHeader;
      try {
        chunkHeader = await this.tokenizer.readToken(ChunkHeader);
      } catch (error) {
        if (error instanceof EndOfStreamError) {
          debug("End-of-stream");
          break;
        }
        throw error;
      }
      debug(`Reading CAF chunk type=${chunkHeader.chunkType} size=${chunkHeader.chunkSize}`);
      if (this.expectedFirstChunk) {
        this.expectedFirstChunk = false;
        if (chunkHeader.chunkType !== "desc") {
          throw new CafContentError(`Expected an Audio Description chunk, found '${chunkHeader.chunkType}'`);
        }
      }
      await this.readChunk(chunkHeader);
    }
    if (!this.desc) {
      throw new CafContentError("Missing Audio Description chunk");
    }
    this.applyDerivedFormat();
  }
  endOfFileReached() {
    const { size } = this.tokenizer.fileInfo;
    return size !== void 0 && size - this.tokenizer.position < ChunkHeader.len;
  }
  async readChunk(header) {
    switch (header.chunkType) {
      case "desc":
        return this.readAudioDescription(header.chunkSize);
      case "pakt":
        return this.readPacketTable(header.chunkSize);
      case "data":
        return this.readAudioData(header.chunkSize);
      case "info":
        return this.readInfo(header.chunkSize);
      case "chan":
        return this.readChannelLayout(header.chunkSize);
      default:
        debug(`Ignore chunk type=${header.chunkType} size=${header.chunkSize}`);
        return this.skipUnknownChunk(header.chunkSize);
    }
  }
  async readAudioDescription(chunkSize) {
    if (chunkSize < AudioDescription.len) {
      throw new CafContentError(`Audio Description chunk size ${chunkSize} is smaller than ${AudioDescription.len}`);
    }
    this.desc = await this.tokenizer.readToken(AudioDescription);
    await this.tokenizer.ignore(chunkSize - AudioDescription.len);
    this.applyAudioDescription(this.desc);
  }
  applyAudioDescription(desc) {
    this.metadata.setFormat("sampleRate", desc.sampleRate);
    this.metadata.setFormat("numberOfChannels", desc.channelsPerFrame);
    if (desc.bitsPerChannel > 0) {
      this.metadata.setFormat("bitsPerSample", desc.bitsPerChannel);
    }
    const codec = codecByFormatId[desc.formatId];
    this.metadata.setFormat("codec", codec ? codec.codec : desc.formatId);
    if (codec) {
      this.metadata.setFormat("lossless", codec.lossless);
    }
  }
  async readPacketTable(chunkSize) {
    const desc = this.desc;
    if (!desc) {
      throw new CafContentError("Packet Table chunk found before the Audio Description chunk");
    }
    if (chunkSize < PacketTableHeader.len) {
      throw new CafContentError(`Packet Table chunk size ${chunkSize} is smaller than ${PacketTableHeader.len}`);
    }
    this.validateChunkAvailability(chunkSize, "Packet Table");
    const packetTable = await this.tokenizer.readToken(PacketTableHeader);
    const body = await this.readChunkBody(chunkSize - PacketTableHeader.len, "Packet Table");
    decodePacketTableEntries(body, desc, packetTable.numberPackets);
    this.packetTable = packetTable;
  }
  async readAudioData(chunkSize) {
    if (chunkSize >= 0 && chunkSize < editCountLen) {
      throw new CafContentError(`Audio Data chunk size ${chunkSize} is too small to hold mEditCount`);
    }
    if (chunkSize >= 0) {
      this.validateChunkAvailability(chunkSize, "Audio Data");
    }
    if (await this.tokenizer.ignore(editCountLen) !== editCountLen) {
      throw new EndOfStreamError();
    }
    if (chunkSize === -1) {
      this.reachedEndOfFile = true;
      const { size } = this.tokenizer.fileInfo;
      if (size !== void 0) {
        this.dataBytes = size - this.tokenizer.position;
        await this.tokenizer.ignore(this.dataBytes);
        return;
      }
      if (!this.options.duration) {
        debug("Audio Data chunk has an unknown size and duration was not requested");
        return;
      }
      const desc = this.desc;
      if (!desc || desc.sampleRate <= 0 || this.deriveFrameCount(desc) !== void 0 || desc.bytesPerPacket <= 0 || desc.framesPerPacket <= 0) {
        return;
      }
      this.dataBytes = await this.readToPhysicalEof();
      return;
    }
    const dataBytes = chunkSize - editCountLen;
    if (await this.tokenizer.ignore(dataBytes) !== dataBytes) {
      throw new EndOfStreamError();
    }
    this.dataBytes = dataBytes;
  }
  /**
   * Consume the remaining input, counting bytes until physical end-of-stream.
   * Only needed for duration recovery when neither the data chunk nor the input declares a size.
   */
  async readToPhysicalEof() {
    const buffer = new Uint8Array(64 * 1024);
    let bytes = 0;
    for (; ; ) {
      const read = await this.tokenizer.readBuffer(buffer, { mayBeLess: true });
      if (read === 0) {
        return bytes;
      }
      bytes += read;
    }
  }
  async readInfo(chunkSize) {
    if (chunkSize < numEntriesLen) {
      throw new CafContentError(`Information chunk size ${chunkSize} is too small to hold mNumEntries`);
    }
    const body = await this.readChunkBody(chunkSize, "Information");
    const entries = parseInfoEntries(body, getMaxMetadataEntries(this.options));
    for (const { key, value } of entries) {
      if (["artist", "composer", "lyricist", "genre"].includes(key)) {
        let count = 1;
        for (let offset = value.indexOf(","); offset >= 0; offset = value.indexOf(",", offset + 1)) {
          ++count;
        }
        if (count > getMaxMetadataEntries(this.options)) {
          throw new CafContentError(`Comma-separated value count ${count} exceeds entry limit ${getMaxMetadataEntries(this.options)}`);
        }
      }
      debug(`info key=${key}`);
      await this.metadata.addTag("CAF", key, value);
    }
  }
  async readChannelLayout(chunkSize) {
    if (chunkSize < ChannelLayoutHeader.len) {
      throw new CafContentError(`Channel Layout chunk size ${chunkSize} is smaller than ${ChannelLayoutHeader.len}`);
    }
    this.validateChunkAvailability(chunkSize, "Channel Layout");
    const header = await this.tokenizer.readToken(ChannelLayoutHeader);
    const descriptionLen = header.numberChannelDescriptions * channelDescriptionLen;
    const bodyLen = ChannelLayoutHeader.len + descriptionLen;
    if (bodyLen > chunkSize) {
      throw new CafContentError(`Channel Layout chunk declares ${header.numberChannelDescriptions} description(s) which exceed its size of ${chunkSize}`);
    }
    const descriptions = descriptionLen > 0 ? parseChannelDescriptions(await this.readChunkBody(descriptionLen, "Channel Layout"), header.numberChannelDescriptions, getMaxMetadataEntries(this.options)) : [];
    await this.addChannelLayout(header, descriptions);
    await this.tokenizer.ignore(chunkSize - bodyLen);
  }
  async addChannelLayout(header, descriptions) {
    await this.metadata.addTag("CAF", "channelLayoutTag", header.channelLayoutTag);
    await this.metadata.addTag("CAF", "channelLayoutBitmap", header.channelBitmap);
    if (descriptions.length > 0) {
      await this.metadata.addTag("CAF", "channelLayoutDescriptions", descriptions);
    }
  }
  /**
   * Rejects a whole chunk whose declared size exceeds the remaining input.
   * Only applicable when the total input size is known.
   */
  validateChunkAvailability(chunkSize, chunkType) {
    const { size } = this.tokenizer.fileInfo;
    if (size !== void 0) {
      const available = size - this.tokenizer.position;
      if (chunkSize > available) {
        throw new CafContentError(`${chunkType} chunk size ${chunkSize} exceeds available input size ${available}`);
      }
    }
  }
  /**
   * Reads a chunk body without trusting its declared size.
   * @param chunkSize Declared body size
   * @param chunkType Chunk name for error messages
   */
  async readChunkBody(chunkSize, chunkType) {
    this.validateChunkAvailability(chunkSize, chunkType);
    return this.readToken(new Uint8ArrayType(chunkSize));
  }
  async skipUnknownChunk(chunkSize) {
    if (chunkSize < 0) {
      throw new CafContentError(`Chunk size ${chunkSize} may only be -1 for an Audio Data chunk`);
    }
    await this.tokenizer.ignore(chunkSize);
  }
  // Deferred: the packet table and audio payload may arrive after the description
  applyDerivedFormat() {
    const desc = this.desc;
    if (!desc || desc.sampleRate <= 0) {
      return;
    }
    const frames = this.deriveFrameCount(desc);
    if (frames === void 0) {
      debug("Unable to derive the number of sample frames");
      return;
    }
    const duration = frames / desc.sampleRate;
    this.metadata.setFormat("numberOfSamples", frames);
    this.metadata.setFormat("duration", duration);
    if (this.dataBytes !== void 0) {
      this.metadata.setFormat("bitrate", 8 * this.dataBytes / duration);
    }
  }
  deriveFrameCount(desc) {
    const packetTable = this.packetTable;
    if (packetTable) {
      if (packetTable.numberValidFrames > 0) {
        return packetTable.numberValidFrames;
      }
      debug(`Ignoring packet table with mNumberValidFrames=${packetTable.numberValidFrames}`);
    }
    if (desc.bytesPerPacket > 0 && desc.framesPerPacket > 0 && this.dataBytes !== void 0) {
      const frames = Math.floor(this.dataBytes / desc.bytesPerPacket) * desc.framesPerPacket;
      if (frames > 0) {
        return frames;
      }
    }
    return void 0;
  }
};
export {
  CafParser
};
//# sourceMappingURL=CafParser-TYWN6AAP.js.map
