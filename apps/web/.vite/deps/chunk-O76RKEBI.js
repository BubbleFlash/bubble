import {
  FieldDecodingError,
  StringType
} from "./chunk-3HBPJLK7.js";

// ../../node_modules/uint8array-extras/index.js
var objectToString = Object.prototype.toString;
var uint8ArrayStringified = "[object Uint8Array]";
var arrayBufferStringified = "[object ArrayBuffer]";
function isType(value, typeConstructor, typeStringified) {
  if (!value) {
    return false;
  }
  if (value.constructor === typeConstructor) {
    return true;
  }
  return objectToString.call(value) === typeStringified;
}
function isUint8Array(value) {
  return isType(value, Uint8Array, uint8ArrayStringified);
}
function isArrayBuffer(value) {
  return isType(value, ArrayBuffer, arrayBufferStringified);
}
function isUint8ArrayOrArrayBuffer(value) {
  return isUint8Array(value) || isArrayBuffer(value);
}
function toUint8ArrayIfArrayBuffer(value) {
  return isArrayBuffer(value) ? new Uint8Array(value) : value;
}
function assertUint8ArrayOrArrayBuffer(value) {
  if (!isUint8ArrayOrArrayBuffer(value)) {
    throw new TypeError(`Expected \`Uint8Array\` or \`ArrayBuffer\`, got \`${typeof value}\``);
  }
}
function concatUint8Arrays(arrays, totalLength) {
  if (arrays.length === 0) {
    return new Uint8Array(0);
  }
  totalLength ?? (totalLength = arrays.reduce((accumulator, currentValue) => accumulator + currentValue.byteLength, 0));
  const returnValue = new Uint8Array(totalLength);
  let offset = 0;
  for (let array of arrays) {
    assertUint8ArrayOrArrayBuffer(array);
    array = toUint8ArrayIfArrayBuffer(array);
    returnValue.set(array, offset);
    offset += array.length;
  }
  return returnValue;
}
var cachedDecoders = {
  utf8: new globalThis.TextDecoder("utf8")
};
var cachedEncoder = new globalThis.TextEncoder();
var byteToHexLookupTable = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, "0"));
function uint8ArrayToHex(array) {
  assertUint8ArrayOrArrayBuffer(array);
  array = toUint8ArrayIfArrayBuffer(array);
  let hexString = "";
  for (let index = 0; index < array.length; index++) {
    hexString += byteToHexLookupTable[array[index]];
  }
  return hexString;
}
function getUintBE(view) {
  const { byteLength } = view;
  if (byteLength === 6) {
    return view.getUint16(0) * 2 ** 32 + view.getUint32(2);
  }
  if (byteLength === 5) {
    return view.getUint8(0) * 2 ** 32 + view.getUint32(1);
  }
  if (byteLength === 4) {
    return view.getUint32(0);
  }
  if (byteLength === 3) {
    return view.getUint8(0) * 2 ** 16 + view.getUint16(1);
  }
  if (byteLength === 2) {
    return view.getUint16(0);
  }
  if (byteLength === 1) {
    return view.getUint8(0);
  }
}

// ../../node_modules/music-metadata/lib/common/Util.js
function orderTags(nativeTags) {
  const tags = /* @__PURE__ */ Object.create(null);
  for (const { id, value } of nativeTags) {
    (tags[id] || (tags[id] = [])).push(value);
  }
  return tags;
}
function toNativeTyped(native) {
  const typed = /* @__PURE__ */ Object.create(null);
  for (const [format, tags] of Object.entries(native)) {
    typed[format] = orderTags(tags);
  }
  return typed;
}
function getBit(buf, off, bit) {
  return (buf[off] & 1 << bit) !== 0;
}
function findZero(uint8Array, encoding) {
  const len = uint8Array.length;
  if (encoding === "utf-16le" || encoding === "utf-16be") {
    for (let i = 0; i + 1 < len; i += 2) {
      if (uint8Array[i] === 0 && uint8Array[i + 1] === 0) {
        return i;
      }
    }
    return len;
  }
  for (let i = 0; i < len; i++) {
    if (uint8Array[i] === 0) {
      return i;
    }
  }
  return len;
}
function trimRightNull(x) {
  const pos0 = x.indexOf("\0");
  return pos0 === -1 ? x : x.substring(0, pos0);
}
function splitText(text, separator, context, validateCount, { keepEmpty = false } = {}) {
  if (separator.length === 0) {
    throw new RangeError("Text separator must not be empty");
  }
  let count = 0;
  let start = 0;
  for (let end = text.indexOf(separator); end >= 0; end = text.indexOf(separator, start)) {
    if (keepEmpty || end > start) {
      ++count;
    }
    start = end + separator.length;
  }
  if (keepEmpty || start < text.length) {
    ++count;
  }
  validateCount(Math.max(count, 1), context);
  const values = [];
  start = 0;
  for (let end = text.indexOf(separator); end >= 0; end = text.indexOf(separator, start)) {
    if (keepEmpty || end > start) {
      values.push(text.slice(start, end));
    }
    start = end + separator.length;
  }
  if (keepEmpty || start < text.length) {
    values.push(text.slice(start));
  } else if (values.length === 0) {
    values.push("");
  }
  return values;
}
function swapBytes(uint8Array) {
  const l = uint8Array.length;
  if ((l & 1) !== 0) {
    throw new FieldDecodingError("Buffer length must be even");
  }
  for (let i = 0; i < l; i += 2) {
    const a = uint8Array[i];
    uint8Array[i] = uint8Array[i + 1];
    uint8Array[i + 1] = a;
  }
  return uint8Array;
}
function decodeString(uint8Array, encoding) {
  if (uint8Array[0] === 255 && uint8Array[1] === 254) {
    return decodeString(uint8Array.subarray(2), encoding);
  }
  if (encoding === "utf-16le" && uint8Array[0] === 254 && uint8Array[1] === 255) {
    if ((uint8Array.length & 1) !== 0) {
      throw new FieldDecodingError("Expected even number of octets for 16-bit unicode string");
    }
    return decodeString(swapBytes(uint8Array), encoding);
  }
  if (encoding === "utf-16be") {
    if ((uint8Array.length & 1) !== 0) {
      throw new FieldDecodingError("Expected even number of octets for 16-bit unicode string");
    }
    return new StringType(uint8Array.length, "utf-16le").get(swapBytes(Uint8Array.from(uint8Array)), 0);
  }
  return new StringType(uint8Array.length, encoding).get(uint8Array, 0);
}
function stripNulls(str) {
  str = str.replace(/^\x00+/g, "");
  str = str.replace(/\x00+$/g, "");
  return str;
}
function getBitAllignedNumber(source, byteOffset, bitOffset, len) {
  const byteOff = byteOffset + ~~(bitOffset / 8);
  const bitOff = bitOffset % 8;
  const value = source[byteOff] & 255 >> bitOff;
  const bitsLeft = len + bitOff - 8;
  if (bitsLeft <= 0) {
    return value >> -bitsLeft;
  }
  return value << bitsLeft | getBitAllignedNumber(source, byteOff + 1, 0, bitsLeft);
}
function isBitSet(source, byteOffset, bitOffset) {
  return getBitAllignedNumber(source, byteOffset, bitOffset, 1) === 1;
}
function a2hex(str) {
  const arr = [];
  for (let i = 0, l = str.length; i < l; i++) {
    const hex = Number(str.charCodeAt(i)).toString(16);
    arr.push(hex.length === 1 ? `0${hex}` : hex);
  }
  return arr.join(" ");
}
function ratioToDb(ratio) {
  return 10 * Math.log10(ratio);
}
function dbToRatio(dB) {
  return 10 ** (dB / 10);
}
function toRatio(value) {
  const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(dB)?$/i);
  if (!match) {
    return;
  }
  const number = Number(match[1]);
  if (!Number.isFinite(number)) {
    return;
  }
  const ratio = match[2] ? dbToRatio(number) : number;
  if (!Number.isFinite(ratio) || ratio < 0) {
    return;
  }
  return { dB: match[2] ? number : ratioToDb(ratio), ratio };
}
function decodeUintBE(uint8Array) {
  if (uint8Array.length === 0) {
    throw new Error("decodeUintBE: empty Uint8Array");
  }
  const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
  return getUintBE(view);
}

export {
  concatUint8Arrays,
  uint8ArrayToHex,
  getUintBE,
  orderTags,
  toNativeTyped,
  getBit,
  findZero,
  trimRightNull,
  splitText,
  decodeString,
  stripNulls,
  getBitAllignedNumber,
  isBitSet,
  a2hex,
  ratioToDb,
  toRatio,
  decodeUintBE
};
//# sourceMappingURL=chunk-O76RKEBI.js.map
