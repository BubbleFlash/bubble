import {
  getBitAllignedNumber,
  isBitSet
} from "./chunk-O76RKEBI.js";
import {
  __publicField
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/music-metadata/lib/mpeg/AdtsFrameHeader.js
var _AdtsFrameHeader = class _AdtsFrameHeader {
  constructor(buf) {
    __publicField(this, "container");
    __publicField(this, "codec", "AAC");
    __publicField(this, "codecProfile");
    __publicField(this, "samplingRate");
    __publicField(this, "numberOfChannels");
    __publicField(this, "frameLength");
    __publicField(this, "headerLength");
    this.headerLength = (buf[1] & 1) === 0 ? 9 : 7;
    this.container = `ADTS/MPEG-${isBitSet(buf, 1, 4) ? 2 : 4}`;
    this.codecProfile = _AdtsFrameHeader.profiles[getBitAllignedNumber(buf, 2, 0, 2)];
    this.samplingRate = _AdtsFrameHeader.samplingRates[getBitAllignedNumber(buf, 2, 2, 4)];
    this.numberOfChannels = _AdtsFrameHeader.channelCounts[getBitAllignedNumber(buf, 2, 7, 3)];
    this.frameLength = getBitAllignedNumber(buf, 3, 6, 2) << 11;
  }
  static matches(buf) {
    return (buf[1] & 22) === 16;
  }
};
__publicField(_AdtsFrameHeader, "profiles", ["AAC Main", "AAC LC", "AAC SSR", "AAC LTP"]);
__publicField(_AdtsFrameHeader, "samplingRates", [
  96e3,
  88200,
  64e3,
  48e3,
  44100,
  32e3,
  24e3,
  22050,
  16e3,
  12e3,
  11025,
  8e3,
  7350,
  null,
  // Reserved index 13
  null,
  // Reserved index 14
  null
  // Escape index 15
]);
__publicField(_AdtsFrameHeader, "channelCounts", [void 0, 1, 2, 3, 4, 5, 6, 8]);
var AdtsFrameHeader = _AdtsFrameHeader;

export {
  AdtsFrameHeader
};
//# sourceMappingURL=chunk-5QXUL7QG.js.map
