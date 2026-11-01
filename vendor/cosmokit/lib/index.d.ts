/** Return true when every item in `array2` is present in `array1`. */
declare function contain(array1: readonly any[], array2: readonly any[]): boolean;
/** Return items that appear in both arrays. */
declare function intersection<T>(array1: readonly T[], array2: readonly T[]): T[];
/** Return items from `array1` that do not appear in `array2`. */
declare function difference<S>(array1: readonly S[], array2: readonly any[]): S[];
/** Return the set-union of two arrays while preserving first occurrence order. */
declare function union<T>(array1: readonly T[], array2: readonly T[]): T[];
/** Remove duplicate values while preserving first occurrence order. */
declare function deduplicate<T>(array: readonly T[]): T[];
/** Remove one item from an array and report whether it was found. */
declare function remove<T>(list: T[], item: T): boolean;
/** Normalize nullish, scalar, or array input to an array. */
declare function makeArray<T>(source: null | undefined | T | T[]): T[];
type GlobalConstructorNames = keyof { [K in keyof typeof globalThis as typeof globalThis[K] extends (abstract new (...args: any) => any) ? K : never]: K; };
/** Create a predicate for a global constructor name. */
declare function is<K extends GlobalConstructorNames>(type: K): (value: any) => value is InstanceType<typeof globalThis[K]>;
/** Test whether a value matches a global constructor name. */
declare function is<K extends GlobalConstructorNames>(type: K, value: any): value is InstanceType<typeof globalThis[K]>;
declare function isArrayBufferLike(value: any): value is ArrayBufferLike;
declare function isArrayBufferSource(value: any): value is Binary.Source;
/** Binary source detection and base64/hex conversion helpers. */
declare namespace Binary {
  type Source<T extends ArrayBufferLike = ArrayBufferLike> = T | ArrayBufferView<T>;
  const is: typeof isArrayBufferLike;
  const isSource: typeof isArrayBufferSource;
  function fromSource<T extends ArrayBufferLike>(source: Source<T>): T;
  function toBase64(source: Source): string;
  function fromBase64(source: string): ArrayBuffer | Uint8Array<ArrayBuffer>;
  function toHex(source: Source): string;
  function fromHex(source: string): ArrayBuffer;
}
/** Decode a base64 string into binary data. */
declare const base64ToArrayBuffer: typeof Binary.fromBase64;
/** Encode binary data as base64. */
declare const arrayBufferToBase64: typeof Binary.toBase64;
/** Decode a hex string into binary data. */
declare const hexToArrayBuffer: typeof Binary.fromHex;
/** Encode binary data as hex. */
declare const arrayBufferToHex: typeof Binary.toHex;
/** Deep-clone common JavaScript values while preserving prototypes. */
declare function clone<T>(source: T): T;
/**
 * Compare values recursively, treating two volatile references as equal regardless of value.
 * Strict comparison distinguishes null/undefined, treats opaque objects by identity,
 * compares URLs by normalized href, treats array holes as undefined, and considers distinct cyclic structures unequal.
 * @param a - first value.
 * @param b - second value.
 * @param strict - whether to require strict data equality outside volatile references.
 * @returns whether the values compare equal.
 */
declare function deepEqual(a: any, b: any, strict?: boolean): boolean;
/** String/symbol keyed dictionary type. */
type Dict<T = any, K extends string | symbol = string> = { [key in K]: T; };
/** Safely read `T[K]`, returning `never` when `K` is not a key of `T`. */
type Get<T extends {}, K> = K extends keyof T ? T[K] : never;
/** Conditional extraction helper with a configurable return type. */
type Extract<S, T, U = S> = S extends T ? U : never;
/** Accept a value or an array, unless the value is already an array type. */
type MaybeArray<T> = [T] extends [unknown[]] ? T : T | T[];
/** Wrap a value in `Promise`, preserving the resolved type of existing promises. */
type Promisify<T> = Promise<T extends Promise<infer S> ? S : T>;
/** Accept a value or promise unless the value type is already promise-like. */
type Awaitable<T> = [T] extends [Promise<unknown>] ? T : T | Promise<T>;
/** Convert a union type to an intersection type. */
type Intersect<U> = (U extends any ? (arg: U) => void : never) extends ((arg: infer I) => void) ? I : never;
/** No-op callback returning `undefined` at runtime and `any` at type level. */
declare function noop(): any;
/** Return true when a value is `null` or `undefined`. */
declare function isNullable(value: any): value is null | undefined | void;
/** Return true when a value is neither `null` nor `undefined`. */
declare function isNonNullable<T>(value: T): value is NonNullable<T>;
/** Return true for non-array object values. */
declare function isPlainObject(data: any): any;
/** Filter object entries with a key type guard. */
declare function filterKeys<T, K extends string, U extends K>(object: Dict<T, K>, filter: (key: K, value: T) => key is U): Dict<T, U>;
/** Filter object entries with a boolean predicate. */
declare function filterKeys<T, K extends string>(object: Dict<T, K>, filter: (key: K, value: T) => boolean): Dict<T, K>;
/** Map object values while preserving the original key set. */
declare function mapValues<U, T, K extends string>(object: Dict<T, K>, transform: (value: T, key: K) => U): Dict<U, K>;
/** Pick selected keys from an object, optionally including `undefined` values. */
declare function pick<T extends object, K extends keyof T>(source: T, keys?: Iterable<K>, forced?: boolean): Pick<T, K>;
/** Omit selected keys from a shallow object copy. */
declare function omit<T, K extends keyof T>(source: T, keys?: Iterable<K>): Omit<T, K>;
/** Define a non-enumerable writable property with a typed key. */
declare function defineProperty<T, K extends keyof T>(object: T, key: K, value: T[K]): T;
/** Define a non-enumerable writable property with an arbitrary key. */
declare function defineProperty<T, K extends keyof any>(object: T, key: K, value: any): T;
/** Uppercase the first character of a string. */
declare function capitalize(source: string): string;
/** Lowercase the first character of a string. */
declare function uncapitalize(source: string): string;
/** Convert dash or underscore delimited text to camelCase. */
declare function camelCase(source: string): string;
/** Convert text to dash-delimited parameter case. */
declare function paramCase(source: string): string;
/** Convert text to underscore-delimited snake case. */
declare function snakeCase(source: string): string;
/** Runtime alias for `camelCase`. */
declare const camelize: typeof camelCase;
/** Runtime alias for `paramCase`. */
declare const hyphenate: typeof paramCase;
declare namespace Letter {
  interface LowerToUpper {
    a: 'A';
    b: 'B';
    c: 'C';
    d: 'D';
    e: 'E';
    f: 'F';
    g: 'G';
    h: 'H';
    i: 'I';
    j: 'J';
    k: 'K';
    l: 'L';
    m: 'M';
    n: 'N';
    o: 'O';
    p: 'P';
    q: 'Q';
    r: 'R';
    s: 'S';
    t: 'T';
    u: 'U';
    v: 'V';
    w: 'W';
    x: 'X';
    y: 'Y';
    z: 'Z';
  }
  interface UpperToLower {
    A: 'a';
    B: 'b';
    C: 'c';
    D: 'd';
    E: 'e';
    F: 'f';
    G: 'g';
    H: 'h';
    I: 'i';
    J: 'j';
    K: 'k';
    L: 'l';
    M: 'm';
    N: 'n';
    O: 'o';
    P: 'p';
    Q: 'q';
    R: 'r';
    S: 's';
    T: 't';
    U: 'u';
    V: 'v';
    W: 'w';
    X: 'x';
    Y: 'y';
    Z: 'z';
  }
  export type Upper = keyof UpperToLower;
  export type Lower = keyof LowerToUpper;
  export type ToUpper<S extends string> = S extends Lower ? LowerToUpper[S] : S;
  export type ToLower<S extends string, P extends string = ''> = S extends Upper ? `${P}${UpperToLower[S]}` : S;
  export {};
}
/** Type-level conversion from dash-delimited text to camelCase. */
type camelize<S extends string> = S extends `${infer L}-${infer M}${infer R}` ? `${L}${Letter.ToUpper<M>}${camelize<R>}` : S;
/** Type-level conversion from camelCase text to dash-delimited text. */
type hyphenate<S extends string> = S extends `${infer L}${infer R}` ? `${Letter.ToLower<L, '-'>}${hyphenate<R>}` : S;
/** Format a property key as a JavaScript member access suffix. */
declare function formatProperty(key: keyof any): string;
/** Remove one trailing slash from a path string. */
declare function trimSlash(source: string): string;
/** Ensure a path starts with `/` and has no trailing slash. */
declare function sanitize(source: string): string;
/** Time constants plus parsing and formatting helpers. */
declare namespace Time {
  const millisecond = 1;
  const second = 1000;
  const minute: number;
  const hour: number;
  const day: number;
  const week: number;
  function setTimezoneOffset(offset: number): void;
  function getTimezoneOffset(): number;
  function getDateNumber(date?: number | Date, offset?: number): number;
  function fromDateNumber(value: number, offset?: number): Date;
  function parseTime(source: string): number;
  function parseDate(date: string): Date;
  function format(ms: number): string;
  function toDigits(source: number, length?: number): string;
  function template(template: string, time?: Date): string;
}
/** Shared config references used by schema validators and plugin runtimes. */
/** Recursively readonly data returned by a volatile config reference. */
type VolatileSnapshot<T> = T extends object ? { readonly [K in keyof T]: VolatileSnapshot<T[K]>; } : T;
/** A stable reference; keep the reference, or capture its value for one operation only. */
interface Volatile<T> {
  /** @returns the current immutable snapshot, including undefined for an absent value. */
  get(): VolatileSnapshot<T>;
}
/**
 * Create a detached reference containing an immutable copy of the supplied data.
 * @param value - validated config data; class instances and functions are unsupported.
 * @returns a reference whose value is updated only by its owning runtime.
 */
declare function createVolatile<T>(value: T): Volatile<T>;
/**
 * Identify references across ESM/CJS copies of the shared library.
 * @param value - a parsed config value.
 * @returns whether the value implements the shared reference protocol.
 */
declare function isVolatile(value: unknown): value is Volatile<unknown>;
/**
 * Collect config references without descending into their snapshots or opaque objects.
 * @internal
 * @param value - parsed config; cyclic ordinary fields are visited once per path.
 * @returns references and their object-key paths, including an empty path for a root reference.
 */
declare function volatileEntries(value: unknown): {
  path: string[];
  ref: Volatile<unknown>;
}[];
/**
 * Commit an already validated immutable snapshot from another reference.
 * @internal
 * @param target - the owning plugin's stable reference.
 * @param source - a newly parsed candidate reference.
 */
declare function updateVolatile(target: Volatile<unknown>, source: Volatile<unknown>): void;
export { Awaitable, Binary, Dict, Extract, Get, Intersect, MaybeArray, Promisify, Time, Volatile, VolatileSnapshot, arrayBufferToBase64, arrayBufferToHex, base64ToArrayBuffer, camelCase, camelize, capitalize, clone, contain, createVolatile, deduplicate, deepEqual, defineProperty, difference, filterKeys, formatProperty, hexToArrayBuffer, hyphenate, intersection, is, isNonNullable, isNullable, isPlainObject, isVolatile, makeArray, mapValues, mapValues as valueMap, noop, omit, paramCase, pick, remove, sanitize, snakeCase, trimSlash, uncapitalize, union, updateVolatile, volatileEntries };