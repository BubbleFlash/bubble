import {
  attachedPictureType
} from "./chunk-GQBXDRBH.js";
import {
  UINT24_BE,
  UINT32_BE,
  UINT32_LE,
  textDecode
} from "./chunk-3HBPJLK7.js";
import {
  __publicField
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/tokens/flac.js
var BlockType = {
  STREAMINFO: 0,
  PADDING: 1,
  APPLICATION: 2,
  SEEKTABLE: 3,
  VORBIS_COMMENT: 4,
  CUESHEET: 5,
  PICTURE: 6
};
function ensureAvailable(buffer, offset, length, createError) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw createError(`Cannot read ${length} byte(s) at offset ${offset} from a ${buffer.length}-byte buffer`);
  }
}
var MAX_BLOCK_LENGTH = 16777215;
var BlockHeader = {
  len: 4,
  get(buffer, offset) {
    ensureAvailable(buffer, offset, BlockHeader.len, (message) => new RangeError(message));
    return {
      lastBlock: (buffer[offset] & 128) !== 0,
      type: buffer[offset] & 127,
      length: UINT24_BE.get(buffer, offset + 1)
    };
  },
  put(buffer, offset, value) {
    ensureAvailable(buffer, offset, BlockHeader.len, (message) => new RangeError(message));
    if (!Number.isSafeInteger(value.length) || value.length < 0 || value.length > MAX_BLOCK_LENGTH) {
      throw new RangeError(`FLAC metadata block length must be between 0 and ${MAX_BLOCK_LENGTH}, got ${value.length}`);
    }
    if (!Number.isSafeInteger(value.type) || value.type < 0 || value.type > 126) {
      throw new RangeError(`FLAC metadata block type must be between 0 and 126, got ${value.type}`);
    }
    buffer[offset] = (value.lastBlock ? 128 : 0) | value.type;
    return UINT24_BE.put(buffer, offset + 1, value.length);
  }
};
var PICTURE_TYPES = [
  "Other",
  "32x32 pixels 'file icon' (PNG only)",
  "Other file icon",
  "Cover (front)",
  "Cover (back)",
  "Leaflet page",
  "Media (e.g. label side of CD)",
  "Lead artist/lead performer/soloist",
  "Artist/performer",
  "Conductor",
  "Band/Orchestra",
  "Composer",
  "Lyricist/text writer",
  "Recording Location",
  "During recording",
  "During performance",
  "Movie/video screen capture",
  "A bright coloured fish",
  "Illustration",
  "Band/artist logotype",
  "Publisher/Studio logotype"
];
function pictureTypeToNumber(type) {
  if (type === void 0) {
    return 0;
  }
  const index = PICTURE_TYPES.indexOf(type);
  return Math.max(index, 0);
}
function normalizePictureMimeType(format) {
  switch (format.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    default:
      return format;
  }
}
function decodePicture(buffer, offset = 0, options = {}) {
  const createError = options.createError ?? ((message) => new RangeError(message));
  ensureAvailable(buffer, offset, 32, createError);
  let cursor = offset;
  const typeId = UINT32_BE.get(buffer, cursor);
  cursor += 4;
  const formatLength = UINT32_BE.get(buffer, cursor);
  cursor += 4;
  ensureAvailable(buffer, cursor, formatLength, createError);
  const format = textDecode(buffer.subarray(cursor, cursor + formatLength), "utf-8");
  cursor += formatLength;
  ensureAvailable(buffer, cursor, 4, createError);
  const descriptionLength = UINT32_BE.get(buffer, cursor);
  cursor += 4;
  ensureAvailable(buffer, cursor, descriptionLength, createError);
  const description = textDecode(buffer.subarray(cursor, cursor + descriptionLength), "utf-8");
  cursor += descriptionLength;
  ensureAvailable(buffer, cursor, 20, createError);
  const width = UINT32_BE.get(buffer, cursor);
  cursor += 4;
  const height = UINT32_BE.get(buffer, cursor);
  cursor += 4;
  const colourDepth = UINT32_BE.get(buffer, cursor);
  cursor += 4;
  const colours = UINT32_BE.get(buffer, cursor);
  cursor += 4;
  const dataLength = UINT32_BE.get(buffer, cursor);
  cursor += 4;
  ensureAvailable(buffer, cursor, dataLength, createError);
  const data = new Uint8Array(buffer.subarray(cursor, cursor + dataLength));
  cursor += dataLength;
  if (options.requireExactData && cursor !== buffer.length) {
    throw createError(`FLAC PICTURE has ${buffer.length - cursor} trailing byte(s)`);
  }
  return {
    typeId,
    type: attachedPictureType(typeId),
    format,
    description,
    width,
    height,
    colour_depth: colourDepth,
    indexed_color: colours,
    colourDepth,
    colours,
    data
  };
}

// ../../node_modules/music-metadata/lib/common/Base64.js
var BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var BASE64_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  BASE64_TABLE[i] = 255;
}
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_TABLE[BASE64_CHARS.charCodeAt(i)] = i;
}
function decodeBase64(value) {
  const normalized = value.includes(" ") || value.includes("\n") || value.includes("	") || value.includes("\r") ? value.replace(/\s/g, "") : value;
  try {
    const binary = atob(normalized);
    const result = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      result[i] = binary.charCodeAt(i);
    }
    return result;
  } catch {
    const length = Math.floor(normalized.length * 3 / 4);
    const result = new Uint8Array(length);
    let resultIndex = 0;
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      const charValue = char < 256 ? BASE64_TABLE[char] : 255;
      if (charValue === 255) {
        continue;
      }
      buffer = buffer << 6 | charValue;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        result[resultIndex++] = buffer >> bits & 255;
      }
    }
    return result.subarray(0, resultIndex);
  }
}
function encodeBase64(data) {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

// ../../node_modules/music-metadata/lib/tokens/vorbis.js
var DEFAULT_MAX_COMMENT_COUNT = 1e5;
function validateMaxComments(maxComments) {
  if (maxComments !== Number.POSITIVE_INFINITY && (!Number.isSafeInteger(maxComments) || maxComments < 0)) {
    throw new RangeError("maxComments must be a non-negative safe integer or Infinity");
  }
}
var VorbisCommentError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "VorbisCommentError";
  }
};
var VorbisDecoder = class {
  constructor(data, offset = 0, options = {}) {
    __publicField(this, "data");
    __publicField(this, "offset");
    __publicField(this, "createError");
    __publicField(this, "maxComments");
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > data.length) {
      throw new RangeError(`Invalid Vorbis Comment offset ${offset} for a ${data.length}-byte buffer`);
    }
    this.data = data;
    this.offset = offset;
    this.createError = options.createError ?? ((message) => new VorbisCommentError(message));
    this.maxComments = options.maxComments ?? DEFAULT_MAX_COMMENT_COUNT;
    validateMaxComments(this.maxComments);
  }
  get remaining() {
    return this.data.length - this.offset;
  }
  readInt32() {
    if (this.remaining < 4) {
      throw this.createError("Truncated Vorbis comment length");
    }
    const value = UINT32_LE.get(this.data, this.offset);
    this.offset += 4;
    return value;
  }
  readStringUtf8() {
    const length = this.readInt32();
    if (length > this.remaining) {
      throw this.createError(`Vorbis comment length ${length} exceeds remaining data ${this.remaining}`);
    }
    const value = textDecode(this.data.subarray(this.offset, this.offset + length), "utf-8");
    this.offset += length;
    return value;
  }
  /**
   * Decode the shared structure, leaving packet framing and metadata policy to
   * callers. Iterating the returned comments consumes the underlying buffer.
   */
  parseCommentList(createCountError = this.createError, maxComments = this.maxComments) {
    validateMaxComments(maxComments);
    const vendor = this.readStringUtf8();
    const count = this.readInt32();
    if (count > Math.floor(this.remaining / 4)) {
      throw createCountError(`Vorbis comment count ${count} exceeds remaining data`);
    }
    if (count > maxComments) {
      throw createCountError(`Vorbis comment count ${count} exceeds entry limit ${maxComments}`);
    }
    return { vendor, comments: this.parseUserComments(count) };
  }
  parseUserComment() {
    const offset0 = this.offset;
    const value = this.readStringUtf8();
    const separator = value.indexOf("=");
    return {
      key: value.substring(0, separator),
      value: value.substring(separator + 1),
      len: this.offset - offset0
    };
  }
  *parseUserComments(count) {
    for (let index = 0; index < count; index++) {
      yield this.parseUserComment();
    }
  }
};
function parseVorbisComment(data, options = {}) {
  const createError = options.createError ?? ((message) => new VorbisCommentError(message));
  const decoder = new VorbisDecoder(data, 0, {
    createError,
    ...options.maxComments === void 0 ? {} : { maxComments: options.maxComments }
  });
  const requireFieldSeparator = options.requireFieldSeparator ?? true;
  const { vendor, comments: parsedComments } = decoder.parseCommentList(createError);
  const comments = [];
  let index = 0;
  for (const comment of parsedComments) {
    if (requireFieldSeparator && comment.key.length === 0) {
      throw createError(`Malformed Vorbis Comment at index ${index}: missing field separator`);
    }
    comments.push({ key: comment.key, value: comment.value });
    index++;
  }
  if (decoder.remaining !== 0) {
    throw createError(`Vorbis Comment block has ${decoder.remaining} trailing byte(s)`);
  }
  return { vendor, comments };
}

export {
  decodeBase64,
  encodeBase64,
  BlockType,
  BlockHeader,
  PICTURE_TYPES,
  pictureTypeToNumber,
  normalizePictureMimeType,
  decodePicture,
  VorbisDecoder,
  parseVorbisComment
};
//# sourceMappingURL=chunk-ZTPD4JNR.js.map
