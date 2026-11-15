import {
  __commonJS,
  __export,
  __publicField,
  __toESM
} from "./chunk-WOOG5QLI.js";

// ../../node_modules/ieee754/index.js
var require_ieee754 = __commonJS({
  "../../node_modules/ieee754/index.js"(exports) {
    exports.read = function(buffer, offset, isLE, mLen, nBytes) {
      var e, m;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var nBits = -7;
      var i = isLE ? nBytes - 1 : 0;
      var d = isLE ? -1 : 1;
      var s = buffer[offset + i];
      i += d;
      e = s & (1 << -nBits) - 1;
      s >>= -nBits;
      nBits += eLen;
      for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      m = e & (1 << -nBits) - 1;
      e >>= -nBits;
      nBits += mLen;
      for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
      }
      if (e === 0) {
        e = 1 - eBias;
      } else if (e === eMax) {
        return m ? NaN : (s ? -1 : 1) * Infinity;
      } else {
        m = m + Math.pow(2, mLen);
        e = e - eBias;
      }
      return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
    };
    exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
      var e, m, c;
      var eLen = nBytes * 8 - mLen - 1;
      var eMax = (1 << eLen) - 1;
      var eBias = eMax >> 1;
      var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
      var i = isLE ? 0 : nBytes - 1;
      var d = isLE ? 1 : -1;
      var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
      value = Math.abs(value);
      if (isNaN(value) || value === Infinity) {
        m = isNaN(value) ? 1 : 0;
        e = eMax;
      } else {
        e = Math.floor(Math.log(value) / Math.LN2);
        if (value * (c = Math.pow(2, -e)) < 1) {
          e--;
          c *= 2;
        }
        if (e + eBias >= 1) {
          value += rt / c;
        } else {
          value += rt * Math.pow(2, 1 - eBias);
        }
        if (value * c >= 2) {
          e++;
          c /= 2;
        }
        if (e + eBias >= eMax) {
          m = 0;
          e = eMax;
        } else if (e + eBias >= 1) {
          m = (value * c - 1) * Math.pow(2, mLen);
          e = e + eBias;
        } else {
          m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
          e = 0;
        }
      }
      for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
      }
      e = e << mLen | m;
      eLen += mLen;
      for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
      }
      buffer[offset + i - d] |= s * 128;
    };
  }
});

// ../../node_modules/strtok3/lib/stream/Errors.js
var defaultMessages = "End-Of-Stream";
var EndOfStreamError = class extends Error {
  constructor() {
    super(defaultMessages);
    this.name = "EndOfStreamError";
  }
};
var AbortError = class extends Error {
  constructor(message = "The operation was aborted") {
    super(message);
    this.name = "AbortError";
  }
};

// ../../node_modules/strtok3/lib/stream/AbstractStreamReader.js
var AbstractStreamReader = class {
  constructor(options) {
    this.endOfStream = false;
    this.interrupted = false;
    this.peekQueue = [];
    this.onCloseCallback = options == null ? void 0 : options.onClose;
  }
  async peek(uint8Array, mayBeLess = false) {
    const bytesRead = await this.read(uint8Array, mayBeLess);
    this.peekQueue.push(uint8Array.subarray(0, bytesRead));
    return bytesRead;
  }
  async read(buffer, mayBeLess = false) {
    if (buffer.length === 0) {
      return 0;
    }
    let bytesRead = this.readFromPeekBuffer(buffer);
    if (!this.endOfStream) {
      bytesRead += await this.readRemainderFromStream(buffer.subarray(bytesRead), mayBeLess);
    }
    if (bytesRead === 0 && !mayBeLess) {
      throw new EndOfStreamError();
    }
    return bytesRead;
  }
  /**
   * Read chunk from stream
   * @param buffer - Target Uint8Array (or Buffer) to store data read from stream in
   * @returns Number of bytes read
   */
  readFromPeekBuffer(buffer) {
    let remaining = buffer.length;
    let bytesRead = 0;
    while (this.peekQueue.length > 0 && remaining > 0) {
      const peekData = this.peekQueue.pop();
      if (!peekData) {
        throw new Error("peekData should be defined");
      }
      const lenCopy = Math.min(peekData.length, remaining);
      buffer.set(peekData.subarray(0, lenCopy), bytesRead);
      bytesRead += lenCopy;
      remaining -= lenCopy;
      if (lenCopy < peekData.length) {
        this.peekQueue.push(peekData.subarray(lenCopy));
      }
    }
    return bytesRead;
  }
  async readRemainderFromStream(buffer, mayBeLess) {
    let bytesRead = 0;
    while (bytesRead < buffer.length && !this.endOfStream) {
      if (this.interrupted) {
        throw new AbortError();
      }
      const chunkLen = await this.readFromStream(buffer.subarray(bytesRead), mayBeLess);
      if (chunkLen === 0) {
        break;
      }
      bytesRead += chunkLen;
    }
    if (!mayBeLess && bytesRead < buffer.length) {
      throw new EndOfStreamError();
    }
    return bytesRead;
  }
  /** Share resource cleanup, callback completion and failures across close calls. */
  close() {
    this.closePromise ?? (this.closePromise = Promise.resolve().then(async () => {
      var _a;
      await this.closeResource();
      await ((_a = this.onCloseCallback) == null ? void 0 : _a.call(this));
    }));
    return this.closePromise;
  }
  /** Backend cleanup completes before the optional close callback. */
  closeResource() {
    return this.abort();
  }
};

// ../../node_modules/strtok3/lib/stream/WebStreamReader.js
var WebStreamReader = class extends AbstractStreamReader {
  constructor(reader, options) {
    super(options);
    this.reader = reader;
    this.released = false;
  }
  async abort() {
    if (!this.released) {
      this.reader.releaseLock();
      this.released = true;
    }
  }
};

// ../../node_modules/strtok3/lib/stream/WebStreamByobReader.js
var WebStreamByobReader = class extends WebStreamReader {
  /**
   * Read from stream
   * @param buffer - Target Uint8Array (or Buffer) to store data read from stream in
   * @param mayBeLess - If true, may fill the buffer partially
   * @protected Bytes read
   */
  async readFromStream(buffer, mayBeLess) {
    if (buffer.length === 0) {
      return 0;
    }
    const result = await this.reader.read(new Uint8Array(buffer.length), {
      min: mayBeLess ? void 0 : buffer.length
    });
    if (result.done) {
      this.endOfStream = result.done;
    }
    if (result.value) {
      buffer.set(result.value);
      return result.value.length;
    }
    return 0;
  }
};

// ../../node_modules/strtok3/lib/stream/WebStreamDefaultReader.js
var WebStreamDefaultReader = class extends AbstractStreamReader {
  constructor(reader, options) {
    super(options);
    this.reader = reader;
    this.buffer = null;
  }
  /**
   * Copy chunk to target, and store the remainder in this.buffer
   */
  writeChunk(target, chunk) {
    const written = Math.min(chunk.length, target.length);
    target.set(chunk.subarray(0, written));
    if (written < chunk.length) {
      this.buffer = chunk.subarray(written);
    } else {
      this.buffer = null;
    }
    return written;
  }
  /**
   * Read from stream
   * @param buffer - Target Uint8Array (or Buffer) to store data read from stream in
   * @param mayBeLess - If true, may fill the buffer partially
   * @protected Bytes read
   */
  async readFromStream(buffer, mayBeLess) {
    if (buffer.length === 0) {
      return 0;
    }
    let totalBytesRead = 0;
    if (this.buffer) {
      totalBytesRead += this.writeChunk(buffer, this.buffer);
    }
    while (totalBytesRead < buffer.length && !this.endOfStream) {
      const result = await this.reader.read();
      if (result.done) {
        this.endOfStream = true;
        break;
      }
      if (result.value) {
        totalBytesRead += this.writeChunk(buffer.subarray(totalBytesRead), result.value);
      }
    }
    if (!mayBeLess && totalBytesRead === 0 && this.endOfStream) {
      throw new EndOfStreamError();
    }
    return totalBytesRead;
  }
  abort() {
    this.interrupted = true;
    return this.reader.cancel();
  }
  async closeResource() {
    try {
      await this.abort();
    } finally {
      this.reader.releaseLock();
    }
  }
};

// ../../node_modules/strtok3/lib/stream/WebStreamReaderFactory.js
function makeWebStreamReader(stream, options) {
  try {
    const reader = stream.getReader({ mode: "byob" });
    if (reader instanceof ReadableStreamDefaultReader) {
      return new WebStreamDefaultReader(reader, options);
    }
    return new WebStreamByobReader(reader, options);
  } catch (error) {
    if (error instanceof TypeError) {
      return new WebStreamDefaultReader(stream.getReader(), options);
    }
    throw error;
  }
}

// ../../node_modules/strtok3/lib/isRandomAccessTokenizer.js
function isRandomAccessTokenizer(tokenizer) {
  return tokenizer.supportsRandomAccess() && "setPosition" in tokenizer && typeof tokenizer.setPosition === "function" && typeof tokenizer.fileInfo.size === "number";
}

// ../../node_modules/strtok3/lib/TokenizerBoundaryError.js
var TokenizerBoundaryError = class extends RangeError {
  constructor(position, length, size) {
    super(`Range at position ${position} with length ${length} exceeds tokenizer view size ${size}`);
    this.position = position;
    this.length = length;
    this.size = size;
    this.name = "TokenizerBoundaryError";
  }
};

// ../../node_modules/strtok3/lib/TokenizerView.js
function validateOffset(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}
function createTokenizerView(source, length) {
  return isRandomAccessTokenizer(source) ? new RandomAccessTokenizerView(source, length) : new TokenizerView(source, length);
}
var TokenizerView = class _TokenizerView {
  constructor(source, size) {
    this.source = source;
    this.size = size;
    this.closed = false;
    this.closedPosition = 0;
    this.busy = false;
    validateOffset(size, "length");
    validateOffset(source.position, "source position");
    validateOffset(source.position + size, "end position");
    if (source instanceof _TokenizerView) {
      source.assertAvailable();
      source.translateRange(size, source.position);
    }
    this.start = source.position;
    this.fileInfo = { size };
  }
  get position() {
    return this.closed ? this.closedPosition : this.source.position - this.start;
  }
  get remaining() {
    return this.size - this.position;
  }
  supportsRandomAccess() {
    return false;
  }
  createView(length) {
    this.assertAvailable();
    return createTokenizerView(this, length);
  }
  async readBuffer(buffer, options) {
    return this.bufferOperation("readBuffer", buffer, options);
  }
  async peekBuffer(buffer, options) {
    return this.bufferOperation("peekBuffer", buffer, options);
  }
  async bufferOperation(method, buffer, options) {
    this.assertAvailable();
    const length = (options == null ? void 0 : options.length) ?? buffer.length;
    const position = (options == null ? void 0 : options.position) ?? this.position;
    const absolutePosition = this.translateRange(length, position);
    if (length > buffer.length) {
      throw new RangeError("length must not exceed the target buffer length");
    }
    return this.run(() => this.source[method](buffer, { ...options, length, position: absolutePosition }));
  }
  async readToken(token, position = this.position) {
    this.assertAvailable();
    const absolutePosition = this.translateRange(token.len, position);
    return this.run(() => this.source.readToken(token, absolutePosition));
  }
  async peekToken(token, position = this.position) {
    this.assertAvailable();
    const absolutePosition = this.translateRange(token.len, position ?? this.position);
    return this.run(() => this.source.peekToken(token, absolutePosition));
  }
  async readNumber(token) {
    this.assertAvailable();
    this.translateRange(token.len, this.position);
    return this.run(() => this.source.readNumber(token));
  }
  async peekNumber(token) {
    this.assertAvailable();
    this.translateRange(token.len, this.position);
    return this.run(() => this.source.peekNumber(token));
  }
  async ignore(length) {
    this.assertAvailable();
    this.translateRange(length, this.position);
    return this.run(() => this.source.ignore(length));
  }
  async consumeRemainder() {
    this.assertAvailable();
    const length = this.remaining;
    const end = this.translateRange(length, this.position) + length;
    return this.run(async () => {
      if (length === 0) {
        return 0;
      }
      if (isRandomAccessTokenizer(this.source)) {
        if (await this.source.peekBuffer(new Uint8Array(1), { position: end - 1 }) !== 1) {
          throw new EndOfStreamError();
        }
        this.source.setPosition(end);
      } else {
        const ignored = await this.source.ignore(length);
        if (ignored !== length) {
          throw new EndOfStreamError();
        }
      }
      return length;
    });
  }
  /** Release this view only. Never drain, close or abort the borrowed source. */
  async close() {
    if (this.closed) {
      return;
    }
    if (this.busy) {
      throw new Error("Cannot close a tokenizer view during an active operation");
    }
    this.closedPosition = this.position;
    this.closed = true;
  }
  /** Explicit cancellation propagates to the shared source and affects its other users. */
  async abort() {
    if (this.closed) {
      return;
    }
    try {
      await this.source.abort();
    } finally {
      this.closedPosition = this.position;
      this.closed = true;
    }
  }
  assertAvailable() {
    if (this.closed) {
      throw new Error("Tokenizer view is closed");
    }
    if (this.busy) {
      throw new Error("Tokenizer views require sequential operations");
    }
    if (this.source instanceof _TokenizerView) {
      this.source.assertAvailable();
    }
  }
  /** Validate the whole request before delegating or allowing a token allocation. */
  translateRange(length, position) {
    validateOffset(length, "length");
    validateOffset(position, "position");
    validateOffset(position + length, "end position");
    if (position > this.size || length > this.size - position) {
      throw new TokenizerBoundaryError(position, length, this.size);
    }
    if (!this.supportsRandomAccess() && position < this.position) {
      throw new Error("`options.position` must be equal or greater than `tokenizer.position`");
    }
    return this.start + position;
  }
  async run(operation) {
    this.busy = true;
    try {
      return await operation();
    } finally {
      this.busy = false;
    }
  }
};
var RandomAccessTokenizerView = class extends TokenizerView {
  constructor(source, size) {
    super(source, size);
  }
  supportsRandomAccess() {
    return true;
  }
  setPosition(position) {
    this.assertAvailable();
    this.source.setPosition(this.translateRange(0, position));
  }
  createView(length) {
    this.assertAvailable();
    return createTokenizerView(this, length);
  }
};

// ../../node_modules/strtok3/lib/AbortSignal.js
function throwIfAborted(signal) {
  if (signal == null ? void 0 : signal.aborted) {
    throw new AbortError();
  }
}

// ../../node_modules/strtok3/lib/BufferSizeError.js
var BufferSizeError = class extends RangeError {
  /**
   * Create an error describing an allocation that exceeds the configured limit.
   * @param requestedSize - Requested buffer size in bytes
   * @param maxBufferSize - Configured maximum buffer size in bytes
   */
  constructor(requestedSize, maxBufferSize) {
    super(`Requested buffer size ${requestedSize} exceeds maxBufferSize ${maxBufferSize}`);
    this.requestedSize = requestedSize;
    this.maxBufferSize = maxBufferSize;
    this.name = "BufferSizeError";
  }
};
function getMaxBufferSize(options) {
  const limit = (options == null ? void 0 : options.maxBufferSize) ?? Number.POSITIVE_INFINITY;
  if (limit !== Number.POSITIVE_INFINITY && (!Number.isSafeInteger(limit) || limit <= 0)) {
    throw new RangeError("maxBufferSize must be a positive safe integer or Infinity");
  }
  return limit;
}

// ../../node_modules/strtok3/lib/AbstractTokenizer.js
var AbstractTokenizer = class {
  /**
   * Constructor
   * @param options Tokenizer options
   * @protected
   */
  constructor(options) {
    this.numBuffer = new Uint8Array(10);
    this.position = 0;
    this.maxBufferSize = getMaxBufferSize(options);
    throwIfAborted(options == null ? void 0 : options.abortSignal);
    this.onClose = options == null ? void 0 : options.onClose;
    if (options == null ? void 0 : options.abortSignal) {
      this.addAbortListener(options.abortSignal, () => {
        void this.abort().catch(() => {
        });
      });
    }
  }
  addAbortListener(signal, listener) {
    this.abortSignal = signal;
    this.abortListener = listener;
    signal.addEventListener("abort", listener, { once: true });
  }
  removeAbortListener() {
    var _a;
    if (this.abortListener) {
      (_a = this.abortSignal) == null ? void 0 : _a.removeEventListener("abort", this.abortListener);
    }
    this.abortSignal = void 0;
    this.abortListener = void 0;
  }
  /**
   * Read a token from the tokenizer-stream
   * @param token - The token to read
   * @param position - If provided, the desired position in the tokenizer-stream
   * @returns Promise with token data
   */
  async readToken(token, position = this.position) {
    this.validateTokenRead(token.len, position);
    const uint8Array = new Uint8Array(token.len);
    const len = await this.readBuffer(uint8Array, { position });
    if (len < token.len) {
      throw new EndOfStreamError();
    }
    return token.get(uint8Array, 0);
  }
  /**
   * Peek a token from the tokenizer-stream.
   * @param token - Token to peek from the tokenizer-stream.
   * @param position - Offset where to begin reading within the file. If position is null, data will be read from the current file position.
   * @returns Promise with token data
   */
  async peekToken(token, position = this.position) {
    const peekPosition = position ?? this.position;
    this.validateTokenRead(token.len, peekPosition, true);
    const uint8Array = new Uint8Array(token.len);
    const len = await this.peekBuffer(uint8Array, { position: peekPosition });
    if (len < token.len) {
      throw new EndOfStreamError();
    }
    return token.get(uint8Array, 0);
  }
  /**
   * Read a numeric token from the stream
   * @param token - Numeric token
   * @returns Promise with number
   */
  async readNumber(token) {
    const len = await this.readBuffer(this.numBuffer, { length: token.len });
    if (len < token.len) {
      throw new EndOfStreamError();
    }
    return token.get(this.numBuffer, 0);
  }
  /**
   * Read a numeric token from the stream
   * @param token - Numeric token
   * @returns Promise with number
   */
  async peekNumber(token) {
    const len = await this.peekBuffer(this.numBuffer, { length: token.len });
    if (len < token.len) {
      throw new EndOfStreamError();
    }
    return token.get(this.numBuffer, 0);
  }
  /**
   * Ignore number of bytes, advances the pointer in under tokenizer-stream.
   * @param length - Number of bytes to ignore.  Must be ≥ 0.
   * @return resolves the number of bytes ignored, equals length if this available, otherwise the number of bytes available
   */
  async ignore(length) {
    if (length < 0) {
      throw new RangeError("ignore length must be ≥ 0 bytes");
    }
    this.validateLength(length, "ignore length");
    this.validateLength(this.position + length, "end position");
    if (this.fileInfo.size !== void 0) {
      const bytesLeft = Math.max(0, this.fileInfo.size - this.position);
      if (length > bytesLeft) {
        this.position += bytesLeft;
        return bytesLeft;
      }
    }
    this.position += length;
    return length;
  }
  close() {
    if (!this.closePromise) {
      this.removeAbortListener();
      this.closePromise = Promise.resolve().then(() => this.closeOnce());
    }
    return this.closePromise;
  }
  /** Perform cleanup once, sharing completion and the first error across close calls. */
  async closeOnce() {
    var _a;
    await this.abort();
    await ((_a = this.onClose) == null ? void 0 : _a.call(this));
  }
  /**
   * Validate a byte length or position before using it in buffer calculations.
   * @param value - Value that must be a non-negative safe integer
   * @param name - Label used in the validation error
   * @throws RangeError if the value is negative or not a safe integer
   */
  validateLength(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
  /**
   * Validate a requested buffer size against the configured allocation limit.
   * @param length - Requested buffer size in bytes
   * @throws RangeError if the length is negative or not a safe integer
   * @throws BufferSizeError if the length exceeds maxBufferSize
   */
  validateBufferSize(length) {
    this.validateLength(length, "buffer length");
    if (length > this.maxBufferSize) {
      throw new BufferSizeError(length, this.maxBufferSize);
    }
  }
  /**
   * Validate a token request before allocating a buffer or consuming input.
   * @param length - Token length in bytes
   * @param position - Byte offset where the token starts
   * @param peek - Whether to include skipped stream bytes in the lookahead limit
   * @throws RangeError if a length or position is negative or not a safe integer
   * @throws BufferSizeError if the token buffer or stream lookahead exceeds maxBufferSize
   * @throws Error if a stream request starts before the current position
   * @throws EndOfStreamError if the token extends beyond the known input size
   */
  validateTokenRead(length, position, peek = false) {
    this.validateBufferSize(length);
    this.validateLength(position, "position");
    this.validateLength(position + length, "end position");
    if (!this.supportsRandomAccess() && position < this.position) {
      throw new Error("`options.position` must be equal or greater than `tokenizer.position`");
    }
    if (peek && !this.supportsRandomAccess()) {
      this.validateBufferSize(length + position - this.position);
    }
    if (this.fileInfo.size !== void 0 && length > this.fileInfo.size - position) {
      throw new EndOfStreamError();
    }
  }
  /**
   * Apply defaults and validate buffer read or peek options.
   * @param uint8Array - Target buffer whose length is the default read length
   * @param options - Requested length, position and partial-read behavior
   * @returns Validated options with an explicit length, position and mayBeLess flag
   * @throws RangeError if a length or position is invalid, or the length exceeds the target buffer
   * @throws Error if a stream request starts before the current position
   */
  normalizeOptions(uint8Array, options) {
    const length = (options == null ? void 0 : options.length) ?? uint8Array.length;
    const position = (options == null ? void 0 : options.position) ?? this.position;
    this.validateLength(length, "length");
    this.validateLength(position, "position");
    this.validateLength(position + length, "end position");
    if (length > uint8Array.length) {
      throw new RangeError("length must not exceed the target buffer length");
    }
    if (!this.supportsRandomAccess() && position < this.position) {
      throw new Error("`options.position` must be equal or greater than `tokenizer.position`");
    }
    return { length, position, mayBeLess: (options == null ? void 0 : options.mayBeLess) ?? false };
  }
  abort() {
    this.removeAbortListener();
    return Promise.resolve();
  }
};

// ../../node_modules/strtok3/lib/BlobTokenizer.js
var BlobTokenizer = class extends AbstractTokenizer {
  /**
   * Construct BufferTokenizer
   * @param blob - Uint8Array to tokenize
   * @param options Tokenizer options
   */
  constructor(blob, options) {
    super(options);
    this.blob = blob;
    this.fileInfo = { ...(options == null ? void 0 : options.fileInfo) ?? {}, ...{ size: blob.size, mimeType: blob.type } };
  }
  /**
   * Read buffer from tokenizer
   * @param uint8Array - Uint8Array to tokenize
   * @param options - Read behaviour options
   * @returns {Promise<number>}
   */
  async readBuffer(uint8Array, options) {
    const normOptions = this.normalizeOptions(uint8Array, options);
    const bytesRead = await this.peekBuffer(uint8Array, normOptions);
    this.position = normOptions.position + bytesRead;
    return bytesRead;
  }
  /**
   * Peek (read ahead) buffer from tokenizer
   * @param buffer
   * @param options - Read behaviour options
   * @returns {Promise<number>}
   */
  async peekBuffer(buffer, options) {
    const normOptions = this.normalizeOptions(buffer, options);
    const bytes2read = Math.max(0, Math.min(this.blob.size - normOptions.position, normOptions.length));
    if (!normOptions.mayBeLess && bytes2read < normOptions.length) {
      throw new EndOfStreamError();
    }
    for (let offset = 0; offset < bytes2read; ) {
      const chunkLength = Math.min(this.maxBufferSize, bytes2read - offset);
      const position = normOptions.position + offset;
      const arrayBuffer = await this.blob.slice(position, position + chunkLength).arrayBuffer();
      buffer.set(new Uint8Array(arrayBuffer), offset);
      offset += chunkLength;
    }
    return bytes2read;
  }
  close() {
    return super.close();
  }
  supportsRandomAccess() {
    return true;
  }
  setPosition(position) {
    this.validateLength(position, "position");
    this.position = position;
  }
};

// ../../node_modules/strtok3/lib/BufferTokenizer.js
var BufferTokenizer = class extends AbstractTokenizer {
  /**
   * Construct BufferTokenizer
   * @param uint8Array - Uint8Array to tokenize
   * @param options Tokenizer options
   */
  constructor(uint8Array, options) {
    super(options);
    this.uint8Array = uint8Array;
    this.fileInfo = { ...(options == null ? void 0 : options.fileInfo) ?? {}, ...{ size: uint8Array.length } };
  }
  /**
   * Read buffer from tokenizer
   * @param uint8Array - Uint8Array to tokenize
   * @param options - Read behaviour options
   * @returns {Promise<number>}
   */
  async readBuffer(uint8Array, options) {
    const normOptions = this.normalizeOptions(uint8Array, options);
    const bytesRead = await this.peekBuffer(uint8Array, normOptions);
    this.position = normOptions.position + bytesRead;
    return bytesRead;
  }
  /**
   * Peek (read ahead) buffer from tokenizer
   * @param uint8Array
   * @param options - Read behaviour options
   * @returns {Promise<number>}
   */
  async peekBuffer(uint8Array, options) {
    const normOptions = this.normalizeOptions(uint8Array, options);
    const bytes2read = Math.max(0, Math.min(this.uint8Array.length - normOptions.position, normOptions.length));
    if (!normOptions.mayBeLess && bytes2read < normOptions.length) {
      throw new EndOfStreamError();
    }
    uint8Array.set(this.uint8Array.subarray(normOptions.position, normOptions.position + bytes2read));
    return bytes2read;
  }
  close() {
    return super.close();
  }
  supportsRandomAccess() {
    return true;
  }
  setPosition(position) {
    this.validateLength(position, "position");
    this.position = position;
  }
};

// ../../node_modules/strtok3/lib/ReadStreamTokenizer.js
var ignoreChunkSize = 256e3;
var ReadStreamTokenizer = class extends AbstractTokenizer {
  /**
   * Constructor
   * @param streamReader stream-reader to read from
   * @param options Tokenizer options
   */
  constructor(streamReader, options) {
    super(options);
    this.streamReader = streamReader;
    this.fileInfo = (options == null ? void 0 : options.fileInfo) ?? {};
  }
  /**
   * Read buffer from tokenizer
   * @param uint8Array - Target Uint8Array to fill with data read from the tokenizer-stream
   * @param options - Read behaviour options
   * @returns Promise with number of bytes read
   */
  async readBuffer(uint8Array, options) {
    const normOptions = this.normalizeOptions(uint8Array, options);
    const skipBytes = normOptions.position - this.position;
    if (skipBytes > 0) {
      await this.ignore(skipBytes);
      return this.readBuffer(uint8Array, options);
    }
    if (skipBytes < 0) {
      throw new Error("`options.position` must be equal or greater than `tokenizer.position`");
    }
    if (normOptions.length === 0) {
      return 0;
    }
    let bytesRead = 0;
    while (bytesRead < normOptions.length) {
      const chunkLength = Math.min(this.maxBufferSize, normOptions.length - bytesRead);
      const count = await this.streamReader.read(uint8Array.subarray(bytesRead, bytesRead + chunkLength), true);
      bytesRead += count;
      this.position += count;
      if (count < chunkLength) {
        break;
      }
    }
    if (!normOptions.mayBeLess && bytesRead < normOptions.length) {
      throw new EndOfStreamError();
    }
    return bytesRead;
  }
  /**
   * Peek (read ahead) buffer from tokenizer
   * @param uint8Array - Uint8Array (or Buffer) to write data to
   * @param options - Read behaviour options
   * @returns Promise with number of bytes peeked
   */
  async peekBuffer(uint8Array, options) {
    const normOptions = this.normalizeOptions(uint8Array, options);
    if (normOptions.length === 0) {
      return 0;
    }
    if (this.fileInfo.size !== void 0 && normOptions.position >= this.fileInfo.size) {
      if (normOptions.mayBeLess) {
        return 0;
      }
      throw new EndOfStreamError();
    }
    const lookaheadSize = normOptions.length + normOptions.position - this.position;
    this.validateBufferSize(lookaheadSize);
    let bytesRead = 0;
    if (normOptions.position) {
      const skipBytes = normOptions.position - this.position;
      if (skipBytes > 0) {
        const skipBuffer = new Uint8Array(normOptions.length + skipBytes);
        bytesRead = await this.peekBuffer(skipBuffer, { mayBeLess: normOptions.mayBeLess });
        const bytesPeeked = Math.max(0, bytesRead - skipBytes);
        uint8Array.set(skipBuffer.subarray(skipBytes, skipBytes + bytesPeeked));
        return bytesPeeked;
      }
      if (skipBytes < 0) {
        throw new Error("Cannot peek from a negative offset in a stream");
      }
    }
    if (normOptions.length > 0) {
      try {
        const peekBuffer = new Uint8Array(normOptions.length);
        bytesRead = await this.streamReader.peek(peekBuffer, true);
        uint8Array.set(peekBuffer.subarray(0, bytesRead));
      } catch (err) {
        if ((options == null ? void 0 : options.mayBeLess) && err instanceof EndOfStreamError) {
          return 0;
        }
        throw err;
      }
      if (!normOptions.mayBeLess && bytesRead < normOptions.length) {
        throw new EndOfStreamError();
      }
    }
    return bytesRead;
  }
  /**
   * @param length Number of bytes to ignore. Must be ≥ 0.
   */
  async ignore(length) {
    if (length < 0) {
      throw new RangeError("ignore length must be ≥ 0 bytes");
    }
    this.validateLength(length, "ignore length");
    this.validateLength(this.position + length, "end position");
    if (length > 0 && this.fileInfo.size !== void 0 && length > this.fileInfo.size - this.position) {
      throw new EndOfStreamError();
    }
    const bufSize = Math.min(ignoreChunkSize, this.maxBufferSize, length);
    const buf = new Uint8Array(bufSize);
    let totBytesRead = 0;
    while (totBytesRead < length) {
      const remaining = length - totBytesRead;
      const bytesRead = await this.readBuffer(buf, { length: Math.min(bufSize, remaining) });
      if (bytesRead < 0) {
        return bytesRead;
      }
      totBytesRead += bytesRead;
    }
    return totBytesRead;
  }
  abort() {
    this.removeAbortListener();
    return this.streamReader.abort();
  }
  async close() {
    this.removeAbortListener();
    return this.streamReader.close();
  }
  supportsRandomAccess() {
    return false;
  }
};

// ../../node_modules/strtok3/lib/TokenWriter.js
var DEFAULT_INITIAL_CAPACITY = 1024;
var MINIMUM_CAPACITY = 16;
var TokenWriter = class {
  /**
   * Create a token writer.
   * @param initialCapacity - Initial buffer size in bytes. The writer grows as needed.
   * Defaults to 1024, reduced to maxBufferSize when a smaller cap is configured.
   * @param options - Optional output and backing-buffer limit.
   */
  constructor(initialCapacity, options) {
    this.offset = 0;
    this.maxBufferSize = getMaxBufferSize(options);
    const capacity = initialCapacity === void 0 ? Math.min(DEFAULT_INITIAL_CAPACITY, this.maxBufferSize) : initialCapacity;
    this.validateCapacity(capacity, "initialCapacity");
    this.buffer = new Uint8Array(Math.min(this.maxBufferSize, Math.max(MINIMUM_CAPACITY, capacity)));
  }
  /**
   * Number of bytes written so far.
   */
  get length() {
    return this.offset;
  }
  /**
   * Reserve a zero-filled region and advance the write position.
   * @param length - Number of bytes to reserve.
   * @returns Offset of the reserved region.
   */
  reserve(length) {
    this.validateLength(length, "length");
    const start = this.offset;
    this.ensureCapacity(length);
    this.offset += length;
    return start;
  }
  /**
   * Encode a token at the current write position.
   * If encoding throws, the written bytes and length remain unchanged.
   * @param token - Token providing the byte length and encoder.
   * @param value - Value to encode.
   * @returns Number of bytes written, equal to token.len.
   */
  writeToken(token, value) {
    const length = token.len;
    this.validateLength(length, "token length");
    this.ensureCapacity(length);
    const start = this.offset;
    try {
      token.put(this.buffer, start, value);
    } catch (error) {
      this.buffer.fill(0, start, start + length);
      throw error;
    }
    this.offset += length;
    return length;
  }
  /**
   * Append raw bytes.
   * @param value - Bytes to append. The data is copied.
   * @returns Number of bytes written.
   */
  writeBuffer(value) {
    this.validateLength(value.length, "value length");
    const start = this.offset;
    this.ensureCapacity(value.length);
    this.buffer.set(value, start);
    this.offset += value.length;
    return value.length;
  }
  /**
   * Alias for writeBuffer. The data is copied.
   * @param value - Bytes to append.
   * @returns Number of bytes written.
   */
  writeBytes(value) {
    return this.writeBuffer(value);
  }
  /**
   * Append zero bytes.
   * @param length - Number of zero bytes to append.
   * @returns Number of bytes written.
   */
  writeZeros(length) {
    const start = this.reserve(length);
    this.buffer.fill(0, start, start + length);
    return length;
  }
  /**
   * Overwrite a previously reserved or written region with an encoded token.
   * If encoding throws, the original bytes are restored and length is unchanged.
   * @param token - Token providing the byte length and encoder.
   * @param offset - Absolute offset of the region.
   * @param value - Value to encode.
   */
  patchToken(token, offset, value) {
    this.validateLength(offset, "offset");
    const length = token.len;
    this.validateLength(length, "token length");
    if (offset + length > this.offset) {
      throw new RangeError(`Invalid patch range: offset=${offset}, length=${length}, written=${this.offset}`);
    }
    const original = this.buffer.slice(offset, offset + length);
    try {
      token.put(this.buffer, offset, value);
    } catch (error) {
      this.buffer.set(original, offset);
      throw error;
    }
  }
  /**
   * Return a copy of the written bytes.
   */
  toUint8Array() {
    return this.buffer.slice(0, this.offset);
  }
  ensureCapacity(extra) {
    const required = this.offset + extra;
    this.validateCapacity(required, "required capacity");
    if (required <= this.buffer.length) {
      return;
    }
    let capacity = this.buffer.length;
    while (capacity < required) {
      capacity = Math.min(capacity * 2, this.maxBufferSize);
    }
    const next = new Uint8Array(capacity);
    next.set(this.buffer.subarray(0, this.offset));
    this.buffer = next;
  }
  validateCapacity(value, name) {
    this.validateLength(value, name);
    if (value > this.maxBufferSize) {
      throw new BufferSizeError(value, this.maxBufferSize);
    }
  }
  validateLength(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
};

// ../../node_modules/strtok3/lib/core.js
function fromWebStream(webStream, options) {
  getMaxBufferSize(options);
  throwIfAborted(options == null ? void 0 : options.abortSignal);
  const webStreamReader = makeWebStreamReader(webStream);
  return new ReadStreamTokenizer(webStreamReader, options);
}
function fromBuffer(uint8Array, options) {
  return new BufferTokenizer(uint8Array, options);
}
function fromBlob(blob, options) {
  return new BlobTokenizer(blob, options);
}

// ../../node_modules/@borewit/text-codec/lib/index.js
var WINDOWS_1252_EXTRA = {
  128: "€",
  130: "‚",
  131: "ƒ",
  132: "„",
  133: "…",
  134: "†",
  135: "‡",
  136: "ˆ",
  137: "‰",
  138: "Š",
  139: "‹",
  140: "Œ",
  142: "Ž",
  145: "‘",
  146: "’",
  147: "“",
  148: "”",
  149: "•",
  150: "–",
  151: "—",
  152: "˜",
  153: "™",
  154: "š",
  155: "›",
  156: "œ",
  158: "ž",
  159: "Ÿ"
};
var WINDOWS_1252_REVERSE = {};
for (const [code, char] of Object.entries(WINDOWS_1252_EXTRA)) {
  WINDOWS_1252_REVERSE[char] = Number.parseInt(code, 10);
}
var _utf8Decoder;
var _utf8Encoder;
function utf8Decoder() {
  if (_utf8Decoder === void 0) {
    try {
      _utf8Decoder = typeof globalThis.TextDecoder === "undefined" ? null : new globalThis.TextDecoder("utf-8");
    } catch {
      _utf8Decoder = null;
    }
  }
  return _utf8Decoder !== null && _utf8Decoder !== void 0 ? _utf8Decoder : void 0;
}
function utf8Encoder() {
  if (_utf8Encoder === void 0) {
    try {
      _utf8Encoder = typeof globalThis.TextEncoder === "undefined" ? null : new globalThis.TextEncoder();
    } catch {
      _utf8Encoder = null;
    }
  }
  return _utf8Encoder !== null && _utf8Encoder !== void 0 ? _utf8Encoder : void 0;
}
var CHUNK = 32 * 1024;
var REPLACEMENT = 65533;
function textDecode(bytes, encoding = "utf-8") {
  switch (encoding.toLowerCase()) {
    case "utf-8":
    case "utf8": {
      const dec = utf8Decoder();
      return dec ? dec.decode(bytes) : decodeUTF8(bytes);
    }
    case "utf-16le":
      return decodeUTF16LE(bytes);
    case "us-ascii":
    case "ascii":
      return decodeASCII(bytes);
    case "latin1":
    case "iso-8859-1":
      return decodeLatin1(bytes);
    case "windows-1252":
      return decodeWindows1252(bytes);
    default:
      throw new RangeError(`Encoding '${encoding}' not supported`);
  }
}
function textEncode(input = "", encoding = "utf-8") {
  switch (encoding.toLowerCase()) {
    case "utf-8":
    case "utf8": {
      const enc = utf8Encoder();
      return enc ? enc.encode(input) : encodeUTF8(input);
    }
    case "utf-16le":
      return encodeUTF16LE(input);
    case "us-ascii":
    case "ascii":
      return encodeASCII(input);
    case "latin1":
    case "iso-8859-1":
      return encodeLatin1(input);
    case "windows-1252":
      return encodeWindows1252(input);
    default:
      throw new RangeError(`Encoding '${encoding}' not supported`);
  }
}
function flushChunk(parts, chunk) {
  if (chunk.length === 0) {
    return;
  }
  parts.push(String.fromCharCode.apply(null, chunk));
  chunk.length = 0;
}
function pushCodeUnit(parts, chunk, codeUnit) {
  chunk.push(codeUnit);
  if (chunk.length >= CHUNK) {
    flushChunk(parts, chunk);
  }
}
function pushCodePoint(parts, chunk, cp) {
  if (cp <= 65535) {
    pushCodeUnit(parts, chunk, cp);
    return;
  }
  cp -= 65536;
  pushCodeUnit(parts, chunk, 55296 + (cp >> 10));
  pushCodeUnit(parts, chunk, 56320 + (cp & 1023));
}
function decodeUTF8(bytes) {
  const parts = [];
  const chunk = [];
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) {
    i = 3;
  }
  while (i < bytes.length) {
    const b1 = bytes[i];
    if (b1 <= 127) {
      pushCodeUnit(parts, chunk, b1);
      i++;
      continue;
    }
    if (b1 < 194 || b1 > 244) {
      pushCodeUnit(parts, chunk, REPLACEMENT);
      i++;
      continue;
    }
    const length = b1 <= 223 ? 2 : b1 <= 239 ? 3 : 4;
    let cp = b1 & 127 >> length;
    let lower = b1 === 224 ? 160 : b1 === 240 ? 144 : 128;
    let upper = b1 === 237 ? 159 : b1 === 244 ? 143 : 191;
    let consumed = 1;
    i++;
    while (consumed < length && i < bytes.length) {
      const next = bytes[i];
      if (next < lower || next > upper) {
        break;
      }
      cp = cp << 6 | next & 63;
      consumed++;
      i++;
      lower = 128;
      upper = 191;
    }
    pushCodePoint(parts, chunk, consumed === length ? cp : REPLACEMENT);
  }
  flushChunk(parts, chunk);
  return parts.join("");
}
function decodeUTF16LE(bytes) {
  const parts = [];
  const chunk = [];
  const len = bytes.length;
  let i = 0;
  if (len >= 2 && bytes[0] === 255 && bytes[1] === 254) {
    i = 2;
  }
  while (i + 1 < len) {
    const u1 = bytes[i] | bytes[i + 1] << 8;
    i += 2;
    if (u1 >= 55296 && u1 <= 56319) {
      if (i + 1 < len) {
        const u2 = bytes[i] | bytes[i + 1] << 8;
        if (u2 >= 56320 && u2 <= 57343) {
          pushCodeUnit(parts, chunk, u1);
          pushCodeUnit(parts, chunk, u2);
          i += 2;
        } else {
          pushCodeUnit(parts, chunk, REPLACEMENT);
        }
      } else {
        pushCodeUnit(parts, chunk, REPLACEMENT);
      }
      continue;
    }
    if (u1 >= 56320 && u1 <= 57343) {
      pushCodeUnit(parts, chunk, REPLACEMENT);
      continue;
    }
    pushCodeUnit(parts, chunk, u1);
  }
  if (i < len) {
    pushCodeUnit(parts, chunk, REPLACEMENT);
  }
  flushChunk(parts, chunk);
  return parts.join("");
}
function decodeASCII(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(bytes.length, i + CHUNK);
    const codes = new Array(end - i);
    for (let j = i, k = 0; j < end; j++, k++) {
      codes[k] = bytes[j] & 127;
    }
    parts.push(String.fromCharCode.apply(null, codes));
  }
  return parts.join("");
}
function decodeLatin1(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(bytes.length, i + CHUNK);
    const codes = new Array(end - i);
    for (let j = i, k = 0; j < end; j++, k++) {
      codes[k] = bytes[j];
    }
    parts.push(String.fromCharCode.apply(null, codes));
  }
  return parts.join("");
}
function decodeWindows1252(bytes) {
  const parts = [];
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const extra = b >= 128 && b <= 159 ? WINDOWS_1252_EXTRA[b] : void 0;
    out += extra !== null && extra !== void 0 ? extra : String.fromCharCode(b);
    if (out.length >= CHUNK) {
      parts.push(out);
      out = "";
    }
  }
  if (out) {
    parts.push(out);
  }
  return parts.join("");
}
function encodeUTF8(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i);
    if (cp >= 55296 && cp <= 56319) {
      if (i + 1 < str.length) {
        const lo = str.charCodeAt(i + 1);
        if (lo >= 56320 && lo <= 57343) {
          cp = 65536 + (cp - 55296 << 10) + (lo - 56320);
          i++;
        } else {
          cp = REPLACEMENT;
        }
      } else {
        cp = REPLACEMENT;
      }
    } else if (cp >= 56320 && cp <= 57343) {
      cp = REPLACEMENT;
    }
    if (cp < 128) {
      out.push(cp);
    } else if (cp < 2048) {
      out.push(192 | cp >> 6, 128 | cp & 63);
    } else if (cp < 65536) {
      out.push(224 | cp >> 12, 128 | cp >> 6 & 63, 128 | cp & 63);
    } else {
      out.push(240 | cp >> 18, 128 | cp >> 12 & 63, 128 | cp >> 6 & 63, 128 | cp & 63);
    }
  }
  return new Uint8Array(out);
}
function encodeUTF16LE(str) {
  const units = [];
  for (let i = 0; i < str.length; i++) {
    const u = str.charCodeAt(i);
    if (u >= 55296 && u <= 56319) {
      if (i + 1 < str.length) {
        const lo = str.charCodeAt(i + 1);
        if (lo >= 56320 && lo <= 57343) {
          units.push(u, lo);
          i++;
        } else {
          units.push(REPLACEMENT);
        }
      } else {
        units.push(REPLACEMENT);
      }
      continue;
    }
    if (u >= 56320 && u <= 57343) {
      units.push(REPLACEMENT);
      continue;
    }
    units.push(u);
  }
  const out = new Uint8Array(units.length * 2);
  for (let i = 0; i < units.length; i++) {
    const code = units[i];
    const o = i * 2;
    out[o] = code & 255;
    out[o + 1] = code >>> 8;
  }
  return out;
}
function encodeASCII(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 127;
  }
  return out;
}
function encodeLatin1(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 255;
  }
  return out;
}
function encodeWindows1252(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = ch.charCodeAt(0);
    if (WINDOWS_1252_REVERSE[ch] !== void 0) {
      out[i] = WINDOWS_1252_REVERSE[ch];
      continue;
    }
    if (code >= 0 && code <= 127 || code >= 160 && code <= 255) {
      out[i] = code;
      continue;
    }
    out[i] = 63;
  }
  return out;
}

// ../../node_modules/token-types/dist/lib/index.js
var lib_exports = {};
__export(lib_exports, {
  AnsiStringType: () => AnsiStringType,
  Float16_BE: () => Float16_BE,
  Float16_LE: () => Float16_LE,
  Float32_BE: () => Float32_BE,
  Float32_LE: () => Float32_LE,
  Float64_BE: () => Float64_BE,
  Float64_LE: () => Float64_LE,
  Float80_BE: () => Float80_BE,
  Float80_LE: () => Float80_LE,
  INT16_BE: () => INT16_BE,
  INT16_LE: () => INT16_LE,
  INT24_BE: () => INT24_BE,
  INT24_LE: () => INT24_LE,
  INT32_BE: () => INT32_BE,
  INT32_LE: () => INT32_LE,
  INT64_BE: () => INT64_BE,
  INT64_LE: () => INT64_LE,
  INT8: () => INT8,
  IgnoreType: () => IgnoreType,
  StringType: () => StringType,
  UINT16_BE: () => UINT16_BE,
  UINT16_LE: () => UINT16_LE,
  UINT24_BE: () => UINT24_BE,
  UINT24_LE: () => UINT24_LE,
  UINT32_BE: () => UINT32_BE,
  UINT32_LE: () => UINT32_LE,
  UINT64_BE: () => UINT64_BE,
  UINT64_LE: () => UINT64_LE,
  UINT8: () => UINT8,
  Uint8ArrayType: () => Uint8ArrayType
});
var ieee754 = __toESM(require_ieee754());
function dv(array) {
  return new DataView(array.buffer, array.byteOffset);
}
var UINT8 = {
  len: 1,
  get(array, offset) {
    return dv(array).getUint8(offset);
  },
  put(array, offset, value) {
    dv(array).setUint8(offset, value);
    return offset + 1;
  }
};
var UINT16_LE = {
  len: 2,
  get(array, offset) {
    return dv(array).getUint16(offset, true);
  },
  put(array, offset, value) {
    dv(array).setUint16(offset, value, true);
    return offset + 2;
  }
};
var UINT16_BE = {
  len: 2,
  get(array, offset) {
    return dv(array).getUint16(offset);
  },
  put(array, offset, value) {
    dv(array).setUint16(offset, value);
    return offset + 2;
  }
};
var UINT24_LE = {
  len: 3,
  get(array, offset) {
    const dataView = dv(array);
    return dataView.getUint8(offset) + (dataView.getUint16(offset + 1, true) << 8);
  },
  put(array, offset, value) {
    const dataView = dv(array);
    dataView.setUint8(offset, value & 255);
    dataView.setUint16(offset + 1, value >> 8, true);
    return offset + 3;
  }
};
var UINT24_BE = {
  len: 3,
  get(array, offset) {
    const dataView = dv(array);
    return (dataView.getUint16(offset) << 8) + dataView.getUint8(offset + 2);
  },
  put(array, offset, value) {
    const dataView = dv(array);
    dataView.setUint16(offset, value >> 8);
    dataView.setUint8(offset + 2, value & 255);
    return offset + 3;
  }
};
var UINT32_LE = {
  len: 4,
  get(array, offset) {
    return dv(array).getUint32(offset, true);
  },
  put(array, offset, value) {
    dv(array).setUint32(offset, value, true);
    return offset + 4;
  }
};
var UINT32_BE = {
  len: 4,
  get(array, offset) {
    return dv(array).getUint32(offset);
  },
  put(array, offset, value) {
    dv(array).setUint32(offset, value);
    return offset + 4;
  }
};
var INT8 = {
  len: 1,
  get(array, offset) {
    return dv(array).getInt8(offset);
  },
  put(array, offset, value) {
    dv(array).setInt8(offset, value);
    return offset + 1;
  }
};
var INT16_BE = {
  len: 2,
  get(array, offset) {
    return dv(array).getInt16(offset);
  },
  put(array, offset, value) {
    dv(array).setInt16(offset, value);
    return offset + 2;
  }
};
var INT16_LE = {
  len: 2,
  get(array, offset) {
    return dv(array).getInt16(offset, true);
  },
  put(array, offset, value) {
    dv(array).setInt16(offset, value, true);
    return offset + 2;
  }
};
var INT24_LE = {
  len: 3,
  get(array, offset) {
    const unsigned = UINT24_LE.get(array, offset);
    return unsigned > 8388607 ? unsigned - 16777216 : unsigned;
  },
  put(array, offset, value) {
    const dataView = dv(array);
    dataView.setUint8(offset, value & 255);
    dataView.setUint16(offset + 1, value >> 8, true);
    return offset + 3;
  }
};
var INT24_BE = {
  len: 3,
  get(array, offset) {
    const unsigned = UINT24_BE.get(array, offset);
    return unsigned > 8388607 ? unsigned - 16777216 : unsigned;
  },
  put(array, offset, value) {
    const dataView = dv(array);
    dataView.setUint16(offset, value >> 8);
    dataView.setUint8(offset + 2, value & 255);
    return offset + 3;
  }
};
var INT32_BE = {
  len: 4,
  get(array, offset) {
    return dv(array).getInt32(offset);
  },
  put(array, offset, value) {
    dv(array).setInt32(offset, value);
    return offset + 4;
  }
};
var INT32_LE = {
  len: 4,
  get(array, offset) {
    return dv(array).getInt32(offset, true);
  },
  put(array, offset, value) {
    dv(array).setInt32(offset, value, true);
    return offset + 4;
  }
};
var UINT64_LE = {
  len: 8,
  get(array, offset) {
    return dv(array).getBigUint64(offset, true);
  },
  put(array, offset, value) {
    dv(array).setBigUint64(offset, value, true);
    return offset + 8;
  }
};
var INT64_LE = {
  len: 8,
  get(array, offset) {
    return dv(array).getBigInt64(offset, true);
  },
  put(array, offset, value) {
    dv(array).setBigInt64(offset, value, true);
    return offset + 8;
  }
};
var UINT64_BE = {
  len: 8,
  get(array, offset) {
    return dv(array).getBigUint64(offset);
  },
  put(array, offset, value) {
    dv(array).setBigUint64(offset, value);
    return offset + 8;
  }
};
var INT64_BE = {
  len: 8,
  get(array, offset) {
    return dv(array).getBigInt64(offset);
  },
  put(array, offset, value) {
    dv(array).setBigInt64(offset, value);
    return offset + 8;
  }
};
var Float16_BE = {
  len: 2,
  get(dataView, offset) {
    return ieee754.read(dataView, offset, false, 10, this.len);
  },
  put(dataView, offset, value) {
    ieee754.write(dataView, value, offset, false, 10, this.len);
    return offset + this.len;
  }
};
var Float16_LE = {
  len: 2,
  get(array, offset) {
    return ieee754.read(array, offset, true, 10, this.len);
  },
  put(array, offset, value) {
    ieee754.write(array, value, offset, true, 10, this.len);
    return offset + this.len;
  }
};
var Float32_BE = {
  len: 4,
  get(array, offset) {
    return dv(array).getFloat32(offset);
  },
  put(array, offset, value) {
    dv(array).setFloat32(offset, value);
    return offset + 4;
  }
};
var Float32_LE = {
  len: 4,
  get(array, offset) {
    return dv(array).getFloat32(offset, true);
  },
  put(array, offset, value) {
    dv(array).setFloat32(offset, value, true);
    return offset + 4;
  }
};
var Float64_BE = {
  len: 8,
  get(array, offset) {
    return dv(array).getFloat64(offset);
  },
  put(array, offset, value) {
    dv(array).setFloat64(offset, value);
    return offset + 8;
  }
};
var Float64_LE = {
  len: 8,
  get(array, offset) {
    return dv(array).getFloat64(offset, true);
  },
  put(array, offset, value) {
    dv(array).setFloat64(offset, value, true);
    return offset + 8;
  }
};
var Float80_BE = {
  len: 10,
  get(array, offset) {
    return ieee754.read(array, offset, false, 63, this.len);
  },
  put(array, offset, value) {
    ieee754.write(array, value, offset, false, 63, this.len);
    return offset + this.len;
  }
};
var Float80_LE = {
  len: 10,
  get(array, offset) {
    return ieee754.read(array, offset, true, 63, this.len);
  },
  put(array, offset, value) {
    ieee754.write(array, value, offset, true, 63, this.len);
    return offset + this.len;
  }
};
var IgnoreType = class {
  /**
   * @param len number of bytes to ignore
   */
  constructor(len) {
    this.len = len;
  }
  get(_array, _off) {
  }
};
var Uint8ArrayType = class {
  constructor(len) {
    this.len = len;
  }
  get(array, offset) {
    return array.subarray(offset, offset + this.len);
  }
  put(array, offset, value) {
    if (value.length !== this.len) {
      throw new RangeError(`Expected a value of ${this.len} byte(s), got ${value.length}`);
    }
    array.set(value, offset);
    return offset + this.len;
  }
};
var StringType = class {
  constructor(len, encoding) {
    this.len = len;
    this.encoding = encoding;
  }
  get(data, offset = 0) {
    const bytes = data.subarray(offset, offset + this.len);
    return textDecode(bytes, this.encoding);
  }
  put(array, offset, value) {
    const bytes = textEncode(value, this.encoding);
    if (bytes.length !== this.len) {
      throw new RangeError(`Expected an encoded value of ${this.len} byte(s), got ${bytes.length}`);
    }
    array.set(bytes, offset);
    return offset + this.len;
  }
};
var AnsiStringType = class extends StringType {
  constructor(len) {
    super(len, "windows-1252");
  }
};

// ../../node_modules/music-metadata/lib/ParseError.js
var makeParseError = (name) => {
  return class ParseError extends Error {
    constructor(message) {
      super(message);
      __publicField(this, "name");
      this.name = name;
    }
  };
};
var CouldNotDetermineFileTypeError = class extends makeParseError("CouldNotDetermineFileTypeError") {
};
var UnsupportedFileTypeError = class extends makeParseError("UnsupportedFileTypeError") {
};
var UnexpectedFileContentError = class extends makeParseError("UnexpectedFileContentError") {
  constructor(fileType, message) {
    super(message);
    __publicField(this, "fileType");
    this.fileType = fileType;
  }
  // Override toString to include file type information.
  toString() {
    return `${this.name} (FileType: ${this.fileType}): ${this.message}`;
  }
};
var FieldDecodingError = class extends makeParseError("FieldDecodingError") {
};
var InternalParserError = class extends makeParseError("InternalParserError") {
};
var makeUnexpectedFileContentError = (fileType) => {
  return class extends UnexpectedFileContentError {
    constructor(message) {
      super(fileType, message);
    }
  };
};

// ../../node_modules/music-metadata/lib/common/Allocation.js
var defaultMaxMemoryAllocation = 64 * 1024 * 1024;
var defaultMaxMetadataEntries = 1e5;
var defaultMaxChapterCount = 1e3;
var readChunkSize = 64 * 1024;
var allocationError = (message) => new UnexpectedFileContentError("metadata", message);
function getMaxMemoryAllocation(options) {
  const limit = options.maxMemoryAllocation ?? defaultMaxMemoryAllocation;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError("maxMemoryAllocation must be a positive safe integer");
  }
  return limit;
}
function getMaxMetadataEntries(options) {
  const limit = options.maxMetadataEntries ?? defaultMaxMetadataEntries;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError("maxMetadataEntries must be a positive safe integer");
  }
  return limit;
}
function getMaxChapterCount(options) {
  const limit = options.maxChapterCount ?? defaultMaxChapterCount;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError("maxChapterCount must be a positive safe integer");
  }
  return limit;
}
function getTokenizerOptions(options, fileInfo) {
  return { maxBufferSize: getMaxMemoryAllocation(options), fileInfo };
}
function validateAllocation(length, options, makeError = allocationError) {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw makeError(`Invalid allocation size: ${length}`);
  }
  const limit = getMaxMemoryAllocation(options);
  if (length > limit) {
    throw makeError(`Metadata size ${length} exceeds allocation limit ${limit} (buffering limit)`);
  }
}
function validateAvailableBytes(tokenizer, length, position) {
  if (tokenizer.fileInfo.size !== void 0 && length > tokenizer.fileInfo.size - position) {
    throw new EndOfStreamError();
  }
}
async function readBuffer(tokenizer, length, options, position = tokenizer.position, makeError = allocationError) {
  validateAllocation(length, options, makeError);
  validateAvailableBytes(tokenizer, length, position);
  if (!isRandomAccessTokenizer(tokenizer) && length > readChunkSize) {
    const chunks = [];
    for (let remaining = length; remaining > 0; ) {
      const chunk = new Uint8Array(Math.min(remaining, readChunkSize));
      const bytesRead = await tokenizer.readBuffer(chunk, { position });
      if (bytesRead !== chunk.length) {
        throw new EndOfStreamError();
      }
      chunks.push(chunk);
      remaining -= chunk.length;
      position += chunk.length;
    }
    const buffer2 = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      buffer2.set(chunk, offset);
      offset += chunk.length;
    }
    return buffer2;
  }
  const buffer = new Uint8Array(length);
  if (await tokenizer.readBuffer(buffer, { position }) !== length) {
    throw new EndOfStreamError();
  }
  return buffer;
}
async function readToken(tokenizer, token, options, position = tokenizer.position, makeError = allocationError) {
  validateAllocation(token.len, options, makeError);
  validateAvailableBytes(tokenizer, token.len, position);
  if (token.len <= readChunkSize) {
    return tokenizer.readToken(token, position);
  }
  return token.get(await readBuffer(tokenizer, token.len, options, position, makeError), 0);
}

// ../../node_modules/music-metadata/lib/common/BasicParser.js
var BasicParser = class {
  /**
   * Initialize parser with output (metadata), input (tokenizer) & parsing options (options).
   * @param {INativeMetadataCollector} metadata Output
   * @param {ITokenizer} tokenizer Input
   * @param {IOptions} options Parsing options
   */
  constructor(metadata, tokenizer, options) {
    __publicField(this, "metadata");
    __publicField(this, "tokenizer");
    __publicField(this, "options");
    getMaxMemoryAllocation(options);
    this.metadata = metadata;
    this.tokenizer = tokenizer;
    this.options = options;
  }
  readToken(token, position) {
    return readToken(this.tokenizer, token, this.options, position);
  }
};

export {
  EndOfStreamError,
  isRandomAccessTokenizer,
  TokenizerBoundaryError,
  createTokenizerView,
  TokenWriter,
  fromWebStream,
  fromBuffer,
  fromBlob,
  textDecode,
  textEncode,
  UINT8,
  UINT16_LE,
  UINT16_BE,
  UINT24_LE,
  UINT24_BE,
  UINT32_LE,
  UINT32_BE,
  INT8,
  INT16_BE,
  INT16_LE,
  INT24_BE,
  INT32_BE,
  INT32_LE,
  UINT64_LE,
  INT64_LE,
  UINT64_BE,
  INT64_BE,
  Float32_BE,
  Float64_BE,
  Uint8ArrayType,
  StringType,
  lib_exports,
  makeParseError,
  CouldNotDetermineFileTypeError,
  UnsupportedFileTypeError,
  UnexpectedFileContentError,
  FieldDecodingError,
  InternalParserError,
  makeUnexpectedFileContentError,
  defaultMaxMetadataEntries,
  defaultMaxChapterCount,
  getMaxMemoryAllocation,
  getMaxMetadataEntries,
  getMaxChapterCount,
  getTokenizerOptions,
  validateAllocation,
  readBuffer,
  readToken,
  BasicParser
};
/*! Bundled license information:

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)
*/
//# sourceMappingURL=chunk-3HBPJLK7.js.map
