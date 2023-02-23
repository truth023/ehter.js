function number(n) {
    if (!Number.isSafeInteger(n) || n < 0)
        throw new Error(`Wrong positive integer: ${n}`);
}
function bool(b) {
    if (typeof b !== 'boolean')
        throw new Error(`Expected boolean, not ${b}`);
}
function bytes(b, ...lengths) {
    if (!(b instanceof Uint8Array))
        throw new TypeError('Expected Uint8Array');
    if (lengths.length > 0 && !lengths.includes(b.length))
        throw new TypeError(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
}
function hash(hash) {
    if (typeof hash !== 'function' || typeof hash.create !== 'function')
        throw new Error('Hash should be wrapped by utils.wrapConstructor');
    number(hash.outputLen);
    number(hash.blockLen);
}
function exists(instance, checkFinished = true) {
    if (instance.destroyed)
        throw new Error('Hash instance has been destroyed');
    if (checkFinished && instance.finished)
        throw new Error('Hash#digest() has already been called');
}
function output(out, instance) {
    bytes(out);
    const min = instance.outputLen;
    if (out.length < min) {
        throw new Error(`digestInto() expects output buffer of length at least ${min}`);
    }
}
const assert$1 = {
    number,
    bool,
    bytes,
    hash,
    exists,
    output,
};

/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const u32 = (arr) => new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
const isLE = new Uint8Array(new Uint32Array([0x11223344]).buffer)[0] === 0x44;
// There is almost no big endian hardware, but js typed arrays uses platform specific endianness.
// So, just to be sure not to corrupt anything.
if (!isLE)
    throw new Error('Non little-endian hardware is not supported');
Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));
function utf8ToBytes(str) {
    if (typeof str !== 'string') {
        throw new TypeError(`utf8ToBytes expected string, got ${typeof str}`);
    }
    return new TextEncoder().encode(str);
}
function toBytes(data) {
    if (typeof data === 'string')
        data = utf8ToBytes(data);
    if (!(data instanceof Uint8Array))
        throw new TypeError(`Expected input type is Uint8Array (got ${typeof data})`);
    return data;
}
// For runtime check if class implements interface
class Hash {
    // Safe version that clones internal state
    clone() {
        return this._cloneInto();
    }
}
function wrapConstructor(hashConstructor) {
    const hashC = (message) => hashConstructor().update(toBytes(message)).digest();
    const tmp = hashConstructor();
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = () => hashConstructor();
    return hashC;
}
function wrapConstructorWithOpts(hashCons) {
    const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
    const tmp = hashCons({});
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    return hashC;
}

const U32_MASK64 = BigInt(2 ** 32 - 1);
const _32n = BigInt(32);
// We are not using BigUint64Array, because they are extremely slow as per 2022
function fromBig(n, le = false) {
    if (le)
        return { h: Number(n & U32_MASK64), l: Number((n >> _32n) & U32_MASK64) };
    return { h: Number((n >> _32n) & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
    let Ah = new Uint32Array(lst.length);
    let Al = new Uint32Array(lst.length);
    for (let i = 0; i < lst.length; i++) {
        const { h, l } = fromBig(lst[i], le);
        [Ah[i], Al[i]] = [h, l];
    }
    return [Ah, Al];
}
const toBig = (h, l) => (BigInt(h >>> 0) << _32n) | BigInt(l >>> 0);
// for Shift in [0, 32)
const shrSH = (h, l, s) => h >>> s;
const shrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
// Right rotate for Shift in [1, 32)
const rotrSH = (h, l, s) => (h >>> s) | (l << (32 - s));
const rotrSL = (h, l, s) => (h << (32 - s)) | (l >>> s);
// Right rotate for Shift in (32, 64), NOTE: 32 is special case.
const rotrBH = (h, l, s) => (h << (64 - s)) | (l >>> (s - 32));
const rotrBL = (h, l, s) => (h >>> (s - 32)) | (l << (64 - s));
// Right rotate for shift===32 (just swaps l&h)
const rotr32H = (h, l) => l;
const rotr32L = (h, l) => h;
// Left rotate for Shift in [1, 32)
const rotlSH = (h, l, s) => (h << s) | (l >>> (32 - s));
const rotlSL = (h, l, s) => (l << s) | (h >>> (32 - s));
// Left rotate for Shift in (32, 64), NOTE: 32 is special case.
const rotlBH = (h, l, s) => (l << (s - 32)) | (h >>> (64 - s));
const rotlBL = (h, l, s) => (h << (s - 32)) | (l >>> (64 - s));
// JS uses 32-bit signed integers for bitwise operations which means we cannot
// simple take carry out of low bit sum by shift, we need to use division.
// Removing "export" has 5% perf penalty -_-
function add(Ah, Al, Bh, Bl) {
    const l = (Al >>> 0) + (Bl >>> 0);
    return { h: (Ah + Bh + ((l / 2 ** 32) | 0)) | 0, l: l | 0 };
}
// Addition with more than 2 elements
const add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
const add3H = (low, Ah, Bh, Ch) => (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;
const add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
const add4H = (low, Ah, Bh, Ch, Dh) => (Ah + Bh + Ch + Dh + ((low / 2 ** 32) | 0)) | 0;
const add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
const add5H = (low, Ah, Bh, Ch, Dh, Eh) => (Ah + Bh + Ch + Dh + Eh + ((low / 2 ** 32) | 0)) | 0;
// prettier-ignore
const u64 = {
    fromBig, split, toBig,
    shrSH, shrSL,
    rotrSH, rotrSL, rotrBH, rotrBL,
    rotr32H, rotr32L,
    rotlSH, rotlSL, rotlBH, rotlBL,
    add, add3L, add3H, add4L, add4H, add5H, add5L,
};

/* Do NOT modify this file; see /src.ts/_admin/update-version.ts */
/**
 *  The current version of Ethers.
 */
const version = "6.0.7";

/**
 *  Property helper functions.
 *
 *  @_subsection api/utils:Properties  [about-properties]
 */
function checkType(value, type, name) {
    const types = type.split("|").map(t => t.trim());
    for (let i = 0; i < types.length; i++) {
        switch (type) {
            case "any":
                return;
            case "bigint":
            case "boolean":
            case "number":
            case "string":
                if (typeof (value) === type) {
                    return;
                }
        }
    }
    const error = new Error(`invalid value for type ${type}`);
    error.code = "INVALID_ARGUMENT";
    error.argument = `value.${name}`;
    error.value = value;
    throw error;
}
/**
 *  Assigns the %%values%% to %%target%% as read-only values.
 *
 *  It %%types%% is specified, the values are checked.
 */
function defineProperties(target, values, types) {
    for (let key in values) {
        let value = values[key];
        const type = (types ? types[key] : null);
        if (type) {
            checkType(value, type, key);
        }
        Object.defineProperty(target, key, { enumerable: true, value, writable: false });
    }
}

/**
 *  About Errors.
 *
 *  @_section: api/utils/errors:Errors  [about-errors]
 */
function stringify(value) {
    if (value == null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "[ " + (value.map(stringify)).join(", ") + " ]";
    }
    if (value instanceof Uint8Array) {
        const HEX = "0123456789abcdef";
        let result = "0x";
        for (let i = 0; i < value.length; i++) {
            result += HEX[value[i] >> 4];
            result += HEX[value[i] & 0xf];
        }
        return result;
    }
    if (typeof (value) === "object" && typeof (value.toJSON) === "function") {
        return stringify(value.toJSON());
    }
    switch (typeof (value)) {
        case "boolean":
        case "symbol":
            return value.toString();
        case "bigint":
            return BigInt(value).toString();
        case "number":
            return (value).toString();
        case "string":
            return JSON.stringify(value);
        case "object": {
            const keys = Object.keys(value);
            keys.sort();
            return "{ " + keys.map((k) => `${stringify(k)}: ${stringify(value[k])}`).join(", ") + " }";
        }
    }
    return `[ COULD NOT SERIALIZE ]`;
}
/**
 *  Returns a new Error configured to the format ethers emits errors, with
 *  the %%message%%, [[api:ErrorCode]] %%code%% and additioanl properties
 *  for the corresponding EthersError.
 *
 *  Each error in ethers includes the version of ethers, a
 *  machine-readable [[ErrorCode]], and depneding on %%code%%, additional
 *  required properties. The error message will also include the %%meeage%%,
 *  ethers version, %%code%% and all aditional properties, serialized.
 */
function makeError(message, code, info) {
    {
        const details = [];
        if (info) {
            if ("message" in info || "code" in info || "name" in info) {
                throw new Error(`value will overwrite populated values: ${stringify(info)}`);
            }
            for (const key in info) {
                const value = (info[key]);
                //                try {
                details.push(key + "=" + stringify(value));
                //                } catch (error: any) {
                //                console.log("MMM", error.message);
                //                    details.push(key + "=[could not serialize object]");
                //                }
            }
        }
        details.push(`code=${code}`);
        details.push(`version=${version}`);
        if (details.length) {
            message += " (" + details.join(", ") + ")";
        }
    }
    let error;
    switch (code) {
        case "INVALID_ARGUMENT":
            error = new TypeError(message);
            break;
        case "NUMERIC_FAULT":
        case "BUFFER_OVERRUN":
            error = new RangeError(message);
            break;
        default:
            error = new Error(message);
    }
    defineProperties(error, { code });
    if (info) {
        Object.assign(error, info);
    }
    return error;
}
/**
 *  Throws an EthersError with %%message%%, %%code%% and additional error
 *  %%info%% when %%check%% is falsish..
 *
 *  @see [[api:makeError]]
 */
function assert(check, message, code, info) {
    if (!check) {
        throw makeError(message, code, info);
    }
}
/**
 *  A simple helper to simply ensuring provided arguments match expected
 *  constraints, throwing if not.
 *
 *  In TypeScript environments, the %%check%% has been asserted true, so
 *  any further code does not need additional compile-time checks.
 */
function assertArgument(check, message, name, value) {
    assert(check, message, "INVALID_ARGUMENT", { argument: name, value: value });
}
const _normalizeForms = ["NFD", "NFC", "NFKD", "NFKC"].reduce((accum, form) => {
    try {
        // General test for normalize
        /* c8 ignore start */
        if ("test".normalize(form) !== "test") {
            throw new Error("bad");
        }
        ;
        /* c8 ignore stop */
        if (form === "NFD") {
            const check = String.fromCharCode(0xe9).normalize("NFD");
            const expected = String.fromCharCode(0x65, 0x0301);
            /* c8 ignore start */
            if (check !== expected) {
                throw new Error("broken");
            }
            /* c8 ignore stop */
        }
        accum.push(form);
    }
    catch (error) { }
    return accum;
}, []);
/**
 *  Throws if the normalization %%form%% is not supported.
 */
function assertNormalize(form) {
    assert(_normalizeForms.indexOf(form) >= 0, "platform missing String.prototype.normalize", "UNSUPPORTED_OPERATION", {
        operation: "String.prototype.normalize", info: { form }
    });
}

/**
 *  Some data helpers.
 *
 *
 *  @_subsection api/utils:Data Helpers  [about-data]
 */
function _getBytes(value, name, copy) {
    if (value instanceof Uint8Array) {
        if (copy) {
            return new Uint8Array(value);
        }
        return value;
    }
    if (typeof (value) === "string" && value.match(/^0x([0-9a-f][0-9a-f])*$/i)) {
        const result = new Uint8Array((value.length - 2) / 2);
        let offset = 2;
        for (let i = 0; i < result.length; i++) {
            result[i] = parseInt(value.substring(offset, offset + 2), 16);
            offset += 2;
        }
        return result;
    }
    assertArgument(false, "invalid BytesLike value", name || "value", value);
}
/**
 *  Get a typed Uint8Array for %%value%%. If already a Uint8Array
 *  the original %%value%% is returned; if a copy is required use
 *  [[getBytesCopy]].
 *
 *  @see: getBytesCopy
 */
function getBytes(value, name) {
    return _getBytes(value, name, false);
}
const HexCharacters = "0123456789abcdef";
/**
 *  Returns a [[DataHexString]] representation of %%data%%.
 */
function hexlify(data) {
    const bytes = getBytes(data);
    let result = "0x";
    for (let i = 0; i < bytes.length; i++) {
        const v = bytes[i];
        result += HexCharacters[(v & 0xf0) >> 4] + HexCharacters[v & 0x0f];
    }
    return result;
}

/**
 *  Using strings in Ethereum (or any security-basd system) requires
 *  additional care. These utilities attempt to mitigate some of the
 *  safety issues as well as provide the ability to recover and analyse
 *  strings.
 *
 *  @_subsection api/utils:Strings and UTF-8  [about-strings]
 */
function errorFunc(reason, offset, bytes, output, badCodepoint) {
    assertArgument(false, `invalid codepoint at offset ${offset}; ${reason}`, "bytes", bytes);
}
function ignoreFunc(reason, offset, bytes, output, badCodepoint) {
    // If there is an invalid prefix (including stray continuation), skip any additional continuation bytes
    if (reason === "BAD_PREFIX" || reason === "UNEXPECTED_CONTINUE") {
        let i = 0;
        for (let o = offset + 1; o < bytes.length; o++) {
            if (bytes[o] >> 6 !== 0x02) {
                break;
            }
            i++;
        }
        return i;
    }
    // This byte runs us past the end of the string, so just jump to the end
    // (but the first byte was read already read and therefore skipped)
    if (reason === "OVERRUN") {
        return bytes.length - offset - 1;
    }
    // Nothing to skip
    return 0;
}
function replaceFunc(reason, offset, bytes, output, badCodepoint) {
    // Overlong representations are otherwise "valid" code points; just non-deistingtished
    if (reason === "OVERLONG") {
        assertArgument(typeof (badCodepoint) === "number", "invalid bad code point for replacement", "badCodepoint", badCodepoint);
        output.push(badCodepoint);
        return 0;
    }
    // Put the replacement character into the output
    output.push(0xfffd);
    // Otherwise, process as if ignoring errors
    return ignoreFunc(reason, offset, bytes);
}
/**
 *  A handful of popular, built-in UTF-8 error handling strategies.
 *
 *  **``"error"``** - throws on ANY illegal UTF-8 sequence or
 *  non-canonical (overlong) codepoints (this is the default)
 *
 *  **``"ignore"``** - silently drops any illegal UTF-8 sequence
 *  and accepts non-canonical (overlong) codepoints
 *
 *  **``"replace"``** - replace any illegal UTF-8 sequence with the
 *  UTF-8 replacement character (i.e. ``"\\ufffd"``) and accepts
 *  non-canonical (overlong) codepoints
 *
 *  @returns: Record<"error" | "ignore" | "replace", Utf8ErrorFunc>
 */
const Utf8ErrorFuncs = Object.freeze({
    error: errorFunc,
    ignore: ignoreFunc,
    replace: replaceFunc
});
// http://stackoverflow.com/questions/13356493/decode-utf-8-with-javascript#13691499
function getUtf8CodePoints(_bytes, onError) {
    if (onError == null) {
        onError = Utf8ErrorFuncs.error;
    }
    const bytes = getBytes(_bytes, "bytes");
    const result = [];
    let i = 0;
    // Invalid bytes are ignored
    while (i < bytes.length) {
        const c = bytes[i++];
        // 0xxx xxxx
        if (c >> 7 === 0) {
            result.push(c);
            continue;
        }
        // Multibyte; how many bytes left for this character?
        let extraLength = null;
        let overlongMask = null;
        // 110x xxxx 10xx xxxx
        if ((c & 0xe0) === 0xc0) {
            extraLength = 1;
            overlongMask = 0x7f;
            // 1110 xxxx 10xx xxxx 10xx xxxx
        }
        else if ((c & 0xf0) === 0xe0) {
            extraLength = 2;
            overlongMask = 0x7ff;
            // 1111 0xxx 10xx xxxx 10xx xxxx 10xx xxxx
        }
        else if ((c & 0xf8) === 0xf0) {
            extraLength = 3;
            overlongMask = 0xffff;
        }
        else {
            if ((c & 0xc0) === 0x80) {
                i += onError("UNEXPECTED_CONTINUE", i - 1, bytes, result);
            }
            else {
                i += onError("BAD_PREFIX", i - 1, bytes, result);
            }
            continue;
        }
        // Do we have enough bytes in our data?
        if (i - 1 + extraLength >= bytes.length) {
            i += onError("OVERRUN", i - 1, bytes, result);
            continue;
        }
        // Remove the length prefix from the char
        let res = c & ((1 << (8 - extraLength - 1)) - 1);
        for (let j = 0; j < extraLength; j++) {
            let nextChar = bytes[i];
            // Invalid continuation byte
            if ((nextChar & 0xc0) != 0x80) {
                i += onError("MISSING_CONTINUE", i, bytes, result);
                res = null;
                break;
            }
            res = (res << 6) | (nextChar & 0x3f);
            i++;
        }
        // See above loop for invalid continuation byte
        if (res === null) {
            continue;
        }
        // Maximum code point
        if (res > 0x10ffff) {
            i += onError("OUT_OF_RANGE", i - 1 - extraLength, bytes, result, res);
            continue;
        }
        // Reserved for UTF-16 surrogate halves
        if (res >= 0xd800 && res <= 0xdfff) {
            i += onError("UTF16_SURROGATE", i - 1 - extraLength, bytes, result, res);
            continue;
        }
        // Check for overlong sequences (more bytes than needed)
        if (res <= overlongMask) {
            i += onError("OVERLONG", i - 1 - extraLength, bytes, result, res);
            continue;
        }
        result.push(res);
    }
    return result;
}
// http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
/**
 *  Returns the UTF-8 byte representation of %%str%%.
 *
 *  If %%form%% is specified, the string is normalized.
 */
function toUtf8Bytes(str, form) {
    if (form != null) {
        assertNormalize(form);
        str = str.normalize(form);
    }
    let result = [];
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c < 0x80) {
            result.push(c);
        }
        else if (c < 0x800) {
            result.push((c >> 6) | 0xc0);
            result.push((c & 0x3f) | 0x80);
        }
        else if ((c & 0xfc00) == 0xd800) {
            i++;
            const c2 = str.charCodeAt(i);
            assertArgument(i < str.length && ((c2 & 0xfc00) === 0xdc00), "invalid surrogate pair", "str", str);
            // Surrogate Pair
            const pair = 0x10000 + ((c & 0x03ff) << 10) + (c2 & 0x03ff);
            result.push((pair >> 18) | 0xf0);
            result.push(((pair >> 12) & 0x3f) | 0x80);
            result.push(((pair >> 6) & 0x3f) | 0x80);
            result.push((pair & 0x3f) | 0x80);
        }
        else {
            result.push((c >> 12) | 0xe0);
            result.push(((c >> 6) & 0x3f) | 0x80);
            result.push((c & 0x3f) | 0x80);
        }
    }
    return new Uint8Array(result);
}
//export 
function _toUtf8String(codePoints) {
    return codePoints.map((codePoint) => {
        if (codePoint <= 0xffff) {
            return String.fromCharCode(codePoint);
        }
        codePoint -= 0x10000;
        return String.fromCharCode((((codePoint >> 10) & 0x3ff) + 0xd800), ((codePoint & 0x3ff) + 0xdc00));
    }).join("");
}
/**
 *  Returns the string represented by the UTF-8 data %%bytes%%.
 *
 *  When %%onError%% function is specified, it is called on UTF-8
 *  errors allowing recovery using the [[Utf8ErrorFunc]] API.
 *  (default: [error](Utf8ErrorFuncs))
 */
function toUtf8String(bytes, onError) {
    return _toUtf8String(getUtf8CodePoints(bytes, onError));
}

// Various per round constants calculations
const [SHA3_PI, SHA3_ROTL, _SHA3_IOTA] = [[], [], []];
const _0n = BigInt(0);
const _1n = BigInt(1);
const _2n = BigInt(2);
const _7n = BigInt(7);
const _256n = BigInt(256);
const _0x71n = BigInt(0x71);
for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
    // Pi
    [x, y] = [y, (2 * x + 3 * y) % 5];
    SHA3_PI.push(2 * (5 * y + x));
    // Rotational
    SHA3_ROTL.push((((round + 1) * (round + 2)) / 2) % 64);
    // Iota
    let t = _0n;
    for (let j = 0; j < 7; j++) {
        R = ((R << _1n) ^ ((R >> _7n) * _0x71n)) % _256n;
        if (R & _2n)
            t ^= _1n << ((_1n << BigInt(j)) - _1n);
    }
    _SHA3_IOTA.push(t);
}
const [SHA3_IOTA_H, SHA3_IOTA_L] = u64.split(_SHA3_IOTA, true);
// Left rotation (without 0, 32, 64)
const rotlH = (h, l, s) => s > 32 ? u64.rotlBH(h, l, s) : u64.rotlSH(h, l, s);
const rotlL = (h, l, s) => s > 32 ? u64.rotlBL(h, l, s) : u64.rotlSL(h, l, s);
// Same as keccakf1600, but allows to skip some rounds
function keccakP(s, rounds = 24) {
    const B = new Uint32Array(5 * 2);
    // NOTE: all indices are x2 since we store state as u32 instead of u64 (bigints to slow in js)
    for (let round = 24 - rounds; round < 24; round++) {
        // Theta θ
        for (let x = 0; x < 10; x++)
            B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
        for (let x = 0; x < 10; x += 2) {
            const idx1 = (x + 8) % 10;
            const idx0 = (x + 2) % 10;
            const B0 = B[idx0];
            const B1 = B[idx0 + 1];
            const Th = rotlH(B0, B1, 1) ^ B[idx1];
            const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
            for (let y = 0; y < 50; y += 10) {
                s[x + y] ^= Th;
                s[x + y + 1] ^= Tl;
            }
        }
        // Rho (ρ) and Pi (π)
        let curH = s[2];
        let curL = s[3];
        for (let t = 0; t < 24; t++) {
            const shift = SHA3_ROTL[t];
            const Th = rotlH(curH, curL, shift);
            const Tl = rotlL(curH, curL, shift);
            const PI = SHA3_PI[t];
            curH = s[PI];
            curL = s[PI + 1];
            s[PI] = Th;
            s[PI + 1] = Tl;
        }
        // Chi (χ)
        for (let y = 0; y < 50; y += 10) {
            for (let x = 0; x < 10; x++)
                B[x] = s[y + x];
            for (let x = 0; x < 10; x++)
                s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
        }
        // Iota (ι)
        s[0] ^= SHA3_IOTA_H[round];
        s[1] ^= SHA3_IOTA_L[round];
    }
    B.fill(0);
}
class Keccak extends Hash {
    // NOTE: we accept arguments in bytes instead of bits here.
    constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
        super();
        this.blockLen = blockLen;
        this.suffix = suffix;
        this.outputLen = outputLen;
        this.enableXOF = enableXOF;
        this.rounds = rounds;
        this.pos = 0;
        this.posOut = 0;
        this.finished = false;
        this.destroyed = false;
        // Can be passed from user as dkLen
        assert$1.number(outputLen);
        // 1600 = 5x5 matrix of 64bit.  1600 bits === 200 bytes
        if (0 >= this.blockLen || this.blockLen >= 200)
            throw new Error('Sha3 supports only keccak-f1600 function');
        this.state = new Uint8Array(200);
        this.state32 = u32(this.state);
    }
    keccak() {
        keccakP(this.state32, this.rounds);
        this.posOut = 0;
        this.pos = 0;
    }
    update(data) {
        assert$1.exists(this);
        const { blockLen, state } = this;
        data = toBytes(data);
        const len = data.length;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            for (let i = 0; i < take; i++)
                state[this.pos++] ^= data[pos++];
            if (this.pos === blockLen)
                this.keccak();
        }
        return this;
    }
    finish() {
        if (this.finished)
            return;
        this.finished = true;
        const { state, suffix, pos, blockLen } = this;
        // Do the padding
        state[pos] ^= suffix;
        if ((suffix & 0x80) !== 0 && pos === blockLen - 1)
            this.keccak();
        state[blockLen - 1] ^= 0x80;
        this.keccak();
    }
    writeInto(out) {
        assert$1.exists(this, false);
        assert$1.bytes(out);
        this.finish();
        const bufferOut = this.state;
        const { blockLen } = this;
        for (let pos = 0, len = out.length; pos < len;) {
            if (this.posOut >= blockLen)
                this.keccak();
            const take = Math.min(blockLen - this.posOut, len - pos);
            out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
            this.posOut += take;
            pos += take;
        }
        return out;
    }
    xofInto(out) {
        // Sha3/Keccak usage with XOF is probably mistake, only SHAKE instances can do XOF
        if (!this.enableXOF)
            throw new Error('XOF is not possible for this instance');
        return this.writeInto(out);
    }
    xof(bytes) {
        assert$1.number(bytes);
        return this.xofInto(new Uint8Array(bytes));
    }
    digestInto(out) {
        assert$1.output(out, this);
        if (this.finished)
            throw new Error('digest() was already called');
        this.writeInto(out);
        this.destroy();
        return out;
    }
    digest() {
        return this.digestInto(new Uint8Array(this.outputLen));
    }
    destroy() {
        this.destroyed = true;
        this.state.fill(0);
    }
    _cloneInto(to) {
        const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
        to || (to = new Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
        to.state32.set(this.state32);
        to.pos = this.pos;
        to.posOut = this.posOut;
        to.finished = this.finished;
        to.rounds = rounds;
        // Suffix can change in cSHAKE
        to.suffix = suffix;
        to.outputLen = outputLen;
        to.enableXOF = enableXOF;
        to.destroyed = this.destroyed;
        return to;
    }
}
const gen = (suffix, blockLen, outputLen) => wrapConstructor(() => new Keccak(blockLen, suffix, outputLen));
gen(0x06, 144, 224 / 8);
/**
 * SHA3-256 hash function
 * @param message - that would be hashed
 */
gen(0x06, 136, 256 / 8);
gen(0x06, 104, 384 / 8);
gen(0x06, 72, 512 / 8);
gen(0x01, 144, 224 / 8);
/**
 * keccak-256 hash function. Different from SHA3-256.
 * @param message - that would be hashed
 */
const keccak_256 = gen(0x01, 136, 256 / 8);
gen(0x01, 104, 384 / 8);
gen(0x01, 72, 512 / 8);
const genShake = (suffix, blockLen, outputLen) => wrapConstructorWithOpts((opts = {}) => new Keccak(blockLen, suffix, opts.dkLen === undefined ? outputLen : opts.dkLen, true));
genShake(0x1f, 168, 128 / 8);
genShake(0x1f, 136, 256 / 8);

/**
 *  Cryptographic hashing functions
 *
 *  @_subsection: api/crypto:Hash Functions [about-crypto-hashing]
 */
let locked = false;
const _keccak256 = function (data) {
    return keccak_256(data);
};
let __keccak256 = _keccak256;
/**
 *  Compute the cryptographic KECCAK256 hash of %%data%%.
 *
 *  The %%data%% **must** be a data representation, to compute the
 *  hash of UTF-8 data use the [[id]] function.
 *
 *  @returns DataHexstring
 *  @example:
 *    keccak256("0x")
 *    //_result:
 *
 *    keccak256("0x1337")
 *    //_result:
 *
 *    keccak256(new Uint8Array([ 0x13, 0x37 ]))
 *    //_result:
 *
 *    // Strings are assumed to be DataHexString, otherwise it will
 *    // throw. To hash UTF-8 data, see the note above.
 *    keccak256("Hello World")
 *    //_error:
 */
function keccak256(_data) {
    const data = getBytes(_data, "data");
    return hexlify(__keccak256(data));
}
keccak256._ = _keccak256;
keccak256.lock = function () { locked = true; };
keccak256.register = function (func) {
    if (locked) {
        throw new TypeError("keccak256 is locked");
    }
    __keccak256 = func;
};
Object.freeze(keccak256);

/**
 *  A simple hashing function which operates on UTF-8 strings to
 *  compute an 32-byte irentifier.
 *
 *  This simply computes the [UTF-8 bytes](toUtf8Bytes) and computes
 *  the [[keccak256]].
 *
 *  @example:
 *    id("hello world")
 *    //_result:
 */
function id(value) {
    return keccak256(toUtf8Bytes(value));
}

const subsChrs = " !#$%&'()*+,-./<=>?@[]^_`{|}~";
const Word = /^[a-z]*$/i;
function unfold(words, sep) {
    let initial = 97;
    return words.reduce((accum, word) => {
        if (word === sep) {
            initial++;
        }
        else if (word.match(Word)) {
            accum.push(String.fromCharCode(initial) + word);
        }
        else {
            initial = 97;
            accum.push(word);
        }
        return accum;
    }, []);
}
/**
 *  @_ignore
 */
function decode(data, subs) {
    // Replace all the substitutions with their expanded form
    for (let i = subsChrs.length - 1; i >= 0; i--) {
        data = data.split(subsChrs[i]).join(subs.substring(2 * i, 2 * i + 2));
    }
    // Get all tle clumps; each suffix, first-increment and second-increment
    const clumps = [];
    const leftover = data.replace(/(:|([0-9])|([A-Z][a-z]*))/g, (all, item, semi, word) => {
        if (semi) {
            for (let i = parseInt(semi); i >= 0; i--) {
                clumps.push(";");
            }
        }
        else {
            clumps.push(item.toLowerCase());
        }
        return "";
    });
    /* c8 ignore start */
    if (leftover) {
        throw new Error(`leftovers: ${JSON.stringify(leftover)}`);
    }
    /* c8 ignore stop */
    return unfold(unfold(clumps, ";"), ":");
}
/**
 *  @_ignore
 */
function decodeOwl(data) {
    assertArgument(data[0] === "0", "unsupported auwl data", "data", data);
    return decode(data.substring(1 + 2 * subsChrs.length), data.substring(1, 1 + 2 * subsChrs.length));
}

/**
 *  A Wordlist represents a collection of language-specific
 *  words used to encode and devoce [[link-bip-39]] encoded data
 *  by mapping words to 11-bit values and vice versa.
 */
class Wordlist {
    locale;
    /**
     *  Creates a new Wordlist instance.
     *
     *  Sub-classes MUST call this if they provide their own constructor,
     *  passing in the locale string of the language.
     *
     *  Generally there is no need to create instances of a Wordlist,
     *  since each language-specific Wordlist creates an instance and
     *  there is no state kept internally, so they are safe to share.
     */
    constructor(locale) {
        defineProperties(this, { locale });
    }
    /**
     *  Sub-classes may override this to provide a language-specific
     *  method for spliting %%phrase%% into individual words.
     *
     *  By default, %%phrase%% is split using any sequences of
     *  white-space as defined by regular expressions (i.e. ``/\s+/``).
     */
    split(phrase) {
        return phrase.toLowerCase().split(/\s+/g);
    }
    /**
     *  Sub-classes may override this to provider a language-specific
     *  method for joining %%words%% into a phrase.
     *
     *  By default, %%words%% are joined by a single space.
     */
    join(words) {
        return words.join(" ");
    }
}

// Use the encode-latin.js script to create the necessary
/**
 *  An OWL format Wordlist is an encoding method that exploits
 *  the general locality of alphabetically sorted words to
 *  achieve a simple but effective means of compression.
 *
 *  This class is generally not useful to most developers as
 *  it is used mainly internally to keep Wordlists for languages
 *  based on ASCII-7 small.
 *
 *  If necessary, there are tools within the ``generation/`` folder
 *  to create these necessary data.
 */
class WordlistOwl extends Wordlist {
    #data;
    #checksum;
    /**
     *  Creates a new Wordlist for %%locale%% using the OWL %%data%%
     *  and validated against the %%checksum%%.
     */
    constructor(locale, data, checksum) {
        super(locale);
        this.#data = data;
        this.#checksum = checksum;
        this.#words = null;
    }
    get _data() { return this.#data; }
    _decodeWords() {
        return decodeOwl(this.#data);
    }
    #words;
    #loadWords() {
        if (this.#words == null) {
            const words = this._decodeWords();
            // Verify the computed list matches the official list
            const checksum = id(words.join("\n") + "\n");
            /* c8 ignore start */
            if (checksum !== this.#checksum) {
                throw new Error(`BIP39 Wordlist for ${this.locale} FAILED`);
            }
            /* c8 ignore stop */
            this.#words = words;
        }
        return this.#words;
    }
    getWord(index) {
        const words = this.#loadWords();
        assertArgument(index >= 0 && index < words.length, `invalid word index: ${index}`, "index", index);
        return words[index];
    }
    getWordIndex(word) {
        return this.#loadWords().indexOf(word);
    }
}

const words$4 = "0itatkastcenaovo$taouleraeki&chor*teci%enbalodaeladet'!Chn=0Di#%E%^1Resa2Rese3CeT'#0EjKohol0Pu)%0A&sDul#Ekdo)Ke)Ti#Ul|3}aOgan%0FaltI$@tPi,%TmaTronom0LasL{i#Ol0Tobus4Yl:B#}<CilCul#D!_Ge)GrHnoKterieLa^L{#LkonLon-LvanLzaMbusNkom!R[rR{RmanRokoRvaTer#TohVl&Zal#Zili#Zu#3D&RanSe^StieTonZin#ZmocZ)k3CyklD]Ft-KinyLan%Og,fO]gTvaZon2AhobytAt*/E/aEdu+EskIk!Iz&Ok|Oud Ud2B-BrDl.D~H!(JkotJ|K<ysLe$R>R'?TaUb_U/!U^U+Ur!Xer2A^v#Ambo,An#AtrEp)Ike)KoLohOnzOskevUn{#Usin#Z^Zy2Bl.Bn|})D _D#D'aF{Jar(Kv?LdokLvaN^NkrRzaTikVolZola3D+tL.T'#0Ukot:PartRev&3DrDu+J/JnLaLerLkemLn?N.Nn(N'#NtrumNz<StopisT#2AlupaAp`]Ar aA)E/t!EmieI/otIrurgL`Le[Lub M_Mu,ObotO/olOd[O+,Om=Op Oro[OvRapotRl RtRupTiv(Ud.Utn!V!Vil#V(Y[Y$!Yt 0Bu+Gare)H_&HlaNkotRkusSter&Ta%TrusZin>Z(2O&2KolivUv!4It_N(0Dn(Ke)KrPot0Ak~AlIkRkot2Kli$a:L-oRe[T_Tum1E,1B!a}'#Cib_Fic Fla%KlKr{Mokr!PreseRbyS#T-tiv3Kob,zKt|O^P]mSkSp+jV`]Vo/2AhaOuhoUhopis1Es0BroByt-C@t}ut DnesH+dHo^H,JemJn?Kl`KolaKt<Kum@tLarLevaL.MaM.ntMluv M'Nut P`PisPln PosudPr'odPu$ Raz R(RtSahSl'St!-SudSy)TazT-Tk~Uf!Utn!Voz%Z`uZn!Z<%2Aho)AkAm!ikAv>AzeDolObn(OgerieOzdSn(T Z(2B@}'noD-HaH'#S SnoT(0Oj?Or>2Nam :9O]gOnomie0EktronIpsa0AilIseO%P!ie2Izo^O/aOpejOs2EjEn%K<)Kymo0Ike)0F<ie0Olu%1Eku%KurzePed?P]zeP<tT,kt:C#Jf#Kul)N!ikN)zieRmacieV< Zo+3De,%J{onN#3Al#Gu,ntLozofLtrNan%N)Xa%0Ord1An_IrtOtila2NdSf<T[lT#Ton2Ak%Es#On)2KarNk%3Zi#:LejeRant3N{i#O]g3Lot.2Azu,Ejt2LemLfi$aTi#2AfAmofonAnu+EpIlOgOtes#2Ma:D?DrLaL@#N[NopisRfaRpu&V,n3Bk(J#lJnoJtmanK)rLmaM!omR>R&S]Zky3St<ik2Ad'#AsivkyAvaEd!EnO^v>OhOup(T!Ub.U/o)0AtO)Yz0IsOjivoOut0Bl.Boj}DinyDl!Dno)D|Jn(KejLin#L#LubMo+N [No,%RalR^RizontRkoRliv>RmonRn.RoskopR$voSpo^St.T'(U[UfUp!Us#V<2Ad[An?Av(Az^Bo+kD.D]D(N-Ob#Oma^OtOu^Oz@St#Ub(Yz!2B@(B~D[KotMrS aSto)0Ozd2Bn(D,ntGie&M&Sterik:2Yl#3Ned2O&0Uze0Un a0F-%Fla%KasoOva%Sp-%Tern{Vali^Ve$<Zer%3Onie:Blko})Ho^Kmi+K(L'>N)rRmarkRoSanSnoT#V<Zyk3Din>D+Dn!_HlanKotL@L oMn(NomP?S{erV Zd>Zero3NakNdyNo/Sk,Sto)Trn?Zva3En|1Gurt5R):Bar{B_Bin{}&D{Did]HanJakJu)KaoKtusLam aLhotyLibrLn(Me,MkolivM&Ni[lNoeNt<Pal.P_aP olaP#P+Po)PrPu$aPy[,Ram_Rot#RtonSaTa]gTed,U%UzaVa+cZaj#Ze)Ziv(2EkolivEsi0Dlub@MpRami#3No2A%kAdivoAmApotAsi#AunEcEn[Ep!Es~IdImaIs&Ob*kO#nOpaOubUb'&Us!Uzk(0EnIt!Otr0IhaOt0Al?Ber>B#BlihaBylaC*rH=J@>KosKtejlLapsLe^LizeLoMandoMe)MikMn!aMo,MpasMun aN!N%ptNd?N>NfeseNgresN.NkursN)ktNzervaPan>PieP~Pr'#Rb_R-t<Rmid]RoptevRpusRu&RytoRz{S!>St#T_T+)T*lUk!Up_&Us-Uz]VbojZaZ<oh2Ab?A/Aj.Al|AsopisAv!aEd EjcarEs[Eve)Ik{ItikIzeKav>Me+cMivoOcanOkOni#Op OupaOv#T-Uh`]Up?Ut(Vin#Y/+Yp)Y$alYt2Dlan#FrJn(KlaLaj^Li/L#Lom{Ltu,NaPodivuRtRz<Til0Al aAsin#E$<2No]gS_.Ta,T?T#T'>V`]:B,d<})nDn(IkKom>M_aMpaN'#S?SoStu,Tin#V.3B#CkdyD@Dn?D'#Dv.G@^GieG,%H%Hk(H~KtvarNo/odNtil#P@#Pid]T`]T>TmoTokruhVhartV a%Vobok3B,}ot#DojedDsk(H'.Jav>L-M{#NieN#No+umStop`T.T|5Bi$aDivodGi#GopedKal aK{Mc|P!aPu/RdSosTrU^lUhU#Usk!V>3Tiv(1Cer&CiferMpSkSt,%0I%2RaRi#S.:DamD]Gi$rHagonJ{-J _J< aKakK'?Kr_aL[L.L|Lv?Min#Nd+NkoRn(SakrSkotSopu$T?Tri#Tur aZan>ZivoZl Zur#2Lo[0}anikD a%D'.LasaL*nNtol#TlaTo^TrZe,3G,%H~Hu+K.KrofonL@>Lim{rL(Mi#Nc'&Ni[rNom{Nul(S#StrX|2Ad(HaH'.OkS!Uv 1I/Ohem0BilCn(D_#Dl [HylaKroL-ulaM@t#Nar/aNoklN$rumNt|NzunSazSkytStTiva%T<#Ty#U/aUdr(Zai#Z-Zol2Am<Av@>KevTvolaZ{Zut(0T _1DrcF]nL!MieN?S{Ta%ZeumZi#nt3Sliv>0Da:B*r!}yt!Da%Dbyt-DhozDobroDpisHlasHn!Hodi+H,d Iv aJedn*Ji$oJm=K]n Kon>Krm LevoMaz!Mluv Nom{rOkoOpakO$roP`!PevnoPln P~Pos+dPr(oRod RubyRy/]S` S-!S+poSt!TolikV@-Vr/Vzd<yZv!3Be}!CkyDa+koDb!DuhGa%H{Ho^J@JprveKlidLib(Mil(MocO/o)On#PokojR(RvSmyslS*l`Tv<UronV.Zvyk+3Co)JakKamKdyKlKte,kTro5C+hHav?M.%RaR-S _Sn(UzeVinyVo)Zd,5DaD+G{T Tn(Trie3Mfa:0AlArv AvaDivEcEhn!Ejm=Ez aHajo[Iln?Jasn J-tK]p La$L-Li[LohaLu^NosOh! Oj-OutRaz>R&Ru[RysSahSluhaS)r!UvVazVin VodVyk+Yv!_Z<0AsElEn Hl` Ho)H,&It~0BojByt}odCiz Ebr!Esl!Evzd!EzvaH`%Hod J{JinudKazK*p LivLu#Ml#Oln(P`PisPl=P<Pu$ Pyk!Raz#S*d StupSunTokTudVahaVe)Vol!V,%tZ&k1I&Sajd1LasNiskoRa^Roz Ryz-2ApEn?Li#NoOuzl OvyRasaResRs-RuhUpantUr#Us 0Ejn.Iz|0AkE+)Ez L`.L*v!LuvaYl0Ehdy1Ak|As-E,%I%Il(Is|O,Oz?RavduRoti1B al}e$rGieL?LojT_0A^}~I#IvoLavaLep Ln L' N'aO[Ol Pa+cT@T,haTu^Ty/Voj 0Epl IskOpRh!Rl(RokRubyV<1A~ArEsLivn O%1Id1Do[:}!_Ci@tD*/H<-KtLan^L>LivoLu[Mf+tMls-N@#Ni#N&N|N$voNtof+Pri#Rke)RodieR)Ru#Ry[Se#Siv aSt_#T@tTro&V*kZnehtZ*r-3C#DagogJs-K]LotonNal)Ndr-NzeRiskopRoStr(Tar^T?Tro+jVn.Xeso3Ani$aHaJav?K+KnikL.Ln(Lul#Nze)Pe)S!_Sto+Tev&Vn?V'ar2A%n)Ak!Am@Ane)A$i#At Avid]AzE/Em@oEn)EsEtivoEv_Iv!N NoO/aOd.Om[OutUkYn2Bav Byt}odC Ctiv>D!D%n Deps!Dh+dDiv Dkl`Dman DnikDo[Dpo,D,zD$!aDvodDzimEzieHan#Hnut#H'<HromaHybIn)Ji$#Jm=Kaz K+sKojKrokKu)KynLedneLib-Lk~LohaLynomMaluMi~Ml#MocM$aMys+tNe/!N<#Nur(P`!P_Pis-Pla/Pros Ps!PudR`%R%RodRu/aRyvS` SedSilaSkokSlan>S*d SpoluS)vaSud-SypTahT#nT+skTom-T,vaTupaTvo,U#zUtoUzdroVahaVidlaVlakVozVr/V$!VykVzde/Zd,vZem-Zn!-Z<Zv!2Ac|Ah<yAkti#A+sAot>Ap<-AseAv^IncipKnoObud O%ntoOdejOfeseOh,Oj-tO]m Omi+Onik!Op`OrokOs[OtonOut-OvazS#v#St@Udk(UtV-Voh<y0An>OvodTruh0Actvo0Ber)}DlKav>Kl.Kr+LtMpaNcP@SaSin#St.T|Ty#3Rami^SkT_::C-}otDia%Dn?DonFtGbyKe)K'.M@oMp*/NdeRa/R aS'&StrTo+$Zan%Zid]3Ag|Ak%CeptDakt<Fer@tF+xJnokKlamaK<dKrutKt<Pu)%VizeVmaVolverZerva3Sk|Ziko5Boti#Dokm@H'#K+KokoMan{oP'odPu/aRejsSolStl.Tmi$rTopedTun^Ub@#U/oUpU,V.Vn?Zb<Z/odZd!Zezn!Zhod%Zin#ZjezdZ#zZ]haZmarZp`Zru/ZsahZtokZumZvod5Bri#}`]Kav?Kopis3BaBol'}l(D]P`]T.Z(:Di$aH!KoM>Mizd!Mo)N #Rdin#San#T_ Z[Z@?0Or0H|1B,n#CeseD`]Dim@tD]Hn!Jm=Ke,K)Kun^KvojeM@oNoRvisS` Sho,SkokSl!St,SuvSyp!T[T.Tk!T~Trv!VerZ&m2O^R~0FonLn?R#Rot-RupTua%1AfandrAliskoAnz@AutEptikIcaL`[L@?LoLuzO[O#nOroRip)RzUp.V(Vr&0Abi#Adid]An.A$Avn(Ed|Ep>EvaEz.IbI&Izn?OnOup-OvoU/UhaUn%Up#Za0A,gdE)&Il$voL*vaOgR`RkRt#Ut-Ysl0AdAhaOb0Bo)}aD'#KolP#TvaUbojUc Ud%UhlasUl`Um,kUp,vaUsedUtokUvis{0Al'&As _IsLavOd-Oj@>OluOnz<Orn(Ou$aR/aU$ 1An^AzD%NaN>Ovn!P@StUb1An?Ar(aAti#Av[EhnoEz#OdolaO+kOpaOrnoOup!Ra/ResRh~RomRu&Ud&Upn?VolYk0Bj-tBtropy}arD(KnoNd!N=Rik!aR'.0AhAl$voEtrAt[Az-Is+It-Obo^Odid]Or#Rab2Kav#KotN-N'>P!Pk(R'(S_T(:B+t#Bu+H*nJemnoJfunJgaJ Jn(Kti#Mh+MponNc|N>NkerPe)V@.Z!_3}ni#HdyKut.LefonMno)Nd@%Ni$aN<P])P&PrveRapieRmos#Xtil3}oSkopisTu+k1Ad+cAn.0Ap#Esk!UkotUpa0El1A+)Pin#PolRzoUhaU+c2Ad?Akt<AmpAsaAverzaEf E$Ez<Hav.Hl.O/uOj?Os#Ou[P%P _Pk(Ub>U/l Uhl?UsV!2DyH~H(Nd,Ri$aR&jZemsko0ArohOr[Rd(Rz2GrKev:0Oh(OzeR!R*s-RusYt'&0HoTiv(0Iv 3R` 1Edn!I$ M=0Az!_Lidn Lon Otv Roj 0I%I)Ov 0Yv`]0Av If<maIk~1Ad~L!n Ly~Out!Rav 1AnAz 0Ed~Il|Mrt N`n N=Oud Tl!Tr~0Ah|K!Lum O~Op@>R*s 1Al Oln Oz'#3D,v ElEn.L.N!:GonL/aL*nNaN^lNil#RanRhanyR|1ElkuHod0Ova0DroGe)%J%Lbl*dL{rhL _LmocLry[Nk'Ran^RzeS_#SkrzeSn?SpoduS)Ter.Ver#3B,%}rDeoh,D.D+LaN?S{Tal aZeZ #0Ezd0L`Us0Aj#AkAs>EvoHk(IvN'#Oup!1Uc|Uk0DaDiv(Doz&kD$voJ@skyJ&JskoLantL[L LnoSk'#Zid]Z'&0Ravo1Ab>A%tAhA)Ba}o+kH!StvaTu+0Ad T*p Tup0Ip4Bav Br!}|D!D,Fot H+d!H~Hod H,d Hub Jasn J{Jm=K]p Kon!L-!Maz!Mez Miz{Mys+tNe/!Nik!Nut P`!Pl! P,v Pu$ Raz R'n!Rv!Sl' SokoS)v Su~Syp!Tas Tes!Tr! Vi~Vol!Vrh_Zdob Zn!0AduBud }op D<Du/Dy/!E$upH+demKazLyk!NikOr-P*,TahT-::993Lofon::Br!Byd+t}|DarmoDus F*k!Hlt Hod H,^Hy~J!>J{Ji$ K+p!K*p Lep Mez Mot!Mys+tNe/!Nik!Pl! Poj Ps!Raz S)v Su~Taj Temn Tk~Ujm=Val Ve+tVin Vol!Vrt!Zvon 0Av RusuUd|Yt-1A+#ArmaAtn(IvoOb RojVihYm`]0L@.ManM.Pt!Z`uZdola2At Lt~Lubo#Ot' Ru[0MaMn?0Emn 0Lam!Oum!R!#Umav#0AtoEh#O[OmO$Ozvyk0Ap|ArAt-IjeIz{Ocn Odr!Rzl.Ut|0AkAl(Am@!Ovu0B,z Tav Ub-Ufa+0Lod Omal RavaR( Rud#Rvu1A^An C`]N (NoOv&Y/l Zav(1I/aR! 0B'.Br0Ed~EnkuEs_aOnR!Uk'odYk";
const checksum$4 = "0x25f44555f4af25b51a711136e1c7d6e50ce9f8917d39d6b1f076b2bb4d2fac1a";
let wordlist$6 = null;
/**
 *  The [[link-bip39-cz]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangCz extends WordlistOwl {
    /**
     *  Creates a new instance of the Czech language Wordlist.
     *
     *  Using the constructor should be unnecessary, instead use the
     *  [[wordlist]] singleton method.
     *
     *  @_ignore:
     */
    constructor() { super("cz", words$4, checksum$4); }
    /**
     *  Returns a singleton instance of a ``LangCz``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$6 == null) {
            wordlist$6 = new LangCz();
        }
        return wordlist$6;
    }
}

const Base64 = ")!@#$%^&*(ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
/**
 *  @_ignore
 */
function decodeBits(width, data) {
    const maxValue = (1 << width) - 1;
    const result = [];
    let accum = 0, bits = 0, flood = 0;
    for (let i = 0; i < data.length; i++) {
        // Accumulate 6 bits of data
        accum = ((accum << 6) | Base64.indexOf(data[i]));
        bits += 6;
        // While we have enough for a word...
        while (bits >= width) {
            // ...read the word
            const value = (accum >> (bits - width));
            accum &= (1 << (bits - width)) - 1;
            bits -= width;
            // A value of 0 indicates we exceeded maxValue, it
            // floods over into the next value
            if (value === 0) {
                flood += maxValue;
            }
            else {
                result.push(value + flood);
                flood = 0;
            }
        }
    }
    return result;
}

/**
 *  @_ignore
 */
function decodeOwlA(data, accents) {
    let words = decodeOwl(data).join(",");
    // Inject the accents
    accents.split(/,/g).forEach((accent) => {
        const match = accent.match(/^([a-z]*)([0-9]+)([0-9])(.*)$/);
        assertArgument(match !== null, "internal error parsing accents", "accents", accents);
        let posOffset = 0;
        const positions = decodeBits(parseInt(match[3]), match[4]);
        const charCode = parseInt(match[2]);
        const regex = new RegExp(`([${match[1]}])`, "g");
        words = words.replace(regex, (all, letter) => {
            const rem = --positions[posOffset];
            if (rem === 0) {
                letter = String.fromCharCode(letter.charCodeAt(0), charCode);
                posOffset++;
            }
            return letter;
        });
    });
    return words.split(",");
}

/**
 *  An OWL-A format Wordlist extends the OWL format to add an
 *  overlay onto an OWL format Wordlist to support diacritic
 *  marks.
 *
 *  This class is generally not useful to most developers as
 *  it is used mainly internally to keep Wordlists for languages
 *  based on latin-1 small.
 *
 *  If necessary, there are tools within the ``generation/`` folder
 *  to create these necessary data.
 */
class WordlistOwlA extends WordlistOwl {
    #accent;
    constructor(locale, data, accent, checksum) {
        super(locale, data, checksum);
        this.#accent = accent;
    }
    get _accent() { return this.#accent; }
    _decodeWords() {
        return decodeOwlA(this._data, this._accent);
    }
}

const words$3 = "0arertoiotadonoaRteirroenaNonaLsolocoiliaralaorrenadaChoN$n0A>Dom,EjaI!#Oga&O'Or#RazoR*Ue=U<0Ab Adem@Ce<C~Ei)ElgaEn#Ept I&L  NeOg!O<TivoToTrizTu Ud*U!&Us 0Ic#Mit*Opt Or'Ua`Ul#0Reo0Ect Ic~In Irm 0IlIt On@Os#Ot Reg R$UaU&U?aUja0OgoOr+0ReSl 0Ed_zE'Us)1Ac[nAmb_ArmaBaBumCaldeDeaEg_Ej Er%E%F?!GaGo&nIa&I,#Iv$MaMejaMib T TezaTivoToTu[Um'Z 0AbleAn)Apo]ArgoAs B Bi#E'IgoIs%dOrP oPl$0|oC@'C]D D,Em@Gu=Il=ImoIsOt T,aTiguoTojoUalUl Unc$Ad*EjoO1Ag A[#Eti#IoLic O&Or)OyoR,d!Rob Ues%U+1A&A`ArBit+BolBus#|ivoCoD!D?]DuoEaI&IesM.i-esOmaPaP.Reg=RozRugaTeTis%0AA&Al#C,<Egur EoE<rI,#I=Ist*NoOmb+P!oT?]T+Tu#Um*Un#0AjoAqueArEn#EoI>Le%OmoRa!RozUn0DazD$GeLaM,#S,)T^0AlAnceA+EEl]`E`EstruzI.I<2ErU{U'0Af[nArO)Uc Uf_Ul:BaB^|eH@IleJ Lanz/c.LdeMbuN>Nd-oRb(>RnizR+Scu]S#nSu[Tal]T!@T*Tu%UlZ 3BeBid/=S SoSt@3|oEnNgo2An>OqueUsa2ABi`BoCaCi`DaDegaIn//!oLsaMb-{dNi#N}saiRdeRr SqueTeTinVe{Zal2AvoAzoEchaEveIl=In>IsaOcaOmaOnceO)UjaUs>U#2CeoCleE'EyFan{F.HoIt_L#Rbuj(l(+Sc TacaZ.:Bal=BezaBi`B[CaoDav!D,aErFeI{ImanJaJ.LLam Lc$L&Li{dLleLm/^LvoMaMb$Mel=Mi'Mp}c!Nd?Nel-gu+Nic-#N-.ObaOsPazPi%nPo)Pt Puch((b.RcelRe%Rg(i'RneRpe%R+R%SaS>S!oSpaS#rT^ceT_U{lUsaZo3Bol]D!D+Ld/eb_Lo<Lu]M,#Niz-t+Rc(&Rez(oRr R)zaSpedT+2AcalAle>AmpuAnc]ApaAr]I>Is)IvoOqueOzaUle%Up 0Cl.EgoE=EnEr#F[G +M->NeN%P_sR>Rue]SneTaU{d2Am^AnA+AseAveI,)ImaInica2B_Cc~|i'Ci`CoDigoDoF_G!He)JinJoL/ch/eg$Lg Lin/l LmoLum`Mba)M!Mi{Mo&Mpr-deNej}g-oc!Nsej}t PaPi(az.Rba%RchoR&nR.(r!S!SmosS%2AneoAt!E Ec!Ei&EmaIaIm,Ip%IsisOmoOnicaOque%U&Uz2Ad+Ar#At+BoBr*| aEl=En#Er{Es%EvaId Lebr/p/#Mb_Mpl*N-e%O%P.Pul( R$<R<RvaTis:M-z(R&T?3B!B?Ca{C*DoF,saFin*J LfinLga&Li#M^-<N%lP^)RechoR+%Sayu'SeoSf?eSnu&Sti'Sv$TalleT,!U{3AAb=AdemaAman)A`Ar$BujoCt En)E%EzFic?G'Lem/u*N!oRec#Rig*S>Se'Sf[zVaVi'5BleCeL^Ming}N Ra&Rm*R<SSis2Ag.Oga2|aDaE=E'LceOQueR Rez(o:0A'R$0H OUa&r0AdIc~Ific$I#rUc 1Ec#Icaz3EEmp=1Efan)Eg*Em,#Ev IpseI)Ix*Og$Ud*0Bu&It*Oc~Pa)Pe'PleoP_sa0A'C go|ufeC@EmigoE+Fa&F!moGa'Igm/aceOrmeRe&SayoS, T!oTr VaseV$1Oca0Uipo0Izo0Ca]C,aCol Crib*Cu&Enc@F!aFu!zoPa{PejoP@PosaPumaQuiT TeTi=Tufa0ApaEr'Ic-@1Ad*Alu En#It 1Ac#Am,Ce<CusaEn#Ig*Il$Ist*I#P!#Plic P.!T_mo:BricaBu]|a{C?C#rE`J/d/=L<Lt MaM?@Mo<Ra.Rmaci(olRsaSeTigaU`V^X3Br!o|/izORi(ozRt?Rv^Stin3AbleAnzaArB[Cc~|aDeoEb_ElE[Es%Gu[J JoL/e)L@lLt+NNc-g*Ni#Rma2A>Au%EchaOrO%U*UjoU^2B@CaGa%G.L$Lle#N&Rm(+Rtun(z SaTo2Aca<Ag?AnjaAseAudeE*E'EsaIoI#U%2EgoEn)ErzaGaM Nc~Nd(g.R@S?TbolTu+:Ce]FasI%JoL/!i/=Mb- Nch}g-<RajeRzaSoli`St ToV?an3Me=M*NN!}$N)Ran$R,)Rm,S#3Gan)M`s$R Ro2Aci OboOr@2LLfoLo<LpeM(&R?([TaTeoZ 2A{Afi>A'AsaAtisAveIe%Il=IpeIsI#O<rUaUe<UmoUpo2An)ApoArd@Er[IaI'I.I<It [Sa'St :B!B?Bl C!|aD/l Mac(i`ZZa`3B?]B[|oLa&L$Mbr(*Rma'RoeRv*3E=Er+Ga&Gi,eJoM'S#r@5Ci>G Gu!aJaMb_Ng}^Nr((mig('St?Yo5E>ElgaEr%E<EvoI{IrMa'Me&M?deM}d*RacanR#:1O'0EalIomaO=2Lesi/uUal4EgalUs~0Ag,AnIt P P!$P.!Pul<0CapazDiceEr)FielF^meG,$Ic$M,<MuneNa#Sec#S%n)T!esTimoTu*Ut?Vi!'3AIsOn@0L/o):BaliB.M.RabeRdinR[U]Zmin3FeRinga3Ne)5R`d(obaV,Ya5ErgaEvesEzGa&rGoGue)Ic$N>Ngl-$Nt Pit!R S#V,?Zg :7Lo5A]:B$C$C[DoD+nG #GrimaGu`I>M!Mi`Mp --ch-gos%NzaPizRgoRvaStimaTaTexT*U_lV Zo3AlCc~|eC#rErG~Gumb_Ja'Ngu-#NaOnOp &S~TalT[VeY,{3B!%dB+C^D!Di EnzoGaG!oMaMi)M.Mp$NceN&Ne-go)N}t!`Qui&SoS%T!aT$T+2AgaAmaAn#AveEg En Ev Or Ov!Uv@2BoC~CoCu[GicaG+MbrizM}jaTe5|aC*G J}-esPaSt+ToZ:Ce%|oD!aD_Du+Est+F@G@GoIzL{dLe%Ll/oMaMboMutN>N&Nej Ng-iquiNj N}<N%Na`PaQuin(R>Re(f?Rg,Ri&RmolR+nR)sRzoSaSc aSivoT T!@TizTrizXimoY^Z^ca3|aDal]D$Du]J?]J^L,/.M^i-^NsajeN)NuRca&R,gueRi#SS.TaT!To&T+Zc]3E&ElEmb+G/Lag+Lit Ll.M}-!}im}u#OpeR SaS!@S?SmoTadTo5|?aC~DaDe=HoJ LdeL!Li'M,#Mi- c-ed-j-#NoRad(d!Re'R*R+Rs(%lScaStr TivoV!V?Zo5|oD EbleE]Er)Est[G_J!L/e%L%N&Nec(alRoScu=SeoSgoSicaS=:C C~D IpeRanj(izRr SalTalTivoTu[lUseaValVeVi{d3C$Ct G Goc$G+OnRv$ToUt+V V!a3|oDoEb]E#NezNoTi&Vel5Bleza|eMin(i(m()TaTic@Va#Ve]V$5BeCaCleoD?=DoE[EveEzLoM!oTr@:Sis0E<IspoJe#R(!oS!v T,!V$0AA<Ea'H,%HoIoReTavoTub_Ul#Up Urr*0I IoIsea0S)0EnsaEr%Ic$Rec!0Ro1DoR0O1AEa{Fa#IvoLaMoOrVi&0Bligo0DaZa1A>C~E[In On!T TicaUes#1Ac~A&rAlBi%CaD,EjaGa'G@Gul=I,)Ig,Il]OQues%Uga0Ad@Cu+Ez'OT[0O'Ro1EjaU=1I&Ige'0En)0O':C#D_El]Gi`GoIsJ oLabr/>Le%Li&Lm/om/p NNalNi>Nt!-ue=PaPelP?]Que)R Rcel(edR*RoRpa&RqueR[foR)S SeoS~SoS%TaT$Tr@UsaU%VoYa<3A#nCa&C!a|oDalD*G IneL L{'Le/ig+LlejoLoLuc--s N.OnOrPi'Que'R(ch(d!Rez(f?Ri>Rl(mi<R+Rs.aSaScaSimoS%`Ta=T+leoZZu`3C |.EEd[Er`EzaJam/ Lo#Mi,%N}#rNz-aOjoP(a%S Sci`SoS%T.Zca2AcaAnA%AyaAzaEi#E'OmoUmaU[l2B_CoD!D$EmaEs@E%L,Lici/=LvoMa{Me=MoMp-!Rc~R%lSa{Se!SibleS)T,c@T+Zo2A&E>zEgun%Em$EnsaE<Ev$ImoIncipeIs~Iv OaOb Oce<Oduc#OezaOfe<rOg[maOleOmesaOn#Op$OximoUeba2Bli>|!oD^Eb=Er%Es#Lg/*Lm.LpoL<M-#NalNoPaP?(e:99Ed EjaEm Er!E<Ie#ImicaInceIt :Ba'B@BoC~DicalIzMaMp-ch}goPazPi&P#SgoSpaToYoZaZ.3Acc~Ali{dBa'Bo)Ca!Ce%|azoCog!C_oC#Cur<DD.&Duc*FlejoF^maF[nFug$Ga=G*G]G_<H,I'IrJ/a#LevoLieveLle'LojM Med$M}>rNd*N%P #Pet*Po<Pt?SSca)Si`Spe#S#Sum,T*oT^'T[#Un*VesVis%YZ 3CoEgoEn{EsgoFaGi&G^Nc.N.OQuezaSaTmoToZo5BleCeCi D DeoD?]ErJizoJoM!oMp!NN>N{PaP!oSaScaSt+T 5BiB^DoE{G*I&In/e%LoMboM^Ptu[TaTi`:Ba&B!B$BleC GazG[&L/&L!oL*Lm.L.Ls/#LudLv Mb-c~Ndi-e Ng_Ni{dN}#PoQueRdin()nSt_TanU`Xof.3Cc~CoC_#C%DGu*IsL=LvaMa`M?l-d-<rNalN^P  P@Qui(RieRm.Rv*S,%S~TaT,%V!oXoX#3D[Es%E)G=G'Lab/b L,c$L]Mbo=M$R,aS)maT$Tu 5B_C$D$LLap/{&Le{dLi&Lt Luc~Mbr-de}i&No+NrisaPaPl P^)R&Rp_s()oS)nTa'5AveB*Ce<D^Eg[E=E'Er)Fr*Je#L%nM P! Pl*P.!P_moRR>Re'Rg*S#T?:Ba>BiqueB]BuCoC#JoL L>L,#Ll/.Ma'Mb^Ng}quePaPe)P@P.Qu?l(deRe(if(je%RotR+R%TuajeU+ZaZ.3At+|oC]CnicaJa&J!Ji&L/efo'MaM^Mp=NazNd!N!NisN<Ori(api(>Rmi'Rnur(+rSisSo+StigoT!aX#Z3B$Bu+nEmpoEn{Er[E<G_J!/deMb_Mi&M}%OPi>PoR(.TanT!eTu=Za5Al]B?=C Ci'DoG/&M N}#P PeQueRaxR!oRm,%RneoRoRpe&R_R<RtugaSS>S!Xi>2AbajoAc#rA!Afi>AgoAjeAmoAnceA#AumaAz EbolEguaEin%EnEp EsIbuIgoIpaIs)IunfoOfeoOmpaOn>OpaO)OzoU>Ue'Ufa2B!@BoEr#MbaM^NelNic(bin(ismoR'T^:0Ic 9C!a0B[l0I{dIrIv!<OT A3Ba'BeG,)Na0ArU $0IlOp@1A:CaC$Cu`G GoI`J?l/eLi&LleL^Lvu]Mp*oR(i R.So3Ci'C#rHicu=In)JezL/!oLozN-c!Nd-e'Ng N*N%NusRRa'RboRdeRed(j(<Rt!3AAjeBr C$CtimaDaDeoDr$EjoErnesG^LLl-ag_N}e&OlinRalRgoRtudS^Sp!aS%Tami`U&VazV!oV*Vo5LcanLum,Lv!RazT ToZ5E=Lg :::C!Te3GuaM('So9DoGaGur:F*}jaPa#Rza93N(+5MoR&";
const accents$1 = "aeiou7695@@BZWWavwUJkO@Y-Kn))YEGq#E@O)cI@#ZkMHv$e*))M!!)D**$GW!oKm*Acoh^k&It-pi^SYW)$^n!G)bO!Wkzam(jS#X)Og*^l^RW!bQ#QygBKXfzE))hti!Qm)Cng%%c)mJiI*HJWbmYniCLwNdYyY%WKO^bnT$PuGOr!IvHu&G(GKbtBuhiW&!eO@XMeoYQeCa#!MrTJCq!OW&CHG(WCcW%%)$rfrIegu$)w!G)JGmWWw)MnD%SXXWIT^LWAZuVWB^W)eTL^x&$WGHW(nKWEMA)#$F$x$Waekqs,n7715)W*HM-$WAcCiu(a))VCZ)GG%(*CWWdW%$D!UCO$M";
const checksum$3 = "0xf74fb7092aeacdfbf8959557de22098da512207fb9f109cb526994938cf40300";
let wordlist$5 = null;
/**
 *  The [[link-bip39-es]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangEs extends WordlistOwlA {
    /**
     *  Creates a new instance of the Spanish language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langEs]] should suffice.
     *
     *  @_ignore:
     */
    constructor() { super("es", words$3, accents$1, checksum$3); }
    /**
     *  Returns a singleton instance of a ``LangEs``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$5 == null) {
            wordlist$5 = new LangEs();
        }
        return wordlist$5;
    }
}

const words$2 = "0erreleontiteurinueiriet cegeanseali medenel q)eniluxaus ch0Ais}And$Diqu E`#Ol*Ord Ou%rOy RasifReuv Ri,Rog RuptS_-SoluS'@UsifYss=0A@m+AjouAr+nCab]Cep,Clam Cola@Cro~eCu}ErbeHatHe,Idu]I Omp&Qu *R$y?Te'TifT)l0Ep&EquatHesifJec%fJug Mett!M* Op,Or Ouc*Res<RoitUl&V be0R R$ef0Fai!Fec,Fi~eF!{Fub]0Ac Enc I#I,Raf Reab#Ru?1D Gu`#L>Mab#S/-0Ou,Us,1Arm Chim+Er&Geb!G)I_ I?ntLeg Lia.Lou Lum O'd*PagaTes<Veo#0A&'BiguB!Enag Ertu?Id$Ir=Orc O'Ovib#Phib+P#'Us/t0Aly<Apho!Ar~+Atom+C+nE/%rG#Gois<Gu#{Im=Nex N$-N)lOd(Om=+Ony?Orm=T_[Tido&X+{1Ai}Eri%fL/*Olog+Pa!`Pe]Por,Puy 0UariumUeduc0Bit!Bus&De'Doi<G_tLequ(Matu!Me?ntMoi!Mu!P_,Ra~ Riv Ro}S_icT +lTic#0PectPh=&P* S|tS v*S+t&Soc>S' TicotT!Tu-0El>O?RiumRo-Ta^T_%fT* Trap 0Ba(eB .Da-Dib#G' Ro!Tom[Tru~e0A]Anc Ari-En*Er<Eug#Ia&'I@I$I}O(eOu R`1I=Io?:D.Fou Ga.G)t&Igna@L/c Lc$Le(eLisa.Mb(Ncai!Nda.Nl+)Nn>eNqu>Rb>R`R$R^Rra.Ss(S%$Ta`#Te|T,+Udr>Vard 3Let&L>Lo&Nefi-R-|Rg Rl(eRmudaSa-Sog[Ta`Ur!3B $Cyc#Du#JouL/L(g)LlardNai!Olog+Ops+OtypeScuitS$Sto'iTu?Zar!2AfardAg)An~*Ess/tInd OndOqu Ous$2BardB(eI!I}Li@Nb$Nd*Nhe'Nif>NusRdu!R[T&Uc#Ue{Ug+Ul$Uqu(Ur<Usso#U%^Xe'2An~eAs>AveEbisE~eEuva.Ico]Iga@Ill/tIo~eI^O~u!Od Onz Ous<Oye'U?Us^Ut=Uy/t2Ff#Iss$L#%nRe|R(S% T( To*Vab#Vet&:B/$B(eChet&De|D!Fe(eIllouIss$Lcu]Lep(Lib!Lm Lomn+Lvai!Mara@M aMi$Mpag[N=Net$N$N%[NularPab#Por=Pri-Psu#P,Pu~eRab(eRb$eRes}RibouRna.Rot&R!|Rt$Sca@S>S^Ssu!U}U%$V=>V [Viar3D`#Intu!Les&Llu#Ndr>Ns' Ntr=Rc#Rebr=Ri<Rn Rve|S}2Agr(Ai<A#'Amb!An-Apit!Arb$As<'At$Auss$Av* Emi<En`#Equ>Er~ Ev=I_Iff!Ign$Im eIotLoru!OcolatOis*O<O)t&Ro?U&0Ga!Gog[M_,NemaNtr Rcu]R R^T [Toy_Tr$V`2A*$A?'Aqu As<Av>I_tIgn ImatIva.O~eOna.Opor&2B=tBraCas<Co% D Dif>Ff!Gn Hesi$Iff Inc L eLibriLl(eLma,L$elMbatMed+Mm/@MpactNc tNdui!Nf>N.]Nno,Ns$[NtactNvexePa(P+Ra`Rbe|Rda.Rni~eRpusR!ctR&.Smi^Stu?T$U@Upu!Ura.U&|Uvr*Yo&2AbeA(&Ava&Ay$Eatu!Edi,E?{Eu}Evet&Ib]I Ist=I,eOi!Oqu Ota#Uci=UelYp,2Bi^E`l*Il]eIs(eIv!Lm( L%v Mu]Pi@Ra%fR<'3Anu!C#L(d!Ni^:Ign M>Ng N<'Uph(3Batt!Bi,Bord Brid But/tC= Cemb!Ch* Cid Clar Cor Cri!Cup]Da#Duc%fEs<F_sifFi]Fray Gag Givr Glu%rGraf Jeun Li-Log M/d Me' Mol*Ni~ Nou N&l#Nud PartP_}Pha}Plac Po}R/g Rob Sast!S-n&S tSign Sobe*Ss( Str>Ta~ Tes,To' T!s<V/c V_*V( Vo*3Ab#Alog)Am/tC,Ff  G  Git=G[Lu M/~eM(u Oxy@Rec%fRig Scu,Spo}Ssip St/-V %rVi}5Ci#C&'G?IgtMa(eMici#Mp,Na&'Nj$Nn Pam(eRto*Ru!Sa.Se'Ss>Ta%$U/>Ub#U-'U,Y_2Ag$Ap Es}Ibb]Oitu!2P +P#xeRab#Rc*3Nas%e:0Lou*0Ar,HarpeHel#La* Lip<Lo!Lu<O#Onom+Or-Ou,Ra}Rem Riva(RouU?U!u`0If>Uqu 1Fac Fec%fFig+FortFray Fusi$0Ali}Ar 2Ec,1Abor Arg*Ectr$Eg/tEph/tEveIgib#I%s?O.Ucid Ud 0B=]Bell*Bry$Er|@Issi$M_ O%$Ouvo*P e'Ploy Por,Pri<Ulsi$0Cadr Ch eClaveCo~eDigu Dos}DroitDui!Erg+F/-F m Fou*Gag G(Glob Ig?Jamb JeuLev NemiNuye{Ri~*Roba.Seig[Tas}T_d!T>To' Trav Um  Vah*Viab#Voy Zy?0L+n0Aiss*Arg[At/tAu#Ic +I@m+I Ilog)I[Iso@ItapheO^ReuveRouv Uis/t0U !Uipe0Ig Osi$Re'Up%$0C=>Pad$Pe-P+g#Po*PritQuiv Say S_-S+uSor Ti?TomacTra@0Ag eA]An~eA%^E(d!Endo*Er[lH/olHi^Hn+Ir Off Oi#Onn/tO'd*R/.RoitU@0Phor+0Alu Asi$Enta`I@n-I,Olu%fOqu 1ActAg  Auc Cel]Cit/tClusifCu<Ecu,Emp#Erc H= Hor,I.n-I]Is,O%^Ped>Plor Po}Prim QuisT_sifTrai!Ul,:B#Bu#{Cet&Ci#Ctu!Ibl*Lai<Me{M`#R-'RfeluR(eRou~eSc( T=Tig)Uc$U%fVe'Vori3Bri#C$d D  L(M?M'Ndo*Od=Rm Ro-Rve'S%v=U`#Ut!Vr>3AscoCe]C%fDe#Gu!Latu!Leta.L>eL#ulLm LouLtr N/c N*O#R?Ssu!X 2A* Am?As^At&'E|E~eE'Exi$Oc$O!Uctu Ui@Uvi=2L+Nd +Ngib#Nta(eRc Rg $Rmu]Rtu[Ssi#Ud!Ug eU`]Ulu!Urmi2Agi#Ai<An~*App Aye'Ega&E( El$Em*E[s+E!Iab#Ic%$Iss$Ivo#OidOma.Ont=Ot,Uit2Gi%fI&Re'R+{R%fSi$T':Gn Lax+L +Mbad R/%rRd+nRn*Rrig)Zel#Z$3AntLa%[Lu#Ndar?N =N+NouN%lOlog+O?t!R/iumR?St)lY}3B>C]RafeV!2A-AiveIs}ObeOi!Or+{2Lfe'M?Nf]R.R`#Udr$Uff!UlotUp`#Urm/dUt&2Ad)lAffi%A(eAndApp(AtuitAv*EnatIffu!Il]Imp Ogn Ond Ot&OupeUg U% Uy e2EpardErr>I@Im|veIta!Sta%f3Mnas&Rostat:Bitu@Cho*L&Me|NgarN[t$RicotRm$+Rp$Sard3LiumMato?RbeRiss$Rm(eR$Si,U!{3B n BouLar/tStoi!V 5MardMma.Mo.[N['Nor N&{R@Riz$Rlo.Rm$eRrib#U#{Us<5BlotI#{Ma(Mb#Mi@Mo'R]3Dro?lG+[M[Pno<:2Yl#2Nor U/e4Lici&Lusi$0A.Bib I,M_<Mobi#Muab#PactP i=Plor Po}Prim Pu,0Carn C_d+Ci@ntCl( Colo!Dex Di-Duc%fEditEp%eExactF(iFlig Form Fusi$G  H= Hib Jec,Ju!No-ntOcu]Ond Scri!Sec&Sig[Soli&Sp* S%nctSul,TactT_<Ti?Trig)Tui%fU%#Vasi$V_,Vi,Voqu 3Oni^Rad>ReelRi,0O]2Oi!Res<:GuarIll*MbeNv>Rd(Ug U[Velot3Tab#T$UdiU[s<9Ind!N~ Ng]Ue'UissifUrn=Vi=Y|Ye{5Bi]Ge?ntNiorP$Ris&S%-Te{V_i#:Yak7M$oOs^:BelBi=Bo' C  Cto<Gu[I[Is}I% Mbe|Mel#MpeN-'Nga.N,[P(R.'R?Ur>VaboVo*3Ctu!G=G Gu?SsiveTt!V>Xi^Zard3As<B  B!C_-Cor[E.Ev!Gatu!Go,G)M Mi&M$a@Mpi@Neai!NgotOn-|Qui@S>eS,ThiumTi.Ttor=V!'5Gi^Inta(Is*MbricT +U UrdUt!UveY=5B+Ci@Cra%fE'Gub!Is/tM>eNai!NdiR$T,X){:Ch(eGas(G_taGi^Ig!Ill$In%_Ir+Is$Jor Lax Lefi-Lhe'Li-L#t&MmouthNda,Niab#Nqu/tN&|N)lRath$Rb!R~/dRdiRi%?R^'Rr$R&]Scot&SsifT +lT>eTra^Udi!Ussa@UveXim=3Ch/tC$nuDa`#Dec(Di,Du<Il#'L/.Lod+Mb!Moi!Nac N Nh*Ns$.NtorRc!diRi&R#Ssag Su!T=Teo!Tho@T>Ub#3Au]CrobeEt&Gn$Gr L+uLli$Mi^N-N =Nim=Nor Nu&Rac#Roi,Ssi#X&5Bi#D [El#{Ndi=Ni&'Nna+Not$eNst!Ntag[Nu?ntQ)'R-|Rsu!R% Te'TifU~eUf#Ul(Uss$Ut$Uv/t5L%p#Ni%$Ra`#Re[Rmu!Sc#SeumSic+nTa%$T T)l3Ria@R%l#S,eThi^:Ge'PpeRquoisRr Ta%$Ti$Tu!Ufra.U%^Vi!3Bu#{CtarFas&Ga%$Glig Goc>I.Rve{Ttoy Ur$eUtr$Veu3CheCkelTra&Ve|5B#CifCt'[Ir-'I<t&Ma@Mb!{Mm Rma%fTab#Tif>Toi!Urr*Uve|Va&'Vemb!Vi-5A.Anc I!Isib#M oP%=Q)Tri%f:0E*Jec%fLig Sc'S v Stac#T_*T' 0Casi$Cup E/Tob!Troy Tup]Ulai!0E'Or/t1F_}Fic>Fr*0Ive1Se|S`l$2Fac%fIv>0Bra.Ett!0Ct){Du]E!{Iri^1A#A^Er Ini$PortunPrim T Ti^1A.{An.Bi&D$n E`#G/eG)`Ifi-Ne?ntQ)T+0C`]Mo<Satu!0Ar+0Rag/Rs$T`Trag Vra.0A%$1Y@Y.[1O[:Isib#La-Lma!sLo'@Lp Na~eNdaNgol(Niqu N[|NoramaNt=$PayeP>Po,PyrusRadoxeR-l#Res<Rfum R]Ro#Rra(R<m Rtag Ru!Rv_*Ssi$S&^T [lT+n-Tr$V`l$Voi}Y Ysa.3Ig[Int!La.Lic/L#Lou<Lu~eNdu#Netr Nib#NsifN'+Pi&PlumRdrixRfor Rio@Rmu,Rp#xeRs`R&S Ta#TitTr*Up#2Ara$Ob+O^Ot$Ra<Ysi^0AnoCt'=E-Er!Euv!Lo&N-|Pet&Qu Rog)Sc(eSt$Vo,XelZza2AcardAf$dAis*An A^Astr$A&|E' ExusIa.OmbOng U+Uma.2Chet&Es+E&In&Ir>Iss$Iv!Lai!Lic>L#nLyg$eMma@Mp>Nct)lNd  NeyR%^Si%$S<d Stu!Tag Te|Ti$U-Ula(Um$Urp!Uss(Uvo*2A*+A%^Ec+{Edi!EfixeElu@EnomE<n-E&x&Evo*Imi%fIn-Is$Iv Ob#?O-d Odi.Of$dOg!sO+Oje,Olog)O?n Op!Osp eO&g O)s<Ov beU@n-U[|0Y~o<1BlicC $I}LpeLsarNai<Ni%fPit!Rif>Zz#3Rami@:99AsarE!l#Es%$Ietu@It,O%_t:C(eC$,D+{G$d(I@'Is(L_%rLl$.Mas}Pi@Sa.Tis}Vag V(Y$n 3Ac%fAg*Ali}Anim Cevo*Ci,Clam Col,Cru,Cu]Cyc]Dig Dou,Fai!F#xeForm Fra(Fu.G=+nGi$Gla.Gul>I, Je,Jou La%fLev L+fMar^Me@Mi<M$,Mpl*Mu NardNfortNif]N$c Ntr NvoiPl>Por,Pri<P%#Qu(S veS(e{Soud!SpectS,SultatTabl*T_*Ticu#Tomb Trac Uni$Uss*V/~eViv!Vol&Vulsif3Ches<De|E'Gi@Go]Nc Pos,Sib#S^T)lV=V>e5Che{M/-Mp!N-Nd(Se|S>Ta%fTorTu#U.U`#U#|U%[Y|?5B/BisCheEl#G){In Is<|S S%^3Th?:B]Bo,B!Co~eFariGes<Is*La@LiveL$Lu MediNc%$Ngl>Rcas?Rd(eT' Ug!nuUm$U,Uva.V/tV$n 1AlpelAnda#E]atEnarioEpt!HemaI_-Ind O!Ru%nUlp,1An-Cab#Ch Cou C!,Da%fDui!Ig['Jo'Lec%fMa(eMb]M_-M(=Na&'Nsib#N&n-Par Q)n-Re(R.ntR+{Rru!RumRvi-Sa?V*Vra.Xtup#3D =Ec#Eg Ff]G#Gn=L_-LiciumMp#Nc eNist!Ph$RopSmi^Tu 1I 3Ci=C#DiumIg[{LdatLe`Litu@Lub#Mb!M?`Mno]N@N.'N[t&No!Rc>R%rS+T%<Uc+{Udu!Uff#U#v UpapeUr-U%r Uv_*0Ac+{A%=Eci=H eIr=3Ab#A%$ErnumImulusIpu]RictUd+{Upe'Ylis&0Bli?BstratB%lBv_*C-sC!FfixeGg  Ive'Lfa&P bePpl>Rfa-Rica&R?n Rpri<Rs|tRv+Spect3LlabeMbo#Metr+Nap<NtaxeS&?:BacBl>C%#Il]L_tLism/L$n Mbo'Mi}Ngib#PisQu( Rd RifR%[S<TamiToua.UpeU!|X 3Mo(Mpo!lNa`#Nd!Ne'N*Nsi$Rm( R[Rrib#T(eX&2E?Eor+Erap+Orax0BiaE@Mi@Reli!Ro*SsuT/eT!Tub 5Bogg/L /tMa&Ni^N[|P$y?R~eRd!Rna@Rp`#R!ntR<Rt)TemU~ Urna.Us}X(e2Ac%$AficAgi^Ah*A(An~ Ava`Ef#Emp EsorEu`Ia.Ibun=Ico,Ilog+IompheIp]It' Ivi=Omb$eOncOpic=Oupe|2I#LipeMul&N[lRb(eTe'Toy Y|3Mp/Ph$Pi^R/:0Ues^9Ti?Tras$1Ani?If>I$I^Itai!Iv s3AniumBa(Tic/t0A.I[UelU!0I#Op+:Car?Cc(Gab$dG)Ill/tInc!Is<|Lab#Li<Ll$LveMpi!N`#Pe'R>Se{Ss=S&3C&'Det&Get=Hicu#InardLo-Nd!diN  Ng Ni?{Ntou<Rdu!R(Rn*RrouR}RtuSt$T /Tus&X/tX 3AducAn@Ctoi!D/.DeoG[t&G)'La(Lla.Naig!Ol$P eRe?ntRtuo<RusSa.Se'Si$S^{S)lT=Tes<Tico#Tr(eVa-Vipa!5Ca%$Gu I#Is(Itu!La`#Lc/L%g Lu?Ra-R&xT Ulo*Ya.Yel#:G$:3N$:Cht:3B!NithS&9Olog+";
const accents = "e7693&)U*o&)Ry^)*)W))))#X^))))@@)#Wf)m%)#!))AG)&IIAQIIIBIIHJNAgBIILIDJGo)))HIQIIIIA(IGgJHH(BIIxX#)Ou)@*IAAPIIIJHQJ)&QIQPYI(HYAQC%)!))QHJJ@)#)^f*^AXCJ))$%CP))%&m)u)@e^A#G#))W@!(IKK%!(I%))O@QA))@GG#e))))WHJIWh))my@IIBT^)!)HAYGETHI*))!QnUDG)))nBoKAC*HwyQh))$&)G&)UGO)G)))(BX#v**)%O,e7686)I))@)&)gdMP()))ud)p#L))I^FIHYdWG))D@DFV)QA)o%MyTh%*)Z)%)n(XANc^R)YS";
const checksum$2 = "0x51deb7ae009149dc61a6bd18a918eb7ac78d2775726c68e598b92d002519b045";
let wordlist$4 = null;
/**
 *  The [[link-bip39-fr]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangFr extends WordlistOwlA {
    /**
     *  Creates a new instance of the French language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langFr]] should suffice.
     *
     *  @_ignore:
     */
    constructor() { super("fr", words$2, accents, checksum$2); }
    /**
     *  Returns a singleton instance of a ``LangFr``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$4 == null) {
            wordlist$4 = new LangFr();
        }
        return wordlist$4;
    }
}

const data$2 = [
    // 4-kana words
    "AQRASRAGBAGUAIRAHBAghAURAdBAdcAnoAMEAFBAFCBKFBQRBSFBCXBCDBCHBGFBEQBpBBpQBIkBHNBeOBgFBVCBhBBhNBmOBmRBiHBiFBUFBZDBvFBsXBkFBlcBjYBwDBMBBTBBTRBWBBWXXaQXaRXQWXSRXCFXYBXpHXOQXHRXhRXuRXmXXbRXlXXwDXTRXrCXWQXWGaBWaKcaYgasFadQalmaMBacAKaRKKBKKXKKjKQRKDRKCYKCRKIDKeVKHcKlXKjHKrYNAHNBWNaRNKcNIBNIONmXNsXNdXNnBNMBNRBNrXNWDNWMNFOQABQAHQBrQXBQXFQaRQKXQKDQKOQKFQNBQNDQQgQCXQCDQGBQGDQGdQYXQpBQpQQpHQLXQHuQgBQhBQhCQuFQmXQiDQUFQZDQsFQdRQkHQbRQlOQlmQPDQjDQwXQMBQMDQcFQTBQTHQrDDXQDNFDGBDGQDGRDpFDhFDmXDZXDbRDMYDRdDTRDrXSAhSBCSBrSGQSEQSHBSVRShYShkSyQSuFSiBSdcSoESocSlmSMBSFBSFKSFNSFdSFcCByCaRCKcCSBCSRCCrCGbCEHCYXCpBCpQCIBCIHCeNCgBCgFCVECVcCmkCmwCZXCZFCdRClOClmClFCjDCjdCnXCwBCwXCcRCFQCFjGXhGNhGDEGDMGCDGCHGIFGgBGVXGVEGVRGmXGsXGdYGoSGbRGnXGwXGwDGWRGFNGFLGFOGFdGFkEABEBDEBFEXOEaBEKSENBENDEYXEIgEIkEgBEgQEgHEhFEudEuFEiBEiHEiFEZDEvBEsXEsFEdXEdREkFEbBEbRElFEPCEfkEFNYAEYAhYBNYQdYDXYSRYCEYYoYgQYgRYuRYmCYZTYdBYbEYlXYjQYRbYWRpKXpQopQnpSFpCXpIBpISphNpdBpdRpbRpcZpFBpFNpFDpFopFrLADLBuLXQLXcLaFLCXLEhLpBLpFLHXLeVLhILdHLdRLoDLbRLrXIABIBQIBCIBsIBoIBMIBRIXaIaRIKYIKRINBINuICDIGBIIDIIkIgRIxFIyQIiHIdRIbYIbRIlHIwRIMYIcRIRVITRIFBIFNIFQOABOAFOBQOaFONBONMOQFOSFOCDOGBOEQOpBOLXOIBOIFOgQOgFOyQOycOmXOsXOdIOkHOMEOMkOWWHBNHXNHXWHNXHDuHDRHSuHSRHHoHhkHmRHdRHkQHlcHlRHwBHWcgAEgAggAkgBNgBQgBEgXOgYcgLXgHjgyQgiBgsFgdagMYgWSgFQgFEVBTVXEVKBVKNVKDVKYVKRVNBVNYVDBVDxVSBVSRVCjVGNVLXVIFVhBVhcVsXVdRVbRVlRhBYhKYhDYhGShxWhmNhdahdkhbRhjohMXhTRxAXxXSxKBxNBxEQxeNxeQxhXxsFxdbxlHxjcxFBxFNxFQxFOxFoyNYyYoybcyMYuBQuBRuBruDMuCouHBudQukkuoBulVuMXuFEmCYmCRmpRmeDmiMmjdmTFmFQiADiBOiaRiKRiNBiNRiSFiGkiGFiERipRiLFiIFihYibHijBijEiMXiWBiFBiFCUBQUXFUaRUNDUNcUNRUNFUDBUSHUCDUGBUGFUEqULNULoUIRUeEUeYUgBUhFUuRUiFUsXUdFUkHUbBUjSUjYUwXUMDUcHURdUTBUrBUrXUrQZAFZXZZaRZKFZNBZQFZCXZGBZYdZpBZLDZIFZHXZHNZeQZVRZVFZmXZiBZvFZdFZkFZbHZbFZwXZcCZcRZRBvBQvBGvBLvBWvCovMYsAFsBDsaRsKFsNFsDrsSHsSFsCXsCRsEBsEHsEfspBsLBsLDsIgsIRseGsbRsFBsFQsFSdNBdSRdCVdGHdYDdHcdVbdySduDdsXdlRdwXdWYdWcdWRkBMkXOkaRkNIkNFkSFkCFkYBkpRkeNkgBkhVkmXksFklVkMBkWDkFNoBNoaQoaFoNBoNXoNaoNEoSRoEroYXoYCoYbopRopFomXojkowXorFbBEbEIbdBbjYlaRlDElMXlFDjKjjSRjGBjYBjYkjpRjLXjIBjOFjeVjbRjwBnXQnSHnpFnLXnINnMBnTRwXBwXNwXYwNFwQFwSBwGFwLXwLDweNwgBwuHwjDwnXMBXMpFMIBMeNMTHcaQcNBcDHcSFcCXcpBcLXcLDcgFcuFcnXcwXccDcTQcrFTQErXNrCHrpFrgFrbFrTHrFcWNYWNbWEHWMXWTR",
    // 5-kana words
    "ABGHABIJAEAVAYJQALZJAIaRAHNXAHdcAHbRAZJMAZJRAZTRAdVJAklmAbcNAjdRAMnRAMWYAWpRAWgRAFgBAFhBAFdcBNJBBNJDBQKBBQhcBQlmBDEJBYJkBYJTBpNBBpJFBIJBBIJDBIcABOKXBOEJBOVJBOiJBOZJBepBBeLXBeIFBegBBgGJBVJXBuocBiJRBUJQBlXVBlITBwNFBMYVBcqXBTlmBWNFBWiJBWnRBFGHBFwXXKGJXNJBXNZJXDTTXSHSXSVRXSlHXCJDXGQJXEhXXYQJXYbRXOfXXeNcXVJFXhQJXhEJXdTRXjdXXMhBXcQTXRGBXTEBXTnQXFCXXFOFXFgFaBaFaBNJaBCJaBpBaBwXaNJKaNJDaQIBaDpRaEPDaHMFamDJalEJaMZJaFaFaFNBaFQJaFLDaFVHKBCYKBEBKBHDKXaFKXGdKXEJKXpHKXIBKXZDKXwXKKwLKNacKNYJKNJoKNWcKDGdKDTRKChXKGaRKGhBKGbRKEBTKEaRKEPTKLMDKLWRKOHDKVJcKdBcKlIBKlOPKFSBKFEPKFpFNBNJNJBQNBGHNBEPNBHXNBgFNBVXNBZDNBsXNBwXNNaRNNJDNNJENNJkNDCJNDVDNGJRNJiDNZJNNsCJNJFNNFSBNFCXNFEPNFLXNFIFQJBFQCaRQJEQQLJDQLJFQIaRQOqXQHaFQHHQQVJXQVJDQhNJQmEIQZJFQsJXQJrFQWbRDJABDBYJDXNFDXCXDXLXDXZDDXsJDQqXDSJFDJCXDEPkDEqXDYmQDpSJDOCkDOGQDHEIDVJDDuDuDWEBDJFgSBNDSBSFSBGHSBIBSBTQSKVYSJQNSJQiSJCXSEqXSJYVSIiJSOMYSHAHSHaQSeCFSepQSegBSHdHSHrFShSJSJuHSJUFSkNRSrSrSWEBSFaHSJFQSFCXSFGDSFYXSFODSFgBSFVXSFhBSFxFSFkFSFbBSFMFCADdCJXBCXaFCXKFCXNFCXCXCXGBCXEJCXYBCXLDCXIBCXOPCXHXCXgBCXhBCXiBCXlDCXcHCJNBCJNFCDCJCDGBCDVXCDhBCDiDCDJdCCmNCpJFCIaRCOqXCHCHCHZJCViJCuCuCmddCJiFCdNBCdHhClEJCnUJCreSCWlgCWTRCFBFCFNBCFYBCFVFCFhFCFdSCFTBCFWDGBNBGBQFGJBCGBEqGBpBGBgQGNBEGNJYGNkOGNJRGDUFGJpQGHaBGJeNGJeEGVBlGVKjGiJDGvJHGsVJGkEBGMIJGWjNGFBFGFCXGFGBGFYXGFpBGFMFEASJEAWpEJNFECJVEIXSEIQJEOqXEOcFEeNcEHEJEHlFEJgFEhlmEmDJEmZJEiMBEUqXEoSREPBFEPXFEPKFEPSFEPEFEPpFEPLXEPIBEJPdEPcFEPTBEJnXEqlHEMpREFCXEFODEFcFYASJYJAFYBaBYBVXYXpFYDhBYCJBYJGFYYbRYeNcYJeVYiIJYZJcYvJgYvJRYJsXYsJFYMYMYreVpBNHpBEJpBwXpQxFpYEJpeNDpJeDpeSFpeCHpHUJpHbBpHcHpmUJpiiJpUJrpsJuplITpFaBpFQqpFGBpFEfpFYBpFpBpFLJpFIDpFgBpFVXpFyQpFuFpFlFpFjDpFnXpFwXpJFMpFTBLXCJLXEFLXhFLXUJLXbFLalmLNJBLSJQLCLCLGJBLLDJLHaFLeNFLeSHLeCXLepFLhaRLZsJLsJDLsJrLocaLlLlLMdbLFNBLFSBLFEHLFkFIBBFIBXFIBaQIBKXIBSFIBpHIBLXIBgBIBhBIBuHIBmXIBiFIBZXIBvFIBbFIBjQIBwXIBWFIKTRIQUJIDGFICjQIYSRIINXIJeCIVaRImEkIZJFIvJRIsJXIdCJIJoRIbBQIjYBIcqXITFVIreVIFKFIFSFIFCJIFGFIFLDIFIBIJFOIFgBIFVXIJFhIFxFIFmXIFdHIFbBIJFrIJFWOBGBOQfXOOKjOUqXOfXBOqXEOcqXORVJOFIBOFlDHBIOHXiFHNTRHCJXHIaRHHJDHHEJHVbRHZJYHbIBHRsJHRkDHWlmgBKFgBSBgBCDgBGHgBpBgBIBgBVJgBuBgBvFgKDTgQVXgDUJgGSJgOqXgmUMgZIJgTUJgWIEgFBFgFNBgFDJgFSFgFGBgFYXgJFOgFgQgFVXgFhBgFbHgJFWVJABVQKcVDgFVOfXVeDFVhaRVmGdViJYVMaRVFNHhBNDhBCXhBEqhBpFhBLXhNJBhSJRheVXhhKEhxlmhZIJhdBQhkIJhbMNhMUJhMZJxNJgxQUJxDEkxDdFxSJRxplmxeSBxeCXxeGFxeYXxepQxegBxWVcxFEQxFLXxFIBxFgBxFxDxFZtxFdcxFbBxFwXyDJXyDlcuASJuDJpuDIBuCpJuGSJuIJFueEFuZIJusJXudWEuoIBuWGJuFBcuFKEuFNFuFQFuFDJuFGJuFVJuFUtuFdHuFTBmBYJmNJYmQhkmLJDmLJomIdXmiJYmvJRmsJRmklmmMBymMuCmclmmcnQiJABiJBNiJBDiBSFiBCJiBEFiBYBiBpFiBLXiBTHiJNciDEfiCZJiECJiJEqiOkHiHKFieNDiHJQieQcieDHieSFieCXieGFieEFieIHiegFihUJixNoioNXiFaBiFKFiFNDiFEPiFYXitFOitFHiFgBiFVEiFmXiFitiFbBiFMFiFrFUCXQUIoQUIJcUHQJUeCEUHwXUUJDUUqXUdWcUcqXUrnQUFNDUFSHUFCFUFEfUFLXUtFOZBXOZXSBZXpFZXVXZEQJZEJkZpDJZOqXZeNHZeCDZUqXZFBQZFEHZFLXvBAFvBKFvBCXvBEPvBpHvBIDvBgFvBuHvQNJvFNFvFGBvFIBvJFcsXCDsXLXsXsXsXlFsXcHsQqXsJQFsEqXseIFsFEHsFjDdBxOdNpRdNJRdEJbdpJRdhZJdnSJdrjNdFNJdFQHdFhNkNJDkYaRkHNRkHSRkVbRkuMRkjSJkcqDoSJFoEiJoYZJoOfXohEBoMGQocqXbBAFbBXFbBaFbBNDbBGBbBLXbBTBbBWDbGJYbIJHbFQqbFpQlDgQlOrFlVJRjGEBjZJRnXvJnXbBnEfHnOPDngJRnxfXnUJWwXEJwNpJwDpBwEfXwrEBMDCJMDGHMDIJMLJDcQGDcQpHcqXccqNFcqCXcFCJRBSBRBGBRBEJRBpQTBNFTBQJTBpBTBVXTFABTFSBTFCFTFGBTFMDrXCJrXLDrDNJrEfHrFQJrFitWNjdWNTR",
    // 6-kana words
    "AKLJMANOPFASNJIAEJWXAYJNRAIIbRAIcdaAeEfDAgidRAdjNYAMYEJAMIbRAFNJBAFpJFBBIJYBDZJFBSiJhBGdEBBEJfXBEJqXBEJWRBpaUJBLXrXBIYJMBOcfXBeEfFBestXBjNJRBcDJOBFEqXXNvJRXDMBhXCJNYXOAWpXONJWXHDEBXeIaRXhYJDXZJSJXMDJOXcASJXFVJXaBQqXaBZJFasXdQaFSJQaFEfXaFpJHaFOqXKBNSRKXvJBKQJhXKEJQJKEJGFKINJBKIJjNKgJNSKVElmKVhEBKiJGFKlBgJKjnUJKwsJYKMFIJKFNJDKFIJFKFOfXNJBSFNJBCXNBpJFNJBvQNJBMBNJLJXNJOqXNJeCXNJeGFNdsJCNbTKFNwXUJQNFEPQDiJcQDMSJQSFpBQGMQJQJeOcQyCJEQUJEBQJFBrQFEJqDXDJFDJXpBDJXIMDGiJhDIJGRDJeYcDHrDJDVXgFDkAWpDkIgRDjDEqDMvJRDJFNFDJFIBSKclmSJQOFSJQVHSJQjDSJGJBSJGJFSECJoSHEJqSJHTBSJVJDSViJYSZJNBSJsJDSFSJFSFEfXSJFLXCBUJVCJXSBCJXpBCXVJXCJXsXCJXdFCJNJHCLIJgCHiJFCVNJMChCJhCUHEJCsJTRCJdYcCoQJCCFEfXCFIJgCFUJxCFstFGJBaQGJBIDGQJqXGYJNRGJHKFGeQqDGHEJFGJeLXGHIiJGHdBlGUJEBGkIJTGFQPDGJFEqEAGegEJIJBEJVJXEhQJTEiJNcEJZJFEJoEqEjDEqEPDsXEPGJBEPOqXEPeQFEfDiDEJfEFEfepQEfMiJEqXNBEqDIDEqeSFEqVJXEMvJRYXNJDYXEJHYKVJcYYJEBYJeEcYJUqXYFpJFYFstXpAZJMpBSJFpNBNFpeQPDpHLJDpHIJFpHgJFpeitFpHZJFpJFADpFSJFpJFCJpFOqXpFitBpJFZJLXIJFLIJgRLVNJWLVHJMLwNpJLFGJBLFLJDLFOqXLJFUJIBDJXIBGJBIJBYQIJBIBIBOqXIBcqDIEGJFILNJTIIJEBIOiJhIJeNBIJeIBIhiJIIWoTRIJFAHIJFpBIJFuHIFUtFIJFTHOSBYJOEcqXOHEJqOvBpFOkVJrObBVJOncqDOcNJkHhNJRHuHJuHdMhBgBUqXgBsJXgONJBgHNJDgHHJQgJeitgHsJXgJyNagyDJBgZJDrgsVJQgkEJNgkjSJgJFAHgFCJDgFZtMVJXNFVXQfXVJXDJVXoQJVQVJQVDEfXVDvJHVEqNFVeQfXVHpJFVHxfXVVJSRVVmaRVlIJOhCXVJhHjYkhxCJVhWVUJhWiJcxBNJIxeEqDxfXBFxcFEPxFSJFxFYJXyBDQJydaUJyFOPDuYCJYuLvJRuHLJXuZJLDuFOPDuFZJHuFcqXmKHJdmCQJcmOsVJiJAGFitLCFieOfXiestXiZJMEikNJQirXzFiFQqXiFIJFiFZJFiFvtFUHpJFUteIcUteOcUVCJkUhdHcUbEJEUJqXQUMNJhURjYkUFitFZDGJHZJIxDZJVJXZJFDJZJFpQvBNJBvBSJFvJxBrseQqDsVFVJdFLJDkEJNBkmNJYkFLJDoQJOPoGsJRoEAHBoEJfFbBQqDbBZJHbFVJXlFIJBjYIrXjeitcjjCEBjWMNBwXQfXwXOaFwDsJXwCJTRwrCZJMDNJQcDDJFcqDOPRYiJFTBsJXTQIJBTFEfXTFLJDrXEJFrEJXMrFZJFWEJdEWYTlm",
    // 7-kana words
    "ABCDEFACNJTRAMBDJdAcNJVXBLNJEBXSIdWRXErNJkXYDJMBXZJCJaXMNJaYKKVJKcKDEJqXKDcNJhKVJrNYKbgJVXKFVJSBNBYBwDNJeQfXNJeEqXNhGJWENJFiJRQlIJbEQJfXxDQqXcfXQFNDEJQFwXUJDYcnUJDJIBgQDIUJTRDJFEqDSJQSJFSJQIJFSOPeZtSJFZJHCJXQfXCTDEqFGJBSJFGJBOfXGJBcqXGJHNJDGJRLiJEJfXEqEJFEJPEFpBEJYJBZJFYBwXUJYiJMEBYJZJyTYTONJXpQMFXFpeGIDdpJFstXpJFcPDLBVSJRLHQJqXLJFZJFIJBNJDIJBUqXIBkFDJIJEJPTIYJGWRIJeQPDIJeEfHIJFsJXOqGDSFHXEJqXgJCsJCgGQJqXgdQYJEgFMFNBgJFcqDVJwXUJVJFZJchIgJCCxOEJqXxOwXUJyDJBVRuscisciJBiJBieUtqXiJFDJkiFsJXQUGEZJcUJFsJXZtXIrXZDZJDrZJFNJDZJFstXvJFQqXvJFCJEsJXQJqkhkNGBbDJdTRbYJMEBlDwXUJMEFiJFcfXNJDRcNJWMTBLJXC",
    // 8-kana words
    "BraFUtHBFSJFdbNBLJXVJQoYJNEBSJBEJfHSJHwXUJCJdAZJMGjaFVJXEJPNJBlEJfFiJFpFbFEJqIJBVJCrIBdHiJhOPFChvJVJZJNJWxGFNIFLueIBQJqUHEJfUFstOZJDrlXEASJRlXVJXSFwVJNJWD",
    // 9-kana words
    "QJEJNNJDQJEJIBSFQJEJxegBQJEJfHEPSJBmXEJFSJCDEJqXLXNJFQqXIcQsFNJFIFEJqXUJgFsJXIJBUJEJfHNFvJxEqXNJnXUJFQqD",
    // 10-kana words
    "IJBEJqXZJ"
];
// Maps each character into its kana value (the index)
const mapping = "~~AzB~X~a~KN~Q~D~S~C~G~E~Y~p~L~I~O~eH~g~V~hxyumi~~U~~Z~~v~~s~~dkoblPjfnqwMcRTr~W~~~F~~~~~Jt";
let _wordlist$2 = null;
function hex(word) {
    return hexlify(toUtf8Bytes(word));
}
const KiYoKu = "0xe3818de38284e3818f";
const KyoKu = "0xe3818de38283e3818f";
function toString(data) {
    return toUtf8String(new Uint8Array(data));
}
function loadWords$2() {
    if (_wordlist$2 !== null) {
        return _wordlist$2;
    }
    const wordlist = [];
    // Transforms for normalizing (sort is a not quite UTF-8)
    const transform = {};
    // Delete the diacritic marks
    transform[toString([227, 130, 154])] = false;
    transform[toString([227, 130, 153])] = false;
    // Some simple transforms that sort out most of the order
    transform[toString([227, 130, 133])] = toString([227, 130, 134]);
    transform[toString([227, 129, 163])] = toString([227, 129, 164]);
    transform[toString([227, 130, 131])] = toString([227, 130, 132]);
    transform[toString([227, 130, 135])] = toString([227, 130, 136]);
    // Normalize words using the transform
    function normalize(word) {
        let result = "";
        for (let i = 0; i < word.length; i++) {
            let kana = word[i];
            const target = transform[kana];
            if (target === false) {
                continue;
            }
            if (target) {
                kana = target;
            }
            result += kana;
        }
        return result;
    }
    // Sort how the Japanese list is sorted
    function sortJapanese(a, b) {
        a = normalize(a);
        b = normalize(b);
        if (a < b) {
            return -1;
        }
        if (a > b) {
            return 1;
        }
        return 0;
    }
    // Load all the words
    for (let length = 3; length <= 9; length++) {
        const d = data$2[length - 3];
        for (let offset = 0; offset < d.length; offset += length) {
            const word = [];
            for (let i = 0; i < length; i++) {
                const k = mapping.indexOf(d[offset + i]);
                word.push(227);
                word.push((k & 0x40) ? 130 : 129);
                word.push((k & 0x3f) + 128);
            }
            wordlist.push(toString(word));
        }
    }
    wordlist.sort(sortJapanese);
    // For some reason kyoku and kiyoku are flipped in node (!!).
    // The order SHOULD be:
    //   - kyoku
    //   - kiyoku
    // This should ignore "if", but that doesn't work here??
    /* c8 ignore start */
    if (hex(wordlist[442]) === KiYoKu && hex(wordlist[443]) === KyoKu) {
        const tmp = wordlist[442];
        wordlist[442] = wordlist[443];
        wordlist[443] = tmp;
    }
    /* c8 ignore stop */
    // Verify the computed list matches the official list
    /* istanbul ignore if */
    const checksum = id(wordlist.join("\n") + "\n");
    /* c8 ignore start */
    if (checksum !== "0xcb36b09e6baa935787fd762ce65e80b0c6a8dabdfbc3a7f86ac0e2c4fd111600") {
        throw new Error("BIP39 Wordlist for ja (Japanese) FAILED");
    }
    /* c8 ignore stop */
    _wordlist$2 = wordlist;
    return wordlist;
}
let wordlist$3 = null;
/**
 *  The [[link-bip39-ja]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangJa extends Wordlist {
    /**
     *  Creates a new instance of the Japanese language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langJa]] should suffice.
     *
     *  @_ignore:
     */
    constructor() { super("ja"); }
    getWord(index) {
        const words = loadWords$2();
        assertArgument(index >= 0 && index < words.length, `invalid word index: ${index}`, "index", index);
        return words[index];
    }
    getWordIndex(word) {
        return loadWords$2().indexOf(word);
    }
    split(phrase) {
        //logger.assertNormalize();
        return phrase.split(/(?:\u3000| )+/g);
    }
    join(words) {
        return words.join("\u3000");
    }
    /**
     *  Returns a singleton instance of a ``LangJa``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$3 == null) {
            wordlist$3 = new LangJa();
        }
        return wordlist$3;
    }
}

const data$1 = [
    "OYAa",
    "ATAZoATBl3ATCTrATCl8ATDloATGg3ATHT8ATJT8ATJl3ATLlvATLn4ATMT8ATMX8ATMboATMgoAToLbAToMTATrHgATvHnAT3AnAT3JbAT3MTAT8DbAT8JTAT8LmAT8MYAT8MbAT#LnAUHT8AUHZvAUJXrAUJX8AULnrAXJnvAXLUoAXLgvAXMn6AXRg3AXrMbAX3JTAX3QbAYLn3AZLgvAZrSUAZvAcAZ8AaAZ8AbAZ8AnAZ8HnAZ8LgAZ8MYAZ8MgAZ8OnAaAboAaDTrAaFTrAaJTrAaJboAaLVoAaMXvAaOl8AaSeoAbAUoAbAg8AbAl4AbGnrAbMT8AbMXrAbMn4AbQb8AbSV8AbvRlAb8AUAb8AnAb8HgAb8JTAb8NTAb8RbAcGboAcLnvAcMT8AcMX8AcSToAcrAaAcrFnAc8AbAc8MgAfGgrAfHboAfJnvAfLV8AfLkoAfMT8AfMnoAfQb8AfScrAfSgrAgAZ8AgFl3AgGX8AgHZvAgHgrAgJXoAgJX8AgJboAgLZoAgLn4AgOX8AgoATAgoAnAgoCUAgoJgAgoLXAgoMYAgoSeAgrDUAgrJTAhrFnAhrLjAhrQgAjAgoAjJnrAkMX8AkOnoAlCTvAlCV8AlClvAlFg4AlFl6AlFn3AloSnAlrAXAlrAfAlrFUAlrFbAlrGgAlrOXAlvKnAlvMTAl3AbAl3MnAnATrAnAcrAnCZ3AnCl8AnDg8AnFboAnFl3AnHX4AnHbrAnHgrAnIl3AnJgvAnLXoAnLX4AnLbrAnLgrAnLhrAnMXoAnMgrAnOn3AnSbrAnSeoAnvLnAn3OnCTGgvCTSlvCTvAUCTvKnCTvNTCT3CZCT3GUCT3MTCT8HnCUCZrCULf8CULnvCU3HnCU3JUCY6NUCbDb8CbFZoCbLnrCboOTCboScCbrFnCbvLnCb8AgCb8HgCb$LnCkLfoClBn3CloDUDTHT8DTLl3DTSU8DTrAaDTrLXDTrLjDTrOYDTrOgDTvFXDTvFnDT3HUDT3LfDUCT9DUDT4DUFVoDUFV8DUFkoDUGgrDUJnrDULl8DUMT8DUMXrDUMX4DUMg8DUOUoDUOgvDUOg8DUSToDUSZ8DbDXoDbDgoDbGT8DbJn3DbLg3DbLn4DbMXrDbMg8DbOToDboJXGTClvGTDT8GTFZrGTLVoGTLlvGTLl3GTMg8GTOTvGTSlrGToCUGTrDgGTrJYGTrScGTtLnGTvAnGTvQgGUCZrGUDTvGUFZoGUHXrGULnvGUMT8GUoMgGXoLnGXrMXGXrMnGXvFnGYLnvGZOnvGZvOnGZ8LaGZ8LmGbAl3GbDYvGbDlrGbHX3GbJl4GbLV8GbLn3GbMn4GboJTGboRfGbvFUGb3GUGb4JnGgDX3GgFl$GgJlrGgLX6GgLZoGgLf8GgOXoGgrAgGgrJXGgrMYGgrScGgvATGgvOYGnAgoGnJgvGnLZoGnLg3GnLnrGnQn8GnSbrGnrMgHTClvHTDToHTFT3HTQT8HToJTHToJgHTrDUHTrMnHTvFYHTvRfHT8MnHT8SUHUAZ8HUBb4HUDTvHUoMYHXFl6HXJX6HXQlrHXrAUHXrMnHXrSbHXvFYHXvKXHX3LjHX3MeHYvQlHZrScHZvDbHbAcrHbFT3HbFl3HbJT8HbLTrHbMT8HbMXrHbMbrHbQb8HbSX3HboDbHboJTHbrFUHbrHgHbrJTHb8JTHb8MnHb8QgHgAlrHgDT3HgGgrHgHgrHgJTrHgJT8HgLX@HgLnrHgMT8HgMX8HgMboHgOnrHgQToHgRg3HgoHgHgrCbHgrFnHgrLVHgvAcHgvAfHnAloHnCTrHnCnvHnGTrHnGZ8HnGnvHnJT8HnLf8HnLkvHnMg8HnRTrITvFUITvFnJTAXrJTCV8JTFT3JTFT8JTFn4JTGgvJTHT8JTJT8JTJXvJTJl3JTJnvJTLX4JTLf8JTLhvJTMT8JTMXrJTMnrJTObrJTQT8JTSlvJT8DUJT8FkJT8MTJT8OXJT8OgJT8QUJT8RfJUHZoJXFT4JXFlrJXGZ8JXGnrJXLV8JXLgvJXMXoJXMX3JXNboJXPlvJXoJTJXoLkJXrAXJXrHUJXrJgJXvJTJXvOnJX4KnJYAl3JYJT8JYLhvJYQToJYrQXJY6NUJbAl3JbCZrJbDloJbGT8JbGgrJbJXvJbJboJbLf8JbLhrJbLl3JbMnvJbRg8JbSZ8JboDbJbrCZJbrSUJb3KnJb8LnJfRn8JgAXrJgCZrJgDTrJgGZrJgGZ8JgHToJgJT8JgJXoJgJgvJgLX4JgLZ3JgLZ8JgLn4JgMgrJgMn4JgOgvJgPX6JgRnvJgSToJgoCZJgoJbJgoMYJgrJXJgrJgJgrLjJg6MTJlCn3JlGgvJlJl8Jl4AnJl8FnJl8HgJnAToJnATrJnAbvJnDUoJnGnrJnJXrJnJXvJnLhvJnLnrJnLnvJnMToJnMT8JnMXvJnMX3JnMg8JnMlrJnMn4JnOX8JnST4JnSX3JnoAgJnoAnJnoJTJnoObJnrAbJnrAkJnrHnJnrJTJnrJYJnrOYJnrScJnvCUJnvFaJnvJgJnvJnJnvOYJnvQUJnvRUJn3FnJn3JTKnFl3KnLT6LTDlvLTMnoLTOn3LTRl3LTSb4LTSlrLToAnLToJgLTrAULTrAcLTrCULTrHgLTrMgLT3JnLULnrLUMX8LUoJgLVATrLVDTrLVLb8LVoJgLV8MgLV8RTLXDg3LXFlrLXrCnLXrLXLX3GTLX4GgLX4OYLZAXrLZAcrLZAgrLZAhrLZDXyLZDlrLZFbrLZFl3LZJX6LZJX8LZLc8LZLnrLZSU8LZoJTLZoJnLZrAgLZrAnLZrJYLZrLULZrMgLZrSkLZvAnLZvGULZvJeLZvOTLZ3FZLZ4JXLZ8STLZ8ScLaAT3LaAl3LaHT8LaJTrLaJT8LaJXrLaJgvLaJl4LaLVoLaMXrLaMXvLaMX8LbClvLbFToLbHlrLbJn4LbLZ3LbLhvLbMXrLbMnoLbvSULcLnrLc8HnLc8MTLdrMnLeAgoLeOgvLeOn3LfAl3LfLnvLfMl3LfOX8Lf8AnLf8JXLf8LXLgJTrLgJXrLgJl8LgMX8LgRZrLhCToLhrAbLhrFULhrJXLhvJYLjHTrLjHX4LjJX8LjLhrLjSX3LjSZ4LkFX4LkGZ8LkGgvLkJTrLkMXoLkSToLkSU8LkSZ8LkoOYLl3FfLl3MgLmAZrLmCbrLmGgrLmHboLmJnoLmJn3LmLfoLmLhrLmSToLnAX6LnAb6LnCZ3LnCb3LnDTvLnDb8LnFl3LnGnrLnHZvLnHgvLnITvLnJT8LnJX8LnJlvLnLf8LnLg6LnLhvLnLnoLnMXrLnMg8LnQlvLnSbrLnrAgLnrAnLnrDbLnrFkLnrJdLnrMULnrOYLnrSTLnvAnLnvDULnvHgLnvOYLnvOnLn3GgLn4DULn4JTLn4JnMTAZoMTAloMTDb8MTFT8MTJnoMTJnrMTLZrMTLhrMTLkvMTMX8MTRTrMToATMTrDnMTrOnMT3JnMT4MnMT8FUMT8FaMT8FlMT8GTMT8GbMT8GnMT8HnMT8JTMT8JbMT8OTMUCl8MUJTrMUJU8MUMX8MURTrMUSToMXAX6MXAb6MXCZoMXFXrMXHXrMXLgvMXOgoMXrAUMXrAnMXrHgMXrJYMXrJnMXrMTMXrMgMXrOYMXrSZMXrSgMXvDUMXvOTMX3JgMX3OTMX4JnMX8DbMX8FnMX8HbMX8HgMX8HnMX8LbMX8MnMX8OnMYAb8MYGboMYHTvMYHX4MYLTrMYLnvMYMToMYOgvMYRg3MYSTrMbAToMbAXrMbAl3MbAn8MbGZ8MbJT8MbJXrMbMXvMbMX8MbMnoMbrMUMb8AfMb8FbMb8FkMcJXoMeLnrMgFl3MgGTvMgGXoMgGgrMgGnrMgHT8MgHZrMgJnoMgLnrMgLnvMgMT8MgQUoMgrHnMgvAnMg8HgMg8JYMg8LfMloJnMl8ATMl8AXMl8JYMnAToMnAT4MnAZ8MnAl3MnAl4MnCl8MnHT8MnHg8MnJnoMnLZoMnLhrMnMXoMnMX3MnMnrMnOgvMnrFbMnrFfMnrFnMnrNTMnvJXNTMl8OTCT3OTFV8OTFn3OTHZvOTJXrOTOl3OT3ATOT3JUOT3LZOT3LeOT3MbOT8ATOT8AbOT8AgOT8MbOUCXvOUMX3OXHXvOXLl3OXrMUOXvDbOX6NUOX8JbOYFZoOYLbrOYLkoOYMg8OYSX3ObHTrObHT4ObJgrObLhrObMX3ObOX8Ob8FnOeAlrOeJT8OeJXrOeJnrOeLToOeMb8OgJXoOgLXoOgMnrOgOXrOgOloOgoAgOgoJbOgoMYOgoSTOg8AbOjLX4OjMnoOjSV8OnLVoOnrAgOn3DUPXQlrPXvFXPbvFTPdAT3PlFn3PnvFbQTLn4QToAgQToMTQULV8QURg8QUoJnQXCXvQbFbrQb8AaQb8AcQb8FbQb8MYQb8ScQeAlrQeLhrQjAn3QlFXoQloJgQloSnRTLnvRTrGURTrJTRUJZrRUoJlRUrQnRZrLmRZrMnRZrSnRZ8ATRZ8JbRZ8ScRbMT8RbST3RfGZrRfMX8RfMgrRfSZrRnAbrRnGT8RnvJgRnvLfRnvMTRn8AaSTClvSTJgrSTOXrSTRg3STRnvSToAcSToAfSToAnSToHnSToLjSToMTSTrAaSTrEUST3BYST8AgST8LmSUAZvSUAgrSUDT4SUDT8SUGgvSUJXoSUJXvSULTrSU8JTSU8LjSV8AnSV8JgSXFToSXLf8SYvAnSZrDUSZrMUSZrMnSZ8HgSZ8JTSZ8JgSZ8MYSZ8QUSaQUoSbCT3SbHToSbQYvSbSl4SboJnSbvFbSb8HbSb8JgSb8OTScGZrScHgrScJTvScMT8ScSToScoHbScrMTScvAnSeAZrSeAcrSeHboSeJUoSeLhrSeMT8SeMXrSe6JgSgHTrSkJnoSkLnvSk8CUSlFl3SlrSnSl8GnSmAboSmGT8SmJU8",
    "ATLnDlATrAZoATrJX4ATrMT8ATrMX4ATrRTrATvDl8ATvJUoATvMl8AT3AToAT3MX8AT8CT3AT8DT8AT8HZrAT8HgoAUAgFnAUCTFnAXoMX8AXrAT8AXrGgvAXrJXvAXrOgoAXvLl3AZvAgoAZvFbrAZvJXoAZvJl8AZvJn3AZvMX8AZvSbrAZ8FZoAZ8LZ8AZ8MU8AZ8OTvAZ8SV8AZ8SX3AbAgFZAboJnoAbvGboAb8ATrAb8AZoAb8AgrAb8Al4Ab8Db8Ab8JnoAb8LX4Ab8LZrAb8LhrAb8MT8Ab8OUoAb8Qb8Ab8ST8AcrAUoAcrAc8AcrCZ3AcrFT3AcrFZrAcrJl4AcrJn3AcrMX3AcrOTvAc8AZ8Ac8MT8AfAcJXAgoFn4AgoGgvAgoGnrAgoLc8AgoMXoAgrLnrAkrSZ8AlFXCTAloHboAlrHbrAlrLhrAlrLkoAl3CZrAl3LUoAl3LZrAnrAl4AnrMT8An3HT4BT3IToBX4MnvBb!Ln$CTGXMnCToLZ4CTrHT8CT3JTrCT3RZrCT#GTvCU6GgvCU8Db8CU8GZrCU8HT8CboLl3CbrGgrCbrMU8Cb8DT3Cb8GnrCb8LX4Cb8MT8Cb8ObrCgrGgvCgrKX4Cl8FZoDTrAbvDTrDboDTrGT6DTrJgrDTrMX3DTrRZrDTrRg8DTvAVvDTvFZoDT3DT8DT3Ln3DT4HZrDT4MT8DT8AlrDT8MT8DUAkGbDUDbJnDYLnQlDbDUOYDbMTAnDbMXSnDboAT3DboFn4DboLnvDj6JTrGTCgFTGTGgFnGTJTMnGTLnPlGToJT8GTrCT3GTrLVoGTrLnvGTrMX3GTrMboGTvKl3GZClFnGZrDT3GZ8DTrGZ8FZ8GZ8MXvGZ8On8GZ8ST3GbCnQXGbMbFnGboFboGboJg3GboMXoGb3JTvGb3JboGb3Mn6Gb3Qb8GgDXLjGgMnAUGgrDloGgrHX4GgrSToGgvAXrGgvAZvGgvFbrGgvLl3GgvMnvGnDnLXGnrATrGnrMboGnuLl3HTATMnHTAgCnHTCTCTHTrGTvHTrHTvHTrJX8HTrLl8HTrMT8HTrMgoHTrOTrHTuOn3HTvAZrHTvDTvHTvGboHTvJU8HTvLl3HTvMXrHTvQb4HT4GT6HT4JT8HT4Jb#HT8Al3HT8GZrHT8GgrHT8HX4HT8Jb8HT8JnoHT8LTrHT8LgvHT8SToHT8SV8HUoJUoHUoJX8HUoLnrHXrLZoHXvAl3HX3LnrHX4FkvHX4LhrHX4MXoHX4OnoHZrAZ8HZrDb8HZrGZ8HZrJnrHZvGZ8HZvLnvHZ8JnvHZ8LhrHbCXJlHbMTAnHboJl4HbpLl3HbrJX8HbrLnrHbrMnvHbvRYrHgoSTrHgrFV8HgrGZ8HgrJXoHgrRnvHgvBb!HgvGTrHgvHX4HgvHn!HgvLTrHgvSU8HnDnLbHnFbJbHnvDn8Hn6GgvHn!BTvJTCTLnJTQgFnJTrAnvJTrLX4JTrOUoJTvFn3JTvLnrJTvNToJT3AgoJT3Jn4JT3LhvJT3ObrJT8AcrJT8Al3JT8JT8JT8JnoJT8LX4JT8LnrJT8MX3JT8Rg3JT8Sc8JUoBTvJU8AToJU8GZ8JU8GgvJU8JTrJU8JXrJU8JnrJU8LnvJU8ScvJXHnJlJXrGgvJXrJU8JXrLhrJXrMT8JXrMXrJXrQUoJXvCTvJXvGZ8JXvGgrJXvQT8JX8Ab8JX8DT8JX8GZ8JX8HZvJX8LnrJX8MT8JX8MXoJX8MnvJX8ST3JYGnCTJbAkGbJbCTAnJbLTAcJboDT3JboLb6JbrAnvJbrCn3JbrDl8JbrGboJbrIZoJbrJnvJbrMnvJbrQb4Jb8RZrJeAbAnJgJnFbJgScAnJgrATrJgvHZ8JgvMn4JlJlFbJlLiQXJlLjOnJlRbOlJlvNXoJlvRl3Jl4AcrJl8AUoJl8MnrJnFnMlJnHgGbJnoDT8JnoFV8JnoGgvJnoIT8JnoQToJnoRg3JnrCZ3JnrGgrJnrHTvJnrLf8JnrOX8JnvAT3JnvFZoJnvGT8JnvJl4JnvMT8JnvMX8JnvOXrJnvPX6JnvSX3JnvSZrJn3MT8Jn3MX8Jn3RTrLTATKnLTJnLTLTMXKnLTRTQlLToGb8LTrAZ8LTrCZ8LTrDb8LTrHT8LT3PX6LT4FZoLT$CTvLT$GgrLUvHX3LVoATrLVoAgoLVoJboLVoMX3LVoRg3LV8CZ3LV8FZoLV8GTvLXrDXoLXrFbrLXvAgvLXvFlrLXvLl3LXvRn6LX4Mb8LX8GT8LYCXMnLYrMnrLZoSTvLZrAZvLZrAloLZrFToLZrJXvLZrJboLZrJl4LZrLnrLZrMT8LZrOgvLZrRnvLZrST4LZvMX8LZvSlvLZ8AgoLZ8CT3LZ8JT8LZ8LV8LZ8LZoLZ8Lg8LZ8SV8LZ8SbrLZ$HT8LZ$Mn4La6CTvLbFbMnLbRYFTLbSnFZLboJT8LbrAT9LbrGb3LbrQb8LcrJX8LcrMXrLerHTvLerJbrLerNboLgrDb8LgrGZ8LgrHTrLgrMXrLgrSU8LgvJTrLgvLl3Lg6Ll3LhrLnrLhrMT8LhvAl4LiLnQXLkoAgrLkoJT8LkoJn4LlrSU8Ll3FZoLl3HTrLl3JX8Ll3JnoLl3LToLmLeFbLnDUFbLnLVAnLnrATrLnrAZoLnrAb8LnrAlrLnrGgvLnrJU8LnrLZrLnrLhrLnrMb8LnrOXrLnrSZ8LnvAb4LnvDTrLnvDl8LnvHTrLnvHbrLnvJT8LnvJU8LnvJbrLnvLhvLnvMX8LnvMb8LnvNnoLnvSU8Ln3Al3Ln4FZoLn4GT6Ln4JgvLn4LhrLn4MT8Ln4SToMToCZrMToJX8MToLX4MToLf8MToRg3MTrEloMTvGb6MT3BTrMT3Lb6MT8AcrMT8AgrMT8GZrMT8JnoMT8LnrMT8MX3MUOUAnMXAbFnMXoAloMXoJX8MXoLf8MXoLl8MXrAb8MXrDTvMXrGT8MXrGgrMXrHTrMXrLf8MXrMU8MXrOXvMXrQb8MXvGT8MXvHTrMXvLVoMX3AX3MX3Jn3MX3LhrMX3MX3MX4AlrMX4OboMX8GTvMX8GZrMX8GgrMX8JT8MX8JX8MX8LhrMX8MT8MYDUFbMYMgDbMbGnFfMbvLX4MbvLl3Mb8Mb8Mb8ST4MgGXCnMg8ATrMg8AgoMg8CZrMg8DTrMg8DboMg8HTrMg8JgrMg8LT8MloJXoMl8AhrMl8JT8MnLgAUMnoJXrMnoLX4MnoLhrMnoMT8MnrAl4MnrDb8MnrOTvMnrOgvMnrQb8MnrSU8MnvGgrMnvHZ8Mn3MToMn4DTrMn4LTrMn4Mg8NnBXAnOTFTFnOToAToOTrGgvOTrJX8OT3JXoOT6MTrOT8GgrOT8HTpOT8MToOUoHT8OUoJT8OUoLn3OXrAgoOXrDg8OXrMT8OXvSToOX6CTvOX8CZrOX8OgrOb6HgvOb8AToOb8MT8OcvLZ8OgvAlrOgvHTvOgvJTrOgvJnrOgvLZrOgvLn4OgvMT8OgvRTrOg8AZoOg8DbvOnrOXoOnvJn4OnvLhvOnvRTrOn3GgoOn3JnvOn6JbvOn8OTrPTGYFTPbBnFnPbGnDnPgDYQTPlrAnvPlrETvPlrLnvPlrMXvPlvFX4QTMTAnQTrJU8QYCnJlQYJlQlQbGTQbQb8JnrQb8LZoQb8LnvQb8MT8Qb8Ml8Qb8ST4QloAl4QloHZvQloJX8QloMn8QnJZOlRTrAZvRTrDTrRTvJn4RTvLhvRT4Jb8RZrAZrRZ8AkrRZ8JU8RZ8LV8RZ8LnvRbJlQXRg3GboRg3MnvRg8AZ8Rg8JboRg8Jl4RnLTCbRnvFl3RnvQb8SToAl4SToCZrSToFZoSToHXrSToJU8SToJgvSToJl4SToLhrSToMX3STrAlvSTrCT9STrCgrSTrGgrSTrHXrSTrHboSTrJnoSTrNboSTvLnrST4AZoST8Ab8ST8JT8SUoJn3SU6HZ#SU6JTvSU8Db8SU8HboSU8LgrSV8JT8SZrAcrSZrAl3SZrJT8SZrJnvSZrMT8SZvLUoSZ4FZoSZ8JnoSZ8RZrScoLnrScoMT8ScoMX8ScrAT4ScrAZ8ScrLZ8ScrLkvScvDb8ScvLf8ScvNToSgrFZrShvKnrSloHUoSloLnrSlrMXoSl8HgrSmrJUoSn3BX6",
    "ATFlOn3ATLgrDYAT4MTAnAT8LTMnAYJnRTrAbGgJnrAbLV8LnAbvNTAnAeFbLg3AgOYMXoAlQbFboAnDboAfAnJgoJTBToDgAnBUJbAl3BboDUAnCTDlvLnCTFTrSnCYoQTLnDTwAbAnDUDTrSnDUHgHgrDX8LXFnDbJXAcrETvLTLnGTFTQbrGTMnGToGT3DUFbGUJlPX3GbQg8LnGboJbFnGb3GgAYGgAg8ScGgMbAXrGgvAbAnGnJTLnvGnvATFgHTDT6ATHTrDlJnHYLnMn8HZrSbJTHZ8LTFnHbFTJUoHgSeMT8HgrLjAnHgvAbAnHlFUrDlHnDgvAnHnHTFT3HnQTGnrJTAaMXvJTGbCn3JTOgrAnJXvAXMnJbMg8SnJbMnRg3Jb8LTMnJnAl3OnJnGYrQlJnJlQY3LTDlCn3LTJjLg3LTLgvFXLTMg3GTLV8HUOgLXFZLg3LXNXrMnLX8QXFnLX9AlMYLYLXPXrLZAbJU8LZDUJU8LZMXrSnLZ$AgFnLaPXrDULbFYrMnLbMn8LXLboJgJgLeFbLg3LgLZrSnLgOYAgoLhrRnJlLkCTrSnLkOnLhrLnFX%AYLnFZoJXLnHTvJbLnLloAbMTATLf8MTHgJn3MTMXrAXMT3MTFnMUITvFnMXFX%AYMXMXvFbMXrFTDbMYAcMX3MbLf8SnMb8JbFnMgMXrMTMgvAXFnMgvGgCmMnAloSnMnFnJTrOXvMXSnOX8HTMnObJT8ScObLZFl3ObMXCZoPTLgrQXPUFnoQXPU3RXJlPX3RkQXPbrJXQlPlrJbFnQUAhrDbQXGnCXvQYLnHlvQbLfLnvRTOgvJbRXJYrQlRYLnrQlRbLnrQlRlFT8JlRlFnrQXSTClCn3STHTrAnSTLZQlrSTMnGTrSToHgGbSTrGTDnSTvGXCnST3HgFbSU3HXAXSbAnJn3SbFT8LnScLfLnv",
    "AT3JgJX8AT8FZoSnAT8JgFV8AT8LhrDbAZ8JT8DbAb8GgLhrAb8SkLnvAe8MT8SnAlMYJXLVAl3GYDTvAl3LfLnvBUDTvLl3CTOn3HTrCT3DUGgrCU8MT8AbCbFTrJUoCgrDb8MTDTLV8JX8DTLnLXQlDT8LZrSnDUQb8FZ8DUST4JnvDb8ScOUoDj6GbJl4GTLfCYMlGToAXvFnGboAXvLnGgAcrJn3GgvFnSToGnLf8JnvGn#HTDToHTLnFXJlHTvATFToHTvHTDToHTvMTAgoHT3STClvHT4AlFl6HT8HTDToHUoDgJTrHUoScMX3HbRZrMXoHboJg8LTHgDb8JTrHgMToLf8HgvLnLnoHnHn3HT4Hn6MgvAnJTJU8ScvJT3AaQT8JT8HTrAnJXrRg8AnJbAloMXoJbrATFToJbvMnoSnJgDb6GgvJgDb8MXoJgSX3JU8JguATFToJlPYLnQlJlQkDnLbJlQlFYJlJl8Lf8OTJnCTFnLbJnLTHXMnJnLXGXCnJnoFfRg3JnrMYRg3Jn3HgFl3KT8Dg8LnLTRlFnPTLTvPbLbvLVoSbrCZLXMY6HT3LXNU7DlrLXNXDTATLX8DX8LnLZDb8JU8LZMnoLhrLZSToJU8LZrLaLnrLZvJn3SnLZ8LhrSnLaJnoMT8LbFlrHTvLbrFTLnrLbvATLlvLb6OTFn3LcLnJZOlLeAT6Mn4LeJT3ObrLg6LXFlrLhrJg8LnLhvDlPX4LhvLfLnvLj6JTFT3LnFbrMXoLnQluCTvLnrQXCY6LnvLfLnvLnvMgLnvLnvSeLf8MTMbrJn3MT3JgST3MT8AnATrMT8LULnrMUMToCZrMUScvLf8MXoDT8SnMX6ATFToMX8AXMT8MX8FkMT8MX8HTrDUMX8ScoSnMYJT6CTvMgAcrMXoMg8SToAfMlvAXLg3MnFl3AnvOT3AnFl3OUoATHT8OU3RnLXrOXrOXrSnObPbvFn6Og8HgrSnOg8OX8DbPTvAgoJgPU3RYLnrPXrDnJZrPb8CTGgvPlrLTDlvPlvFUJnoQUvFXrQlQeMnoAl3QlrQlrSnRTFTrJUoSTDlLiLXSTFg6HT3STJgoMn4STrFTJTrSTrLZFl3ST4FnMXoSUrDlHUoScvHTvSnSfLkvMXo",
    "AUoAcrMXoAZ8HboAg8AbOg6ATFgAg8AloMXoAl3AT8JTrAl8MX8MXoCT3SToJU8Cl8Db8MXoDT8HgrATrDboOT8MXoGTOTrATMnGT8LhrAZ8GnvFnGnQXHToGgvAcrHTvAXvLl3HbrAZoMXoHgBlFXLg3HgMnFXrSnHgrSb8JUoHn6HT8LgvITvATrJUoJUoLZrRnvJU8HT8Jb8JXvFX8QT8JXvLToJTrJYrQnGnQXJgrJnoATrJnoJU8ScvJnvMnvMXoLTCTLgrJXLTJlRTvQlLbRnJlQYvLbrMb8LnvLbvFn3RnoLdCVSTGZrLeSTvGXCnLg3MnoLn3MToLlrETvMT8SToAl3MbrDU6GTvMb8LX4LhrPlrLXGXCnSToLf8Rg3STrDb8LTrSTvLTHXMnSb3RYLnMnSgOg6ATFg",
    "HUDlGnrQXrJTrHgLnrAcJYMb8DULc8LTvFgGnCk3Mg8JbAnLX4QYvFYHnMXrRUoJnGnvFnRlvFTJlQnoSTrBXHXrLYSUJgLfoMT8Se8DTrHbDb",
    "AbDl8SToJU8An3RbAb8ST8DUSTrGnrAgoLbFU6Db8LTrMg8AaHT8Jb8ObDl8SToJU8Pb3RlvFYoJl"
];
const codes$1 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
function getHangul(code) {
    if (code >= 40) {
        code = code + 168 - 40;
    }
    else if (code >= 19) {
        code = code + 97 - 19;
    }
    return toUtf8String(new Uint8Array([225, (code >> 6) + 132, (code & 0x3f) + 128]));
}
let _wordlist$1 = null;
function loadWords$1() {
    if (_wordlist$1 != null) {
        return _wordlist$1;
    }
    const wordlist = [];
    data$1.forEach((data, length) => {
        length += 4;
        for (let i = 0; i < data.length; i += length) {
            let word = "";
            for (let j = 0; j < length; j++) {
                word += getHangul(codes$1.indexOf(data[i + j]));
            }
            wordlist.push(word);
        }
    });
    wordlist.sort();
    // Verify the computed list matches the official list
    /* istanbul ignore if */
    const checksum = id(wordlist.join("\n") + "\n");
    /* c8 ignore start */
    if (checksum !== "0xf9eddeace9c5d3da9c93cf7d3cd38f6a13ed3affb933259ae865714e8a3ae71a") {
        throw new Error("BIP39 Wordlist for ko (Korean) FAILED");
    }
    /* c8 ignore stop */
    _wordlist$1 = wordlist;
    return wordlist;
}
let wordlist$2 = null;
/**
 *  The [[link-bip39-ko]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangKo extends Wordlist {
    /**
     *  Creates a new instance of the Korean language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langKo]] should suffice.
     *
     *  @_ignore:
     */
    constructor() {
        super("ko");
    }
    getWord(index) {
        const words = loadWords$1();
        assertArgument(index >= 0 && index < words.length, `invalid word index: ${index}`, "index", index);
        return words[index];
    }
    getWordIndex(word) {
        return loadWords$1().indexOf(word);
    }
    /**
     *  Returns a singleton instance of a ``LangKo``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$2 == null) {
            wordlist$2 = new LangKo();
        }
        return wordlist$2;
    }
}

const words$1 = "0torea noica!iosorolotaleratelanena%oiadoencotivomai t ca%a0A]Bagl'Bin#E.Is(Oli!Rasi_Rog#0Cade!C[$Cus#E <Hil,I@QuaReRil>Roba+U 0Ag'Deb{DomeEgu#Eri!IpeOtt&Ul&1Fabi,Fe|Fis(F-n Oris`O(R~$0AveEn.E_,Ganc'I!It&OnismoR>*Rume Uzzo4AbardaA Bat)Ber#BoBumeCeCol>E|<FaGeb-Ian.IbiIm[ Lag#Leg)Lie_Lo@/Lusi_Me$Oge$Pa}Pest!Ta,=Ter$T%c'T)veUn$Veo*Z&0Alga`Ani+A!=B{Br#EbaEr~E^s+I]Mas(M[daMir&Mon{O!P'Pli&U, 0A}r@Ag-feAlis+Arch?At-CaCel/Co-D&D!aEl*Ge*Gol&Gus I`Neg&Nid#NoNunc'OnimoT%ipoZi1At>Ertu-OdePari!Pe^ Pogg'P)@Pun Ri,1Ab~AchideAgos+Ald~Anc'Atu-AzzoBit)Chiv'D{Eni,G[ Gi<Gu IaMon?NeseRed#RingaRos S[>SoTef%eZil*0Ciu|Col EpsiEtt>Fal I$O/Pir#P)Sagg'SeSolu Sur@TaT[u T%eT-|0Av>EismoOm>O$TesaTiv&Tor$Tr{Tua,0Sil'Str?Tis+To$moTun$0Anz#E!V[i!Vi(Volge!3Io<O ZimoZur):Be,C}$Ci$CoDessaDi/+Gn#I+L]<L@Le=L/+Lza$Mbi$Ndi!RaondaRba)R}R{$RlumeRoc]Sil>S(Tos+Ttu U,VaVosa3C]FfaLg'LvaNdaNe_,Nig$Nzi=ReRli=Ta3Bi+CiDo<Fi@GaLanc?MboNo]*O*goPedePol&Rban.R-S]|Ses S$n$Son.SturiZzar)2An@At+2Ll{Nif>R@S]Tan>T^$Zzo*2Acc'AdipoA`An}Avu-E.l/Eve|EzzaIgl?Il/n.Ind&Oc]*O@Onzi=Ul*U$2Bbo<CaDi$Ffo<IoLboO$R*<R-s}S(/S+:De|Du]La`)L]*LesseLib)LmoLor?MbusaMe-+M%?Mmi$Mo/Mpa,NapaNde/NeNi$No|N^=PacePel*P{*Pogi)Ppe)P-Psu/RapaceR}ssaR@Ris`Rova=R!|R li=Sacc'S}+Ser`SoS(<S.l*Sua,Tas+Te=T-meU Vil*3Dibi,D-+Fa*Leb!Llul&NaNo<N.simoRam~Rc&R RumeRvel*So?SpoTo2E/Ia)Ic}Iede!Ime-I=IrurgoI+r-0AoClismoFr&G$Lind)O|*R}R)siTr>T+di$UffoVet+Vi,2Ass>In~O)2C]Dar@D%eE!n.G$meLl&Lm#Lo!Lpo(L^v#LzaMaMe+M`n@Mo@Mpu.rMu<Nci(Ndur!Nfer`Ngel&NiugeN<s(Nosce!NsumoN^nuoNveg$Per P'<Pp?Pr~poRazzaRda+R%#Rn%eRol/RpoR!@Rs?R.seSm>S+n.Ttu-V#2A.!Avat+E#Ede!Emo(Esci+E+Ice I=,IsiIt>OceO=}Os++Uc?,Us}2Ci!Cu*Gi$Ll#Po/R#!R(!R_Sci$S de:DoI$L`+Meri$Nie/N$(Nz&T#Van^Vve)3Bu|C[n'Ci(Cli$Col*C! D%#Fin{FormeG$Leg&Lfi$Lir'L+M[zaNot#Nt)Pos{Rapa+Riv&RogaScri|Ser Sider'Sume!Tersi_Vo 3Amet)Cemb!Ed)Fe(Ffu(Geri!Gi+,Luv'Nam>N=nziPin P*`Po*Rad&ReRo|RupoSag'Sc! Sf&Sge*Spos S+nzaSu`$ToVa$Vel Vide!Vor#5B*<C[.Ga=,G`LceM#M[~Min&N@*NoRmi!TeT !Vu Zzi=2AgoUi@2Bb'Bit&Ca,NaOmoPl%eRatu):0A$0Ces(CoLissiO$m?0E-I]/I,I r?Uc&2Emon?LiOismoReg'4Abor#Argi!Egan.Enc#E|Ev&F>I}MoSaU(0An#B,`Es(I)O^_Oz'<Pir>U*0Dem>Du)Erg?FasiO.}Tr&Zi`1A^.I*goI(d'O},Pu!0U#!0Ar'BaBo(EdeEmi+Ige!Met>OeOsi_Ran.0Ago$AmeAnimeAudi!CaEmp'Erc{Ib{Ig[.Is.!I OfagoOrt#O(Pan(P!s(S[zaSoTe(Tim&Ton?T)(Ult&0Il>N>Rus]To0ClideoRopa0A(Id[zaIt#Olu Viva:Bbr~Cc[daChi)L]Migl?Na,Nfa-NgoN+s`ReRfal/Ri$(R`]Sc?S (Sul*T%&ToVo*(3Bb!Co/DeG#LpaLt)Mmi=Nde!Nome$Rm[ R)R^,Ssu-S^_T+U@3AbaDuc?FaGur#LoNanzaNest-Ni!O!S},S>Ume2A]<Am[]EboEm`Ori@U[.Uo)2B>Cacc?Co(Der#Gl'La+Lc*!Lgo!Nd[.Net>N?N+=Rb{Rchet+Res+Rm~R='RoR.zzaRz&Sf#S(2A}s(A=Assi$A.l*Eccet+E=+Es]IgoOlli$OndeUga,Ut+2Ci/+Cs?Gg[.Lmi<L_Man.Me|Mo(NeNz'<O]RboRgo<Ro!SoTi,:Bb?$FfeLa.oLli=LoppoMbe)M`Ranz?RboRofa$Rzo<S@|Sol'Str>T Ud'ZeboZzel/3CoLa^=L(Mel*Mm#NeN{!N='No^poRgo2Epar@Iacc'Isa0Al*LdaNep)Oc&Oiel*Or$OveR#Ro<T++Udiz'Ur#Us 2Obu*U^<1Omo0BbaLfM{Mmo<Nf'N=Ver$2Aci,A@Af>AmmoAndeAtt&A_(Az?E}EggeIfo<Ig'InzaOt+Uppo2Adag$A'An Ard&FoId&::0Ern#0O=0Ent>Ill'O*RaR>Roge$2Ie<Na)Nor#4A!Le(Log>Lude!0Bal*Bevu Boc]Bu Ma<Mer(Mol#Pac]Pe PiegoPor P)n+0Al&Arc&At^_Can C[d'Chi$Cisi_Clu(Cont)C)c'CuboDagi<D?Do,Ed{Fat^Fil&Fli|Gagg'Geg$G,seGor@G)s(Nes]O@!Oltr&Ond#Sa$Se|SiemeSonn?Suli=Tas#Te)To=]Tu{Umidi!Vali@VeceV{1Erbo,Not>O.siP~1IdeLandaOn>Rig#Ror&0Ol#O poTer>Titu Tr%e0Al?Er&:::Bb)Birin C}Cer#Cri`Cu=D@veGoMpoNcet+N.r=R@(RgaRingeSt-T[zaTi$TtugaVag=Vo)3Ga,Gge)MboN.zzaNzaO<P!Si_Ss#S T.-,VaVig#3Be)DoEv{L/Matu-Mit&Mpi@Ne&NguaQui@RaR~S}TeTig'V!a5CandaDeG~Mb&Nd-Nge_QuaceR[zoToT.r?5CeCid#Ma}Mi$(NgoPoPpo*SingaS(T :Cab)Cchi=Ce)Cin#Da`G>Gl?G<.G)Iol~LafedeLg-@Lin.(Lsa$L Lumo!NaNc?N@r/Ngi&Nifes N=)Nov-NsardaN^deNubr'PpaR#=Rci!Ret+RmoRsup'Sche-Ssa?S^$Te-s(Tr>/T <Tu)Zur}3And)C}n>Ce=.DesimoDit&GaLassaLisLod?NingeNoN(/Rcur'R[daR*Schi$SeSse!S *Tal*To@T.!3Agol&CaCel'Che,C)boDol*E,Gl'!La$Li.MosaNe-,NiNo!Ri$R^l*Sce/SsivaS Sur&TezzaTig&T-T.n.4Emon>0Del*Dif~Du*Ga$G'LeLos(Nas.)N]Ndi=Ne+r'Ni,No $N(<Nt#Nvi(RaRde!Rs%#St)Tiv#TosegaT V[zaVim[ Zzo5C}CosaFfaGhe|G='La|Li<l*L^p*Mm?N Ove!Ra,SaS]*S~Te_,To:BabboF+Nomet)Rci(R%eRr#Sce!Str&Tu-,Ut~Vigl'3Bu*saC)siGa^_Goz'Mme$Ofi+Re|R_Ssu$Ttu$Ut-,VeV)t>3Cch?NfaTi@5Bi,Ci_DoMeMi=Rd>R`,RvegeseSt-$T&Tiz?Ttur$Vel/5C,oL/Me)O_Tri!Vo/Z?,:Si0Bedi!BligoElis]L'O*So, 0Cas'<Ch'Cid[.Cor!!Cult&RaUl#0Ier$Or&1Fer+Fri!Fusc#0Ge|GiNu$4AndeseFa|I#IvaOg-m`T!0Agg'Bel>B-EgaIss'<0Do(E!IceNi_)O!_,Ta1Er#In'<Pos 1A]*AfoDi<Ecchi$Ef%eFa$Gan>Igi<Izzon.MaMegg'Na^_O*g'R[@Ribi,T[s?T~Za+Zo0A!Cur&MosiPeda,Pi.SaSid&Ta]*Te0I.ReTago$TimoTob!1A,EstI$Ipa)Oc{UnqueVi&3Io:Cche|CeCif>Del/D)<EseGaGi=Lazzi=Les&Lli@LoLudeN@)N<l*O*O=zzoPr~Rabo/Rcel/Re!Rgo*RiRl#Ro/R^!Rv[zaRz?,Ssi_St%}Tac}To*g?TtumeVo<3Cc#Dal&Do=,Gg'Lo(N&Nd%eNi(/Nnu Nomb-Ns&N /PePi+Rbe<R]r(R@n#Rfor&Rgame=R'@Rmes(R$Rp,s(Rsua(Rtug'Rva(S#!Sis+SoS^fe)Ta*T^<Tu/n.Zzo3Ace!An+At^$Cci$CozzaEgaEt-Ffe)G?`Gol'G)LaLife)L*/Lo+Mpan.Ne+N=No*Ogg?OmboRamideRet>Ri.RolisiTo<Zz>2AceboAn&As`A+$E=r'2ChezzaDe)(DismoEs?Ggi&L[+Ligo$Ll%eLmoni.Lpet+L(Lt)=Lve!M%eMo@)N.Po*(Rfi@Ro(Rpo-R!R++SaSi^_Sses(Stul#Tass'Te!2AnzoAssiAt~Eclu(Ed~Efis(Egi#Elie_Eme!E$t&Epar#Es[zaE.s Eval(I`IncipeIv#Ob,`Ocu-Odur!OfumoOge|OlungaOmessaO$meOpos+O)gaO.(OvaUd[.Ug=Ur{0Iche1Bbl>D~Gil#G$LceL{Lsan.Nt&PazzoPil/Ro:99Ad)Al]saAsiE!/O+:C]l D@pp'D~,Dun#Ff~GazzoG'<G$Mar)MingoMoNdag'N l&P#Pi=Pp!(Satu-Schi#S[.Sseg=St!l*TaVvedu 3A,Cepi!Cin Clu+Cond{Cupe)Dd{Dime!Gal#Gist)Go/G!s(Laz'<M&Mo N=Pl~Prime!Put&SaSid[.Spon(S+u)TeTi=Tor~T^f~Voc#3Assun Badi!Bel,B!zzoCar~C]Ceve!C%l#Cor@C!du D>*Dur!Fas&F,s(For`Fug'G&Gett#Ghel*Lass#Lev#Ma<!MbalzoMed'Morch'Nasci+N})NforzoN$_Nom#Nsav{N c]Nunc?Nv[i!Par#Petu Pie$Port&P!saPuli!Sa+Sch'ServaSibi,SoSpe|S )Sult#S_l Tar@Teg$Tm>T)_Un'<VaVer(Vinci+Vol Zo`5BaBot>Bus Cc?CoDagg'De!D{!G{Ll'Mant>Mpe!Nz'Sol&SpoTan.Ton@Tu/Vesc'5BizzoBr~GaLli$Mi<Mo)(O*PeSs&St>:B#Bbi&Bot#Go`Las(Ldatu-Lgem`Liv&Lmo<Lo<Lt&Lu L_Pe!Pi@Por{Race$R}smoR S((Telli.Ti-Tol*Tur$Va=V'Zi#0Adigl'AlzoAnc#Ar-At.!Av&End&Irci&Locc#Occi#Rin&Ruffo<Uff&0Ab)(Ad[zaA/Ambi&Anda*Apo/Ar(A.n&Av#El En>Ett)HedaHie=IarpaI[zaInde!IppoI)ppoI_*Ler&Odel/Olp{Ompar Onfor Opri!Or+Os(<OzzeseRibaRoll&Ru^n'Uder?Ul !Uo/U)Us&0Ebit&Ogan&0C}tu-Con@Da$Gg'/G=l#G!g#Gu{Lci#Let^_L/Lvagg'Mafo)Mbr&MeMin#Mp!N(N^!Pol Qu[zaRa+Rb#Re$R'Rp[.R-gl'Rvi!S^=To/T^`=0Ace*Ald&Am#Arzo(At%#E-IdaIl#IngeOc#Oder&OgoOl^!Orz#Ra|Rutt#Ugg{Um&U(0Abel*Arb#Onfi&Orb'Rass#Uar@1Bi*C]meEr-G/G$!L[z'L/baMbo*Mpat>Mul#Nfon?Ngo*Nist)NoN.siNu(idePar'S`S ,Tu#2It+Ogatu-Ove$0Arr{Emor#En^ E-l@IlzoOnt&Ott#Uss#0Elli!Erv#O@0BbalzoBr'C]r(C?,Da,Ffi|G$Ld#L[<Li@L/zzoLoLubi,Lv[.Mat>M`NdaNe|Nnife)Pi!Ppe(P-Rge!Rpas(Rri(R(R.gg'R_l#Spi)S+T^,0AdaAl/Arge!A /Av[ Azzo/EcieEdi!Eg<!E/tu-E-nzaEs(!Ett-,Ezz#IaIgo*(Ill#I$(I-,L[di@Or^_O(RangaRec&Ron#RuzzoUn^$0Uil*0Ad%&O l#1Abi,Ac]AffaAgn&Amp#Ant'Arnu Ase-Atu E*EppaErzoI,|I`IrpeIva,Izzo(On#Or>RappoReg#Ridu*Rozz&Ru|Ucc&UfoUp[@0B[t)C](Do!Gger{GoL+$On&PerboPpor Rgel#R)g#Ssur)Tu-0Ag&EdeseEgl'El&Enu Ez?IluppoIs+Izze-Ol+Uot&:Bac]Bul#Cci&Citur$LeLis`$Mpo<Nni$RaRdi_Rg#RiffaRp&R+rugaS Tt>Ver=Vo/+Zza3CaCn>Lefo$Me-r'MpoMu N@<Ne)Ns'<N+]*O!`RmeR-zzoRze|SiSser#St#T)T ?3F&Gel/Mb)N P>Pog-foRagg'RoTan'To*Tuban.Z'Zzo<5Cc&L,r&L Mbo/MoNfoNsil/Paz'Po*g?PpaRbaRn&R)<R -S}$Ssi!S+tu-Ta$2Aboc]AcheaAfi/Aged?Alc'Amon Ans{Apa$Ar!As*]Att#AveEcc?Emol'Espo*Ibu Iche]Ifogl'Il*InceaIoIs.zzaItur#Ivel/OmbaO$OppoO|/Ov&Ucc#2Batu-Ff#Lipa$Mul Nis?Rb&Rchi$TaTe/:0Ic#0Cel*Ci(!0I!I^_1FaF%'0Ua,4IsseTim#0A$I,Orismo0Ci<|Ge!Ghe!seI]r$If%#I($I+r'Te0Vo0Upa1Aga$G[zaLo0AnzaA C{Ig$*U-'0Ensi,IlizzoOp?:Can.Ccin#Gabon@Gli#LangaLgoL>L,t+Lo)(Lut&L_/Mpa+Ng&N{(NoN+gg'Nve-Po!Ra$Rc#R?n.S}3Det+DovaDu Ge+,I]*Lc)Li=Llu LoceN#Ndemm?N RaceRba,Rgog=Rif~RoRru}Rt~,Sc~Ssil*S+,Te-$Tri=Tus 3Andan.B-n.C[daChingoCi=nzaDim&Gil?G< Go!LeL/$MiniNc{!O/Pe-Rgo/Ro*goRu,n S](S'<SpoSsu Su-TaTel*T^`VandaVi@Zi&5CeGaLa^,Le!LpeRagi<5L}$::::Mpog=N=Pp#T.-Vor-3Fi)Lan.LoNze)Rbi$3Be|N]R]<T 5L/T>5Cche)Fo*LuPpa";
const checksum$1 = "0x5c1362d88fd4cf614a96f3234941d29f7d37c08c5292fde03bf62c2db6ff7620";
let wordlist$1 = null;
/**
 *  The [[link-bip39-it]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangIt extends WordlistOwl {
    /**
     *  Creates a new instance of the Italian language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langIt]] should suffice.
     *
     *  @_ignore:
     */
    constructor() { super("it", words$1, checksum$1); }
    /**
     *  Returns a singleton instance of a ``LangIt``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist$1 == null) {
            wordlist$1 = new LangIt();
        }
        return wordlist$1;
    }
}

const words = "0arad!ototealirertainrasoent hoandoaR#riareha!aroele'oronul0Aca%AixoAl A%rDuz'El]Er$IsmoO$ R<g(Revi Rig Rup$S*$Solu$Sur=Ut[0Ab#Alm Amp Anh A,Ei.El( En ErvoEss E$naHa.IdezImaI}#Irr Lam LiveOlhidaOmod Opl Ord Um~ Us?0Ap.EgaEnt_Ep$Equ Er-%EsivoEusI<%ItivoJetivoJun$M' Or Qu''UboV(,Vog#0R}ave0As.Er'EtivoIn?Iv` Li$Lu-%R}.0Ach Arr As&/Enci Iliz Io)It#O+R! Res%Rup U d Ul]2O`h Ud Us.1AmedaArmeAstr Av<caB(gueB*oCat+De@EcrimEgr@Er.FaceF*e%GumHeioI Ica%I- Inh Ivi Mof^Oc Pis%T( TitudeUc* Ug UnoUsivoVo0Aci A=rA[loAss BasBi-%EixaEniz I=Is$,Iz!eOl?On$ O_,Ost+P  Pli Pola0Ag+maAlis Arqu@A$m@DaimeElExoG~ Im JoOm&@Ot#Sio,T(i|Uid!eUnci Zol1Ag?Alp Anh#EgoEli=Ert^Es Eti%I$Lau,Lic^OioOn.Os)R-dizRov 0Uec(0AmeAn]A+C^D-%E@Ej Eni$Es)Gilo,GolaMaQuivoRai&Reba%Risc Rob>um S-&T(i&TigoVo[=0F&.Il#P' S?S* So&/Sun$Tr&0Ac#Adu+Al/A[f E End(Er_EuIng'Ir?IvoOl{oRac Revi=RizU&Um0Di$rM-.R>o+TismoT|@Tu 0Ali An%Ar@Ent&Es,I?Is Ul,1Ila1Ar E=Ei%Ulejo:B BosaC&]uCh `C@GagemI<oIl I}e)Ir_Ixis)J~ Le@LizaLsaN&Nd{aN/N'Nque%Ra$Rb#R}es>+c>~/Se#S)n%Ta)Te=rTidaTomTuc Unil]3B(IjoIr^IsebolLd!eLezaLgaLisc Ndi$Ng&aNz(RimbauRl*d>_Sou_XigaZ(_3CoCu=En&Foc&Furc G|naLhe%Mest[Mo$rOlog@OmboOsf(aPol Rr-$Scoi$Sne$SpoSsex$TolaZ _2Ind#OcoOque 2A$BagemC#CejoChec]Ico.L^LetimL]LoMb{oNdeNecoNi)Rb~h>d>e&R+c]V*oXe?2AncoAsaAvezaEuIgaIl/Inc OaOchu+Onze O$Uxo2C]DismoF LeRacoScaS$Z*a:B<aB`oBideBoBri$CauCet^C/r_CiqueDast_De#Fez&IaqueIp'aIxo%J#JuLafrioLc~ Ld{aLibr Lm<%Lo)M^Mbis)MisaMomilaMp<]Mufl Navi&Nc` Ne)NguruN/$Nive%NoaNs#N.Nu=Pac/P`aP* Po.Pric/Pt?PuzRacolRb}oRde&Rec>imb Rn{oRpe%R['>)zRv&/SacoScaSeb[S%loS~oT a)Tiv UleUs?U%l V&oV(na3BolaDil]G}]Lebr L~ Nou+N,N%ioRc Rr#R%'oRvejaTimV^2Aco)Al{aAm#Ap^ArmeAticeAveEfeEg^E'oEqueIco%If[In`oOc&/Ov(UmboU.Uva0CatrizCl}eD!eD['aEn%G<aM-$N$Nz><d>cui$Rurg@T 2A[zaE_Ic OneUbe2A=Ag'Ba@B($rBr C^El/Ent_E,Gum`oIb'IfaIo%L L{aLh(Lid'Lme@L}oLunaM<=Mb* M-.MitivaMov(MplexoMumNc]N=rNec.Nfu,Ng` Nhec(Njug Nsum'Nt+$Nvi%Op( P{oPi?PoQue%lRagemRdi&Rne)R}h>p|&R[ioR%joRuj>voSs-oS%laT}e%U_UveVilZ*]2A%+AvoEcheE=rEmeErEspoI^Im*&Io~oIseItic Os)UaUz{o2B<oEcaId#JoLat+Lm* Lp Ltu+Mpr'Nh#Pi=RativoRr&Rs R$Sp'S% T`o:MascoT 3Ba%rBi.BocheB~h C&queCim&CliveCo%C[.D&Dic#Duz'FesaFum G`oG+uGus.It#Ix La$rLeg#L*e L}gaM<daMit'Moli=Ntis)P-#Pil PoisP[ssaPur Riv>+m SafioSbo.Sc<,S-/Sfi#Sgas%Sigu&SlizeSmam SovaSpesaS)queSvi T&h T-$rT} Tri$UsaV(Vi=Vot#Z-a3Ag+maAle$Da)Fu,Gi.Lat#Lu-%M*u'Nast@Nh{oOceseRe$Sc[)Sf ceSp oSque%Ssip S)n%T?UrnoV(,Vi,rV~g Z(5Br?L|i=M?M*#NativoNz`>m-%Rs&SagemUr#U$r2EnagemIbleOg @2El EndeE$PloQues><%Vi=,:1Lod'O Olog@0Ific It&Uc#1Ei$Etiv 3E.1Ab| Eg(Ei$rEncoEv?Im* Ogi 0B goBol#Br~/Buti=EndaErg'Is,rPat@P-/P*#Polg P[goPurr Ul?0CaixeC-#Ch-%C}t_Deus Doss Faix Fei%FimGaj#G-/Glob Gom#G+x Gu@Jo La.Qu<$Raiz Rol#Rug SaioSe^S*oSop#T<$Te#Tid!eT|.Tr^T~/V(g Vi#Volv(XameX($Xof[Xu$1Id(me0Uip 0E$Gui=Ra)VaVil]0B<j B`$CamaColaCri)Cu)F*geFol F[g Fum#GrimaM&%P<$P`/PigaP}jaP[i)Pum Qu(daTacaT{aTic Tof#T[laTu=Vazi 0AnolIque)0F|i>opeu0Acu Ap| AsivoEntu&Id-%Olu'1Ag(oAl Am* A$Aus$Ces,Ci.Clam Ecu.EmploIb'Ig-%On( P<d'P`'P' Pl< Pos$P[s,P~s T(noT*$T+$:Bric B~o,Ce)Ci&DaDigaIxaL L)Mili Nd<goNf +N$cheRd#R`oR*h>of>p>tu+T@T|V|i)X*aZ-da3Ch#Ijo^I+n%L*oM**oNdaNoR>i#RrugemRv(S%j T&Ud&3ApoB_seC Ch{oGur#L{aL/LmeLtr RmezaSg^Ssu+TaV`aX?Xo2AcidezAm*goAn`aEch^O+Utu Uxo2C&C*/Foc GoGue%IceLg#Lhe$Rj Rmig>noR%ScoSsa2Aga)AldaAngoAscoA%rnoE'aEn%E.IezaI,Itu+On]Ustr U%'a2G'L<oLigemNd NgoNilR?Rio,Tebol:B i$B*e%DoIa$IolaIvo)LegaL/L*]Loc]Nh RagemRfoRg&oRimpoRoup>+faSodu$S$TaTil/Ve)Z`a3L#Le@LoM^M(Mi=N(o,NgivaNi&NomaN_Ologi>?Rm* S,S$r3Nas)Nc<aNg#Raf>*o2Aci&IcoseOb&Orio,2ElaIabaLfeLpe Rdu+Rje)R_S$,T{aV(n 2AcejoAdu&Afi%Al]AmpoAn^Atui$Ave$AxaEgoElh EveIloIs&/I.@Os,O%scoUd#Unhi=U)2AcheA+niAx*imEr[ I Inc/Is#LaLo,Ru:Bi.Rm}@S%V(3C.eRd Res@Si.3A$B(n D+.EnaNoPismoPnosePo%ca5JeLofo%MemNes$Nr#Rm}&Sped 5M|#:Te2E@O,2N|#RejaU<a4E,HaUdi=Um* Ustr 0AgemEd@$En,ErsivoIn-%It?Ort&Pac$Ped'Pl<%P|Pr-saPuneUniz 0Al?Ap$AtivoC-,Ch Cid'Clu'Col|Deci,D'e$Du$rEficazEr-%F<tilFes.F*i$Flam F|m&F+$rG('Ibi=Ici&ImigoJe.Oc-%O=_Ov?OxQuie$Scri$Se$Sist'Spe$rSt& S~$Tac$Tegr&Tim Toc#TrigaVa,rV(noVic$Voc 0Gur%2Ani<oOniz Re&Rit#0CaEn$Ol#Qu{o0Ali<o:N{oNg^N)R ac>dimR_SmimToV&iZida3Jum9An*]Elh^G?I>n&Rr Vem5BaDeuDocaIzLg?L/R#Ris)RoS)::B edaB|&C[C)n%Dril/G )GoaJeMb(M-.M* MpejoNchePid P,R<j>{>gu+S<]St_T(&Ti=V<daVou+Vr?X<%Z(3Ald!eB[G#G-d Gis)IgoIlo Itu+Mb[%MeNh?Ntil]OaSmaS%TivoT['oV VezaVi.3B(&Bi=D( G G{oMi.Mo{oMp?NdaNe N]gemQuidezS)gemSu+T|&V_XaX{a5C?Cu$rJis)MboNaNgeNt+RdeT#T(@Ucu+UsaUv 5ArCidezC_Ne)St[T?Va:CacoCe%Ch#CioD{aDr*]Gna)G[zaI|IsL<d_L]Lo%LucoMiloMo{oMu%N^Nc]Nda$NequimN/,Niv`aNobr NsaN%rNuse Pe#Qu* Rc?Resi>fimRgemR*/Rmi)Ro$RquiseR[coR%loRujoSco%Sm|+SsagemStig Tag&T(noT*&Tu.Xil 3D&]DidaDusaGaf}eIgaL<c@L/rMb_M|i&N*oNosNsagemNt&Rec(Rg~/S^Scl SmoSqui)St[T!eTeo_T+gemX(Xic<o3C_G&]Gr Lag[L- Lh M#N( N/caNist_N|@OloR<%RtiloStur 5Cid!eD(noD~ EdaErIn/I)Ldu+LezaL/L*e%LuscoN)n]Quec><goRcegoR=moR-aSaicoSque%S.daT`TimToTriz5DaI$La)Lh(L.Ndi&Ni=R&h>c/Sc~ SeuSic&:Ci}&D?JaMo_R*>r#Sc(TivaTu[zaV&]Veg Vio3Bl*aB~o,GativaGoci Gri$Rvo,TaUr&VascaVo{o3N N/TidezV` 5B[zaI%IvaMe M*&Rdes%R% T Tici TurnoV`oVil/Vo5Bl#DezM(&Pci&Tr'Vem:0Cec#Edec(JetivoRig#Scu_S%t+T(Tur 0Id-%Io,Orr(Ulis)Up#2Eg<%EnsivaEr-daIc*aUsc#0Iva4Ar@Eo,H Iv{a0B_Ele%Is,It'0D~#E_,Tem1Ci}&Er?On-%OrtunoOs$1ArBi.DemD*&F<a$GasmoG~/I-t&IgemIun=LaTo=xoV&/0Cil S^SoT-.0Imismo0S!@T}oTub_Vi=0El]Ul 1Id Ig- :Ca$Ci-%Co%Ctu D @Dr*/G GodeIn`Ir IsagemLav+Lest+Lhe)Li$Lm^Lpi.Nc^N`aNfle$NquecaN)n&PagaioP`^P'oRaf*>ci&Rd&RedeRtidaSmoSs#S%lTam T-%T* T_noUl^Us 3C~i D& Dest[D@t+D+G^I$r&IxeLeLic<oNcaNdur N{aN]scoNs?N%Rceb(Rfei$Rgun)Ri$Rmit'Rn>plexoRsi<>%nceRucaSc#SquisaS,aTisc 3AdaC#Ed!eGm-$Last+Lh#Lo.M-)Nc`NguimN]No%N.On{oPocaQue%R<h>esRue)Sc S$laT<gaVe%2An)Aque)At*aEbeuUmagemUvi&1Eu0DaE'aEtisaLeg^Lici Lu-%Lvil/M MbaNd( N.@P~o,R)Ssu'St&TeUp U,Vo 2A@Anc]A$AxeEceEd?Efei$Emi Ens Ep  Esil]E%x$Ev-'Ez Ima)IncesaIsmaIv#Oces,Odu$Ofe)Oibi=Oje$Ome%rOpag OsaO%$rOv?2Blic DimL Lm} Ls{aNh&N'PiloRezaX?:99Ad+Ant@Ar$AseEbr EdaEijoEn%Eri=Im}oInaIosque:B<^BiscoCh Ci} Di&I In]IoIvaJ^L#M&Ng(Nhu+P!u+P`PidezPosaQue%Rid!eS<%Scun/Sg Sp?S%'aSur Taz<aTo{a3AlezaAnim Av(Baix B`deBol C#C-%CheioCiboC|d Cru.Cu DeDim'D}daDuzidaEnvioF* Flet'Fog F[scoFugi G&@GimeG+In#I$rJei.LativoM?M-=M|,Nov#P oP`'Ple$Pol/P[saPudi Qu((S-]Sfri Sga.Sid'Solv(Spei$SsacaS)n%Sum'T&/T(T' Tom^T+.V` Vi,rVol)3Ac/CaGidezGo_,M NgueS^ScoS}/5B&oChe=D^DeioDov@E=rLe)M<oNc S#S{aS$TaT{oT*aT~ UcoUpaXo5B_Gi=Go,IvoMoPest[S,:B|Ci ColaCud'DioF'aGaGr^Ib_L^L{oLg#LivaLpic Lsic]L.Lv?Mb Mu+iN Nf}aNgueNid!ePa$Rd>g-$Rje)Tur Ud!eXof}eZ}&3C C~ DaD-$Di#Do,Du$rGm-$G[=Gun=IvaLe$LvagemM<&M-%N?N/rNsu&Nt#P #Rei>*g>+RvoTemb_T|3GiloLhue)Lic}eMetr@Mpat@M~ N&Nc(oNg~ NopseN$ni>-eRiTu#5B(<oB+C|_G_JaLdaLetr L%'oMbrioNa)Nd Neg Nh?NoP+noQue%Rr'R%ioSsegoTaqueT(r V#Z*/5Aviz BidaBm(,B,loBt+'Ca)Ces,CoDes%FixoG?G('Jei$Lfa$M'OrP(i|Plic Pos$Prim'Rd*>fis)Rp[s>[&Rt'Sp'oS%n$:B`aBle%Bu^C/G `aLh(LoLvezM</Mb|imMpaNg-%N$P Pioc>dioRef>j>+xaTuagemUr*oXativoXis)3Atr&C(Ci=Cl#Dio,IaIm Lef}eLh#Mp(oN-%N,rN.Rm&RnoRr-oSeSou+St#ToXtu+Xugo3A+G`aJoloMbr MidezNgi=N%'oRagemT~ 5Al]C]L( LiceM^Mil/N`Ntu+Pe%R>ci=RneioRqueRr!>$S.UcaUp{aX*a2Ab&/Acej Adu$rAfeg Aje$AmaAnc ApoAs{oAt?Av E*oEm(Epid EvoIagemIboIcicloId-%Ilog@Ind!eIploItur Iunf&Oc Ombe)OvaUnfoUque2B~ C<oDoLipaPiRboRm>quesaT` T|i&:7V 3Bigo0HaId!eIf|me3Olog@SoTigaUbu0A=InaUfru':C*aDi G o,I=,LaL-%Lid!eLo[sN)gemQu{oR<d>e)Rr(Sc~ Sil]S,u+Z Zio3A=D Ge.Ic~ L{oLhiceLu=Nce=rNdav&N( Nt[Rb&Rd!eRe?Rg}h>m`/RnizRs R%n%SpaSti=T|i&3Adu$AgemAj Atu+Br?D{aDr @ElaGaG-%Gi G| L ejoNcoNhe)NilOle)R!>tudeSi.S$Tr&V{oZ*/5A=rArG&L<%LeibolL)gemLumo,Nt!e5L$Vuz`a::D[zRope3QueRe.Rife3Ng ::Ng#Rp 3BuL?9Mb Olog@5Mbi=";
const checksum = "0x2219000926df7b50d8aa0a3d495826b988287df4657fbd100e6fe596c8f737ac";
let wordlist = null;
/**
 *  The [[link-bip39-pt]] for [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangPt extends WordlistOwl {
    /**
     *  Creates a new instance of the Portuguese language Wordlist.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langPt]] should suffice.
     *
     *  @_ignore:
     */
    constructor() { super("pt", words, checksum); }
    /**
     *  Returns a singleton instance of a ``LangPt``, creating it
     *  if this is the first time being called.
     */
    static wordlist() {
        if (wordlist == null) {
            wordlist = new LangPt();
        }
        return wordlist;
    }
}

const data = "}aE#4A=Yv&co#4N#6G=cJ&SM#66|/Z#4t&kn~46#4K~4q%b9=IR#7l,mB#7W_X2*dl}Uo~7s}Uf&Iw#9c&cw~6O&H6&wx&IG%v5=IQ~8a&Pv#47$PR&50%Ko&QM&3l#5f,D9#4L|/H&tQ;v0~6n]nN<di,AM=W5%QO&ka&ua,hM^tm=zV=JA=wR&+X]7P&NB#4J#5L|/b[dA}tJ<Do&6m&u2[U1&Kb.HM&mC=w0&MW<rY,Hq#6M}QG,13&wP}Jp]Ow%ue&Kg<HP<D9~4k~9T&I2_c6$9T#9/[C5~7O~4a=cs&O7=KK=An&l9$6U$8A&uD&QI|/Y&bg}Ux&F2#6b}E2&JN&kW&kp=U/&bb=Xl<Cj}k+~5J#6L&5z&9i}b4&Fo,ho(X0_g3~4O$Fz&QE<HN=Ww]6/%GF-Vw=tj&/D&PN#9g=YO}cL&Of&PI~5I&Ip=vU=IW#9G;0o-wU}ss&QR<BT&R9=tk$PY_dh&Pq-yh]7T,nj.Xu=EP&76=cI&Fs*Xg}z7$Gb&+I=DF,AF=cA}rL#7j=Dz&3y<Aa$52=PQ}b0(iY$Fa}oL&xV#6U=ec=WZ,xh%RY<dp#9N&Fl&44=WH*A7=sh&TB&8P=07;u+&PK}uh}J5#72)V/=xC,AB$k0&f6;1E|+5=1B,3v]6n&wR%b+&xx]7f=Ol}fl;+D^wG]7E;nB;uh^Ir&l5=JL,nS=cf=g5;u6|/Q$Gc=MH%Hg#5d%M6^86=U+$Gz,l/,ir^5y&Ba&/F-IY&FI&be%IZ#77&PW_Nu$kE(Yf&NX]7Z,Jy&FJ(Xo&Nz#/d=y7&MX<Ag}Z+;nE]Dt(iG#4D=13&Pj~4c%v8&Zo%OL&/X#4W<HR&ie~6J_1O(Y2=y5=Ad*cv_eB#6k&PX:BU#7A;uk&Ft&Fx_dD=U2;vB=U5=4F}+O&GN.HH:9s=b0%NV(jO&IH=JT}Z9=VZ<Af,Kx^4m&uJ%c6,6r;9m#+L}cf%Kh&F3~4H=vP}bu,Hz|++,1w]nv}k6;uu$jw*Kl*WX&uM[x7&Fr[m7$NO&QN]hu=JN}nR^8g#/h(ps|KC;vd}xz=V0}p6&FD$G1#7K<bG_4p~8g&cf;u4=tl}+k%5/}fz;uw<cA=u1}gU}VM=LJ=eX&+L&Pr#4U}p2:nC,2K]7H:jF&9x}uX#9O=MB<fz~8X~5m&4D&kN&u5%E/(h7(ZF&VG<de(qM|/e-Wt=3x(a+,/R]f/&ND$Ro&nU}0g=KA%kH&NK$Ke<dS}cB&IX~5g$TN]6m=Uv,Is&Py=Ef%Kz#+/%bi&+A<F4$OG&4C&FL#9V<Zk=2I_eE&6c]nw&kq$HG}y+&A8$P3}OH=XP]70%IS(AJ_gH%GZ&tY&AZ=vb~6y&/r=VI=Wv<Zi=fl=xf&eL}c8}OL=MJ=g8$F7=YT}9u=0+^xC}JH&nL^N0~4T]K2,Cy%OC#6s;vG(AC^xe^cG&MF}Br#9P;wD-7h$O/&xA}Fn^PC]6i]7G&8V$Qs;vl(TB~73~4l<mW&6V=2y&uY&+3)aP}XF;LP&kx$wU=t7;uy<FN&lz)7E=Oo*Y+;wI}9q}le;J6&Ri&4t&Qr#8B=cb&vG=J5|Ql(h5<Yy~4+}QD,Lx=wn%K/&RK=dO&Pw,Q9=co%4u;9u}g0@6a^4I%b0=zo|/c&tX=dQ=OS#+b=yz_AB&wB&Pm=W9$HP_gR=62=AO=ti=hI,oA&jr&dH=tm&b6$P2(x8=zi;nG~7F;05]0n[Ix&3m}rg=Xp=cd&uz]7t;97=cN;vV<jf&FF&F1=6Q&Ik*Kk&P4,2z=fQ]7D&3u,H0=d/}Uw<ZN<7R}Kv;0f$H7,MD]7n$F0#88~9Z%da=by;+T#/u=VF&fO&kr^kf<AB]sU,I5$Ng&Pz;0i&QD&vM=Yl:BM;nJ_xJ]U7&Kf&30,3f|Z9*dC)je_jA&Q4&Kp$NH(Yz#6S&Id%Ib=KX,AD=KV%dP}tW&Pk^+E_Ni=cq,3R}VZ(Si=b+}rv;0j}rZ]uA,/w(Sx&Jv$w9&4d&wE,NJ$Gy=J/]Ls#7k<ZQ<Y/&uj]Ov$PM;v3,2F&+u:up=On&3e,Jv;90=J+&Qm]6q}bK#+d~8Y(h2]hA;99&AS=I/}qB&dQ}yJ-VM}Vl&ui,iB&G3|Dc]7d=eQ%dX%JC_1L~4d^NP;vJ&/1)ZI#7N]9X[bQ&PL=0L(UZ,Lm&kc&IR}n7(iR<AQ<dg=33=vN}ft}au]7I,Ba=x9=dR~6R&Tq=Xi,3d$Nr&Bc}DI&ku&vf]Dn,/F&iD,Ll&Nw=0y&I7=Ls=/A&tU=Qe}Ua&uk&+F=g4=gh=Vj#+1&Qn}Uy*44#5F,Pc&Rz*Xn=oh=5W;0n_Nf(iE<Y7=vr=Zu]oz#5Z%mI=kN=Bv_Jp(T2;vt_Ml<FS&uI=L/&6P]64$M7}86<bo%QX(SI%IY&VK=Al&Ux;vv;ut*E/%uh<ZE|O3,M2(yc]yu=Wk&tp:Ex}hr,Cl&WE)+Z=8U}I2_4Q,hA_si=iw=OM=tM=yZ%Ia=U7;wT}b+;uo=Za}yS!5x}HD}fb#5O_dA;Nv%uB(yB;01(Sf}Fk;v7}Pt#8v<mZ#7L,/r&Pl~4w&f5=Ph$Fw_LF&8m,bL=yJ&BH}p/*Jn}tU~5Q;wB(h6]Df]8p^+B;E4&Wc=d+;Ea&bw$8C&FN,DM=Yf}mP~5w=fT#6V=mC=Fi=AV}jB&AN}lW}aH#/D)dZ;hl;vE}/7,CJ;31&w8,hj%u9_Js=jJ&4M~8k=TN&eC}nL&uc-wi&lX}dj=Mv=e2#6u=cr$uq$6G]8W}Jb:nm=Yg<b3(UA;vX&6n&xF=KT,jC,De&R8&oY=Zv&oB]7/=Z2&Oa}bf,hh(4h^tZ&72&Nx;D2&xL~5h~40)ZG)h+=OJ&RA]Bv$yB=Oq=df,AQ%Jn}OJ;11,3z&Tl&tj;v+^Hv,Dh(id=s+]7N&N3)9Q~8f,S4=uW=w4&uX,LX&3d]CJ&yp&8x<b2_do&lP=y/<cy_dG=Oi=7R(VH(lt_1T,Iq_AA;12^6T%k6#8K[B1{oO<AU[Bt;1b$9S&Ps<8T=St{bY,jB(Zp&63&Uv$9V,PM]6v&Af}zW[bW_oq}sm}nB&Kq&gC&ff_eq_2m&5F&TI}rf}Gf;Zr_z9;ER&jk}iz_sn<BN~+n&vo=Vi%97|ZR=Wc,WE&6t]6z%85(ly#84=KY)6m_5/=aX,N3}Tm&he&6K]tR_B2-I3;u/&hU&lH<AP=iB&IA=XL;/5&Nh=wv<BH#79=vS=zl<AA=0X_RG}Bw&9p$NW,AX&kP_Lp&/Z(Tc]Mu}hs#6I}5B&cI<bq&H9#6m=K9}vH(Y1(Y0#4B&w6,/9&gG<bE,/O=zb}I4_l8<B/;wL%Qo<HO[Mq=XX}0v&BP&F4(mG}0i}nm,EC=9u{I3,xG&/9=JY*DK&hR)BX=EI=cx=b/{6k}yX%A+&wa}Xb=la;wi^lL;0t}jo&Qb=xg=XB}iO<qo{bR=NV&8f=a0&Jy;0v=uK)HK;vN#6h&jB(h/%ud&NI%wY.X7=Pt}Cu-uL&Gs_hl%mH,tm]78=Lb^Q0#7Y=1u<Bt&+Q=Co_RH,w3;1e}ux<aU;ui}U3&Q5%bt]63&UQ|0l&uL}O7&3o,AV&dm|Nj(Xt*5+(Uu&Hh(p7(UF=VR=Bp^Jl&Hd[ix)9/=Iq]C8<67]66}mB%6f}bb}JI]8T$HA}db=YM&pa=2J}tS&Y0=PS&y4=cX$6E,hX,XP&nR;04,FQ&l0&Vm_Dv#5Y~8Z=Bi%MA]6x=JO:+p,Az&9q,Hj~6/}SD=K1:EJ}nA;Qo#/E]9R,Ie&6X%W3]61&v4=xX_MC=0q;06(Xq=fs}IG}Dv=0l}o7$iZ;9v&LH&DP-7a&OY,SZ,Kz,Cv&dh=fx|Nh,F/~7q=XF&w+;9n&Gw;0h}Z7<7O&JK(S7&LS<AD<ac=wo<Dt&zw%4B=4v#8P;9o~6p*vV=Tm,Or&I6=1q}nY=P0=gq&Bl&Uu,Ch%yb}UY=zh}dh}rl(T4_xk(YA#8R*xH,IN}Jn]7V}C4&Ty}j3]7p=cL=3h&wW%Qv<Z3=f0&RI&+S(ic_zq}oN&/Y=z1;Td=LW=0e=OI(Vc,+b^ju(UL;0r:Za%8v=Rp=zw&58&73&wK}qX]6y&8E)a2}WR=wP^ur&nQ<cH}Re=Aq&wk}Q0&+q=PP,Gc|/d^k5,Fw]8Y}Pg]p3=ju=ed}r5_yf&Cs]7z$/G<Cm&Jp&54_1G_gP_Ll}JZ;0u]k8_7k(Sg]65{9i=LN&Sx&WK,iW&fD&Lk{9a}Em-9c#8N&io=sy]8d&nT&IK(lx#7/$lW(Td<s8~49,3o<7Y=MW(T+_Jr&Wd,iL}Ct=xh&5V;v4&8n%Kx=iF&l2_0B{B+,If(J0,Lv;u8=Kx-vB=HC&vS=Z6&fU&vE^xK;3D=4h=MR#45:Jw;0d}iw=LU}I5=I0]gB*im,K9}GU,1k_4U&Tt=Vs(iX&lU(TF#7y,ZO}oA&m5#5P}PN}Uz=hM<B1&FB<aG,e6~7T<tP(UQ_ZT=wu&F8)aQ]iN,1r_Lo&/g:CD}84{J1_Ki&Na&3n$jz&FE=dc;uv;va}in}ll=fv(h1&3h}fp=Cy}BM(+E~8m}lo%v7=hC(T6$cj=BQ=Bw(DR,2j=Ks,NS|F+;00=fU=70}Mb(YU;+G&m7&hr=Sk%Co]t+(X5_Jw}0r}gC(AS-IP&QK<Z2#8Q$WC]WX}T2&pG_Ka,HC=R4&/N;Z+;ch(C7,D4$3p_Mk&B2$8D=n9%Ky#5z(CT&QJ#7B]DC]gW}nf~5M;Iw#80}Tc_1F#4Z-aC}Hl=ph=fz,/3=aW}JM}nn;DG;vm}wn,4P}T3;wx&RG$u+}zK=0b;+J_Ek{re<aZ=AS}yY#5D]7q,Cp}xN=VP*2C}GZ}aG~+m_Cs=OY#6r]6g<GS}LC(UB=3A=Bo}Jy<c4}Is;1P<AG}Op<Z1}ld}nS=1Z,yM&95&98=CJ(4t:2L$Hk=Zo}Vc;+I}np&N1}9y=iv}CO*7p=jL)px]tb^zh&GS&Vl%v/;vR=14=zJ&49|/f]hF}WG;03=8P}o/&Gg&rp;DB,Kv}Ji&Pb;aA^ll(4j%yt}+K$Ht#4y&hY]7Y<F1,eN}bG(Uh%6Z]t5%G7;+F_RE;it}tL=LS&Da=Xx(S+(4f=8G=yI}cJ}WP=37=jS}pX}hd)fp<A8=Jt~+o$HJ=M6}iX=g9}CS=dv=Cj(mP%Kd,xq|+9&LD(4/=Xm&QP=Lc}LX&fL;+K=Op(lu=Qs.qC:+e&L+=Jj#8w;SL]7S(b+#4I=c1&nG_Lf&uH;+R)ZV<bV%B/,TE&0H&Jq&Ah%OF&Ss(p2,Wv&I3=Wl}Vq;1L&lJ#9b_1H=8r=b8=JH(SZ=hD=J2#7U,/U#/X~6P,FU<eL=jx,mG=hG=CE&PU=Se(qX&LY=X6=y4&tk&QQ&tf=4g&xI}W+&mZ=Dc#7w}Lg;DA;wQ_Kb(cJ=hR%yX&Yb,hw{bX_4X;EP;1W_2M}Uc=b5(YF,CM&Tp^OJ{DD]6s=vF=Yo~8q}XH}Fu%P5(SJ=Qt;MO]s8<F3&B3&8T(Ul-BS*dw&dR<87}/8]62$PZ]Lx<Au}9Q]7c=ja=KR,Go,Us&v6(qk}pG&G2=ev^GM%w4&H4]7F&dv]J6}Ew:9w=sj-ZL}Ym$+h(Ut(Um~4n=Xs(U7%eE=Qc_JR<CA#6t<Fv|/I,IS,EG<F2(Xy$/n<Fa(h9}+9_2o&N4#7X<Zq|+f_Dp=dt&na,Ca=NJ)jY=8C=YG=s6&Q+<DO}D3=xB&R1(lw;Qn<bF(Cu|/B}HV=SS&n7,10&u0]Dm%A6^4Q=WR(TD=Xo<GH,Rj(l8)bP&n/=LM&CF,F5&ml=PJ;0k=LG=tq,Rh,D6@4i=1p&+9=YC%er_Mh;nI;0q=Fw]80=xq=FM$Gv;v6&nc;wK%H2&Kj;vs,AA=YP,66}bI(qR~5U=6q~4b$Ni=K5.X3$So&Iu(p+]8G=Cf=RY(TS_O3(iH&57=fE=Dg_Do#9z#7H;FK{qd_2k%JR}en&gh_z8;Rx}9p<cN_Ne,DO;LN_7o~/p=NF=5Y}gN<ce<C1,QE]Wv=3u<BC}GK]yq}DY&u/_hj=II(pz&rC,jV&+Z}ut=NQ;Cg-SR_ZS,+o=u/;Oy_RK_QF(Fx&xP}Wr&TA,Uh&g1=yr{ax[VF$Pg(YB;Ox=Vy;+W(Sp}XV%dd&33(l/]l4#4Y}OE=6c=bw(A7&9t%wd&N/&mo,JH&Qe)fm=Ao}fu=tH";
const deltaData = "FAZDC6BALcLZCA+GBARCW8wNCcDDZ8LVFBOqqDUiou+M42TFAyERXFb7EjhP+vmBFpFrUpfDV2F7eB+eCltCHJFWLFCED+pWTojEIHFXc3aFn4F68zqjEuKidS1QBVPDEhE7NA4mhMF7oThD49ot3FgtzHFCK0acW1x8DH1EmLoIlrWFBLE+y5+NA3Cx65wJHTaEZVaK1mWAmPGxgYCdxwOjTDIt/faOEhTl1vqNsKtJCOhJWuio2g07KLZEQsFBUpNtwEByBgxFslFheFbiEPvi61msDvApxCzB6rBCzox7joYA5UdDc+Cb4FSgIabpXFAj3bjkmFAxCZE+mD/SFf/0ELecYCt3nLoxC6WEZf2tKDB4oZvrEmqFkKk7BwILA7gtYBpsTq//D4jD0F0wEB9pyQ1BD5Ba0oYHDI+sbDFhvrHXdDHfgFEIJLi5r8qercNFBgFLC4bo5ERJtamWBDFy73KCEb6M8VpmEt330ygCTK58EIIFkYgF84gtGA9Uyh3m68iVrFbWFbcbqiCYHZ9J1jeRPbL8yswhMiDbhEhdNoSwFbZrLT740ABEqgCkO8J1BLd1VhKKR4sD1yUo0z+FF59Mvg71CFbyEhbHSFBKEIKyoQNgQppq9T0KAqePu0ZFGrXOHdKJqkoTFhYvpDNyuuznrN84thJbsCoO6Cu6Xlvntvy0QYuAExQEYtTUBf3CoCqwgGFZ4u1HJFzDVwEy3cjcpV4QvsPaBC3rCGyCF23o4K3pp2gberGgFEJEHo4nHICtyKH2ZqyxhN05KBBJIQlKh/Oujv/DH32VrlqFdIFC7Fz9Ct4kaqFME0UETLprnN9kfy+kFmtQBB0+5CFu0N9Ij8l/VvJDh2oq3hT6EzjTHKFN7ZjZwoTsAZ4Exsko6Fpa6WC+sduz8jyrLpegTv2h1EBeYpLpm2czQW0KoCcS0bCVXCmuWJDBjN1nQNLdF58SFJ0h7i3pC3oEOKy/FjBklL70XvBEEIWp2yZ04xObzAWDDJG7f+DbqBEA7LyiR95j7MDVdDViz2RE5vWlBMv5e4+VfhP3aXNPhvLSynb9O2x4uFBV+3jqu6d5pCG28/sETByvmu/+IJ0L3wb4rj9DNOLBF6XPIODr4L19U9RRofAG6Nxydi8Bki8BhGJbBAJKzbJxkZSlF9Q2Cu8oKqggB9hBArwLLqEBWEtFowy8XK8bEyw9snT+BeyFk1ZCSrdmgfEwFePTgCjELBEnIbjaDDPJm36rG9pztcEzT8dGk23SBhXBB1H4z+OWze0ooFzz8pDBYFvp9j9tvFByf9y4EFdVnz026CGR5qMr7fxMHN8UUdlyJAzlTBDRC28k+L4FB8078ljyD91tUj1ocnTs8vdEf7znbzm+GIjEZnoZE5rnLL700Xc7yHfz05nWxy03vBB9YGHYOWxgMQGBCR24CVYNE1hpfKxN0zKnfJDmmMgMmBWqNbjfSyFCBWSCGCgR8yFXiHyEj+VtD1FB3FpC1zI0kFbzifiKTLm9yq5zFmur+q8FHqjoOBWsBPiDbnCC2ErunV6cJ6TygXFYHYp7MKN9RUlSIS8/xBAGYLzeqUnBF4QbsTuUkUqGs6CaiDWKWjQK9EJkjpkTmNCPYXL";
const _wordlist = {
    zh_cn: null,
    zh_tw: null
};
const Checks = {
    zh_cn: "0x17bcc4d8547e5a7135e365d1ab443aaae95e76d8230c2782c67305d4f21497a1",
    zh_tw: "0x51e720e90c7b87bec1d70eb6e74a21a449bd3ec9c020b01d3a40ed991b60ce5d"
};
const codes = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const style = "~!@#$%^&*_-=[]{}|;:,.()<>?";
function loadWords(locale) {
    if (_wordlist[locale] != null) {
        return _wordlist[locale];
    }
    const wordlist = [];
    let deltaOffset = 0;
    for (let i = 0; i < 2048; i++) {
        const s = style.indexOf(data[i * 3]);
        const bytes = [
            228 + (s >> 2),
            128 + codes.indexOf(data[i * 3 + 1]),
            128 + codes.indexOf(data[i * 3 + 2]),
        ];
        if (locale === "zh_tw") {
            const common = s % 4;
            for (let i = common; i < 3; i++) {
                bytes[i] = codes.indexOf(deltaData[deltaOffset++]) + ((i == 0) ? 228 : 128);
            }
        }
        wordlist.push(toUtf8String(new Uint8Array(bytes)));
    }
    // Verify the computed list matches the official list
    const checksum = id(wordlist.join("\n") + "\n");
    /* c8 ignore start */
    if (checksum !== Checks[locale]) {
        throw new Error(`BIP39 Wordlist for ${locale} (Chinese) FAILED`);
    }
    /* c8 ignore stop */
    _wordlist[locale] = wordlist;
    return wordlist;
}
const wordlists = {};
/**
 *  The [[link-bip39-zh_cn]] and [[link-bip39-zh_tw]] for
 *  [mnemonic phrases](link-bip-39).
 *
 *  @_docloc: api/wordlists
 */
class LangZh extends Wordlist {
    /**
     *  Creates a new instance of the Chinese language Wordlist for
     *  the %%dialect%%, either ``"cn"`` or ``"tw"`` for simplified
     *  or traditional, respectively.
     *
     *  This should be unnecessary most of the time as the exported
     *  [[langZhCn]] and [[langZhTw]] should suffice.
     *
     *  @_ignore:
     */
    constructor(dialect) { super("zh_" + dialect); }
    getWord(index) {
        const words = loadWords(this.locale);
        assertArgument(index >= 0 && index < words.length, `invalid word index: ${index}`, "index", index);
        return words[index];
    }
    getWordIndex(word) {
        return loadWords(this.locale).indexOf(word);
    }
    split(phrase) {
        phrase = phrase.replace(/(?:\u3000| )+/g, "");
        return phrase.split("");
    }
    /**
     *  Returns a singleton instance of a ``LangZh`` for %%dialect%%,
     *  creating it if this is the first time being called.
     *
     *  Use the %%dialect%% ``"cn"`` or ``"tw"`` for simplified or
     *  traditional, respectively.
     */
    static wordlist(dialect) {
        if (wordlists[dialect] == null) {
            wordlists[dialect] = new LangZh(dialect);
        }
        return wordlists[dialect];
    }
}

export { LangCz, LangEs, LangFr, LangIt, LangJa, LangKo, LangPt, LangZh };
//# sourceMappingURL=wordlists-extra.js.map
