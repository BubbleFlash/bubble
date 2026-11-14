// ../../node_modules/music-metadata/lib/type.js
var TrackType = {
  video: 1,
  audio: 2,
  complex: 3,
  logo: 4,
  subtitle: 17,
  button: 18,
  control: 32,
  /** Timed metadata (library extension to the Matroska track types). */
  metadata: 33
};
var TrackTypeValueToKeyMap = {
  [TrackType.video]: "video",
  [TrackType.audio]: "audio",
  [TrackType.complex]: "complex",
  [TrackType.logo]: "logo",
  [TrackType.subtitle]: "subtitle",
  [TrackType.button]: "button",
  [TrackType.control]: "control",
  [TrackType.metadata]: "metadata"
};

export {
  TrackType,
  TrackTypeValueToKeyMap
};
//# sourceMappingURL=chunk-XS2AH7GC.js.map
