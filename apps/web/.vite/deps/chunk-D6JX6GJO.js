import {
  ID3v2Parser,
  Id3v2ContentError
} from "./chunk-7DCDJDGP.js";
import {
  ID3v2Header
} from "./chunk-GQBXDRBH.js";
import {
  EndOfStreamError,
  TokenizerBoundaryError,
  createTokenizerView,
  validateAllocation
} from "./chunk-3HBPJLK7.js";

// ../../node_modules/music-metadata/lib/id3v2/EmbeddedID3v2.js
async function parseEmbeddedID3v2(metadata, tokenizer, options, size) {
  validateAllocation(size, options);
  if (size < ID3v2Header.len || tokenizer.fileInfo.size !== void 0 && size > tokenizer.fileInfo.size - tokenizer.position) {
    throw new EndOfStreamError();
  }
  const embeddedTokenizer = createTokenizerView(tokenizer, size);
  try {
    await new ID3v2Parser().parse(metadata, embeddedTokenizer, options);
    await embeddedTokenizer.consumeRemainder();
  } catch (error) {
    if (error instanceof TokenizerBoundaryError) {
      throw new Id3v2ContentError(`Embedded ID3v2 read exceeds chunk boundary: ${error.message}`);
    }
    throw error;
  } finally {
    await embeddedTokenizer.close();
  }
}

export {
  parseEmbeddedID3v2
};
//# sourceMappingURL=chunk-D6JX6GJO.js.map
