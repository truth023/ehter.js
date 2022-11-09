import { getBytes } from "./data.js";
import { assert, assertArgument, assertPrivate } from "./errors.js";
import { getBigInt, getNumber, fromTwos, toBigInt, toHex, toTwos } from "./maths.js";
const _guard = {};
const NegativeOne = BigInt(-1);
function throwFault(message, fault, operation, value) {
    const params = { fault: fault, operation: operation };
    if (value !== undefined) {
        params.value = value;
    }
    assert(false, message, "NUMERIC_FAULT", params);
}
// Constant to pull zeros from for multipliers
let zeros = "0";
while (zeros.length < 256) {
    zeros += zeros;
}
// Returns a string "1" followed by decimal "0"s
function getMultiplier(decimals) {
    assertArgument(Number.isInteger(decimals) && decimals >= 0 && decimals <= 256, "invalid decimal length", "decimals", decimals);
    return BigInt("1" + zeros.substring(0, decimals));
}
export function formatFixed(_value, _decimals) {
    if (_decimals == null) {
        _decimals = 18;
    }
    let value = getBigInt(_value, "value");
    const decimals = getNumber(_decimals, "decimals");
    const multiplier = getMultiplier(decimals);
    const multiplierStr = String(multiplier);
    const negative = (value < 0);
    if (negative) {
        value *= NegativeOne;
    }
    let fraction = String(value % multiplier);
    // Make sure there are enough place-holders
    while (fraction.length < multiplierStr.length - 1) {
        fraction = "0" + fraction;
    }
    // Strip training 0
    while (fraction.length > 1 && fraction.substring(fraction.length - 1) === "0") {
        fraction = fraction.substring(0, fraction.length - 1);
    }
    let result = String(value / multiplier);
    if (multiplierStr.length !== 1) {
        result += "." + fraction;
    }
    if (negative) {
        result = "-" + result;
    }
    return result;
}
export function parseFixed(value, _decimals) {
    if (_decimals == null) {
        _decimals = 18;
    }
    const decimals = getNumber(_decimals, "decimals");
    const multiplier = getMultiplier(decimals);
    assertArgument(typeof (value) === "string" && value.match(/^-?[0-9.]+$/), "invalid decimal value", "value", value);
    // Is it negative?
    const negative = (value.substring(0, 1) === "-");
    if (negative) {
        value = value.substring(1);
    }
    assertArgument(value !== ".", "missing value", "value", value);
    // Split it into a whole and fractional part
    const comps = value.split(".");
    assertArgument(comps.length <= 2, "too many decimal points", "value", value);
    let whole = (comps[0] || "0"), fraction = (comps[1] || "0");
    // Trim trialing zeros
    while (fraction[fraction.length - 1] === "0") {
        fraction = fraction.substring(0, fraction.length - 1);
    }
    // Check the fraction doesn't exceed our decimals size
    if (fraction.length > String(multiplier).length - 1) {
        throwFault("fractional component exceeds decimals", "underflow", "parseFixed");
    }
    // If decimals is 0, we have an empty string for fraction
    if (fraction === "") {
        fraction = "0";
    }
    // Fully pad the string with zeros to get to wei
    while (fraction.length < String(multiplier).length - 1) {
        fraction += "0";
    }
    const wholeValue = BigInt(whole);
    const fractionValue = BigInt(fraction);
    let wei = (wholeValue * multiplier) + fractionValue;
    if (negative) {
        wei *= NegativeOne;
    }
    return wei;
}
export class FixedFormat {
    signed;
    width;
    decimals;
    name;
    _multiplier;
    constructor(guard, signed, width, decimals) {
        assertPrivate(guard, _guard, "FixedFormat");
        this.signed = signed;
        this.width = width;
        this.decimals = decimals;
        this.name = (signed ? "" : "u") + "fixed" + String(width) + "x" + String(decimals);
        this._multiplier = getMultiplier(decimals);
        Object.freeze(this);
    }
    static from(value) {
        if (value instanceof FixedFormat) {
            return value;
        }
        if (typeof (value) === "number") {
            value = `fixed128x${value}`;
        }
        let signed = true;
        let width = 128;
        let decimals = 18;
        if (typeof (value) === "string") {
            if (value === "fixed") {
                // defaults...
            }
            else if (value === "ufixed") {
                signed = false;
            }
            else {
                const match = value.match(/^(u?)fixed([0-9]+)x([0-9]+)$/);
                assertArgument(match, "invalid fixed format", "format", value);
                signed = (match[1] !== "u");
                width = parseInt(match[2]);
                decimals = parseInt(match[3]);
            }
        }
        else if (value) {
            const check = (key, type, defaultValue) => {
                if (value[key] == null) {
                    return defaultValue;
                }
                assertArgument(typeof (value[key]) === type, "invalid fixed format (" + key + " not " + type + ")", "format." + key, value[key]);
                return value[key];
            };
            signed = check("signed", "boolean", signed);
            width = check("width", "number", width);
            decimals = check("decimals", "number", decimals);
        }
        assertArgument((width % 8) === 0, "invalid fixed format width (not byte aligned)", "format.width", width);
        assertArgument(decimals <= 80, "invalid fixed format (decimals too large)", "format.decimals", decimals);
        return new FixedFormat(_guard, signed, width, decimals);
    }
}
/**
 *  Fixed Number class
 */
export class FixedNumber {
    format;
    _isFixedNumber;
    //#hex: string;
    #value;
    constructor(guard, hex, value, format) {
        assertPrivate(guard, _guard, "FixedNumber");
        this.format = FixedFormat.from(format);
        //this.#hex = hex;
        this.#value = value;
        this._isFixedNumber = true;
        Object.freeze(this);
    }
    #checkFormat(other) {
        assertArgument(this.format.name === other.format.name, "incompatible format; use fixedNumber.toFormat", "other", other);
    }
    /**
     *  Returns a new [[FixedNumber]] with the result of this added
     *  to %%other%%.
     */
    addUnsafe(other) {
        this.#checkFormat(other);
        const a = parseFixed(this.#value, this.format.decimals);
        const b = parseFixed(other.#value, other.format.decimals);
        return FixedNumber.fromValue(a + b, this.format.decimals, this.format);
    }
    subUnsafe(other) {
        this.#checkFormat(other);
        const a = parseFixed(this.#value, this.format.decimals);
        const b = parseFixed(other.#value, other.format.decimals);
        return FixedNumber.fromValue(a - b, this.format.decimals, this.format);
    }
    mulUnsafe(other) {
        this.#checkFormat(other);
        const a = parseFixed(this.#value, this.format.decimals);
        const b = parseFixed(other.#value, other.format.decimals);
        return FixedNumber.fromValue((a * b) / this.format._multiplier, this.format.decimals, this.format);
    }
    divUnsafe(other) {
        this.#checkFormat(other);
        const a = parseFixed(this.#value, this.format.decimals);
        const b = parseFixed(other.#value, other.format.decimals);
        return FixedNumber.fromValue((a * this.format._multiplier) / b, this.format.decimals, this.format);
    }
    floor() {
        const comps = this.toString().split(".");
        if (comps.length === 1) {
            comps.push("0");
        }
        let result = FixedNumber.from(comps[0], this.format);
        const hasFraction = !comps[1].match(/^(0*)$/);
        if (this.isNegative() && hasFraction) {
            result = result.subUnsafe(ONE.toFormat(result.format));
        }
        return result;
    }
    ceiling() {
        const comps = this.toString().split(".");
        if (comps.length === 1) {
            comps.push("0");
        }
        let result = FixedNumber.from(comps[0], this.format);
        const hasFraction = !comps[1].match(/^(0*)$/);
        if (!this.isNegative() && hasFraction) {
            result = result.addUnsafe(ONE.toFormat(result.format));
        }
        return result;
    }
    // @TODO: Support other rounding algorithms
    round(decimals) {
        if (decimals == null) {
            decimals = 0;
        }
        // If we are already in range, we're done
        const comps = this.toString().split(".");
        if (comps.length === 1) {
            comps.push("0");
        }
        assertArgument(Number.isInteger(decimals) && decimals >= 0 && decimals <= 80, "invalid decimal count", "decimals", decimals);
        if (comps[1].length <= decimals) {
            return this;
        }
        const factor = FixedNumber.from("1" + zeros.substring(0, decimals), this.format);
        const bump = BUMP.toFormat(this.format);
        return this.mulUnsafe(factor).addUnsafe(bump).floor().divUnsafe(factor);
    }
    isZero() {
        return (this.#value === "0.0" || this.#value === "0");
    }
    isNegative() {
        return (this.#value[0] === "-");
    }
    toString() { return this.#value; }
    toHexString(_width) {
        throw new Error("TODO");
        /*
        return toHex();
        if (width == null) { return this.#hex; }

        const width = logger.getNumeric(_width);
        if (width % 8) { logger.throwArgumentError("invalid byte width", "width", width); }

        const hex = BigNumber.from(this.#hex).fromTwos(this.format.width).toTwos(width).toHexString();
        return zeroPadLeft(hex, width / 8);
        */
    }
    toUnsafeFloat() { return parseFloat(this.toString()); }
    toFormat(format) {
        return FixedNumber.fromString(this.#value, format);
    }
    static fromValue(value, decimals = 0, format = "fixed") {
        return FixedNumber.fromString(formatFixed(value, decimals), FixedFormat.from(format));
    }
    static fromString(value, format = "fixed") {
        const fixedFormat = FixedFormat.from(format);
        const numeric = parseFixed(value, fixedFormat.decimals);
        if (!fixedFormat.signed && numeric < 0) {
            throwFault("unsigned value cannot be negative", "overflow", "value", value);
        }
        const hex = (function () {
            if (fixedFormat.signed) {
                return toHex(toTwos(numeric, fixedFormat.width));
            }
            return toHex(numeric, fixedFormat.width / 8);
        })();
        const decimal = formatFixed(numeric, fixedFormat.decimals);
        return new FixedNumber(_guard, hex, decimal, fixedFormat);
    }
    static fromBytes(_value, format = "fixed") {
        const value = getBytes(_value, "value");
        const fixedFormat = FixedFormat.from(format);
        if (value.length > fixedFormat.width / 8) {
            throw new Error("overflow");
        }
        let numeric = toBigInt(value);
        if (fixedFormat.signed) {
            numeric = fromTwos(numeric, fixedFormat.width);
        }
        const hex = toHex(toTwos(numeric, (fixedFormat.signed ? 0 : 1) + fixedFormat.width));
        const decimal = formatFixed(numeric, fixedFormat.decimals);
        return new FixedNumber(_guard, hex, decimal, fixedFormat);
    }
    static from(value, format) {
        if (typeof (value) === "string") {
            return FixedNumber.fromString(value, format);
        }
        if (value instanceof Uint8Array) {
            return FixedNumber.fromBytes(value, format);
        }
        try {
            return FixedNumber.fromValue(value, 0, format);
        }
        catch (error) {
            // Allow NUMERIC_FAULT to bubble up
            if (error.code !== "INVALID_ARGUMENT") {
                throw error;
            }
        }
        assertArgument(false, "invalid FixedNumber value", "value", value);
    }
    static isFixedNumber(value) {
        return !!(value && value._isFixedNumber);
    }
}
const ONE = FixedNumber.from(1);
const BUMP = FixedNumber.from("0.5");
//# sourceMappingURL=fixednumber.js.map