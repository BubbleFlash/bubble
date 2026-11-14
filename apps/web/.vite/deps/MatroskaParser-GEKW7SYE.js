import {
  TrackType
} from "./chunk-XS2AH7GC.js";
import "./chunk-GQBXDRBH.js";
import "./chunk-O76RKEBI.js";
import {
  BasicParser,
  EndOfStreamError,
  Float32_BE,
  Float64_BE,
  StringType,
  UINT64_BE,
  UINT8,
  getMaxMemoryAllocation,
  getMaxMetadataEntries,
  isRandomAccessTokenizer,
  makeUnexpectedFileContentError,
  readBuffer
} from "./chunk-3HBPJLK7.js";
import {
  require_browser
} from "./chunk-ZGKN2RSD.js";
import {
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/matroska/MatroskaParser.js
var import_debug2 = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/ebml/EbmlIterator.js
var import_debug = __toESM(require_browser(), 1);

// ../../node_modules/music-metadata/lib/ebml/types.js
var DataType = {
  string: 0,
  uint: 1,
  uid: 2,
  bool: 3,
  binary: 4,
  float: 5,
  int: 6
};

// ../../node_modules/music-metadata/lib/ebml/EbmlIterator.js
var debug = (0, import_debug.default)("music-metadata:parser:ebml");
var EbmlContentError = class extends makeUnexpectedFileContentError("EBML") {
};
var ParseAction = {
  ReadNext: 0,
  // Continue reading the next elements
  IgnoreElement: 2,
  // Ignore (do not read) this element
  SkipSiblings: 3,
  // Skip all remaining elements at the same level
  TerminateParsing: 4,
  // Terminate the parsing process
  SkipElement: 5
  // Consider the element has read, assume position is at the next element
};
var EbmlIterator = class {
  /**
   * @param {ITokenizer} tokenizer Input
   * @param tokenizer
   */
  constructor(tokenizer, options = {}) {
    __publicField(this, "options");
    __publicField(this, "parserMap", /* @__PURE__ */ new Map());
    __publicField(this, "ebmlMaxIDLength", 4);
    __publicField(this, "ebmlMaxSizeLength", 8);
    __publicField(this, "tokenizer");
    __publicField(this, "elementHeader");
    this.options = options;
    this.tokenizer = tokenizer;
    const maxMemoryAllocation = getMaxMemoryAllocation(options);
    this.elementHeader = new Uint8Array(Math.min(12, maxMemoryAllocation));
    this.parserMap.set(DataType.uint, (e) => this.readUint(e));
    this.parserMap.set(DataType.int, (e) => this.readInt(e));
    this.parserMap.set(DataType.string, (e) => this.readString(e));
    this.parserMap.set(DataType.binary, (e) => this.readBuffer(e));
    this.parserMap.set(DataType.uid, async (e) => this.readBuffer(e));
    this.parserMap.set(DataType.bool, (e) => this.readFlag(e));
    this.parserMap.set(DataType.float, (e) => this.readFloat(e));
  }
  async iterate(dtdElement, posDone, listener) {
    var _a;
    const root = { ...dtdElement, id: 0, parent: void 0 };
    const tree = await this.parseContainer(root, posDone, {
      startNext: listener.startNext,
      collect: listener.collect ?? (() => true),
      elementValue: async (element, value, offset) => {
        var _a2, _b;
        await ((_a2 = listener.elementValue) == null ? void 0 : _a2.call(listener, element, value, offset));
        await ((_b = listener.onElement) == null ? void 0 : _b.call(listener, { id: element.id, element, value, offset }));
      }
    }, ((_a = listener.collect) == null ? void 0 : _a.call(listener, root)) ?? true);
    return tree;
  }
  async parseContainer(dtdElement, posDone, listener, collect) {
    var _a;
    const tree = {};
    while (this.tokenizer.position < posDone) {
      let element;
      const elementPosition = this.tokenizer.position;
      try {
        element = await this.readElement();
      } catch (error) {
        if (error instanceof EndOfStreamError) {
          break;
        }
        throw error;
      }
      const definition = (_a = dtdElement.container) == null ? void 0 : _a[element.id];
      if (definition) {
        const child = { ...definition, id: element.id, parent: dtdElement };
        const action = await listener.startNext(child);
        switch (action) {
          case ParseAction.ReadNext:
            {
              debug(`Read element: name=${getElementPath(child)}{id=0x${element.id.toString(16)}, container=${!!child.container}} at position=${elementPosition}`);
              if (child.container) {
                const childEnd = Math.min(posDone, this.tokenizer.fileInfo.size ?? Number.POSITIVE_INFINITY, element.len >= 0 ? this.tokenizer.position + element.len : posDone);
                const res = await this.parseContainer(child, childEnd, listener, collect || listener.collect(child));
                if (collect) {
                  this.collect(tree, child, res);
                }
                await listener.elementValue(child, res, elementPosition);
              } else {
                const parser = child.value === void 0 ? void 0 : this.parserMap.get(child.value);
                if (typeof parser === "function") {
                  const end = Math.min(posDone, this.tokenizer.fileInfo.size ?? Number.POSITIVE_INFINITY);
                  if (!Number.isSafeInteger(element.len) || element.len < 0 || element.len > end - this.tokenizer.position) {
                    throw new EbmlContentError(`Invalid element length: ${element.len}`);
                  }
                  const value = await parser(element);
                  if (collect) {
                    this.collect(tree, child, value);
                  }
                  await listener.elementValue(child, value, elementPosition);
                } else {
                  if (!await this.ignore(element.len, posDone)) {
                    return tree;
                  }
                }
              }
            }
            break;
          case ParseAction.SkipElement:
            debug(`Go to next element: name=${getElementPath(child)}, element.id=0x${element.id}, container=${!!child.container} at position=${elementPosition}`);
            break;
          case ParseAction.IgnoreElement:
            debug(`Ignore element: name=${getElementPath(child)}, element.id=0x${element.id}, container=${!!child.container} at position=${elementPosition}`);
            if (!await this.ignore(element.len, posDone)) {
              return tree;
            }
            break;
          case ParseAction.SkipSiblings:
            debug(`Ignore remaining container, at: name=${getElementPath(child)}, element.id=0x${element.id}, container=${!!child.container} at position=${elementPosition}`);
            if (!await this.ignore(posDone - this.tokenizer.position, posDone)) {
              return tree;
            }
            break;
          case ParseAction.TerminateParsing:
            debug(`Terminate parsing at element: name=${getElementPath(child)}, element.id=0x${element.id}, container=${!!child.container} at position=${elementPosition}`);
            return tree;
        }
      } else {
        switch (element.id) {
          case 236:
            if (!await this.ignore(element.len, posDone)) {
              return tree;
            }
            break;
          default:
            debug(`parseEbml: parent=${getElementPath(dtdElement)}, unknown child: id=${element.id.toString(16)} at position=${elementPosition}`);
            if (!await this.ignore(element.len, posDone)) {
              return tree;
            }
        }
      }
    }
    return tree;
  }
  collect(tree, element, value) {
    var _a;
    if (element.multiple) {
      const values = tree[_a = element.name] ?? (tree[_a] = []);
      if (Array.isArray(values)) {
        if (values.length >= getMaxMetadataEntries(this.options)) {
          throw new EbmlContentError("Collected EBML element count exceeds entry limit");
        }
        values.push(value);
      }
    } else {
      tree[element.name] = value;
    }
  }
  async ignore(length, posDone) {
    const end = Math.min(posDone, this.tokenizer.fileInfo.size ?? Number.POSITIVE_INFINITY);
    const boundedLength = Math.min(length, end - this.tokenizer.position);
    if (!Number.isSafeInteger(boundedLength) || boundedLength < 0) {
      throw new EbmlContentError(`Invalid element length: ${length}`);
    }
    try {
      return await this.tokenizer.ignore(boundedLength) === boundedLength;
    } catch (error) {
      if (error instanceof EndOfStreamError) {
        return false;
      }
      throw error;
    }
  }
  async readVintData(maxLength) {
    const msb = await this.tokenizer.peekNumber(UINT8);
    let mask = 128;
    let oc = 1;
    while ((msb & mask) === 0) {
      if (oc > maxLength) {
        throw new EbmlContentError("VINT value exceeding maximum size");
      }
      ++oc;
      mask >>= 1;
    }
    const id = new Uint8Array(oc);
    await this.tokenizer.readBuffer(id);
    return id;
  }
  async readElement() {
    if (isRandomAccessTokenizer(this.tokenizer) && this.elementHeader.length === 12) {
      const available = await this.tokenizer.peekBuffer(this.elementHeader, { mayBeLess: true });
      const width = (offset, maximum) => {
        if (offset >= available) {
          throw new EndOfStreamError();
        }
        for (let length = 1; length <= maximum; ++length) {
          if ((this.elementHeader[offset] & 128 >> length - 1) !== 0) {
            if (offset + length > available) {
              throw new EndOfStreamError();
            }
            return length;
          }
        }
        throw new EbmlContentError("VINT value exceeding maximum size");
      };
      const idLength = width(0, this.ebmlMaxIDLength);
      const sizeLength = width(idLength, this.ebmlMaxSizeLength);
      const id2 = readUIntBE(this.elementHeader.subarray(0, idLength), idLength);
      const lenField2 = this.elementHeader.subarray(idLength, idLength + sizeLength);
      lenField2[0] ^= 128 >> sizeLength - 1;
      this.tokenizer.setPosition(this.tokenizer.position + idLength + sizeLength);
      return { id: id2, len: readUIntBE(lenField2, sizeLength) };
    }
    const id = await this.readVintData(this.ebmlMaxIDLength);
    const lenField = await this.readVintData(this.ebmlMaxSizeLength);
    lenField[0] ^= 128 >> lenField.length - 1;
    return {
      id: readUIntBE(id, id.length),
      len: readUIntBE(lenField, lenField.length)
    };
  }
  async readFloat(e) {
    switch (e.len) {
      case 0:
        return 0;
      case 4:
        return this.tokenizer.readNumber(Float32_BE);
      case 8:
        return this.tokenizer.readNumber(Float64_BE);
      case 10:
        return this.tokenizer.readNumber(Float64_BE);
      default:
        throw new EbmlContentError(`Invalid IEEE-754 float length: ${e.len}`);
    }
  }
  async readFlag(e) {
    return await this.readUint(e) === 1;
  }
  async readUint(e) {
    const buf = await this.readBuffer(e);
    return readUIntBE(buf, e.len);
  }
  async readInt(e) {
    const buffer = await this.readBuffer(e);
    const value = readUIntBeAsBigInt(buffer, e.len);
    return Number(buffer[0] & 128 ? value - (1n << BigInt(8 * e.len)) : value);
  }
  async readString(e) {
    const buf = await this.readBuffer(e);
    const rawString = new StringType(e.len, "utf-8").get(buf, 0);
    return rawString.replace(/\x00.*$/g, "");
  }
  async readBuffer(e) {
    return readBuffer(this.tokenizer, e.len, this.options, void 0, (message) => new EbmlContentError(message));
  }
};
function readUIntBE(buf, len) {
  return Number(readUIntBeAsBigInt(buf, len));
}
function readUIntBeAsBigInt(buf, len) {
  const normalizedNumber = new Uint8Array(8);
  const cleanNumber = buf.subarray(0, len);
  try {
    normalizedNumber.set(cleanNumber, 8 - len);
    return UINT64_BE.get(normalizedNumber, 0);
  } catch (_error) {
    return BigInt(-1);
  }
}
function getElementPath(element) {
  let path = "";
  if (element.parent && element.parent.name !== "dtd") {
    path += `${getElementPath(element.parent)}/`;
  }
  return path + element.name;
}

// ../../node_modules/music-metadata/lib/matroska/MatroskaDtd.js
var matroskaDtd = {
  name: "dtd",
  container: {
    440786851: {
      // 5.1
      name: "ebml",
      container: {
        17030: { name: "ebmlVersion", value: DataType.uint },
        // 5.1.1
        17143: { name: "ebmlReadVersion", value: DataType.uint },
        // 5.1.2
        17138: { name: "ebmlMaxIDWidth", value: DataType.uint },
        // 5.1.3
        17139: { name: "ebmlMaxSizeWidth", value: DataType.uint },
        // 5.1.4
        17026: { name: "docType", value: DataType.string },
        // 5.1.5
        17031: { name: "docTypeVersion", value: DataType.uint },
        // 5.1.6
        17029: { name: "docTypeReadVersion", value: DataType.uint }
        // 5.1.7
      }
    },
    // Matroska segments
    408125543: {
      name: "segment",
      container: {
        // Meta Seek Information (also known as MetaSeek)
        290298740: {
          name: "seekHead",
          multiple: true,
          container: {
            19899: {
              name: "seek",
              multiple: true,
              container: {
                21419: { name: "id", value: DataType.binary },
                21420: { name: "position", value: DataType.uint }
              }
            }
          }
        },
        // Segment Information
        357149030: {
          name: "info",
          container: {
            29604: { name: "uid", value: DataType.uid },
            29572: { name: "filename", value: DataType.string },
            3979555: { name: "prevUID", value: DataType.uid },
            3965867: { name: "prevFilename", value: DataType.string },
            4110627: { name: "nextUID", value: DataType.uid },
            4096955: { name: "nextFilename", value: DataType.string },
            2807729: { name: "timecodeScale", value: DataType.uint },
            17545: { name: "duration", value: DataType.float },
            17505: { name: "dateUTC", value: DataType.int },
            31657: { name: "title", value: DataType.string },
            19840: { name: "muxingApp", value: DataType.string },
            22337: { name: "writingApp", value: DataType.string }
          }
        },
        // Cluster
        524531317: {
          name: "cluster",
          multiple: true,
          container: {
            231: { name: "timecode", value: DataType.uint },
            22612: {
              name: "silentTracks",
              container: {
                22743: { name: "trackNumber", value: DataType.uint, multiple: true }
              }
            },
            167: { name: "position", value: DataType.uint },
            171: { name: "prevSize", value: DataType.uint },
            160: { name: "blockGroup", multiple: true },
            163: { name: "simpleBlock", value: DataType.binary, multiple: true }
          }
        },
        // Track
        374648427: {
          name: "tracks",
          container: {
            174: {
              name: "entries",
              multiple: true,
              container: {
                215: { name: "trackNumber", value: DataType.uint },
                29637: { name: "uid", value: DataType.uid },
                131: { name: "trackType", value: DataType.uint },
                185: { name: "flagEnabled", value: DataType.bool },
                136: { name: "flagDefault", value: DataType.bool },
                21930: { name: "flagForced", value: DataType.bool },
                // extended
                156: { name: "flagLacing", value: DataType.bool },
                28135: { name: "minCache", value: DataType.uint },
                28152: { name: "maxCache", value: DataType.uint },
                2352003: { name: "defaultDuration", value: DataType.uint },
                2306383: { name: "trackTimecodeScale", value: DataType.float },
                21358: { name: "name", value: DataType.string },
                2274716: { name: "language", value: DataType.string },
                2274717: { name: "languageIETF", value: DataType.string },
                134: { name: "codecID", value: DataType.string },
                25506: { name: "codecPrivate", value: DataType.binary },
                2459272: { name: "codecName", value: DataType.string },
                3839639: { name: "codecSettings", value: DataType.string },
                3883072: { name: "codecInfoUrl", value: DataType.string, multiple: true },
                2536e3: { name: "codecDownloadUrl", value: DataType.string, multiple: true },
                170: { name: "codecDecodeAll", value: DataType.bool },
                28587: { name: "trackOverlay", value: DataType.uint, multiple: true },
                // Video
                224: {
                  name: "video",
                  container: {
                    154: { name: "flagInterlaced", value: DataType.uint },
                    21432: { name: "stereoMode", value: DataType.uint },
                    176: { name: "pixelWidth", value: DataType.uint },
                    186: { name: "pixelHeight", value: DataType.uint },
                    21680: { name: "displayWidth", value: DataType.uint },
                    21690: { name: "displayHeight", value: DataType.uint },
                    21682: { name: "displayUnit", value: DataType.uint },
                    21683: { name: "aspectRatioType", value: DataType.uint },
                    3061028: { name: "colourSpace", value: DataType.binary },
                    3126563: { name: "gammaValue", value: DataType.float }
                  }
                },
                // Audio
                225: {
                  name: "audio",
                  container: {
                    181: { name: "samplingFrequency", value: DataType.float },
                    30901: { name: "outputSamplingFrequency", value: DataType.float },
                    159: { name: "channels", value: DataType.uint },
                    // https://www.matroska.org/technical/specs/index.html
                    32123: { name: "channelPositions", value: DataType.binary },
                    25188: { name: "bitDepth", value: DataType.uint }
                  }
                },
                // Content Encoding
                28032: {
                  name: "contentEncodings",
                  container: {
                    25152: {
                      name: "contentEncoding",
                      multiple: true,
                      container: {
                        20529: { name: "order", value: DataType.uint },
                        20530: { name: "scope", value: DataType.uint },
                        20531: { name: "type", value: DataType.uint },
                        20532: {
                          name: "contentCompression",
                          container: {
                            16980: { name: "contentCompAlgo", value: DataType.uint },
                            16981: { name: "contentCompSettings", value: DataType.binary }
                          }
                        },
                        20533: {
                          name: "contentEncryption",
                          container: {
                            18401: { name: "contentEncAlgo", value: DataType.uint },
                            18402: { name: "contentEncKeyID", value: DataType.binary },
                            18403: { name: "contentSignature", value: DataType.binary },
                            18404: { name: "contentSigKeyID", value: DataType.binary },
                            18405: { name: "contentSigAlgo", value: DataType.uint },
                            18406: { name: "contentSigHashAlgo", value: DataType.uint }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Cueing Data
        475249515: {
          name: "cues",
          container: {
            187: {
              name: "cuePoint",
              multiple: true,
              container: {
                179: { name: "cueTime", value: DataType.uint },
                183: {
                  name: "positions",
                  multiple: true,
                  container: {
                    247: { name: "track", value: DataType.uint },
                    241: { name: "clusterPosition", value: DataType.uint },
                    21368: { name: "blockNumber", value: DataType.uint },
                    234: { name: "codecState", value: DataType.uint },
                    219: {
                      name: "reference",
                      multiple: true,
                      container: {
                        150: { name: "time", value: DataType.uint },
                        151: { name: "cluster", value: DataType.uint },
                        21343: { name: "number", value: DataType.uint },
                        235: { name: "codecState", value: DataType.uint }
                      }
                    },
                    240: { name: "relativePosition", value: DataType.uint }
                    // extended
                  }
                }
              }
            }
          }
        },
        // Attachment
        423732329: {
          name: "attachments",
          container: {
            24999: {
              name: "attachedFiles",
              multiple: true,
              container: {
                18046: { name: "description", value: DataType.string },
                18030: { name: "name", value: DataType.string },
                18016: { name: "mimeType", value: DataType.string },
                18012: { name: "data", value: DataType.binary },
                18094: { name: "uid", value: DataType.uid }
              }
            }
          }
        },
        // Chapters
        272869232: {
          name: "chapters",
          container: {
            17849: {
              name: "editionEntry",
              multiple: true,
              container: {
                182: {
                  name: "chapterAtom",
                  multiple: true,
                  container: {
                    29636: { name: "uid", value: DataType.uid },
                    145: { name: "timeStart", value: DataType.uint },
                    146: { name: "timeEnd", value: DataType.uint },
                    152: { name: "hidden", value: DataType.bool },
                    17816: { name: "enabled", value: DataType.bool },
                    143: {
                      name: "track",
                      container: {
                        137: { name: "trackUID", value: DataType.uid, multiple: true }
                      }
                    },
                    128: {
                      name: "display",
                      multiple: true,
                      container: {
                        133: { name: "string", value: DataType.string },
                        17276: { name: "language", value: DataType.string, multiple: true },
                        17278: { name: "country", value: DataType.string, multiple: true }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Tagging
        307544935: {
          name: "tags",
          multiple: true,
          container: {
            29555: {
              name: "tag",
              multiple: true,
              container: {
                25536: {
                  name: "target",
                  container: {
                    25541: { name: "tagTrackUID", value: DataType.uid, multiple: true },
                    25540: { name: "tagChapterUID", value: DataType.uid, multiple: true },
                    25542: { name: "tagAttachmentUID", value: DataType.uid, multiple: true },
                    25546: { name: "targetType", value: DataType.string },
                    // extended
                    26826: { name: "targetTypeValue", value: DataType.uint },
                    // extended
                    25545: { name: "tagEditionUID", value: DataType.uid, multiple: true }
                    // extended
                  }
                },
                26568: {
                  name: "simpleTags",
                  multiple: true,
                  container: {
                    17827: { name: "name", value: DataType.string },
                    17543: { name: "string", value: DataType.string },
                    17541: { name: "binary", value: DataType.binary },
                    17530: { name: "language", value: DataType.string },
                    // extended
                    17531: { name: "languageIETF", value: DataType.string },
                    // extended
                    17540: { name: "default", value: DataType.bool }
                    // extended
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

// ../../node_modules/music-metadata/lib/matroska/types.js
var TargetType = {
  10: "shot",
  20: "scene",
  30: "track",
  40: "part",
  50: "album",
  60: "edition",
  70: "collection"
};

// ../../node_modules/music-metadata/lib/matroska/MatroskaParser.js
var debug2 = (0, import_debug2.default)("music-metadata:parser:matroska");
var targetTypes = TargetType;
function isCompleteTrack(entry) {
  return typeof entry.trackNumber === "number" && Number.isSafeInteger(entry.trackNumber) && entry.trackNumber > 0 && typeof entry.codecID === "string" && entry.codecID.length > 0 && Object.values(TrackType).some((type) => type === entry.trackType);
}
function isCompleteFile(file) {
  return typeof file.name === "string" && typeof file.mimeType === "string" && file.data instanceof Uint8Array && file.uid instanceof Uint8Array;
}
function videoInfo(video) {
  const { flagInterlaced, ...properties } = video;
  const result = properties;
  if (flagInterlaced === 1 || flagInterlaced === 2) {
    result.flagInterlaced = flagInterlaced === 1;
  }
  return result;
}
var MatroskaParser = class extends BasicParser {
  constructor() {
    super(...arguments);
    __publicField(this, "tracksByUid", /* @__PURE__ */ new Map());
    __publicField(this, "trackStatistics", /* @__PURE__ */ new Map());
    __publicField(this, "seekHead");
    __publicField(this, "seekHeadOffset", 0);
    __publicField(this, "selectedAudioTrackUid");
    __publicField(this, "albumCandidates", []);
    /**
     * Use index to skip multiple segment/cluster elements at once.
     * Significant performance impact
     */
    __publicField(this, "flagUseIndexToSkipClusters", this.options.mkvUseIndex ?? false);
  }
  async parse() {
    const containerSize = this.tokenizer.fileInfo.size ?? Number.MAX_SAFE_INTEGER;
    const attachmentMimeTypes = /* @__PURE__ */ new WeakMap();
    const matroskaIterator = new EbmlIterator(this.tokenizer, this.options);
    debug2("Initializing DTD end MatroskaIterator");
    await matroskaIterator.iterate(matroskaDtd, containerSize, {
      // Process tags and attachments one at a time. Never assemble a Segment/root tree.
      collect: (element) => [290298740, 357149030, 374648427, 29555, 24999].includes(element.id),
      startNext: async (element) => {
        switch (element.id) {
          case 408125543:
            this.seekHeadOffset = this.tokenizer.position;
            return ParseAction.ReadNext;
          case 423732329:
            return this.options.skipCovers ? ParseAction.IgnoreElement : ParseAction.ReadNext;
          case 18012: {
            const mimeType = element.parent && attachmentMimeTypes.get(element.parent);
            return mimeType !== void 0 && !mimeType.startsWith("image/") ? ParseAction.IgnoreElement : ParseAction.ReadNext;
          }
          case 290298740:
            return this.flagUseIndexToSkipClusters ? ParseAction.ReadNext : ParseAction.IgnoreElement;
          case 25506:
          // CodecPrivate is not exposed as metadata.
          case 28032:
          // ContentEncodings
          case 272869232:
          // Chapters are not currently exposed by this parser.
          case 475249515:
            debug2(`Skip element: name=${element.name}, id=0x${element.id.toString(16)}`);
            return ParseAction.IgnoreElement;
          case 524531317:
            if (this.flagUseIndexToSkipClusters && this.seekHead) {
              const index = (this.seekHead.seek ?? []).find((index2) => index2.position !== void 0 && index2.position + this.seekHeadOffset > this.tokenizer.position);
              if ((index == null ? void 0 : index.position) !== void 0) {
                const ignoreSize = index.position + this.seekHeadOffset - this.tokenizer.position;
                debug2(`Use index to go to next position, ignoring ${ignoreSize} bytes`);
                await this.tokenizer.ignore(ignoreSize);
                return ParseAction.SkipElement;
              }
            }
            return ParseAction.IgnoreElement;
          default:
            return ParseAction.ReadNext;
        }
      },
      onElement: async (event) => {
        var _a, _b, _c, _d, _e;
        if (debug2.enabled) {
          const value = event.value instanceof Uint8Array ? `${event.value.byteLength} bytes` : event.value;
          debug2(`Received: name=${event.element.name}, value=${value}`);
        }
        switch (event.id) {
          case 17026:
            this.metadata.setFormat("container", `EBML/${event.value}`);
            break;
          case 290298740:
            this.seekHead = event.value;
            break;
          case 357149030:
            {
              const info = event.value;
              if (info.title !== void 0) {
                await this.addTag("segment:title", info.title);
              }
              const timecodeScale = info.timecodeScale ? info.timecodeScale : 1e6;
              if (typeof info.duration === "number") {
                const duration = info.duration * timecodeScale / 1e9;
                if (Number.isFinite(duration) && duration > 0) {
                  this.metadata.setFormat("duration", duration);
                  this.metadata.setFormat("containerDuration", duration);
                }
              }
            }
            break;
          case 374648427:
            {
              const audioTracks = event.value;
              if (audioTracks == null ? void 0 : audioTracks.entries) {
                const entries = audioTracks.entries.filter((entry) => {
                  if (isCompleteTrack(entry)) {
                    return true;
                  }
                  this.metadata.addWarning("Ignoring Matroska track without valid TrackNumber, TrackType or CodecID");
                  return false;
                }).filter(isCompleteTrack);
                entries.forEach((entry) => {
                  var _a2, _b2;
                  const stream = {
                    id: entry.trackNumber,
                    codecId: entry.codecID,
                    codecName: entry.codecName ?? entry.codecID.replace(/^[AV]_/, ""),
                    codecSettings: entry.codecSettings,
                    flagDefault: entry.flagDefault ?? true,
                    flagLacing: entry.flagLacing ?? true,
                    flagEnabled: entry.flagEnabled ?? true,
                    flagForced: entry.flagForced ?? false,
                    language: entry.languageIETF ?? entry.language ?? "eng",
                    name: entry.name,
                    type: entry.trackType,
                    audio: entry.trackType === TrackType.audio ? {
                      ...entry.audio,
                      samplingFrequency: ((_a2 = entry.audio) == null ? void 0 : _a2.samplingFrequency) ?? 8e3,
                      channels: ((_b2 = entry.audio) == null ? void 0 : _b2.channels) ?? 1
                    } : void 0,
                    video: entry.trackType === TrackType.video && entry.video ? videoInfo(entry.video) : void 0
                  };
                  if (stream.video && entry.defaultDuration && entry.defaultDuration > 0) {
                    stream.video = { ...stream.video, frameRate: 1e9 / entry.defaultDuration };
                  }
                  if (entry.uid) {
                    this.tracksByUid.set(this.uidKey(entry.uid), stream);
                  }
                  this.metadata.addStreamInfo(stream);
                });
                const audioTrack = entries.filter((entry) => entry.trackType === TrackType.audio && entry.flagEnabled !== false).reduce((acc, cur) => {
                  if (!acc) {
                    return cur;
                  }
                  const currentDefault = cur.flagDefault ?? true;
                  const previousDefault = acc.flagDefault ?? true;
                  if (currentDefault !== previousDefault) {
                    return currentDefault ? cur : acc;
                  }
                  if (cur.trackNumber < acc.trackNumber) {
                    return cur;
                  }
                  return acc;
                }, null);
                if (audioTrack) {
                  if (audioTrack.uid) {
                    this.selectedAudioTrackUid = this.uidKey(audioTrack.uid);
                  }
                  this.metadata.setFormat("codec", audioTrack.codecID.replace(/^A_/, ""));
                  this.metadata.setFormat("hasAudio", true);
                  this.metadata.setFormat("sampleRate", ((_a = audioTrack.audio) == null ? void 0 : _a.outputSamplingFrequency) ?? ((_b = audioTrack.audio) == null ? void 0 : _b.samplingFrequency) ?? 8e3);
                  this.metadata.setFormat("numberOfChannels", ((_c = audioTrack.audio) == null ? void 0 : _c.channels) ?? 1);
                  if (((_d = audioTrack.audio) == null ? void 0 : _d.bitDepth) !== void 0) {
                    this.metadata.setFormat("bitsPerSample", audioTrack.audio.bitDepth);
                  }
                }
              }
            }
            break;
          case 29555: {
            const tag = event.value;
            const target = tag.target;
            for (const uid of (target == null ? void 0 : target.tagTrackUID) ?? []) {
              const key = this.uidKey(uid);
              if (key !== "0") {
                const statistics = this.trackStatistics.get(key) ?? /* @__PURE__ */ new Map();
                for (const simpleTag of tag.simpleTags ?? []) {
                  if (simpleTag.name && typeof simpleTag.string === "string") {
                    statistics.set(simpleTag.name.toUpperCase(), simpleTag.string);
                  }
                }
                this.trackStatistics.set(key, statistics);
              }
            }
            const targetType = (target == null ? void 0 : target.targetTypeValue) !== void 0 ? targetTypes[target.targetTypeValue] ?? "track" : (target == null ? void 0 : target.targetType) ?? "track";
            const isTrackTarget = targetType.toLowerCase() === "track";
            const targetUidKeys = ((target == null ? void 0 : target.tagTrackUID) ?? []).map((uid) => this.uidKey(uid)).filter((uid) => uid !== "0");
            const selectedAudioUid = this.selectedAudioTrackUid;
            const targetsSelectedAudio = selectedAudioUid !== void 0 && targetUidKeys.includes(selectedAudioUid);
            const isUntargeted = ((target == null ? void 0 : target.tagTrackUID) ?? []).length === 0;
            for (const simpleTag of tag.simpleTags ?? []) {
              const value = simpleTag.string ?? simpleTag.binary;
              if (simpleTag.name && value !== void 0) {
                const nameUpper = simpleTag.name.toUpperCase();
                if (isTrackTarget && nameUpper === "ALBUM") {
                  this.addNativeTag("track:ALBUM", value);
                  this.albumCandidates.push({
                    value,
                    targetUIDs: targetUidKeys,
                    untargeted: isUntargeted
                  });
                } else if (isTrackTarget && (nameUpper === "DATE" || nameUpper === "DISC" || nameUpper === "COMPOSER" || nameUpper === "ALBUM_ARTIST")) {
                  if (selectedAudioUid !== void 0 && !targetsSelectedAudio && !isUntargeted) {
                    this.addNativeTag(`track:${simpleTag.name}`, value);
                  } else {
                    await this.addTag(`${targetType}:${simpleTag.name}`, value);
                  }
                } else {
                  await this.addTag(`${targetType}:${simpleTag.name}`, value);
                }
              }
            }
            break;
          }
          case 18016:
            if (event.element.parent) {
              attachmentMimeTypes.set(event.element.parent, event.value);
            }
            break;
          case 24999: {
            const file = event.value;
            if ((_e = file.mimeType) == null ? void 0 : _e.startsWith("image/")) {
              if (isCompleteFile(file)) {
                await this.addTag("picture", {
                  data: file.data,
                  format: file.mimeType,
                  description: file.description,
                  name: file.name
                });
              } else {
                this.metadata.addWarning("Ignoring incomplete Matroska image attachment");
              }
            }
            break;
          }
        }
      }
    });
    this.applyTrackStatistics();
    await this.resolveTrackAlbum();
  }
  addNativeTag(tagId, value) {
    this.metadata.registerTagType("matroska");
    if (!this.metadata.native.matroska) {
      this.metadata.native.matroska = [];
    }
    this.metadata.native.matroska.push({ id: tagId, value });
  }
  async resolveTrackAlbum() {
    if (this.albumCandidates.length === 0) {
      return;
    }
    const selectedAudioUid = this.selectedAudioTrackUid;
    const targetsSelectedAudio = (candidate) => selectedAudioUid !== void 0 && candidate.targetUIDs.includes(selectedAudioUid);
    const targetsVideoOnly = (candidate) => candidate.targetUIDs.length > 0 && candidate.targetUIDs.every((uid) => {
      var _a;
      return ((_a = this.tracksByUid.get(uid)) == null ? void 0 : _a.type) === TrackType.video;
    });
    const selected = this.albumCandidates.findLast(targetsSelectedAudio) ?? this.albumCandidates.findLast((candidate) => candidate.untargeted) ?? this.albumCandidates.findLast((candidate) => !targetsVideoOnly(candidate)) ?? this.albumCandidates[this.albumCandidates.length - 1];
    if (this.metadata.common.album === void 0) {
      await this.metadata.postMap("matroska", { id: "album", value: selected.value });
    }
  }
  uidKey(uid) {
    return Array.from(uid, (byte) => byte.toString(16).padStart(2, "0")).join("").replace(/^0+/, "") || "0";
  }
  applyTrackStatistics() {
    var _a, _b;
    for (const [uid, tags] of this.trackStatistics) {
      const track = this.tracksByUid.get(uid);
      if (!track) {
        continue;
      }
      const duration = (_a = tags.get("DURATION")) == null ? void 0 : _a.match(/^(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)$/);
      if (duration) {
        const seconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
        if (Number.isFinite(seconds) && seconds > 0) {
          track.duration = seconds;
        }
      }
      const number = (name) => {
        const value = tags.get(name);
        if (value && /^\d+$/.test(value)) {
          const result = Number(value);
          if (Number.isSafeInteger(result) && result >= 0) {
            return result;
          }
        }
        return void 0;
      };
      const bitrate = number("BPS");
      const size = number("NUMBER_OF_BYTES");
      if (bitrate !== void 0 && bitrate > 0) {
        track.bitrate = bitrate;
      } else if (size !== void 0 && track.duration) {
        track.bitrate = size * 8 / track.duration;
      }
      const frames = number("NUMBER_OF_FRAMES");
      if (track.video && frames !== void 0 && frames > 0 && track.duration) {
        (_b = track.video).frameRate ?? (_b.frameRate = frames / track.duration);
      }
    }
  }
  async addTag(tagId, value) {
    await this.metadata.addTag("matroska", tagId, value);
  }
};
export {
  MatroskaParser
};
//# sourceMappingURL=MatroskaParser-GEKW7SYE.js.map
