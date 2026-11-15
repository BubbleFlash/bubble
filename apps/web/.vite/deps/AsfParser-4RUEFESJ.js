import {
  TrackType
} from "./chunk-XS2AH7GC.js";
import {
  AttachedPictureType
} from "./chunk-GQBXDRBH.js";
import {
  decodeString,
  stripNulls
} from "./chunk-O76RKEBI.js";
import {
  BasicParser,
  EndOfStreamError,
  StringType,
  TokenizerBoundaryError,
  UINT16_LE,
  UINT32_LE,
  UINT64_LE,
  Uint8ArrayType,
  createTokenizerView,
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

// ../../node_modules/music-metadata/lib/asf/AsfParser.js
var import_debug = __toESM(require_browser(), 1);

// ../../node_modules/win-guid/lib/guid.js
function parseWindowsGuid(guid) {
  let s = guid.trim();
  if (s.length !== 36 || s[8] !== "-" || s[13] !== "-" || s[18] !== "-" || s[23] !== "-") {
    throw new Error(`Invalid GUID format: ${guid}`);
  }
  let v;
  const out = new Uint8Array(16);
  v = parseInt(s.slice(0, 8), 16);
  out[0] = v & 255;
  out[1] = v >>> 8 & 255;
  out[2] = v >>> 16 & 255;
  out[3] = v >>> 24 & 255;
  v = parseInt(s.slice(9, 13), 16);
  out[4] = v & 255;
  out[5] = v >>> 8 & 255;
  v = parseInt(s.slice(14, 18), 16);
  out[6] = v & 255;
  out[7] = v >>> 8 & 255;
  v = parseInt(s.slice(19, 23), 16);
  out[8] = v >>> 8 & 255;
  out[9] = v & 255;
  v = parseInt(s.slice(24, 32), 16);
  out[10] = v >>> 24 & 255;
  out[11] = v >>> 16 & 255;
  out[12] = v >>> 8 & 255;
  out[13] = v & 255;
  v = parseInt(s.slice(32, 36), 16);
  out[14] = v >>> 8 & 255;
  out[15] = v & 255;
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(out[i])) {
      throw new Error(`Invalid GUID format: ${guid}`);
    }
  }
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s)) {
    throw new Error(`Invalid GUID format: ${guid}`);
  }
  return out;
}
var Guid = class _Guid {
  constructor(bytes) {
    if (bytes.length !== 16)
      throw new Error("GUID must be exactly 16 bytes");
    this.bytes = bytes;
  }
  static fromString(guid) {
    return new _Guid(parseWindowsGuid(guid));
  }
  /**
   * Convert Windows / CFBF byte order into canonical GUID string:
   * xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   */
  toString() {
    const b = this.bytes;
    const hx = (n) => n.toString(16).padStart(2, "0");
    const g1 = hx(b[3]) + hx(b[2]) + hx(b[1]) + hx(b[0]);
    const g2 = hx(b[5]) + hx(b[4]);
    const g3 = hx(b[7]) + hx(b[6]);
    const g4 = hx(b[8]) + hx(b[9]);
    const g5 = hx(b[10]) + hx(b[11]) + hx(b[12]) + hx(b[13]) + hx(b[14]) + hx(b[15]);
    return `${g1}-${g2}-${g3}-${g4}-${g5}`.toUpperCase();
  }
  /**
   * Compare against a Uint8Array containing GUID bytes
   * in Windows / CFBF layout.
   */
  equals(buf, offset = 0) {
    if (offset < 0 || buf.length - offset < 16)
      return false;
    const a = this.bytes;
    for (let i = 0; i < 16; i++) {
      if (buf[offset + i] !== a[i])
        return false;
    }
    return true;
  }
};

// ../../node_modules/music-metadata/lib/asf/AsfGuid.js
var _AsfGuid = class _AsfGuid {
  constructor(str) {
    __publicField(this, "str");
    this.str = str;
  }
  static fromBin(bin, offset = 0) {
    return new _AsfGuid(_AsfGuid.decode(bin, offset));
  }
  /**
   * Decode GUID in format like "B503BF5F-2EA9-CF11-8EE3-00C00C205365"
   * @param objectId Binary GUID
   * @param offset Read offset in bytes, default 0
   * @returns GUID as dashed hexadecimal representation
   */
  static decode(objectId, offset = 0) {
    return new Guid(objectId.subarray(offset, offset + 16)).toString();
  }
  /**
   * Decode stream type
   * @param mediaType Media type GUID
   * @returns Media type
   */
  static decodeMediaType(mediaType) {
    switch (mediaType.str) {
      case _AsfGuid.AudioMedia.str:
        return "audio";
      case _AsfGuid.VideoMedia.str:
        return "video";
      case _AsfGuid.CommandMedia.str:
        return "command";
      case _AsfGuid.Degradable_JPEG_Media.str:
        return "degradable-jpeg";
      case _AsfGuid.FileTransferMedia.str:
        return "file-transfer";
      case _AsfGuid.BinaryMedia.str:
        return "binary";
    }
  }
  /**
   * Encode GUID
   * @param guid GUID like: "B503BF5F-2EA9-CF11-8EE3-00C00C205365"
   * @returns Encoded Binary GUID
   */
  static encode(guid) {
    return parseWindowsGuid(guid);
  }
  equals(guid) {
    return this.str === guid.str;
  }
  toBin() {
    return _AsfGuid.encode(this.str);
  }
};
// 10.1 Top-level ASF object GUIDs
__publicField(_AsfGuid, "HeaderObject", new _AsfGuid("75B22630-668E-11CF-A6D9-00AA0062CE6C"));
__publicField(_AsfGuid, "DataObject", new _AsfGuid("75B22636-668E-11CF-A6D9-00AA0062CE6C"));
__publicField(_AsfGuid, "SimpleIndexObject", new _AsfGuid("33000890-E5B1-11CF-89F4-00A0C90349CB"));
__publicField(_AsfGuid, "IndexObject", new _AsfGuid("D6E229D3-35DA-11D1-9034-00A0C90349BE"));
__publicField(_AsfGuid, "MediaObjectIndexObject", new _AsfGuid("FEB103F8-12AD-4C64-840F-2A1D2F7AD48C"));
__publicField(_AsfGuid, "TimecodeIndexObject", new _AsfGuid("3CB73FD0-0C4A-4803-953D-EDF7B6228F0C"));
// 10.2 Header Object GUIDs
__publicField(_AsfGuid, "FilePropertiesObject", new _AsfGuid("8CABDCA1-A947-11CF-8EE4-00C00C205365"));
__publicField(_AsfGuid, "StreamPropertiesObject", new _AsfGuid("B7DC0791-A9B7-11CF-8EE6-00C00C205365"));
__publicField(_AsfGuid, "HeaderExtensionObject", new _AsfGuid("5FBF03B5-A92E-11CF-8EE3-00C00C205365"));
__publicField(_AsfGuid, "CodecListObject", new _AsfGuid("86D15240-311D-11D0-A3A4-00A0C90348F6"));
__publicField(_AsfGuid, "ScriptCommandObject", new _AsfGuid("1EFB1A30-0B62-11D0-A39B-00A0C90348F6"));
__publicField(_AsfGuid, "MarkerObject", new _AsfGuid("F487CD01-A951-11CF-8EE6-00C00C205365"));
__publicField(_AsfGuid, "BitrateMutualExclusionObject", new _AsfGuid("D6E229DC-35DA-11D1-9034-00A0C90349BE"));
__publicField(_AsfGuid, "ErrorCorrectionObject", new _AsfGuid("75B22635-668E-11CF-A6D9-00AA0062CE6C"));
__publicField(_AsfGuid, "ContentDescriptionObject", new _AsfGuid("75B22633-668E-11CF-A6D9-00AA0062CE6C"));
__publicField(_AsfGuid, "ExtendedContentDescriptionObject", new _AsfGuid("D2D0A440-E307-11D2-97F0-00A0C95EA850"));
__publicField(_AsfGuid, "ContentBrandingObject", new _AsfGuid("2211B3FA-BD23-11D2-B4B7-00A0C955FC6E"));
__publicField(_AsfGuid, "StreamBitratePropertiesObject", new _AsfGuid("7BF875CE-468D-11D1-8D82-006097C9A2B2"));
__publicField(_AsfGuid, "ContentEncryptionObject", new _AsfGuid("2211B3FB-BD23-11D2-B4B7-00A0C955FC6E"));
__publicField(_AsfGuid, "ExtendedContentEncryptionObject", new _AsfGuid("298AE614-2622-4C17-B935-DAE07EE9289C"));
__publicField(_AsfGuid, "DigitalSignatureObject", new _AsfGuid("2211B3FC-BD23-11D2-B4B7-00A0C955FC6E"));
__publicField(_AsfGuid, "PaddingObject", new _AsfGuid("1806D474-CADF-4509-A4BA-9AABCB96AAE8"));
// 10.3 Header Extension Object GUIDs
__publicField(_AsfGuid, "ExtendedStreamPropertiesObject", new _AsfGuid("14E6A5CB-C672-4332-8399-A96952065B5A"));
__publicField(_AsfGuid, "AdvancedMutualExclusionObject", new _AsfGuid("A08649CF-4775-4670-8A16-6E35357566CD"));
__publicField(_AsfGuid, "GroupMutualExclusionObject", new _AsfGuid("D1465A40-5A79-4338-B71B-E36B8FD6C249"));
__publicField(_AsfGuid, "StreamPrioritizationObject", new _AsfGuid("D4FED15B-88D3-454F-81F0-ED5C45999E24"));
__publicField(_AsfGuid, "BandwidthSharingObject", new _AsfGuid("A69609E6-517B-11D2-B6AF-00C04FD908E9"));
__publicField(_AsfGuid, "LanguageListObject", new _AsfGuid("7C4346A9-EFE0-4BFC-B229-393EDE415C85"));
__publicField(_AsfGuid, "MetadataObject", new _AsfGuid("C5F8CBEA-5BAF-4877-8467-AA8C44FA4CCA"));
__publicField(_AsfGuid, "MetadataLibraryObject", new _AsfGuid("44231C94-9498-49D1-A141-1D134E457054"));
__publicField(_AsfGuid, "IndexParametersObject", new _AsfGuid("D6E229DF-35DA-11D1-9034-00A0C90349BE"));
__publicField(_AsfGuid, "MediaObjectIndexParametersObject", new _AsfGuid("6B203BAD-3F11-48E4-ACA8-D7613DE2CFA7"));
__publicField(_AsfGuid, "TimecodeIndexParametersObject", new _AsfGuid("F55E496D-9797-4B5D-8C8B-604DFE9BFB24"));
__publicField(_AsfGuid, "CompatibilityObject", new _AsfGuid("26F18B5D-4584-47EC-9F5F-0E651F0452C9"));
__publicField(_AsfGuid, "AdvancedContentEncryptionObject", new _AsfGuid("43058533-6981-49E6-9B74-AD12CB86D58C"));
// 10.4 Stream Properties Object Stream Type GUIDs
__publicField(_AsfGuid, "AudioMedia", new _AsfGuid("F8699E40-5B4D-11CF-A8FD-00805F5C442B"));
__publicField(_AsfGuid, "VideoMedia", new _AsfGuid("BC19EFC0-5B4D-11CF-A8FD-00805F5C442B"));
__publicField(_AsfGuid, "CommandMedia", new _AsfGuid("59DACFC0-59E6-11D0-A3AC-00A0C90348F6"));
__publicField(_AsfGuid, "JFIF_Media", new _AsfGuid("B61BE100-5B4E-11CF-A8FD-00805F5C442B"));
__publicField(_AsfGuid, "Degradable_JPEG_Media", new _AsfGuid("35907DE0-E415-11CF-A917-00805F5C442B"));
__publicField(_AsfGuid, "FileTransferMedia", new _AsfGuid("91BD222C-F21C-497A-8B6D-5AA86BFC0185"));
__publicField(_AsfGuid, "BinaryMedia", new _AsfGuid("3AFB65E2-47EF-40F2-AC2C-70A90D71D343"));
__publicField(_AsfGuid, "ASF_Index_Placeholder_Object", new _AsfGuid("D9AADE20-7C17-4F9C-BC28-8555DD98E2A2"));
var AsfGuid = _AsfGuid;

// ../../node_modules/music-metadata/lib/asf/AsfUtil.js
function getParserForAttr(i) {
  return attributeParsers[i];
}
function parseUnicodeAttr(uint8Array) {
  return stripNulls(decodeString(uint8Array, "utf-16le"));
}
var attributeParsers = [
  parseUnicodeAttr,
  parseByteArrayAttr,
  parseBoolAttr,
  parseDWordAttr,
  parseQWordAttr,
  parseWordAttr,
  parseByteArrayAttr
];
function parseByteArrayAttr(buf) {
  return new Uint8Array(buf);
}
function parseBoolAttr(buf, offset = 0) {
  return parseWordAttr(buf, offset) === 1;
}
function parseDWordAttr(buf, offset = 0) {
  return UINT32_LE.get(buf, offset);
}
function parseQWordAttr(buf, offset = 0) {
  return UINT64_LE.get(buf, offset);
}
function parseWordAttr(buf, offset = 0) {
  return UINT16_LE.get(buf, offset);
}

// ../../node_modules/music-metadata/lib/asf/AsfObject.js
var AsfContentParseError = class extends makeUnexpectedFileContentError("ASF") {
};
var ByteCursor = class {
  constructor(buf, off, length, context) {
    __publicField(this, "context");
    __publicField(this, "data");
    __publicField(this, "position", 0);
    this.context = context;
    if (off < 0 || length < 0 || length > buf.length - off) {
      throw new AsfContentParseError(`Truncated ${context}`);
    }
    this.data = buf.subarray(off, off + length);
  }
  get remaining() {
    return this.data.length - this.position;
  }
  require(length, message = `Truncated ${this.context}`) {
    if (length > this.remaining) {
      throw new AsfContentParseError(message);
    }
  }
  read(token) {
    this.require(token.len);
    const value = token.get(this.data, this.position);
    this.position += token.len;
    return value;
  }
  bytes(length, message) {
    this.require(length, message);
    const start = this.position;
    this.position += length;
    return this.data.subarray(start, this.position);
  }
};
var DataType = {
  /**
   * Unicode string. The data consists of a sequence of Unicode characters.
   */
  UnicodeString: 0,
  /**
   * BYTE array. The type of data is implementation-specific.
   */
  ByteArray: 1,
  /**
   * BOOL. The data is 2 bytes long and should be interpreted as a 16-bit unsigned integer. Only 0x0000 or 0x0001 are permitted values.
   */
  Bool: 2,
  /**
   * DWORD. The data is 4 bytes long and should be interpreted as a 32-bit unsigned integer.
   */
  DWord: 3,
  /**
   * QWORD. The data is 8 bytes long and should be interpreted as a 64-bit unsigned integer.
   */
  QWord: 4,
  /**
   * WORD. The data is 2 bytes long and should be interpreted as a 16-bit unsigned integer.
   */
  Word: 5
};
var TopLevelHeaderObjectToken = {
  len: 30,
  get: (buf, off) => {
    const base = HeaderObjectToken.get(buf, off);
    if (base.objectSize < TopLevelHeaderObjectToken.len) {
      throw new AsfContentParseError(`Invalid ASF top-level header object size: ${base.objectSize}`);
    }
    return {
      ...base,
      numberOfHeaderObjects: UINT32_LE.get(buf, off + 24)
      // reserved: 2 bytes
    };
  }
};
var HeaderObjectToken = {
  len: 24,
  get: (buf, off) => {
    const objectSize = UINT64_LE.get(buf, off + 16);
    if (objectSize < BigInt(HeaderObjectToken.len) || objectSize > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new AsfContentParseError(`Invalid ASF header object size: ${objectSize}`);
    }
    const header = {
      objectId: AsfGuid.fromBin(buf, off),
      objectSize: Number(objectSize)
    };
    return header;
  }
};
var State = class {
  constructor(header) {
    __publicField(this, "len");
    this.len = header.objectSize - HeaderObjectToken.len;
  }
  postProcessTag(tags, name, valueType, data) {
    if (name === "WM/Picture") {
      tags.push({ id: name, value: WmPictureToken.fromBuffer(data) });
    } else {
      const parseAttr = getParserForAttr(valueType);
      if (!parseAttr) {
        throw new AsfContentParseError(`unexpected value headerType: ${valueType}`);
      }
      const buffer = data;
      const minimumLength = valueType === DataType.QWord ? 8 : valueType === DataType.DWord ? 4 : valueType === DataType.Bool || valueType === DataType.Word ? 2 : 0;
      if (buffer.length < minimumLength) {
        throw new AsfContentParseError(`Truncated ASF attribute ${name} of type ${valueType}`);
      }
      tags.push({ id: name, value: parseAttr(buffer) });
    }
  }
};
var FilePropertiesObject = class extends State {
  get(buf, off) {
    const flags = UINT32_LE.get(buf, off + 64);
    return {
      fileId: AsfGuid.fromBin(buf, off),
      fileSize: UINT64_LE.get(buf, off + 16),
      creationDate: UINT64_LE.get(buf, off + 24),
      dataPacketsCount: UINT64_LE.get(buf, off + 32),
      playDuration: UINT64_LE.get(buf, off + 40),
      sendDuration: UINT64_LE.get(buf, off + 48),
      preroll: UINT64_LE.get(buf, off + 56),
      flags: {
        broadcast: (flags & 1) !== 0,
        seekable: (flags & 2) !== 0
      },
      // flagsNumeric: Token.UINT32_LE.get(buf, off + 64),
      minimumDataPacketSize: UINT32_LE.get(buf, off + 68),
      maximumDataPacketSize: UINT32_LE.get(buf, off + 72),
      maximumBitrate: UINT32_LE.get(buf, off + 76)
    };
  }
};
__publicField(FilePropertiesObject, "guid", AsfGuid.FilePropertiesObject);
var StreamPropertiesObject = class extends State {
  get(buf, off) {
    const available = Math.min(this.len, buf.length - off);
    if (available < 54) {
      throw new AsfContentParseError("Truncated Stream Properties Object");
    }
    const typeSpecificSize = UINT32_LE.get(buf, off + 40);
    const correctionSize = UINT32_LE.get(buf, off + 44);
    if (typeSpecificSize + correctionSize > available - 54) {
      throw new AsfContentParseError("ASF stream data exceeds Stream Properties Object payload");
    }
    const result = {
      streamType: AsfGuid.decodeMediaType(AsfGuid.fromBin(buf, off)),
      errorCorrectionType: AsfGuid.fromBin(buf, off + 16),
      streamNumber: UINT16_LE.get(buf, off + 48) & 127
    };
    const data = off + 54;
    if (result.streamType === "audio" && typeSpecificSize >= 16) {
      result.codecId = `0x${UINT16_LE.get(buf, data).toString(16).padStart(4, "0")}`;
      result.audio = {
        channels: UINT16_LE.get(buf, data + 2),
        samplingFrequency: UINT32_LE.get(buf, data + 4)
      };
      const bitDepth = UINT16_LE.get(buf, data + 14);
      if (bitDepth > 0) {
        result.audio.bitDepth = bitDepth;
      }
      const bytesPerSecond = UINT32_LE.get(buf, data + 8);
      if (bytesPerSecond > 0) {
        result.bitrate = bytesPerSecond * 8;
      }
    } else if (result.streamType === "video" && typeSpecificSize >= 11) {
      result.video = {
        pixelWidth: UINT32_LE.get(buf, data),
        pixelHeight: UINT32_LE.get(buf, data + 4)
      };
      const formatSize = UINT16_LE.get(buf, data + 9);
      if (formatSize > typeSpecificSize - 11) {
        throw new AsfContentParseError("ASF video format data exceeds stream data");
      }
      if (formatSize >= 20) {
        result.codecId = new StringType(4, "ascii").get(buf, data + 27);
      }
    }
    return result;
  }
};
__publicField(StreamPropertiesObject, "guid", AsfGuid.StreamPropertiesObject);
var HeaderExtensionObject = class {
  constructor() {
    __publicField(this, "len");
    this.len = 22;
  }
  get(buf, off) {
    if (off < 0 || this.len > buf.length - off) {
      throw new AsfContentParseError("Truncated Header Extension Object");
    }
    const view = new DataView(buf.buffer, buf.byteOffset + off, this.len);
    return {
      reserved1: AsfGuid.fromBin(buf, off),
      reserved2: view.getUint16(16, true),
      extensionDataSize: view.getUint32(18, true)
    };
  }
};
__publicField(HeaderExtensionObject, "guid", AsfGuid.HeaderExtensionObject);
var CodecListObjectHeader = {
  len: 20,
  get: (buf, off) => {
    const view = new DataView(buf.buffer, off);
    return {
      entryCount: view.getUint16(16, true)
    };
  }
};
async function readString(reader) {
  const length = await reader.readNumber(UINT16_LE);
  return (await reader.readToken(new StringType(length * 2, "utf-16le"))).replace("\0", "");
}
async function readCodecEntries(tokenizer, payloadSize, maxEntries = defaultMaxMetadataEntries) {
  const reader = createTokenizerView(tokenizer, payloadSize);
  const entries = [];
  try {
    const codecHeader = await reader.readToken(CodecListObjectHeader);
    if (codecHeader.entryCount > maxEntries) {
      throw new AsfContentParseError(`ASF Codec List entry count ${codecHeader.entryCount} exceeds entry limit ${maxEntries}`);
    }
    for (let i = 0; i < codecHeader.entryCount; ++i) {
      entries.push(await readCodecEntry(reader));
    }
    await reader.consumeRemainder();
  } catch (error) {
    if (error instanceof EndOfStreamError || error instanceof TokenizerBoundaryError) {
      throw new AsfContentParseError(`Unexpected end of ASF Codec List Object: ${error.message}`);
    }
    throw error;
  } finally {
    await reader.close();
  }
  return entries;
}
async function readInformation(reader) {
  const length = await reader.readNumber(UINT16_LE);
  return reader.readToken(new Uint8ArrayType(length));
}
async function readCodecEntry(reader) {
  const type = await reader.readNumber(UINT16_LE);
  return {
    type: {
      videoCodec: (type & 1) === 1,
      audioCodec: (type & 2) === 2
    },
    codecName: await readString(reader),
    description: await readString(reader),
    information: await readInformation(reader)
  };
}
var _ContentDescriptionObjectState = class _ContentDescriptionObjectState extends State {
  get(buf, off) {
    const cursor = new ByteCursor(buf, off, this.len, "Content Description Object");
    const lengths = cursor.bytes(10, "Truncated Content Description Object");
    const tags = [];
    for (const [i, tagName] of _ContentDescriptionObjectState.contentDescTags.entries()) {
      const length = UINT16_LE.get(lengths, i * 2);
      const value = cursor.bytes(length, `${tagName} length ${length} exceeds Content Description payload`);
      if (length > 0) {
        tags.push({ id: tagName, value: parseUnicodeAttr(value) });
      }
    }
    return tags;
  }
};
__publicField(_ContentDescriptionObjectState, "guid", AsfGuid.ContentDescriptionObject);
__publicField(_ContentDescriptionObjectState, "contentDescTags", ["Title", "Author", "Copyright", "Description", "Rating"]);
var ContentDescriptionObjectState = _ContentDescriptionObjectState;
var ExtendedContentDescriptionObjectState = class extends State {
  get(buf, off) {
    const cursor = new ByteCursor(buf, off, this.len, "Extended Content Description Object");
    const tags = [];
    const attrCount = cursor.read(UINT16_LE);
    if (attrCount > cursor.remaining / 6) {
      throw new AsfContentParseError("Extended Content Description count exceeds payload");
    }
    for (let i = 0; i < attrCount; i += 1) {
      cursor.require(6, "Truncated Extended Content Description record");
      const nameLen = cursor.read(UINT16_LE);
      cursor.require(nameLen + 4, "Extended Content Description name exceeds payload");
      const name = parseUnicodeAttr(cursor.bytes(nameLen, "Extended Content Description name exceeds payload"));
      const valueType = cursor.read(UINT16_LE);
      const valueLen = cursor.read(UINT16_LE);
      const value = cursor.bytes(valueLen, "Extended Content Description value exceeds payload");
      this.postProcessTag(tags, name, valueType, value);
    }
    return tags;
  }
};
__publicField(ExtendedContentDescriptionObjectState, "guid", AsfGuid.ExtendedContentDescriptionObject);
var ExtendedStreamPropertiesObjectState = class extends State {
  get(buf, off) {
    const end = off + Math.min(this.len, buf.length - off);
    if (end - off < 64) {
      throw new AsfContentParseError("Truncated Extended Stream Properties Object");
    }
    const flags = UINT32_LE.get(buf, off + 44);
    const result = {
      startTime: UINT64_LE.get(buf, off),
      endTime: UINT64_LE.get(buf, off + 8),
      dataBitrate: UINT32_LE.get(buf, off + 16),
      bufferSize: UINT32_LE.get(buf, off + 20),
      initialBufferFullness: UINT32_LE.get(buf, off + 24),
      alternateDataBitrate: UINT32_LE.get(buf, off + 28),
      alternateBufferSize: UINT32_LE.get(buf, off + 32),
      alternateInitialBufferFullness: UINT32_LE.get(buf, off + 36),
      maximumObjectSize: UINT32_LE.get(buf, off + 40),
      flags: {
        reliableFlag: (flags & 1) !== 0,
        seekableFlag: (flags & 2) !== 0,
        resendLiveCleanpointsFlag: (flags & 8) !== 0
      },
      streamNumber: UINT16_LE.get(buf, off + 48) & 127,
      streamLanguageId: UINT16_LE.get(buf, off + 50),
      averageTimePerFrame: Number(UINT64_LE.get(buf, off + 52)),
      streamNameCount: UINT16_LE.get(buf, off + 60),
      payloadExtensionSystems: UINT16_LE.get(buf, off + 62),
      streamNames: [],
      streamPropertiesObject: null
    };
    let cursor = off + 64;
    const requireBytes = (length) => {
      if (length > end - cursor) {
        throw new AsfContentParseError("ASF extended stream data exceeds object payload");
      }
    };
    for (let index = 0; index < result.streamNameCount; ++index) {
      requireBytes(4);
      const language = UINT16_LE.get(buf, cursor);
      const length = UINT16_LE.get(buf, cursor + 2);
      cursor += 4;
      requireBytes(length);
      result.streamNames.push({
        streamLanguageId: language,
        streamName: parseUnicodeAttr(buf.subarray(cursor, cursor + length))
      });
      cursor += length;
    }
    for (let index = 0; index < result.payloadExtensionSystems; ++index) {
      requireBytes(22);
      const length = UINT32_LE.get(buf, cursor + 18);
      cursor += 22;
      requireBytes(length);
      cursor += length;
    }
    if (cursor < end) {
      requireBytes(HeaderObjectToken.len);
      const header = HeaderObjectToken.get(buf, cursor);
      if (!header.objectId.equals(AsfGuid.StreamPropertiesObject) || header.objectSize !== end - cursor) {
        throw new AsfContentParseError("Invalid embedded ASF Stream Properties Object");
      }
      result.streamPropertiesObject = new StreamPropertiesObject(header).get(buf, cursor + HeaderObjectToken.len);
    }
    return result;
  }
};
__publicField(ExtendedStreamPropertiesObjectState, "guid", AsfGuid.ExtendedStreamPropertiesObject);
var MetadataObjectState = class extends State {
  get(uint8Array, off) {
    const cursor = new ByteCursor(uint8Array, off, this.len, "Metadata Object");
    const tags = [];
    const descriptionRecordsCount = cursor.read(UINT16_LE);
    if (descriptionRecordsCount > cursor.remaining / 12) {
      throw new AsfContentParseError("Metadata record count exceeds payload");
    }
    for (let i = 0; i < descriptionRecordsCount; i += 1) {
      cursor.require(12, "Truncated Metadata record header");
      cursor.read(UINT32_LE);
      const nameLen = cursor.read(UINT16_LE);
      const dataType = cursor.read(UINT16_LE);
      const dataLen = cursor.read(UINT32_LE);
      const name = parseUnicodeAttr(cursor.bytes(nameLen, "Metadata name exceeds payload"));
      const data = cursor.bytes(dataLen, "Metadata value exceeds payload");
      this.postProcessTag(tags, name, dataType, data);
    }
    return tags;
  }
};
__publicField(MetadataObjectState, "guid", AsfGuid.MetadataObject);
var MetadataLibraryObjectState = class extends MetadataObjectState {
};
__publicField(MetadataLibraryObjectState, "guid", AsfGuid.MetadataLibraryObject);
var WmPictureToken = class _WmPictureToken {
  constructor(len) {
    __publicField(this, "len");
    this.len = len;
  }
  static fromBuffer(buffer) {
    const pic = new _WmPictureToken(buffer.length);
    return pic.get(buffer, 0);
  }
  get(buffer, offset) {
    const payload = buffer.subarray(offset, offset + this.len);
    if (payload.length < 5) {
      throw new AsfContentParseError("Truncated ASF picture header");
    }
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const typeId = view.getUint8(0);
    const size = view.getUint32(1, true);
    let index = 5;
    const readString2 = (field) => {
      const start = index;
      while (index + 2 <= payload.length) {
        const codeUnit = view.getUint16(index, true);
        index += 2;
        if (codeUnit === 0) {
          return new StringType(index - start - 2, "utf-16le").get(payload, start);
        }
      }
      throw new AsfContentParseError(`Unterminated ASF picture ${field}`);
    };
    const format = readString2("MIME type");
    const description = readString2("description");
    return {
      type: AttachedPictureType[typeId],
      format,
      description,
      size,
      data: payload.slice(index)
    };
  }
};

// ../../node_modules/music-metadata/lib/asf/AsfParser.js
var debug = (0, import_debug.default)("music-metadata:parser:ASF");
var headerType = "asf";
var AsfParser = class extends BasicParser {
  constructor() {
    super(...arguments);
    __publicField(this, "streams", /* @__PURE__ */ new Map());
    __publicField(this, "codecs", []);
    __publicField(this, "extendedStreams", /* @__PURE__ */ new Map());
    __publicField(this, "streamBitrates", /* @__PURE__ */ new Map());
  }
  async parse() {
    var _a, _b;
    const header = await this.readToken(TopLevelHeaderObjectToken);
    if (!header.objectId.equals(AsfGuid.HeaderObject)) {
      throw new AsfContentParseError(`expected asf header; but was not found; got: ${header.objectId.str}`);
    }
    if (header.numberOfHeaderObjects < 1 || header.numberOfHeaderObjects > 1e4) {
      throw new AsfContentParseError(`Unrealistic number of ASF header objects: ${header.numberOfHeaderObjects}`);
    }
    await this.parseObjectHeaders(header.numberOfHeaderObjects, header.objectSize - TopLevelHeaderObjectToken.len);
    for (const stream of this.streams.values()) {
      const type = stream.streamType === "audio" ? TrackType.audio : stream.streamType === "video" ? TrackType.video : stream.streamType === "command" ? TrackType.control : stream.streamType === "binary" ? TrackType.metadata : void 0;
      const codec = this.codecs.find((codec2) => {
        if (type === TrackType.audio && codec2.type.audioCodec && codec2.information.length >= 2) {
          return stream.codecId === `0x${UINT16_LE.get(codec2.information, 0).toString(16).padStart(4, "0")}`;
        }
        return type === TrackType.video && codec2.type.videoCodec && codec2.information.length >= 4 && stream.codecId === new StringType(4, "ascii").get(codec2.information, 0);
      });
      const track = { id: stream.streamNumber, type };
      const extended = this.extendedStreams.get(stream.streamNumber);
      if (stream.codecId !== void 0) {
        track.codecId = stream.codecId;
      }
      if (codec) {
        track.codecName = codec.codecName;
      }
      if (stream.audio) {
        track.audio = stream.audio;
      }
      if (stream.video) {
        track.video = stream.video;
      }
      if (extended) {
        if (extended.endTime > extended.startTime) {
          track.duration = Number(extended.endTime - extended.startTime) / 1e3;
        }
        const name = (_a = extended.streamNames[0]) == null ? void 0 : _a.streamName;
        if (name) {
          track.name = name;
        }
        if (track.video && extended.averageTimePerFrame > 0) {
          track.video.frameRate = 1e7 / extended.averageTimePerFrame;
        }
      }
      const bitrate = this.streamBitrates.get(stream.streamNumber) ?? (extended && extended.dataBitrate > 0 ? extended.dataBitrate : stream.bitrate);
      if (bitrate !== void 0) {
        track.bitrate = bitrate;
      }
      this.metadata.addStreamInfo(track);
    }
    const audio = (_b = [...this.streams.values()].find((stream) => stream.audio)) == null ? void 0 : _b.audio;
    if (audio) {
      this.metadata.setFormat("sampleRate", audio.samplingFrequency);
      this.metadata.setFormat("numberOfChannels", audio.channels);
      if (audio.bitDepth !== void 0) {
        this.metadata.setFormat("bitsPerSample", audio.bitDepth);
      }
    }
  }
  async parseObjectHeaders(numberOfObjectHeaders, remainingHeaderSize) {
    let tags;
    for (let index = 0; index < numberOfObjectHeaders; ++index) {
      const { header, payloadSize } = await this.readObjectHeader(remainingHeaderSize, "header");
      debug("header GUID=%s", header.objectId.str);
      switch (header.objectId.str) {
        case FilePropertiesObject.guid.str: {
          this.validateAllocationSize(payloadSize, "File Properties Object");
          const fpo = await this.readToken(new FilePropertiesObject(header));
          if (!fpo.flags.broadcast) {
            const duration = Number(fpo.playDuration) / 1e7 - Number(fpo.preroll) / 1e3;
            if (Number.isFinite(duration) && duration > 0) {
              this.metadata.setFormat("duration", duration);
              this.metadata.setFormat("containerDuration", duration);
            }
          }
          this.metadata.setFormat("bitrate", fpo.maximumBitrate);
          break;
        }
        case StreamPropertiesObject.guid.str: {
          this.validateAllocationSize(payloadSize, "Stream Properties Object");
          const spo = await this.readToken(new StreamPropertiesObject(header));
          this.metadata.setFormat("container", `ASF/${spo.streamType}`);
          if (spo.streamType === "audio") {
            this.metadata.setFormat("hasAudio", true);
          } else if (spo.streamType === "video") {
            this.metadata.setFormat("hasVideo", true);
          }
          this.streams.set(spo.streamNumber, spo);
          break;
        }
        case HeaderExtensionObject.guid.str: {
          const extensionHeaderToken = new HeaderExtensionObject();
          if (payloadSize < extensionHeaderToken.len) {
            throw new AsfContentParseError(`ASF Header Extension Object payload is too small: ${payloadSize} bytes`);
          }
          const extHeader = await this.readToken(extensionHeaderToken);
          const expectedExtensionSize = payloadSize - extensionHeaderToken.len;
          if (extHeader.extensionDataSize !== expectedExtensionSize) {
            throw new AsfContentParseError(`ASF extension data size ${extHeader.extensionDataSize} does not match enclosing payload size ${expectedExtensionSize}`);
          }
          await this.parseExtensionObject(extHeader.extensionDataSize);
          break;
        }
        case ContentDescriptionObjectState.guid.str:
          this.validateAllocationSize(payloadSize, "Content Description Object");
          tags = await this.readToken(new ContentDescriptionObjectState(header));
          await this.addTags(tags);
          break;
        case ExtendedContentDescriptionObjectState.guid.str:
          this.validateAllocationSize(payloadSize, "Extended Content Description Object");
          tags = await this.readToken(new ExtendedContentDescriptionObjectState(header));
          await this.addTags(tags);
          break;
        case AsfGuid.CodecListObject.str: {
          this.validateAllocationSize(payloadSize, "Codec List Object");
          let codecs;
          try {
            codecs = await readCodecEntries(this.tokenizer, payloadSize, getMaxMetadataEntries(this.options));
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new AsfContentParseError(`Invalid ASF Codec List Object: ${message}`);
          }
          for (const codec of codecs) {
            this.codecs.push(codec);
          }
          const audioCodecs = codecs.filter((codec) => codec.type.audioCodec).map((codec) => codec.codecName).join("/");
          this.metadata.setFormat("codec", audioCodecs);
          break;
        }
        case AsfGuid.StreamBitratePropertiesObject.str: {
          if (payloadSize < 2) {
            throw new AsfContentParseError("Truncated Stream Bitrate Properties Object");
          }
          const count = await this.readToken(UINT16_LE);
          if (count * 6 > payloadSize - 2) {
            throw new AsfContentParseError("ASF stream bitrate records exceed object payload");
          }
          for (let index2 = 0; index2 < count; ++index2) {
            const streamNumber = await this.readToken(UINT16_LE) & 127;
            this.streamBitrates.set(streamNumber, await this.readToken(UINT32_LE));
          }
          await this.ignorePayload(payloadSize - 2 - count * 6, "Stream Bitrate Properties Object");
          break;
        }
        case AsfGuid.PaddingObject.str:
          debug("Padding: %s bytes", payloadSize);
          await this.ignorePayload(payloadSize, "Padding Object");
          break;
        default:
          this.metadata.addWarning(`Ignore ASF-Object-GUID: ${header.objectId.str}`);
          debug("Ignore ASF-Object-GUID: %s", header.objectId.str);
          await this.ignorePayload(payloadSize, `object ${header.objectId.str}`);
      }
      remainingHeaderSize -= header.objectSize;
    }
    if (remainingHeaderSize !== 0) {
      throw new AsfContentParseError(`ASF header child objects leave ${remainingHeaderSize} payload byte(s) unaccounted`);
    }
  }
  async addTags(tags) {
    for (const { id, value } of tags) {
      await this.metadata.addTag(headerType, id, value);
    }
  }
  async readObjectHeader(remainingSize, containerType) {
    if (remainingSize < HeaderObjectToken.len) {
      throw new AsfContentParseError(`Insufficient ASF ${containerType} data for an object header: ${remainingSize} bytes`);
    }
    const header = await this.readToken(HeaderObjectToken);
    if (header.objectSize > remainingSize) {
      throw new AsfContentParseError(`ASF ${containerType} object size ${header.objectSize} exceeds remaining ${containerType} payload size ${remainingSize}`);
    }
    return {
      header,
      payloadSize: this.validatePayloadAvailability(header, `${containerType} object`)
    };
  }
  validatePayloadAvailability(header, objectType) {
    const payloadSize = header.objectSize - HeaderObjectToken.len;
    const fileSize = this.tokenizer.fileInfo.size;
    if (fileSize !== void 0) {
      const available = fileSize - this.tokenizer.position;
      if (payloadSize > available) {
        throw new AsfContentParseError(`ASF ${objectType} payload size ${payloadSize} exceeds available input size ${available}`);
      }
    }
    return payloadSize;
  }
  validateAllocationSize(payloadSize, objectType) {
    validateAllocation(payloadSize, this.options, (message) => new AsfContentParseError(`ASF ${objectType}: ${message}`));
  }
  async ignorePayload(payloadSize, objectType) {
    let ignored;
    try {
      ignored = await this.tokenizer.ignore(payloadSize);
    } catch (error) {
      if (error instanceof EndOfStreamError) {
        throw new AsfContentParseError(`Unexpected end of ASF ${objectType}`);
      }
      throw error;
    }
    if (ignored !== payloadSize) {
      throw new AsfContentParseError(`Unexpected end of ASF ${objectType}; missing ${payloadSize - ignored} bytes`);
    }
  }
  async parseExtensionObject(extensionSize) {
    while (extensionSize > 0) {
      const { header, payloadSize } = await this.readObjectHeader(extensionSize, "extension");
      switch (header.objectId.str) {
        case ExtendedStreamPropertiesObjectState.guid.str: {
          this.validateAllocationSize(payloadSize, "Extended Stream Properties Object");
          const extended = await this.readToken(new ExtendedStreamPropertiesObjectState(header));
          this.extendedStreams.set(extended.streamNumber, extended);
          if (extended.streamPropertiesObject) {
            const stream = extended.streamPropertiesObject;
            this.streams.set(stream.streamNumber, stream);
            this.metadata.setFormat("container", `ASF/${stream.streamType}`);
          }
          break;
        }
        case MetadataObjectState.guid.str: {
          this.validateAllocationSize(payloadSize, "Metadata Object");
          const moTags = await this.readToken(new MetadataObjectState(header));
          await this.addTags(moTags);
          break;
        }
        case MetadataLibraryObjectState.guid.str: {
          this.validateAllocationSize(payloadSize, "Metadata Library Object");
          const mlTags = await this.readToken(new MetadataLibraryObjectState(header));
          await this.addTags(mlTags);
          break;
        }
        case AsfGuid.PaddingObject.str:
          await this.ignorePayload(payloadSize, "extension Padding Object");
          break;
        case AsfGuid.CompatibilityObject.str:
          await this.ignorePayload(payloadSize, "Compatibility Object");
          break;
        case AsfGuid.ASF_Index_Placeholder_Object.str:
          await this.ignorePayload(payloadSize, "Index Placeholder Object");
          break;
        default:
          this.metadata.addWarning(`Ignore ASF-Object-GUID: ${header.objectId.str}`);
          await this.ignorePayload(payloadSize, `extension object ${header.objectId.str}`);
          break;
      }
      extensionSize -= header.objectSize;
    }
  }
};
export {
  AsfParser
};
//# sourceMappingURL=AsfParser-4RUEFESJ.js.map
