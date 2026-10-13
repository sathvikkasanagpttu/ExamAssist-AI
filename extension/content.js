var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
(function() {
  "use strict";
  function getEnumValues(entries) {
    const numericValues = Object.values(entries).filter((v2) => typeof v2 === "number");
    const values = Object.entries(entries).filter(([k2, _2]) => numericValues.indexOf(+k2) === -1).map(([_2, v2]) => v2);
    return values;
  }
  function joinValues(array2, separator = "|") {
    return array2.map((val) => stringifyPrimitive(val)).join(separator);
  }
  function jsonStringifyReplacer(_2, value) {
    if (typeof value === "bigint")
      return value.toString();
    return value;
  }
  class Cached {
    constructor(getter) {
      this._getter = getter;
      this._value = void 0;
    }
    get value() {
      const getter = this._getter;
      if (getter !== void 0) {
        this._value = getter();
        this._getter = void 0;
      }
      return this._value;
    }
  }
  function cached(getter) {
    return new Cached(getter);
  }
  function nullish(input) {
    return input === null || input === void 0;
  }
  function cleanRegex(source) {
    const start = source.startsWith("^") ? 1 : 0;
    const end = source.endsWith("$") ? source.length - 1 : source.length;
    return source.slice(start, end);
  }
  function floatSafeRemainder(val, step) {
    const ratio = val / step;
    const roundedRatio = Math.round(ratio);
    const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
    if (Math.abs(ratio - roundedRatio) < tolerance)
      return 0;
    return ratio - roundedRatio;
  }
  function assignProp(target, prop, value) {
    Object.defineProperty(target, prop, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  function rawShape(def) {
    const desc = Object.getOwnPropertyDescriptor(def, "shape");
    return (desc == null ? void 0 : desc.get) ? desc.get.raw : desc == null ? void 0 : desc.value;
  }
  function sourceShape(schema) {
    return rawShape(schema._zod.def) ?? schema._zod.def.shape;
  }
  function deferProp(target, key, getter) {
    Object.defineProperty(target, key, {
      get() {
        const value = getter();
        assignProp(this, key, value);
        return value;
      },
      enumerable: true,
      configurable: true
    });
  }
  function putProp(target, key, value) {
    if (key in target)
      assignProp(target, key, value);
    else
      target[key] = value;
  }
  function mirrorShape(target, source, keys, wrap) {
    const raw = sourceShape(source);
    for (const key of keys) {
      const desc = Object.getOwnPropertyDescriptor(raw, key);
      if (!desc.enumerable)
        continue;
      if (desc.get) {
        deferProp(target, key, () => {
          const value = source._zod.def.shape[key];
          return wrap ? wrap(value, key) : value;
        });
      } else
        putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
    }
  }
  function mirrorProps(target, source) {
    for (const key of Reflect.ownKeys(source)) {
      const desc = Object.getOwnPropertyDescriptor(source, key);
      if (!desc.enumerable)
        continue;
      if (desc.get)
        deferProp(target, key, () => source[key]);
      else
        putProp(target, key, desc.value);
    }
  }
  function mergeDefs(...defs) {
    const mergedDescriptors = {};
    for (const def of defs) {
      const descriptors = Object.getOwnPropertyDescriptors(def);
      Object.assign(mergedDescriptors, descriptors);
    }
    return Object.defineProperties({}, mergedDescriptors);
  }
  function esc(str) {
    return JSON.stringify(str);
  }
  function slugify(input) {
    return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
  }
  const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {
  };
  function isObject(data) {
    return typeof data === "object" && data !== null && !Array.isArray(data);
  }
  const allowsEval = /* @__PURE__ */ cached(() => {
    var _a2;
    if (globalConfig.jitless) {
      return false;
    }
    if (typeof navigator !== "undefined" && ((_a2 = navigator == null ? void 0 : navigator.userAgent) == null ? void 0 : _a2.includes("Cloudflare"))) {
      return false;
    }
    try {
      const F = Function;
      new F("");
      return true;
    } catch (_2) {
      return false;
    }
  });
  function isPlainObject(o2) {
    if (isObject(o2) === false)
      return false;
    const ctor = o2.constructor;
    if (ctor === void 0)
      return true;
    if (typeof ctor !== "function")
      return true;
    const prot = ctor.prototype;
    if (isObject(prot) === false)
      return false;
    if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
      return false;
    }
    return true;
  }
  function shallowClone(o2) {
    if (isPlainObject(o2))
      return { ...o2 };
    if (Array.isArray(o2))
      return [...o2];
    if (o2 instanceof Map)
      return new Map(o2);
    if (o2 instanceof Set)
      return new Set(o2);
    return o2;
  }
  const propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function clone(inst, def, params) {
    const cl = new inst._zod.constr(def ?? inst._zod.def);
    if (!def || (params == null ? void 0 : params.parent))
      cl._zod.parent = inst;
    return cl;
  }
  function normalizeParams(_params) {
    const params = _params;
    if (!params)
      return {};
    if (typeof params === "string")
      return { error: () => params };
    if ((params == null ? void 0 : params.message) !== void 0) {
      if ((params == null ? void 0 : params.error) !== void 0)
        throw new Error("Cannot specify both `message` and `error` params");
      params.error = params.message;
    }
    delete params.message;
    if (typeof params.error === "string")
      return { ...params, error: () => params.error };
    return params;
  }
  function stringifyPrimitive(value) {
    if (typeof value === "bigint")
      return value.toString() + "n";
    if (typeof value === "string")
      return `"${value}"`;
    return `${value}`;
  }
  function optionalKeys(shape) {
    return Object.keys(shape).filter((k2) => {
      return shape[k2]._zod.optin !== void 0 && shape[k2]._zod.optout === "optional";
    });
  }
  const NUMBER_FORMAT_RANGES = /* @__PURE__ */ (() => ({
    safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    int32: [-2147483648, 2147483647],
    uint32: [0, 4294967295],
    float32: [-34028234663852886e22, 34028234663852886e22],
    float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
  }))();
  const BIGINT_FORMAT_RANGES = {
    int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
    uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
  };
  function pick(schema, mask) {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
      throw new Error(".pick() cannot be used on object schemas containing refinements");
    }
    const newShape = {};
    mirrorShape(newShape, schema, maskedKeys(schema, mask));
    return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
  }
  function maskedKeys(schema, mask) {
    var _a2;
    const raw = sourceShape(schema);
    const keys = [];
    for (const key of Reflect.ownKeys(mask)) {
      if (!((_a2 = Object.getOwnPropertyDescriptor(raw, key)) == null ? void 0 : _a2.enumerable)) {
        throw new Error(`Unrecognized key: "${String(key)}"`);
      }
      if (mask[key])
        keys.push(key);
    }
    return keys;
  }
  function omit(schema, mask) {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
      throw new Error(".omit() cannot be used on object schemas containing refinements");
    }
    const omitted = new Set(maskedKeys(schema, mask));
    const newShape = {};
    mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key) => !omitted.has(key)));
    return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
  }
  function extend(schema, shape) {
    if (!isPlainObject(shape)) {
      throw new Error("Invalid input to extend: expected a plain object");
    }
    const checks = schema._zod.def.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
      const existingShape = sourceShape(schema);
      for (const key of Reflect.ownKeys(shape)) {
        if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) {
          throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
        }
      }
    }
    return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
  }
  function extended(schema, shape) {
    const newShape = {};
    mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
    mirrorProps(newShape, shape);
    return newShape;
  }
  function safeExtend(schema, shape) {
    if (!isPlainObject(shape)) {
      throw new Error("Invalid input to safeExtend: expected a plain object");
    }
    return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
  }
  function merge(a2, b2) {
    var _a2, _b;
    if (!((_a2 = b2 == null ? void 0 : b2._zod) == null ? void 0 : _a2.def)) {
      throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
    }
    if ((_b = a2._zod.def.checks) == null ? void 0 : _b.length) {
      throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
    }
    const newShape = {};
    mirrorShape(newShape, a2, Reflect.ownKeys(sourceShape(a2)));
    mirrorShape(newShape, b2, Reflect.ownKeys(sourceShape(b2)));
    const def = mergeDefs(a2._zod.def, {
      shape: newShape,
      get catchall() {
        return b2._zod.def.catchall;
      },
      checks: b2._zod.def.checks ?? []
    });
    return clone(a2, def);
  }
  function partial(Class, schema, mask, name = "partial") {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
      throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
    }
    const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
    const newShape = {};
    mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class && ((value, key) => selected && !selected.has(key) ? value : new Class({ type: "optional", innerType: value })));
    return clone(schema, mergeDefs(schema._zod.def, { shape: newShape, checks: [] }));
  }
  function required(Class, schema, mask) {
    const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
    const newShape = {};
    mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key) => (
      // overwrite with non-optional
      selected && !selected.has(key) ? value : new Class({ type: "nonoptional", innerType: value })
    ));
    return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
  }
  function aborted(x2, startIndex = 0) {
    var _a2;
    if (x2.aborted === true)
      return true;
    for (let i2 = startIndex; i2 < x2.issues.length; i2++) {
      if (((_a2 = x2.issues[i2]) == null ? void 0 : _a2.continue) !== true) {
        return true;
      }
    }
    return false;
  }
  function explicitlyAborted(x2, startIndex = 0) {
    var _a2;
    if (x2.aborted === true)
      return true;
    for (let i2 = startIndex; i2 < x2.issues.length; i2++) {
      if (((_a2 = x2.issues[i2]) == null ? void 0 : _a2.continue) === false) {
        return true;
      }
    }
    return false;
  }
  function prefixIssues(path, issues) {
    return issues.map((iss) => {
      var _a2;
      (_a2 = iss).path ?? (_a2.path = []);
      iss.path.unshift(path);
      return iss;
    });
  }
  function unwrapMessage(message) {
    return typeof message === "string" ? message : message == null ? void 0 : message.message;
  }
  function attachSchema(issues, start, inst) {
    var _a2;
    for (let i2 = start; i2 < issues.length; i2++) {
      (_a2 = issues[i2]).schema ?? (_a2.schema = inst);
    }
  }
  function finalizeIssue(iss, ctx, config2) {
    var _a3, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    var _a2;
    const traits = (_b = (_a3 = iss.inst) == null ? void 0 : _a3._zod) == null ? void 0 : _b.traits;
    if (traits == null ? void 0 : traits.has("$ZodType")) {
      if (traits.has("$ZodCheck"))
        (_a2 = iss).schema ?? (_a2.schema = iss.inst);
      else
        iss.schema = iss.inst;
    }
    const schemaError = iss.schema !== iss.inst ? (_d = (_c = iss.schema) == null ? void 0 : _c._zod.def) == null ? void 0 : _d.error : void 0;
    const message = iss.message ? iss.message : unwrapMessage((_g = (_f = (_e = iss.inst) == null ? void 0 : _e._zod.def) == null ? void 0 : _f.error) == null ? void 0 : _g.call(_f, iss)) ?? unwrapMessage(schemaError == null ? void 0 : schemaError(iss)) ?? unwrapMessage((_h = ctx == null ? void 0 : ctx.error) == null ? void 0 : _h.call(ctx, iss)) ?? unwrapMessage((_i = config2.customError) == null ? void 0 : _i.call(config2, iss)) ?? unwrapMessage((_j = config2.localeError) == null ? void 0 : _j.call(config2, iss)) ?? "Invalid input";
    const full = {};
    for (const k2 of Object.keys(iss)) {
      if (k2 === "inst" || k2 === "schema" || k2 === "continue" || k2 === "input" || k2 === "__proto__")
        continue;
      full[k2] = iss[k2];
    }
    full.path ?? (full.path = []);
    full.message = message;
    if (ctx == null ? void 0 : ctx.reportInput) {
      full.input = iss.input;
    }
    return full;
  }
  const highSurrogate = /[\uD800-\uDBFF]/;
  function codePointLength(str) {
    const units = str.length;
    if (!highSurrogate.test(str))
      return units;
    let count = units;
    for (let i2 = 0; i2 < units - 1; i2++) {
      if ((str.charCodeAt(i2) & 64512) === 55296 && (str.charCodeAt(i2 + 1) & 64512) === 56320) {
        count--;
        i2++;
      }
    }
    return count;
  }
  function getLengthableOrigin(input) {
    if (Array.isArray(input))
      return "array";
    if (typeof input === "string")
      return "string";
    return "unknown";
  }
  function parsedType(data) {
    const t2 = typeof data;
    switch (t2) {
      case "number": {
        return Number.isNaN(data) ? "nan" : "number";
      }
      case "object": {
        if (data === null) {
          return "null";
        }
        if (Array.isArray(data)) {
          return "array";
        }
        const obj = data;
        if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
          return obj.constructor.name;
        }
      }
    }
    return t2;
  }
  function issue(...args) {
    const [iss, input, inst] = args;
    if (typeof iss === "string") {
      return {
        message: iss,
        code: "custom",
        input,
        inst
      };
    }
    return { ...iss };
  }
  function members(proto, table) {
    for (const key in table) {
      const desc = Object.getOwnPropertyDescriptor(table, key);
      if (desc.get)
        Object.defineProperty(proto, key, { ...desc, enumerable: false });
      else
        defineBound(proto, key, desc.value);
    }
  }
  function own(inst, key, value, enumerable = true) {
    Object.defineProperty(inst, key, { configurable: true, writable: true, enumerable, value });
    return value;
  }
  function hide(inst, key, value) {
    return own(inst, key, value, false);
  }
  function derived(computes, table) {
    for (const key in computes) {
      const compute = computes[key];
      Object.defineProperty(table, key, {
        configurable: true,
        enumerable: true,
        get() {
          return own(this, key, compute(this));
        },
        set(value) {
          own(this, key, value);
        }
      });
    }
    return table;
  }
  function defineBound(proto, key, fn) {
    Object.defineProperty(proto, key, {
      configurable: true,
      get() {
        return this == null ? fn : own(this, key, fn.bind(this));
      },
      set(value) {
        own(this, key, value);
      }
    });
  }
  function claim(inst, sentinel) {
    const proto = Object.getPrototypeOf(inst);
    return sentinel in proto ? void 0 : proto;
  }
  let installing;
  let broke = false;
  const breaker = {
    configurable: true,
    get() {
      broke = true;
      return void 0;
    }
  };
  function defineLazyInternal(inst, key, compute) {
    const proto = Object.getPrototypeOf(inst._zod);
    if (key in proto && installing !== inst._zod) {
      installing = void 0;
      return;
    }
    installing = inst._zod;
    Object.defineProperty(proto, key, {
      configurable: true,
      get() {
        Object.defineProperty(this, key, breaker);
        const outer = broke;
        broke = false;
        try {
          const value = compute(this);
          if (broke)
            delete this[key];
          else
            Object.defineProperty(this, key, { configurable: true, writable: true, value });
          broke = broke || outer;
          return value;
        } catch (err) {
          delete this[key];
          broke = broke || outer;
          throw err;
        }
      },
      set(value) {
        Object.defineProperty(this, key, { configurable: true, writable: true, value });
      }
    });
  }
  function installLazyProp(inst, key, make, enumerable) {
    const proto = claim(inst, key);
    if (!proto)
      return;
    Object.defineProperty(proto, key, {
      configurable: true,
      get() {
        const desc = { configurable: true, writable: true, enumerable, value: void 0 };
        Object.defineProperty(this, key, desc);
        desc.value = make(this);
        Object.defineProperty(this, key, desc);
        return desc.value;
      },
      set(value) {
        Object.defineProperty(this, key, { configurable: true, writable: true, enumerable, value });
      }
    });
  }
  const CONSTANT_CATCH = "~constantCatch";
  function constantCatch(value) {
    const fn = () => value;
    fn[CONSTANT_CATCH] = true;
    return fn;
  }
  var _a$1;
  const _zodDesc = { value: void 0, enumerable: false };
  let _E = "captureStackTrace" in Error ? Error : null;
  function newError(Definition) {
    const E2 = _E;
    if (E2) {
      const saved = E2.stackTraceLimit;
      if (typeof saved === "number") {
        try {
          E2.stackTraceLimit = 0;
        } catch {
          _E = null;
          return new Definition();
        }
        try {
          return new Definition();
        } finally {
          E2.stackTraceLimit = saved;
        }
      }
    }
    return new Definition();
  }
  function $constructor(name, initializer2, proto, params) {
    const zodProto = {};
    function Internals(def) {
      this.def = def;
      this.constr = _2;
      this.traits = /* @__PURE__ */ new Set();
    }
    Internals.prototype = zodProto;
    const protoMembers = proto;
    const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
    function init(inst, def) {
      if (!inst._zod) {
        _zodDesc.value = new Internals(def);
        try {
          Object.defineProperty(inst, "_zod", _zodDesc);
        } finally {
          _zodDesc.value = void 0;
        }
      } else if (inst._zod.traits.has(name)) {
        return;
      }
      inst._zod.traits.add(name);
      initializer2(inst, def);
      if (initialized) {
        const own2 = Object.getPrototypeOf(inst);
        const ctorProto = inst._zod.constr.prototype;
        let up = own2;
        while (up && up !== ctorProto)
          up = Object.getPrototypeOf(up);
        const target = up ?? own2;
        if (!initialized.has(target)) {
          initialized.add(target);
          members(target, protoMembers);
        }
      }
      const proto2 = _2.prototype;
      for (const k2 in proto2) {
        if (!Object.prototype.hasOwnProperty.call(proto2, k2))
          continue;
        if (!(k2 in inst)) {
          inst[k2] = proto2[k2].bind(inst);
        }
      }
    }
    const Parent = (params == null ? void 0 : params.Parent) ?? Object;
    class Definition extends Parent {
    }
    Object.defineProperty(Definition, "name", { value: name });
    function _2(def) {
      var _a2;
      const inst = (params == null ? void 0 : params.Parent) ? newError(Definition) : this;
      init(inst, def);
      const deferred = inst._zod.deferred;
      if (deferred) {
        for (const fn of deferred) {
          fn();
        }
        inst._zod.deferred = void 0;
      }
      const pp = (_a2 = globalThis.__zod_globalConfig) == null ? void 0 : _a2.postProcessor;
      if (pp)
        pp(inst);
      return inst;
    }
    Object.defineProperty(_2, "init", { value: init });
    Object.defineProperty(_2, Symbol.hasInstance, {
      value: (inst) => {
        var _a2, _b;
        if ((params == null ? void 0 : params.Parent) && inst instanceof params.Parent)
          return true;
        return (_b = (_a2 = inst == null ? void 0 : inst._zod) == null ? void 0 : _a2.traits) == null ? void 0 : _b.has(name);
      }
    });
    Object.defineProperty(_2, "name", { value: name });
    return _2;
  }
  class $ZodAsyncError extends Error {
    constructor() {
      super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
    }
  }
  class $ZodEncodeError extends Error {
    constructor(name) {
      super(`Encountered unidirectional transform during encode: ${name}`);
      this.name = "ZodEncodeError";
    }
  }
  (_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
  const globalConfig = globalThis.__zod_globalConfig;
  function config(newConfig) {
    if (newConfig)
      Object.assign(globalConfig, newConfig);
    return globalConfig;
  }
  function _getMessage() {
    const internals = this._zod;
    internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
    return internals.message;
  }
  function _setMessage(value) {
    this._zod.message = value;
  }
  const _messageDesc = {
    get: _getMessage,
    set: _setMessage,
    enumerable: true,
    configurable: true
  };
  const _issuesDesc = { value: void 0, enumerable: false };
  const _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
  const initializer$1 = (inst, def) => {
    inst.name = "$ZodError";
    _issuesDesc.value = def;
    Object.defineProperty(inst, "issues", _issuesDesc);
    _issuesDesc.value = void 0;
    Object.defineProperty(inst, "message", _messageDesc);
    const proto = Object.getPrototypeOf(inst);
    if (!_installedToString.has(proto)) {
      _installedToString.add(proto);
      Object.defineProperty(proto, "toString", {
        configurable: true,
        enumerable: false,
        get() {
          const value = () => this.message;
          Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
          return value;
        },
        set(value) {
          Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
        }
      });
    }
  };
  const $ZodError = $constructor("$ZodError", initializer$1);
  function node(obj, key, make) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      if (key === "__proto__") {
        Object.defineProperty(obj, key, { value: make(), writable: true, enumerable: true, configurable: true });
      } else {
        obj[key] = make();
      }
    }
    return obj[key];
  }
  function flattenError(error2, mapper = (issue2) => issue2.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of error2.issues) {
      if (sub.path.length > 0) {
        node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  function formatError(error2, mapper = (issue2) => issue2.message) {
    const fieldErrors = { _errors: [] };
    const processError = (error3, path = []) => {
      for (const issue2 of error3.issues) {
        if (issue2.code === "invalid_union" && issue2.errors.length) {
          issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
        } else if (issue2.code === "invalid_key") {
          processError({ issues: issue2.issues }, [...path, ...issue2.path]);
        } else if (issue2.code === "invalid_element") {
          processError({ issues: issue2.issues }, [...path, ...issue2.path]);
        } else {
          const fullpath = [...path, ...issue2.path];
          if (fullpath.length === 0) {
            fieldErrors._errors.push(mapper(issue2));
          } else {
            let curr = fieldErrors;
            let i2 = 0;
            while (i2 < fullpath.length) {
              const el = fullpath[i2];
              const terminal = i2 === fullpath.length - 1;
              if (el === "_errors") {
                if (terminal)
                  curr._errors.push(mapper(issue2));
                i2++;
                continue;
              }
              if (!Object.prototype.hasOwnProperty.call(curr, el)) {
                Object.defineProperty(curr, el, {
                  value: { _errors: [] },
                  enumerable: true,
                  writable: true,
                  configurable: true
                });
              }
              const node2 = curr[el];
              if (terminal) {
                node2._errors.push(mapper(issue2));
              }
              curr = node2;
              i2++;
            }
          }
        }
      }
    };
    processError(error2);
    return fieldErrors;
  }
  function finalizeParams(callee, params) {
    return { callee: (params == null ? void 0 : params.callee) ?? callee, Err: params == null ? void 0 : params.Err };
  }
  const _parse = (_Err) => {
    const fn = (schema, value, _ctx, _params) => {
      const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
      const result = schema._zod.run({ value, issues: [] }, ctx);
      if (result instanceof Promise) {
        throw new $ZodAsyncError();
      }
      if (result.issues.length) {
        const e2 = new ((_params == null ? void 0 : _params.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e2, (_params == null ? void 0 : _params.callee) ?? fn);
        throw e2;
      }
      return result.value;
    };
    return fn;
  };
  const _parseAsync = (_Err) => {
    const fn = async (schema, value, _ctx, params) => {
      const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
      let result = schema._zod.run({ value, issues: [] }, ctx);
      if (result instanceof Promise)
        result = await result;
      if (result.issues.length) {
        const e2 = new ((params == null ? void 0 : params.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e2, (params == null ? void 0 : params.callee) ?? fn);
        throw e2;
      }
      return result.value;
    };
    return fn;
  };
  const _safeParse = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new $ZodAsyncError();
    }
    return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
  };
  function failure(Err, issues, ctx) {
    let error2;
    return {
      success: false,
      get error() {
        if (!error2) {
          error2 = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
          issues = void 0;
          ctx = void 0;
        }
        return error2;
      },
      set error(e2) {
        error2 = e2;
        issues = void 0;
        ctx = void 0;
      }
    };
  }
  const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
  };
  const COMPILE_INVALID = /* @__PURE__ */ Symbol.for("zod.compile.invalid");
  const COMPILE_FALLBACK = /* @__PURE__ */ Symbol.for("zod.compile.fallback");
  const validate = ((schema, value, _ctx) => {
    const validator = schema._zod.bag.validator;
    if (validator !== void 0) {
      if (validator(value) !== COMPILE_INVALID)
        return true;
      if (validator.definite === true && _ctx === void 0)
        return false;
    }
    return validateFallback(schema, value, _ctx);
  });
  function validateFallback(schema, value, _ctx) {
    const ctx = _ctx ? { ..._ctx, async: false, abortEarly: true } : { async: false, abortEarly: true };
    const fallbackRun = schema._zod.bag.fallbackRun;
    let result;
    if (fallbackRun) {
      ctx[COMPILE_FALLBACK] = true;
      result = fallbackRun({ value, issues: [] }, ctx);
    } else {
      result = schema._zod.run({ value, issues: [] }, ctx);
    }
    if (result instanceof Promise) {
      throw new $ZodAsyncError();
    }
    return result.issues.length === 0;
  }
  const validateAsync$1 = async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: true, abortEarly: true } : { async: true, abortEarly: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    return result.issues.length === 0;
  };
  const _encode = (_Err) => {
    const parse2 = _parse(_Err);
    const fn = (schema, value, _ctx, _params) => {
      const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
      return parse2(schema, value, ctx, finalizeParams(fn, _params));
    };
    return fn;
  };
  const _decode = (_Err) => {
    const parse2 = _parse(_Err);
    const fn = (schema, value, _ctx, _params) => {
      return parse2(schema, value, _ctx, finalizeParams(fn, _params));
    };
    return fn;
  };
  const _encodeAsync = (_Err) => {
    const parseAsync2 = _parseAsync(_Err);
    const fn = async (schema, value, _ctx, _params) => {
      const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
      return await parseAsync2(schema, value, ctx, finalizeParams(fn, _params));
    };
    return fn;
  };
  const _decodeAsync = (_Err) => {
    const parseAsync2 = _parseAsync(_Err);
    const fn = async (schema, value, _ctx, _params) => {
      return await parseAsync2(schema, value, _ctx, finalizeParams(fn, _params));
    };
    return fn;
  };
  const _safeEncode = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _safeParse(_Err)(schema, value, ctx);
  };
  const _safeDecode = (_Err) => (schema, value, _ctx) => {
    return _safeParse(_Err)(schema, value, _ctx);
  };
  const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _safeParseAsync(_Err)(schema, value, ctx);
  };
  const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
    return _safeParseAsync(_Err)(schema, value, _ctx);
  };
  const cuid = /^[cC][0-9a-z]{6,}$/;
  const cuid2 = /^[0-9a-z]+$/;
  const ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
  const xid = /^[0-9a-vA-V]{20}$/;
  const ksuid = /^[A-Za-z0-9]{27}$/;
  const nanoid = /^[a-zA-Z0-9_-]{21}$/;
  function nanoidOfLength(length) {
    return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
  }
  const duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
  const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
  const uuid = (version2) => {
    if (!version2)
      return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
    return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version2}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
  };
  const email = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
  const _emoji$1 = `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
  function emoji() {
    return new RegExp(_emoji$1, "u");
  }
  const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
  const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
  const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
  const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
  const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
  const base64url = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
  const httpProtocol = /^https?$/;
  const e164 = /^\+[1-9]\d{6,14}$/;
  const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
  function anchor(source) {
    return new RegExp(`^${source}$`);
  }
  const date = /* @__PURE__ */ anchor(dateSource);
  function timeSource(args) {
    const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
    const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
    return regex;
  }
  function time(args) {
    return new RegExp(`^${timeSource(args)}$`);
  }
  function datetime(args) {
    const opts = ["Z"];
    if (args.offset)
      opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
    const qualified = `${timeSource({ precision: args.precision, seconds: true })}(?:${opts.join("|")})`;
    const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
    return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
  }
  const anyString = /^[\s\S]{0,}$/;
  const integer = /^-?\d+$/;
  const number$1 = /^-?\d+(?:\.\d+)?$/;
  const boolean$1 = /^(?:true|false)$/i;
  const lowercase = /^[^A-Z]*$/;
  const uppercase = /^[^a-z]*$/;
  const $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
    var _a2;
    inst._zod ?? (inst._zod = {});
    inst._zod.def = def;
    (_a2 = inst._zod).onattach ?? (_a2.onattach = []);
  });
  const _whenHasLength = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  };
  const numericOriginMap = {
    number: "number",
    bigint: "bigint",
    object: "date"
  };
  const $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.check = (payload) => {
      if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
        return;
      }
      payload.issues.push({
        origin: numericOriginMap[typeof payload.value] ?? origin,
        code: "too_big",
        maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
        input: payload.value,
        inclusive: def.inclusive,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.check = (payload) => {
      if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
        return;
      }
      payload.issues.push({
        origin: numericOriginMap[typeof payload.value] ?? origin,
        code: "too_small",
        minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
        input: payload.value,
        inclusive: def.inclusive,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
      if (typeof payload.value !== typeof def.value)
        throw new Error("Cannot mix number and bigint in multiple_of check.");
      const isMultiple = typeof payload.value === "bigint" ? (
        // `value % 0n` throws, and nothing is a multiple of zero — the number branch already fails this way via NaN
        def.value !== BigInt(0) && payload.value % def.value === BigInt(0)
      ) : floatSafeRemainder(payload.value, def.value) === 0;
      if (isMultiple)
        return;
      payload.issues.push({
        origin: typeof payload.value,
        code: "not_multiple_of",
        divisor: def.value,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
    var _a2;
    $ZodCheck.init(inst, def);
    def.format = def.format || "float64";
    const isInt = (_a2 = def.format) == null ? void 0 : _a2.includes("int");
    const origin = isInt ? "int" : "number";
    const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
    inst._zod.check = (payload) => {
      const input = payload.value;
      if (isInt) {
        if (!Number.isInteger(input)) {
          payload.issues.push({
            expected: origin,
            format: def.format,
            code: "invalid_type",
            continue: false,
            input,
            inst
          });
          return;
        }
        if (!Number.isSafeInteger(input)) {
          if (input > 0) {
            payload.issues.push({
              input,
              code: "too_big",
              maximum: Number.MAX_SAFE_INTEGER,
              note: "Integers must be within the safe integer range.",
              inst,
              origin,
              inclusive: true,
              continue: !def.abort
            });
          } else {
            payload.issues.push({
              input,
              code: "too_small",
              minimum: Number.MIN_SAFE_INTEGER,
              note: "Integers must be within the safe integer range.",
              inst,
              origin,
              inclusive: true,
              continue: !def.abort
            });
          }
          return;
        }
      }
      if (input < minimum) {
        payload.issues.push({
          origin: "number",
          input,
          code: "too_small",
          minimum,
          inclusive: true,
          inst,
          continue: !def.abort
        });
      }
      if (input > maximum) {
        payload.issues.push({
          origin: "number",
          input,
          code: "too_big",
          maximum,
          inclusive: true,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  const $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
    var _a2;
    $ZodCheck.init(inst, def);
    (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
    inst._zod.check = (payload) => {
      const input = payload.value;
      const units = input.length;
      const length = typeof input === "string" && units > def.maximum ? codePointLength(input) : units;
      if (length <= def.maximum)
        return;
      const origin = getLengthableOrigin(input);
      payload.issues.push({
        origin,
        code: "too_big",
        maximum: def.maximum,
        inclusive: true,
        input,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
    var _a2;
    $ZodCheck.init(inst, def);
    (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
    inst._zod.check = (payload) => {
      const input = payload.value;
      const units = input.length;
      const length = typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units;
      if (length >= def.minimum)
        return;
      const origin = getLengthableOrigin(input);
      payload.issues.push({
        origin,
        code: "too_small",
        minimum: def.minimum,
        inclusive: true,
        input,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
    var _a2;
    $ZodCheck.init(inst, def);
    (_a2 = inst._zod.def).when ?? (_a2.when = _whenHasLength);
    inst._zod.check = (payload) => {
      const input = payload.value;
      const units = input.length;
      const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
      if (length === def.length)
        return;
      const origin = getLengthableOrigin(input);
      const tooBig = length > def.length;
      payload.issues.push({
        origin,
        ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
        inclusive: true,
        exact: true,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
    var _a2, _b;
    $ZodCheck.init(inst, def);
    if (def.pattern)
      (_a2 = inst._zod).check ?? (_a2.check = (payload) => {
        def.pattern.lastIndex = 0;
        if (def.pattern.test(payload.value))
          return;
        payload.issues.push({
          origin: "string",
          code: "invalid_format",
          format: def.format,
          input: payload.value,
          ...def.pattern ? { pattern: def.pattern.toString() } : {},
          inst,
          continue: !def.abort
        });
      });
    else
      (_b = inst._zod).check ?? (_b.check = () => {
      });
  });
  const $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
    $ZodCheckStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "regex",
        input: payload.value,
        pattern: def.pattern.toString(),
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
    def.pattern ?? (def.pattern = lowercase);
    $ZodCheckStringFormat.init(inst, def);
  });
  const $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
    def.pattern ?? (def.pattern = uppercase);
    $ZodCheckStringFormat.init(inst, def);
  });
  const $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
    $ZodCheck.init(inst, def);
    const escapedRegex = escapeRegex(def.includes);
    const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
    def.pattern = pattern;
    inst._zod.check = (payload) => {
      if (payload.value.includes(def.includes, def.position))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "includes",
        includes: def.includes,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.check = (payload) => {
      if (payload.value.startsWith(def.prefix))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "starts_with",
        prefix: def.prefix,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.check = (payload) => {
      if (payload.value.endsWith(def.suffix))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: "ends_with",
        suffix: def.suffix,
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
      payload.value = def.tx(payload.value);
    };
  });
  class Doc {
    constructor(args = [], closed = {}) {
      this.content = [];
      this.indent = 0;
      this.args = args;
      this.closed = closed;
    }
    // the compiler catches a child's throw and keeps writing into this doc, so the indent has to unwind with it
    indented(fn) {
      this.indent += 1;
      try {
        fn(this);
      } finally {
        this.indent -= 1;
      }
    }
    write(arg) {
      if (typeof arg === "function") {
        arg(this, { execution: "sync" });
        arg(this, { execution: "async" });
        return;
      }
      const content = arg;
      const lines = content.split("\n").filter((x2) => x2);
      const minIndent = Math.min(...lines.map((x2) => x2.length - x2.trimStart().length));
      const dedented = lines.map((x2) => x2.slice(minIndent)).map((x2) => " ".repeat(this.indent * 2) + x2);
      for (const line of dedented) {
        this.content.push(line);
      }
    }
    compile() {
      const F = Function;
      const content = (this == null ? void 0 : this.content) ?? [``];
      const factory = new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {
${content.join("\n")}
};`);
      return factory(...Object.values(this.closed));
    }
  }
  const version = {
    major: 4,
    minor: 6,
    patch: 5
  };
  const $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
    var _a3;
    var _a2;
    inst ?? (inst = {});
    inst._zod.def = def;
    inst._zod.bag = inst._zod.bag || {};
    inst._zod.version = version;
    const defChecks = inst._zod.def.checks;
    const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : (defChecks == null ? void 0 : defChecks.length) ? [...defChecks] : [];
    for (const ch of checks) {
      for (const fn of ch._zod.onattach) {
        fn(inst);
      }
    }
    if (checks.length === 0) {
      (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
      (_a3 = inst._zod.deferred) == null ? void 0 : _a3.push(() => {
        inst._zod.run = inst._zod.parse;
      });
    } else {
      const runChecks = (payload, checks2, ctx) => {
        if (payload.memo)
          return payload;
        let isAborted = aborted(payload);
        let asyncResult;
        for (const ch of checks2) {
          if (ch._zod.def.when) {
            if (explicitlyAborted(payload))
              continue;
            const shouldRun = ch._zod.def.when(payload);
            if (!shouldRun)
              continue;
          } else if (isAborted) {
            continue;
          }
          const currLen = payload.issues.length;
          const _2 = ch._zod.check(payload);
          if (_2 instanceof Promise && (ctx == null ? void 0 : ctx.async) === false) {
            throw new $ZodAsyncError();
          }
          if (asyncResult || _2 instanceof Promise) {
            asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
              await _2;
              const nextLen = payload.issues.length;
              if (nextLen === currLen)
                return;
              attachSchema(payload.issues, currLen, inst);
              if (!isAborted)
                isAborted = aborted(payload, currLen);
            });
          } else {
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              continue;
            attachSchema(payload.issues, currLen, inst);
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          }
        }
        if (asyncResult) {
          return asyncResult.then(() => {
            return payload;
          });
        }
        return payload;
      };
      const handleCanaryResult = (canary, payload, ctx) => {
        if (aborted(canary)) {
          canary.aborted = true;
          return canary;
        }
        const checkResult = runChecks(payload, checks, ctx);
        if (checkResult instanceof Promise) {
          if (ctx.async === false)
            throw new $ZodAsyncError();
          return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
        }
        return inst._zod.parse(checkResult, ctx);
      };
      inst._zod.run = (payload, ctx) => {
        if (ctx.skipChecks) {
          return inst._zod.parse(payload, ctx);
        }
        if (ctx.direction === "backward") {
          const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
          if (canary instanceof Promise) {
            return canary.then((canary2) => {
              return handleCanaryResult(canary2, payload, ctx);
            });
          }
          return handleCanaryResult(canary, payload, ctx);
        }
        const result = inst._zod.parse(payload, ctx);
        if (result instanceof Promise) {
          if (ctx.async === false)
            throw new $ZodAsyncError();
          return result.then((result2) => runChecks(result2, checks, ctx));
        }
        return runChecks(result, checks, ctx);
      };
    }
  }, {
    // Wrappers extend this by installing a richer factory over it; reading it eagerly would defeat the laziness.
    get "~standard"() {
      return hide(this, "~standard", standardProps(this));
    },
    set "~standard"(value) {
      own(this, "~standard", value);
    }
  });
  const toStandardResult = (r2, ctx) => r2.issues.length ? { issues: r2.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r2.value };
  async function validateAsync(inst, value) {
    const ctx = { async: true };
    return toStandardResult(await inst._zod.run({ value, issues: [] }, ctx), ctx);
  }
  function standardProps(inst) {
    return {
      validate: (value) => {
        const ctx = { async: false };
        try {
          const r2 = inst._zod.run({ value, issues: [] }, ctx);
          if (!(r2 instanceof Promise))
            return toStandardResult(r2, ctx);
        } catch (_2) {
        }
        return validateAsync(inst, value);
      },
      vendor: "zod",
      version: 1
    };
  }
  const $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = def.pattern ?? anyString;
    inst._zod.parse = (payload, _2) => {
      if (def.coerce)
        try {
          payload.value = String(payload.value);
        } catch (_3) {
        }
      if (typeof payload.value === "string")
        return payload;
      payload.issues.push({
        expected: "string",
        code: "invalid_type",
        input: payload.value,
        inst
      });
      return payload;
    };
  });
  const $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
    $ZodCheckStringFormat.init(inst, def);
    $ZodString.init(inst, def);
  });
  const $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
    def.pattern ?? (def.pattern = guid);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
    if (def.version) {
      const versionMap = {
        v1: 1,
        v2: 2,
        v3: 3,
        v4: 4,
        v5: 5,
        v6: 6,
        v7: 7,
        v8: 8
      };
      const v2 = versionMap[def.version];
      if (v2 === void 0)
        throw new Error(`Invalid UUID version: "${def.version}"`);
      def.pattern ?? (def.pattern = uuid(v2));
    } else
      def.pattern ?? (def.pattern = uuid());
    $ZodStringFormat.init(inst, def);
  });
  const $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
    def.pattern ?? (def.pattern = email);
    $ZodStringFormat.init(inst, def);
  });
  const URL_BAD_FORMAT = 1;
  const URL_UNPARSEABLE = 2;
  function canParseURL(input) {
    try {
      if (typeof URL !== "undefined" && typeof URL.canParse === "function")
        return URL.canParse(input);
      new URL(input);
      return true;
    } catch {
      return false;
    }
  }
  function validateURL(trimmed, def) {
    if (!("normalize" in def) && !("hostname" in def) && !("protocol" in def)) {
      return canParseURL(trimmed) || URL_UNPARSEABLE;
    }
    return parseURLObject(trimmed, def);
  }
  function parseURLObject(trimmed, def) {
    var _a2;
    if (!def.normalize && ((_a2 = def.protocol) == null ? void 0 : _a2.source) === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) {
      return URL_BAD_FORMAT;
    }
    try {
      if (typeof URL !== "undefined") {
        const URLStatic = URL;
        if (typeof URLStatic.parse === "function")
          return URLStatic.parse(trimmed) ?? URL_UNPARSEABLE;
      }
      return new URL(trimmed);
    } catch {
      return URL_UNPARSEABLE;
    }
  }
  const asciiTabOrNewline = /[\t\n\r]/g;
  function stripTabAndNewline(value) {
    return value.replace(asciiTabOrNewline, "");
  }
  function urlHostnameOk(url, hostname) {
    hostname.lastIndex = 0;
    return hostname.test(url.hostname);
  }
  function urlProtocolOk(url, protocol) {
    protocol.lastIndex = 0;
    return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
  }
  const $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      try {
        const trimmed = payload.value.trim();
        const url = validateURL(trimmed, def);
        if (url === URL_BAD_FORMAT) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid URL format",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
        if (url === URL_UNPARSEABLE) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
        if (url === true) {
          payload.value = stripTabAndNewline(trimmed);
          return;
        }
        if (def.hostname && !urlHostnameOk(url, def.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: def.hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
        if (def.protocol && !urlProtocolOk(url, def.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
        payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
        return;
      } catch (_2) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  const $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
    def.pattern ?? (def.pattern = emoji());
    $ZodStringFormat.init(inst, def);
  });
  const $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
    if (def.length !== void 0 && (!Number.isInteger(def.length) || def.length < 1))
      throw new Error(`Invalid nanoid length: ${def.length}`);
    def.pattern ?? (def.pattern = def.length === void 0 ? nanoid : nanoidOfLength(def.length));
    $ZodStringFormat.init(inst, def);
  });
  const $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
    def.pattern ?? (def.pattern = cuid);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
    def.pattern ?? (def.pattern = cuid2);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
    def.pattern ?? (def.pattern = ulid);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
    def.pattern ?? (def.pattern = xid);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
    def.pattern ?? (def.pattern = ksuid);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
    def.pattern ?? (def.pattern = datetime(def));
    $ZodStringFormat.init(inst, def);
  });
  const $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
    def.pattern ?? (def.pattern = date);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
    def.pattern ?? (def.pattern = time(def));
    $ZodStringFormat.init(inst, def);
  });
  const $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
    def.pattern ?? (def.pattern = duration);
    $ZodStringFormat.init(inst, def);
  });
  const $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
    def.pattern ?? (def.pattern = ipv4);
    $ZodStringFormat.init(inst, def);
  });
  const ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
  function isValidIPv6(value) {
    if (!ipv6Alphabet.test(value))
      return false;
    return canParseURL(`http://[${value}]`);
  }
  const $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
    def.pattern ?? (def.pattern = ipv6);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (!isValidIPv6(payload.value)) {
        payload.issues.push({
          code: "invalid_format",
          format: "ipv6",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  const $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv4);
    $ZodStringFormat.init(inst, def);
  });
  function isValidCIDRv6(value) {
    const parts = value.split("/");
    if (parts.length !== 2)
      return false;
    const [address, prefix] = parts;
    if (!prefix)
      return false;
    const prefixNum = Number(prefix);
    if (`${prefixNum}` !== prefix)
      return false;
    if (prefixNum < 0 || prefixNum > 128)
      return false;
    return isValidIPv6(address);
  }
  const $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv6);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (!isValidCIDRv6(payload.value)) {
        payload.issues.push({
          code: "invalid_format",
          format: "cidrv6",
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
    };
  });
  function isValidBase64(data) {
    if (data === "")
      return true;
    if (/\s/.test(data))
      return false;
    if (data.length % 4 !== 0)
      return false;
    try {
      atob(data);
      return true;
    } catch {
      return false;
    }
  }
  const base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
  const $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
    def.pattern ?? (def.pattern = base64Charset);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (isValidBase64(payload.value))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "base64",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const base64urlCharset = /^[A-Za-z0-9_-]*$/;
  function isValidBase64URL(data) {
    if (!base64urlCharset.test(data))
      return false;
    const base642 = data.replace(/[-_]/g, (c2) => c2 === "-" ? "+" : "/");
    const padded = base642.padEnd(Math.ceil(base642.length / 4) * 4, "=");
    return isValidBase64(padded);
  }
  const $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
    def.pattern ?? (def.pattern = base64urlCharset);
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (isValidBase64URL(payload.value))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "base64url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
    def.pattern ?? (def.pattern = e164);
    $ZodStringFormat.init(inst, def);
  });
  function isValidJWT(token, algorithm = null) {
    try {
      const tokensParts = token.split(".");
      if (tokensParts.length !== 3)
        return false;
      const [header] = tokensParts;
      if (!header)
        return false;
      const parsedHeader = JSON.parse(atob(header));
      if ("typ" in parsedHeader && (parsedHeader == null ? void 0 : parsedHeader.typ) !== "JWT")
        return false;
      if (!parsedHeader.alg)
        return false;
      if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
        return false;
      return true;
    } catch {
      return false;
    }
  }
  const $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
      if (isValidJWT(payload.value, def.alg))
        return;
      payload.issues.push({
        code: "invalid_format",
        format: "jwt",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    };
  });
  const $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = number$1;
    inst._zod.parse = (payload, _ctx) => {
      if (def.coerce)
        try {
          payload.value = Number(payload.value);
        } catch (_2) {
        }
      const input = payload.value;
      if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
        return payload;
      }
      const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
      payload.issues.push({
        expected: "number",
        code: "invalid_type",
        input,
        inst,
        ...received ? { received } : {}
      });
      return payload;
    };
  });
  const $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
    $ZodCheckNumberFormat.init(inst, def);
    $ZodNumber.init(inst, def);
  });
  const $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = boolean$1;
    inst._zod.parse = (payload, _ctx) => {
      if (def.coerce)
        try {
          payload.value = Boolean(payload.value);
        } catch (_2) {
        }
      const input = payload.value;
      if (typeof input === "boolean")
        return payload;
      payload.issues.push({
        expected: "boolean",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    };
  });
  const $ZodAny = /* @__PURE__ */ $constructor("$ZodAny", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload) => payload;
  });
  const $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload) => payload;
  });
  const $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
      payload.issues.push({
        expected: "never",
        code: "invalid_type",
        input: payload.value,
        inst
      });
      return payload;
    };
  });
  function handleArrayResult(result, final, index) {
    if (result.issues.length) {
      final.issues.push(...prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
  }
  const $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
    $ZodType.init(inst, def);
    const memo2 = globalConfig.memoizer;
    memo2 == null ? void 0 : memo2.attach(inst);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!Array.isArray(input)) {
        payload.issues.push({
          expected: "array",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      payload.value = memo2 ? memo2.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
      const proms = [];
      const abortEarly = ctx == null ? void 0 : ctx.abortEarly;
      for (let i2 = 0; i2 < input.length; i2++) {
        const item = input[i2];
        const result = def.element._zod.run({
          value: item,
          issues: []
        }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => handleArrayResult(result2, payload, i2)));
        } else {
          handleArrayResult(result, payload, i2);
          if (abortEarly && result.issues.length !== 0 && aborted(result))
            break;
        }
      }
      if (proms.length) {
        return Promise.all(proms).then(() => payload);
      }
      return payload;
    };
  });
  function handlePropertyResult(result, final, key, input, optin, optout) {
    const isPresent = key in input;
    const isOptionalOut = optout === "optional";
    if (!isPresent && isOptionalOut && optin === "optional") {
      return;
    }
    if (result.issues.length) {
      if (optin !== void 0 && isOptionalOut && !isPresent) {
        return;
      }
      final.issues.push(...prefixIssues(key, result.issues));
    }
    if (!isPresent && optin === void 0) {
      if (!result.issues.length) {
        final.issues.push({
          code: "invalid_type",
          expected: "nonoptional",
          input: void 0,
          path: [key]
        });
      }
      return;
    }
    if (result.value === void 0) {
      if (isPresent || optin === "defaulted" && !isOptionalOut) {
        final.value[key] = void 0;
      }
    } else {
      final.value[key] = result.value;
    }
  }
  const NO_SYMBOL_KEYS = [];
  function normalizeDef(def) {
    var _a2, _b, _c, _d;
    const keys = Object.keys(def.shape);
    const ownSymbols = Object.getOwnPropertySymbols(def.shape);
    const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
    const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
    for (const k2 of allKeys) {
      if (!((_d = (_c = (_b = (_a2 = def.shape) == null ? void 0 : _a2[k2]) == null ? void 0 : _b._zod) == null ? void 0 : _c.traits) == null ? void 0 : _d.has("$ZodType"))) {
        throw new Error(`Invalid element at key "${String(k2)}": expected a Zod schema`);
      }
    }
    const okeys = optionalKeys(def.shape);
    return {
      ...def,
      allKeys,
      symbolKeys,
      // string-only: handleCatchall matches it against `for...in`, which never yields a symbol
      keySet: new Set(keys),
      numKeys: keys.length,
      optionalKeys: new Set(okeys)
    };
  }
  function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
    const unrecognized = [];
    const keySet = def.keySet;
    const _catchall = def.catchall._zod;
    const t2 = _catchall.def.type;
    const optin = _catchall.optin;
    const optout = _catchall.optout;
    let seen = 0;
    for (const key in input) {
      if (abortEarly && payload.issues.length !== seen) {
        if (aborted(payload, seen))
          break;
        seen = payload.issues.length;
      }
      if (keySet.has(key))
        continue;
      if (key === "__proto__") {
        if (t2 === "never")
          unrecognized.push(key);
        continue;
      }
      if (t2 === "never") {
        unrecognized.push(key);
        continue;
      }
      const r2 = _catchall.run({ value: input[key], issues: [] }, ctx);
      if (r2 instanceof Promise) {
        proms.push(r2.then((r3) => handlePropertyResult(r3, payload, key, input, optin, optout)));
      } else {
        handlePropertyResult(r2, payload, key, input, optin, optout);
      }
    }
    if (unrecognized.length) {
      payload.issues.push({
        code: "unrecognized_keys",
        keys: unrecognized,
        input,
        inst,
        // Describes the shape of the input, not the validity of the parsed value, so it never aborts. The parse still fails; the schema's own checks just get to run first, and an enclosing intersection can reconcile the key against a sibling operand.
        continue: true
      });
    }
    if (!proms.length)
      return payload;
    return Promise.all(proms).then(() => {
      return payload;
    });
  }
  const $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
    $ZodType.init(inst, def);
    const desc = Object.getOwnPropertyDescriptor(def, "shape");
    const sh = (desc == null ? void 0 : desc.get) ? desc.get.raw : def.shape ?? {};
    if (sh) {
      const get = () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", { value: newSh });
        get.raw = newSh;
        return newSh;
      };
      get.raw = sh;
      Object.defineProperty(def, "shape", { get });
    }
    const _normalized = cached(() => normalizeDef(def));
    defineLazyInternal(inst, "propValues", (zod) => {
      const shape = zod.def.shape;
      const propValues = {};
      for (const key in shape) {
        const field = shape[key]._zod;
        if (field.values) {
          if (!Object.prototype.hasOwnProperty.call(propValues, key)) {
            assignProp(propValues, key, /* @__PURE__ */ new Set());
          }
          for (const v2 of field.values)
            propValues[key].add(v2);
          if (field.optin !== void 0)
            propValues[key].add(void 0);
        }
      }
      return propValues;
    });
    const isObject$1 = isObject;
    const catchall = def.catchall;
    let value;
    const memo2 = globalConfig.memoizer;
    memo2 == null ? void 0 : memo2.attach(inst);
    inst._zod.parse = (payload, ctx) => {
      value ?? (value = _normalized.value);
      const input = payload.value;
      if (!isObject$1(input)) {
        payload.issues.push({
          expected: "object",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      payload.value = memo2 ? memo2.alloc(inst, payload, {}, ctx) : {};
      const proms = [];
      const shape = value.shape;
      const abortEarly = ctx == null ? void 0 : ctx.abortEarly;
      let seen = payload.issues.length;
      for (const key of value.allKeys) {
        if (abortEarly && payload.issues.length !== seen) {
          if (aborted(payload, seen))
            break;
          seen = payload.issues.length;
        }
        if (key === "__proto__")
          continue;
        const el = shape[key];
        const optin = el._zod.optin;
        const optout = el._zod.optout;
        const r2 = el._zod.run({ value: input[key], issues: [] }, ctx);
        if (r2 instanceof Promise) {
          proms.push(r2.then((r3) => handlePropertyResult(r3, payload, key, input, optin, optout)));
        } else {
          handlePropertyResult(r2, payload, key, input, optin, optout);
        }
      }
      if (!catchall) {
        return proms.length ? Promise.all(proms).then(() => payload) : payload;
      }
      return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
    };
  });
  const $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
    $ZodObject.init(inst, def);
    const superParse = inst._zod.parse;
    const _normalized = cached(() => normalizeDef(def));
    const memo2 = globalConfig.memoizer;
    const generateFastpass = (shape) => {
      var _a2, _b;
      const normalized = _normalized.value;
      const syms = normalized.symbolKeys;
      const doc = new Doc(["payload", "ctx"], { shape, inst, memo: memo2, syms });
      const parseStr = (k2) => `shape[${k2}]._zod.run({ value: input[${k2}], issues: [] }, ctx)`;
      const prefixStr = (id, k2) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k2}, ...iss.path] : [${k2}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
      doc.write(`const input = payload.value;`);
      const ids = /* @__PURE__ */ Object.create(null);
      let counter = 0;
      for (const key of normalized.allKeys) {
        ids[key] = `key_${counter++}`;
      }
      doc.write(memo2 ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
      for (const key of normalized.allKeys) {
        if (key === "__proto__")
          continue;
        const id = ids[key];
        const k2 = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc(key);
        const isPresent = `${k2} in input`;
        const schema = shape[key];
        const optin = (_a2 = schema == null ? void 0 : schema._zod) == null ? void 0 : _a2.optin;
        const isOptionalIn = optin !== void 0;
        const isOptionalOut = ((_b = schema == null ? void 0 : schema._zod) == null ? void 0 : _b.optout) === "optional";
        doc.write(`const ${id} = ${parseStr(k2)};`);
        if (isOptionalIn && isOptionalOut) {
          const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
          doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k2)}
          }

          if (${assign}) {
            newResult[${k2}] = ${id}.value;
          }
        }

      `);
        } else if (!isOptionalIn) {
          doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k2)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k2}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k2}] = ${id}.value;
        }

      `);
        } else {
          doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k2)}
        }
      `);
          if (optin === "defaulted") {
            doc.write(`newResult[${k2}] = ${id}.value;`);
          } else {
            doc.write(`
        if (${id}.value !== undefined || ${isPresent}) {
          newResult[${k2}] = ${id}.value;
        }
      `);
          }
        }
      }
      doc.write(`payload.value = newResult;`);
      doc.write(`return payload;`);
      return doc.compile();
    };
    let fastpass;
    const isObject$1 = isObject;
    const jit = !globalConfig.jitless;
    const allowsEval$1 = allowsEval;
    const fastEnabled = jit && allowsEval$1.value;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
      value ?? (value = _normalized.value);
      const input = payload.value;
      if (!isObject$1(input)) {
        payload.issues.push({
          expected: "object",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      if (jit && fastEnabled && (ctx == null ? void 0 : ctx.async) === false && ctx.jitless !== true) {
        if (!fastpass)
          fastpass = generateFastpass(def.shape);
        payload = fastpass(payload, ctx);
        if (!catchall)
          return payload;
        return handleCatchall([], input, payload, ctx, value, inst, (ctx == null ? void 0 : ctx.abortEarly) === true);
      }
      return superParse(payload, ctx);
    };
  });
  function handleUnionResults(results, final, inst, ctx) {
    for (const result of results) {
      if (result.issues.length === 0) {
        final.value = result.value;
        return final;
      }
    }
    const nonaborted = results.filter((r2) => !aborted(r2));
    if (nonaborted.length === 1) {
      final.value = nonaborted[0].value;
      return nonaborted[0];
    }
    final.issues.push({
      code: "invalid_union",
      input: final.value,
      inst,
      errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
    });
    return final;
  }
  const $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o2) => o2._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o2) => o2._zod.optin !== void 0) ? "optional" : void 0);
    defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o2) => o2._zod.optout === "optional") ? "optional" : void 0);
    defineLazyInternal(inst, "values", (zod) => {
      if (zod.def.options.every((o2) => o2._zod.values)) {
        return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
      }
      return void 0;
    });
    defineLazyInternal(inst, "pattern", (zod) => {
      if (zod.def.options.every((o2) => o2._zod.pattern)) {
        const patterns = zod.def.options.map((o2) => o2._zod.pattern);
        return new RegExp(`^(${patterns.map((p2) => cleanRegex(p2.source)).join("|")})$`);
      }
      return void 0;
    });
    const first = def.options.length === 1 ? def.options[0]._zod.run : null;
    inst._zod.parse = (payload, ctx) => {
      if (first) {
        return first(payload, ctx);
      }
      let async = false;
      const results = [];
      for (const option of def.options) {
        const result = option._zod.run({
          value: payload.value,
          issues: []
        }, ctx);
        if (result instanceof Promise) {
          results.push(result);
          async = true;
        } else {
          if (result.issues.length === 0)
            return result;
          results.push(result);
        }
      }
      if (!async)
        return handleUnionResults(results, payload, inst, ctx);
      return Promise.all(results).then((results2) => {
        return handleUnionResults(results2, payload, inst, ctx);
      });
    };
  });
  function discriminatorMap(def) {
    var _a2;
    const map = /* @__PURE__ */ new Map();
    for (const option of def.options) {
      const values = (_a2 = option._zod.propValues) == null ? void 0 : _a2[def.discriminator];
      if (!values || values.size === 0)
        throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
      for (const value of values) {
        if (map.has(value)) {
          if (value !== void 0)
            throw new Error(`Duplicate discriminator value "${String(value)}"`);
          map.set(value, null);
        } else {
          map.set(value, option);
        }
      }
    }
    return map;
  }
  const $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
    def.inclusive = false;
    $ZodUnion.init(inst, def);
    const _super = inst._zod.parse;
    defineLazyInternal(inst, "propValues", (zod) => {
      var _a2, _b;
      const propValues = {};
      let undefinedCount = 0;
      for (const option of zod.def.options) {
        const pv = option._zod.propValues;
        if (!pv || Object.keys(pv).length === 0)
          throw new Error(`Invalid discriminated union option at index "${zod.def.options.indexOf(option)}"`);
        if ((_a2 = pv[zod.def.discriminator]) == null ? void 0 : _a2.has(void 0))
          undefinedCount++;
        for (const [k2, v2] of Object.entries(pv)) {
          if (!Object.prototype.hasOwnProperty.call(propValues, k2)) {
            assignProp(propValues, k2, /* @__PURE__ */ new Set());
          }
          for (const val of v2) {
            propValues[k2].add(val);
          }
        }
      }
      if (!zod.def.unionFallback && undefinedCount > 1)
        (_b = propValues[zod.def.discriminator]) == null ? void 0 : _b.delete(void 0);
      return propValues;
    });
    def.options.forEach((option, i2) => {
      const propShape = rawShape(option._zod.def);
      if (propShape && !Object.prototype.hasOwnProperty.call(propShape, def.discriminator)) {
        throw new Error(`Invalid discriminated union option at index "${i2}"`);
      }
    });
    const disc = cached(() => discriminatorMap(def));
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!isObject(input)) {
        payload.issues.push({
          code: "invalid_type",
          expected: "object",
          input,
          inst
        });
        return payload;
      }
      const value = input == null ? void 0 : input[def.discriminator];
      const opt = disc.value.get(value);
      if (opt && (value !== void 0 || ctx.direction !== "backward")) {
        return opt._zod.run(payload, ctx);
      }
      if (def.unionFallback || ctx.direction === "backward") {
        return _super(payload, ctx);
      }
      payload.issues.push({
        code: "invalid_union",
        errors: [],
        note: "No matching discriminator",
        discriminator: def.discriminator,
        options: Array.from(disc.value.keys()).filter((value2) => disc.value.get(value2) !== null),
        input,
        path: [def.discriminator],
        inst
      });
      return payload;
    };
  });
  const $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      const left = def.left._zod.run({ value: input, issues: [] }, ctx);
      const right = def.right._zod.run({ value: input, issues: [] }, ctx);
      const async = left instanceof Promise || right instanceof Promise;
      if (async) {
        return Promise.all([left, right]).then(([left2, right2]) => {
          return handleIntersectionResults(payload, left2, right2);
        });
      }
      return handleIntersectionResults(payload, left, right);
    };
  });
  function mergeValues(a2, b2) {
    if (a2 === b2) {
      return { valid: true, data: a2 };
    }
    if (a2 instanceof Date && b2 instanceof Date && +a2 === +b2) {
      return { valid: true, data: a2 };
    }
    if (isPlainObject(a2) && isPlainObject(b2)) {
      const bKeys = Object.keys(b2);
      const sharedKeys = Object.keys(a2).filter((key) => bKeys.indexOf(key) !== -1);
      const newObj = { ...a2, ...b2 };
      if (Object.prototype.hasOwnProperty.call(newObj, "__proto__"))
        delete newObj.__proto__;
      for (const key of sharedKeys) {
        if (key === "__proto__")
          continue;
        const sharedValue = mergeValues(a2[key], b2[key]);
        if (!sharedValue.valid) {
          return {
            valid: false,
            mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
          };
        }
        newObj[key] = sharedValue.data;
      }
      return { valid: true, data: newObj };
    }
    if (Array.isArray(a2) && Array.isArray(b2)) {
      if (a2.length !== b2.length) {
        return { valid: false, mergeErrorPath: [] };
      }
      const newArray = [];
      for (let index = 0; index < a2.length; index++) {
        const itemA = a2[index];
        const itemB = b2[index];
        const sharedValue = mergeValues(itemA, itemB);
        if (!sharedValue.valid) {
          return {
            valid: false,
            mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
          };
        }
        newArray.push(sharedValue.data);
      }
      return { valid: true, data: newArray };
    }
    return { valid: false, mergeErrorPath: [] };
  }
  function handleIntersectionResults(result, left, right) {
    const unrecKeys = /* @__PURE__ */ new Map();
    let unrecIssue;
    const keyIssues = /* @__PURE__ */ new Map();
    const collect = (iss, side) => {
      var _a2, _b;
      let keys;
      if (iss.code === "unrecognized_keys" && !((_a2 = iss.path) == null ? void 0 : _a2.length)) {
        unrecIssue ?? (unrecIssue = iss);
        keys = iss.keys;
      } else if (iss.code === "invalid_key" && iss.origin === "record" && ((_b = iss.path) == null ? void 0 : _b.length) === 1) {
        const k2 = String(iss.path[0]);
        if (!keyIssues.has(k2))
          keyIssues.set(k2, iss);
        keys = [k2];
      } else {
        return false;
      }
      for (const k2 of keys) {
        if (!unrecKeys.has(k2))
          unrecKeys.set(k2, {});
        unrecKeys.get(k2)[side] = true;
      }
      return true;
    };
    for (const iss of left.issues) {
      if (!collect(iss, "l"))
        result.issues.push(iss);
    }
    for (const iss of right.issues) {
      if (!collect(iss, "r"))
        result.issues.push(iss);
    }
    const bothKeys = [...unrecKeys].filter(([, f2]) => f2.l && f2.r).map(([k2]) => k2);
    if (bothKeys.length) {
      const aggregated = unrecIssue ? bothKeys.filter((k2) => unrecIssue.keys.includes(k2)) : [];
      if (aggregated.length)
        result.issues.push({ ...unrecIssue, keys: aggregated });
      for (const k2 of bothKeys) {
        if (!aggregated.includes(k2) && keyIssues.has(k2))
          result.issues.push(keyIssues.get(k2));
      }
    }
    const merged = mergeValues(left.value, right.value);
    if (!merged.valid) {
      if (aborted(result))
        return result;
      throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
    }
    result.value = merged.data;
    return result;
  }
  const $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
    $ZodType.init(inst, def);
    const memo2 = globalConfig.memoizer;
    memo2 == null ? void 0 : memo2.attach(inst);
    inst._zod.parse = (payload, ctx) => {
      const input = payload.value;
      if (!isPlainObject(input)) {
        payload.issues.push({
          expected: "record",
          code: "invalid_type",
          input,
          inst
        });
        return payload;
      }
      const proms = [];
      const values = def.keyType._zod.values;
      if (values && !def.partial) {
        payload.value = memo2 ? memo2.alloc(inst, payload, {}, ctx) : {};
        const recordKeys = /* @__PURE__ */ new Set();
        for (const key of values) {
          if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
            recordKeys.add(typeof key === "number" ? key.toString() : key);
            if (key === "__proto__")
              continue;
            const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
            if (keyResult instanceof Promise) {
              throw new Error("Async schemas not supported in object keys currently");
            }
            if (keyResult.issues.length) {
              payload.issues.push({
                code: "invalid_key",
                origin: "record",
                issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                input: key,
                path: [key],
                inst
              });
              continue;
            }
            const outKey = keyResult.value;
            if (outKey === "__proto__")
              continue;
            const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
            if (result instanceof Promise) {
              proms.push(result.then((result2) => {
                if (result2.issues.length) {
                  payload.issues.push(...prefixIssues(key, result2.issues));
                }
                payload.value[outKey] = result2.value;
              }));
            } else {
              if (result.issues.length) {
                payload.issues.push(...prefixIssues(key, result.issues));
              }
              payload.value[outKey] = result.value;
            }
          }
        }
        let unrecognized;
        for (const key in input) {
          if (!recordKeys.has(key)) {
            if (def.mode === "loose") {
              if (key === "__proto__")
                continue;
              payload.value[key] = input[key];
            } else {
              unrecognized = unrecognized ?? [];
              unrecognized.push(key);
            }
          }
        }
        if (unrecognized && unrecognized.length > 0) {
          payload.issues.push({
            code: "unrecognized_keys",
            input,
            inst,
            keys: unrecognized,
            continue: true
          });
        }
      } else {
        payload.value = memo2 ? memo2.alloc(inst, payload, {}, ctx) : {};
        let unrecognized;
        for (const key of Reflect.ownKeys(input)) {
          if (key === "__proto__")
            continue;
          if (!Object.prototype.propertyIsEnumerable.call(input, key))
            continue;
          let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          const checkNumericKey = typeof key === "string" && number$1.test(key) && keyResult.issues.length;
          if (checkNumericKey) {
            const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
            if (retryResult instanceof Promise) {
              throw new Error("Async schemas not supported in object keys currently");
            }
            if (retryResult.issues.length === 0) {
              keyResult = retryResult;
            }
          }
          if (keyResult.issues.length) {
            if (def.mode === "loose") {
              payload.value[key] = input[key];
            } else if (values) {
              unrecognized = unrecognized ?? [];
              unrecognized.push(key);
            } else {
              payload.issues.push({
                code: "invalid_key",
                origin: "record",
                issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                input: key,
                path: [key],
                inst
              });
            }
            continue;
          }
          const outKey = keyResult.value;
          if (outKey === "__proto__")
            continue;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key, result2.issues));
              }
              payload.value[outKey] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
        if (unrecognized && unrecognized.length > 0) {
          payload.issues.push({
            code: "unrecognized_keys",
            input,
            inst,
            keys: unrecognized,
            continue: true
          });
        }
      }
      if (proms.length) {
        return Promise.all(proms).then(() => payload);
      }
      return payload;
    };
  });
  const $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
    $ZodType.init(inst, def);
    const values = getEnumValues(def.entries);
    const valuesSet = new Set(values);
    inst._zod.values = valuesSet;
    defineLazyInternal(inst, "pattern", (zod) => {
      const patternValues = getEnumValues(zod.def.entries).filter((k2) => propertyKeyTypes.has(typeof k2));
      return new RegExp(patternValues.length ? `^(${patternValues.map((o2) => escapeRegex(o2.toString())).join("|")})$` : "^[^\\s\\S]$");
    });
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (valuesSet.has(input)) {
        return payload;
      }
      payload.issues.push({
        code: "invalid_value",
        values,
        input,
        inst
      });
      return payload;
    };
  });
  const $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
    $ZodType.init(inst, def);
    const values = new Set(def.values);
    inst._zod.values = values;
    defineLazyInternal(inst, "pattern", (zod) => {
      const vals = zod.def.values;
      return new RegExp(vals.length ? `^(${vals.map((o2) => typeof o2 === "string" ? escapeRegex(o2) : o2 ? escapeRegex(o2.toString()) : String(o2)).join("|")})$` : "^[^\\s\\S]$");
    });
    inst._zod.parse = (payload, _ctx) => {
      const input = payload.value;
      if (values.has(input)) {
        return payload;
      }
      payload.issues.push({
        code: "invalid_value",
        values: def.values,
        input,
        inst
      });
      return payload;
    };
  });
  const $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
    var _a2;
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    (_a2 = globalConfig.memoizer) == null ? void 0 : _a2.guard(inst);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        throw new $ZodEncodeError(inst.constructor.name);
      }
      const _out = def.transform(payload.value, payload);
      if (ctx.async) {
        const output = _out instanceof Promise ? _out : Promise.resolve(_out);
        return output.then((output2) => {
          payload.value = output2;
          return payload;
        });
      }
      if (_out instanceof Promise) {
        throw new $ZodAsyncError();
      }
      payload.value = _out;
      return payload;
    };
  });
  function handleOptionalResult(payload, result) {
    payload.value = result.issues.length ? void 0 : result.value;
    return payload;
  }
  const $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
    inst._zod.optout = "optional";
    defineLazyInternal(inst, "values", (zod) => {
      const values = zod.def.innerType._zod.values;
      return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
    });
    defineLazyInternal(inst, "pattern", (zod) => {
      const pattern = zod.def.innerType._zod.pattern;
      return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
    });
    inst._zod.parse = (payload, ctx) => {
      if (payload.value === void 0) {
        if (def.innerType._zod.optin !== "defaulted")
          return payload;
        const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
        if (result instanceof Promise)
          return result.then((result2) => handleOptionalResult(payload, result2));
        return handleOptionalResult(payload, result);
      }
      return def.innerType._zod.run(payload, ctx);
    };
  });
  const $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
    $ZodOptional.init(inst, def);
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
    inst._zod.parse = (payload, ctx) => {
      return def.innerType._zod.run(payload, ctx);
    };
  });
  const $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
    defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
    defineLazyInternal(inst, "pattern", (zod) => {
      const pattern = zod.def.innerType._zod.pattern;
      return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
    });
    defineLazyInternal(inst, "values", (zod) => {
      return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
    });
    inst._zod.parse = (payload, ctx) => {
      if (payload.value === null)
        return payload;
      return def.innerType._zod.run(payload, ctx);
    };
  });
  const $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "defaulted";
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      if (payload.value === void 0) {
        payload.value = def.defaultValue;
        return payload;
      }
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleDefaultResult(result2, def));
      }
      return handleDefaultResult(result, def);
    };
  });
  function handleDefaultResult(payload, def) {
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
    }
    return payload;
  }
  const $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "defaulted";
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      if (payload.value === void 0) {
        payload.value = def.defaultValue;
      }
      return def.innerType._zod.run(payload, ctx);
    };
  });
  const $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "values", (zod) => {
      const v2 = zod.def.innerType._zod.values;
      return v2 ? new Set([...v2].filter((x2) => x2 !== void 0)) : void 0;
    });
    inst._zod.parse = (payload, ctx) => {
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleNonOptionalResult(result2, inst));
      }
      return handleNonOptionalResult(result, inst);
    };
  });
  function handleNonOptionalResult(payload, inst) {
    if (!payload.issues.length && payload.value === void 0) {
      payload.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: payload.value,
        inst
      });
    }
    return payload;
  }
  function handleCatchResult(payload, result, def, ctx) {
    if (!result.issues.length) {
      payload.value = result.value;
      if (result.memo)
        payload.memo = true;
      return payload;
    }
    payload.value = def.catchValue({
      ...result,
      value: payload.value,
      error: {
        issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
      },
      input: payload.value
    });
    return payload;
  }
  const $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
    defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
      if (result instanceof Promise) {
        return result.then((result2) => handleCatchResult(payload, result2, def, ctx));
      }
      return handleCatchResult(payload, result, def, ctx);
    };
  });
  const $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
    defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
    defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
    defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        const right = def.out._zod.run(payload, ctx);
        if (right instanceof Promise) {
          return right.then((right2) => handlePipeResult(right2, def.in, ctx));
        }
        return handlePipeResult(right, def.in, ctx);
      }
      const left = def.in._zod.run(payload, ctx);
      if (left instanceof Promise) {
        return left.then((left2) => handlePipeResult(left2, def.out, ctx));
      }
      return handlePipeResult(left, def.out, ctx);
    };
  });
  function handlePipeResult(left, next, ctx) {
    if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
      left.aborted = true;
      return left;
    }
    return next._zod.run({ value: left.value, issues: left.issues }, ctx);
  }
  const $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
    defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
    defineLazyInternal(inst, "optin", (zod) => {
      var _a2, _b;
      return (_b = (_a2 = zod.def.innerType) == null ? void 0 : _a2._zod) == null ? void 0 : _b.optin;
    });
    defineLazyInternal(inst, "optout", (zod) => {
      var _a2, _b;
      return (_b = (_a2 = zod.def.innerType) == null ? void 0 : _a2._zod) == null ? void 0 : _b.optout;
    });
    inst._zod.parse = (payload, ctx) => {
      if (ctx.direction === "backward") {
        return def.innerType._zod.run(payload, ctx);
      }
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise) {
        return result.then(handleReadonlyResult);
      }
      return handleReadonlyResult(result);
    };
  });
  function handleReadonlyResult(payload) {
    if (!payload.memo)
      payload.value = Object.freeze(payload.value);
    return payload;
  }
  const $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
    $ZodCheck.init(inst, def);
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _2) => {
      return payload;
    };
    inst._zod.check = (payload) => {
      const input = payload.value;
      const r2 = def.fn(input);
      if (r2 instanceof Promise) {
        return r2.then((r3) => handleRefineResult(r3, payload, input, inst));
      }
      handleRefineResult(r2, payload, input, inst);
      return;
    };
  });
  function handleRefineResult(result, payload, input, inst) {
    if (!result) {
      const _iss = {
        code: "custom",
        input,
        inst,
        // incorporates params.error into issue reporting
        path: [...inst._zod.def.path ?? []],
        // incorporates params.error into issue reporting
        continue: !inst._zod.def.abort
        // params: inst._zod.def.params,
      };
      if (inst._zod.def.params)
        _iss.params = inst._zod.def.params;
      payload.issues.push(issue(_iss));
    }
  }
  class $ZodCyclicError extends Error {
    constructor() {
      super(`Cannot parse a reference cycle that closes through a transform`);
      this.name = "ZodCyclicError";
    }
  }
  const STATE = "~memo";
  const NO_ISSUES = [];
  function isRef(value) {
    return value !== null && typeof value === "object";
  }
  function cloneIssues(issues) {
    return issues.map((iss) => iss.path ? { ...iss, path: iss.path.slice() } : { ...iss });
  }
  const recursive = /* @__PURE__ */ new WeakMap();
  const NONE = 0;
  const ASSUMED = 1;
  const PROVEN = 2;
  function isRecursive(inst, stack, resolve) {
    const cached2 = recursive.get(inst);
    if (cached2 !== void 0)
      return cached2 ? PROVEN : NONE;
    if (stack.has(inst))
      return PROVEN;
    stack.add(inst);
    let result = NONE;
    const check = (child) => {
      if (result !== PROVEN && (child == null ? void 0 : child._zod)) {
        const answer = isRecursive(child, stack);
        if (answer > result)
          result = answer;
      }
    };
    const shape = (sh, spread) => {
      var _a2;
      let answer = NONE;
      for (const key of Reflect.ownKeys(sh)) {
        const desc = Object.getOwnPropertyDescriptor(sh, key);
        if (!desc.enumerable)
          continue;
        const child = desc.get ? ASSUMED : ((_a2 = desc.value) == null ? void 0 : _a2._zod) ? isRecursive(desc.value, stack) : NONE;
        if (child > answer)
          answer = child;
      }
      return answer;
    };
    const merge2 = (answer) => {
      if (answer > result)
        result = answer;
    };
    const def = inst._zod.def;
    const kind = def.type;
    switch (kind) {
      case "object": {
        const raw = rawShape(def);
        merge2(raw ? shape(raw) : ASSUMED);
        check(def.catchall);
        break;
      }
      case "array":
        check(def.element);
        break;
      case "tuple":
        for (const el of def.items)
          check(el);
        check(def.rest);
        break;
      case "record":
      case "map":
        check(def.keyType);
        check(def.valueType);
        break;
      case "set":
        check(def.valueType);
        break;
      case "union":
        for (const el of def.options)
          check(el);
        break;
      case "intersection":
        check(def.left);
        check(def.right);
        break;
      case "optional":
      case "nullable":
      case "default":
      case "prefault":
      case "catch":
      case "readonly":
      case "nonoptional":
      case "promise":
      case "success":
        check(def.innerType);
        break;
      case "pipe":
        check(def.in);
        check(def.out);
        break;
      case "function":
        check(def.input);
        check(def.output);
        break;
      // `$ZodLazy` caches its inner on the def, so a resolved edge is followed exactly
      case "lazy": {
        const inner = def._cachedInner ?? void 0;
        merge2(inner ? isRecursive(inner, stack) : ASSUMED);
        break;
      }
      // a leaf by choice: `parts` are regex fragments, not data positions
      case "template_literal":
      // leaves
      case "string":
      case "number":
      case "int":
      case "boolean":
      case "bigint":
      case "symbol":
      case "undefined":
      case "null":
      case "void":
      case "never":
      case "any":
      case "unknown":
      case "date":
      case "nan":
      case "enum":
      case "literal":
      case "file":
      case "transform":
      case "custom":
        break;
      default: {
        for (const key in def) {
          const desc = Object.getOwnPropertyDescriptor(def, key);
          if (!desc || desc.get)
            continue;
          const value = desc.value;
          if (!value || typeof value !== "object")
            continue;
          if (value._zod)
            check(value);
          else if (Array.isArray(value))
            for (const el of value)
              check(el);
        }
      }
    }
    stack.delete(inst);
    return settle(inst, result);
  }
  function settle(inst, answer) {
    if (answer !== ASSUMED)
      recursive.set(inst, answer === PROVEN);
    return answer;
  }
  function bucketFor(state, inst) {
    let bucket = state.buckets.get(inst);
    if (!bucket) {
      bucket = /* @__PURE__ */ new WeakMap();
      state.buckets.set(inst, bucket);
    }
    return bucket;
  }
  let handoff;
  const open = [];
  const memo = {
    alloc(_inst, payload, empty) {
      const bucket = handoff;
      if (!bucket)
        return empty;
      handoff = void 0;
      const entry = { value: empty, issues: null };
      bucket.set(payload.value, entry);
      open.push(entry);
      return empty;
    },
    guard(inst) {
      var _a2;
      (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
      inst._zod.deferred.push(() => {
        const base = inst._zod.parse;
        const wrapped = (payload, ctx) => {
          if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value))
            throw new $ZodCyclicError();
          return base(payload, ctx);
        };
        inst._zod.parse = wrapped;
        if (inst._zod.run === base)
          inst._zod.run = wrapped;
      });
    },
    attach(inst) {
      var _a2;
      let isRecursiveInst;
      let rechecked = false;
      let lastCtx;
      let lastBucket;
      (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
      inst._zod.deferred.push(() => {
        const base = inst._zod.parse;
        const wrapped = (payload, ctx) => {
          if (isRecursiveInst === void 0) {
            const walked = isRecursive(inst, /* @__PURE__ */ new Set());
            if (walked === NONE) {
              inst._zod.parse = base;
              if (inst._zod.run === wrapped)
                inst._zod.run = base;
              return base(payload, ctx);
            }
            if (walked === PROVEN || rechecked)
              isRecursiveInst = true;
            else
              rechecked = true;
          }
          const input = payload.value;
          if (!isRef(input))
            return base(payload, ctx);
          let state = ctx[STATE];
          if (!state) {
            state = { buckets: /* @__PURE__ */ new WeakMap(), backEdges: void 0 };
            ctx[STATE] = state;
          }
          let bucket;
          if (lastCtx === ctx) {
            bucket = lastBucket;
          } else {
            bucket = bucketFor(state, inst);
            lastCtx = ctx;
            lastBucket = bucket;
          }
          const hit = bucket.get(input);
          if (hit) {
            payload.value = hit.value;
            if (hit.issues) {
              if (hit.issues.length)
                payload.issues.push(...cloneIssues(hit.issues));
            } else {
              payload.memo = true;
              state.backEdges ?? (state.backEdges = /* @__PURE__ */ new WeakSet());
              state.backEdges.add(hit.value);
            }
            return payload;
          }
          handoff = bucket;
          const depth = open.length;
          const result = base(payload, ctx);
          handoff = void 0;
          const entry = open.length > depth ? open.pop() : void 0;
          if (result instanceof Promise) {
            return result.then((r2) => {
              if (entry)
                entry.issues = r2.issues.length ? cloneIssues(r2.issues) : NO_ISSUES;
              return r2;
            });
          }
          if (entry)
            entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
          return result;
        };
        inst._zod.parse = wrapped;
        if (inst._zod.run === base)
          inst._zod.run = wrapped;
      });
    }
  };
  function memoizer() {
    return memo;
  }
  function isBackEdge(ctx, value) {
    var _a2;
    const backEdges = (_a2 = ctx[STATE]) == null ? void 0 : _a2.backEdges;
    return backEdges !== void 0 && isRef(value) && backEdges.has(value);
  }
  const error = () => {
    const Sizable = {
      string: { unit: "characters", verb: "to have" },
      file: { unit: "bytes", verb: "to have" },
      array: { unit: "items", verb: "to have" },
      set: { unit: "items", verb: "to have" },
      map: { unit: "entries", verb: "to have" }
    };
    function getSizing(origin) {
      return Sizable[origin] ?? null;
    }
    const FormatDictionary = {
      regex: "input",
      email: "email address",
      url: "URL",
      emoji: "emoji",
      uuid: "UUID",
      uuidv4: "UUIDv4",
      uuidv6: "UUIDv6",
      nanoid: "nanoid",
      guid: "GUID",
      cuid: "cuid",
      cuid2: "cuid2",
      ulid: "ULID",
      xid: "XID",
      ksuid: "KSUID",
      datetime: "ISO datetime",
      date: "ISO date",
      time: "ISO time",
      duration: "ISO duration",
      ipv4: "IPv4 address",
      ipv6: "IPv6 address",
      mac: "MAC address",
      cidrv4: "IPv4 range",
      cidrv6: "IPv6 range",
      base64: "base64-encoded string",
      base64url: "base64url-encoded string",
      json_string: "JSON string",
      e164: "E.164 number",
      currency_code: "currency code",
      credit_card: "credit card number",
      iban: "IBAN",
      jwt: "JWT",
      template_literal: "input"
    };
    const TypeDictionary = {
      // Compatibility: "nan" -> "NaN" for display
      nan: "NaN"
      // All other type names omitted - they fall back to raw values via ?? operator
    };
    function getTypeName(type, input) {
      if (type === "number" && typeof input === "number" && !Number.isFinite(input)) {
        return String(input);
      }
      return TypeDictionary[type] ?? type;
    }
    return (issue2) => {
      switch (issue2.code) {
        case "invalid_type": {
          const expected = getTypeName(issue2.expected);
          const receivedType = parsedType(issue2.input);
          const received = getTypeName(receivedType, issue2.input);
          return `Invalid input: expected ${expected}, received ${received}`;
        }
        case "invalid_value":
          if (issue2.values.length === 1)
            return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
          return `Invalid option: expected one of ${joinValues(issue2.values, "|")}`;
        case "too_big": {
          const adj = issue2.exact ? "exactly " : issue2.inclusive ? "<=" : "<";
          const sizing = getSizing(issue2.origin);
          if (sizing)
            return `Too big: expected ${issue2.origin ?? "value"} to have ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
          return `Too big: expected ${issue2.origin ?? "value"} to be ${adj}${issue2.maximum.toString()}`;
        }
        case "too_small": {
          const adj = issue2.exact ? "exactly " : issue2.inclusive ? ">=" : ">";
          const sizing = getSizing(issue2.origin);
          if (sizing) {
            return `Too small: expected ${issue2.origin} to have ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
          }
          return `Too small: expected ${issue2.origin} to be ${adj}${issue2.minimum.toString()}`;
        }
        case "invalid_format": {
          const _issue = issue2;
          if (_issue.format === "starts_with") {
            return `Invalid string: must start with "${_issue.prefix}"`;
          }
          if (_issue.format === "ends_with")
            return `Invalid string: must end with "${_issue.suffix}"`;
          if (_issue.format === "includes")
            return `Invalid string: must include "${_issue.includes}"`;
          if (_issue.format === "regex")
            return `Invalid string: must match pattern ${_issue.pattern}`;
          return `Invalid ${FormatDictionary[_issue.format] ?? issue2.format}`;
        }
        case "not_multiple_of":
          return `Invalid number: must be a multiple of ${issue2.divisor}`;
        case "unrecognized_keys":
          return `Unrecognized key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
        case "invalid_key":
          return `Invalid key in ${issue2.origin}`;
        case "invalid_union":
          if (issue2.options && Array.isArray(issue2.options) && issue2.options.length > 0) {
            const opts = issue2.options.map((o2) => `'${o2}'`).join(" | ");
            return `Invalid discriminator value. Expected ${opts}`;
          }
          if (issue2.inclusive === false) {
            return "Invalid input: more than one option matched";
          }
          return "Invalid input";
        case "invalid_element":
          return `Invalid value in ${issue2.origin}`;
        default:
          return `Invalid input`;
      }
    };
  };
  function en() {
    return {
      localeError: error()
    };
  }
  var _a;
  class $ZodRegistry {
    constructor() {
      this._map = /* @__PURE__ */ new WeakMap();
      this._idmap = /* @__PURE__ */ new Map();
    }
    add(schema, ..._meta) {
      const meta = _meta[0];
      this._map.set(schema, meta);
      if (meta && typeof meta === "object" && "id" in meta) {
        this._idmap.set(meta.id, schema);
      }
      return this;
    }
    clear() {
      this._map = /* @__PURE__ */ new WeakMap();
      this._idmap = /* @__PURE__ */ new Map();
      return this;
    }
    remove(schema) {
      const meta = this._map.get(schema);
      if (meta && typeof meta === "object" && "id" in meta) {
        this._idmap.delete(meta.id);
      }
      this._map.delete(schema);
      return this;
    }
    get(schema) {
      const p2 = schema._zod.parent;
      if (p2) {
        const pm = { ...this.get(p2) ?? {} };
        delete pm.id;
        const f2 = { ...pm, ...this._map.get(schema) };
        return Object.keys(f2).length ? f2 : void 0;
      }
      return this._map.get(schema);
    }
    has(schema) {
      return this._map.has(schema);
    }
  }
  function registry() {
    return new $ZodRegistry();
  }
  (_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
  const globalRegistry = globalThis.__zod_globalRegistry;
  function snapshotChecks(def) {
    if (def.checks)
      def.checks = [...def.checks];
    return def;
  }
  // @__NO_SIDE_EFFECTS__
  function _string(Class, params) {
    return new Class(snapshotChecks({ type: "string", ...normalizeParams(params) }));
  }
  // @__NO_SIDE_EFFECTS__
  function _email(Class, params) {
    return new Class({
      type: "string",
      format: "email",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _guid(Class, params) {
    return new Class({
      type: "string",
      format: "guid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _uuid(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _uuidv4(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      version: "v4",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _uuidv6(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      version: "v6",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _uuidv7(Class, params) {
    return new Class({
      type: "string",
      format: "uuid",
      check: "string_format",
      abort: false,
      version: "v7",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _url(Class, params) {
    return new Class({
      type: "string",
      format: "url",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _emoji(Class, params) {
    return new Class({
      type: "string",
      format: "emoji",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _nanoid(Class, params) {
    return new Class({
      type: "string",
      format: "nanoid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _cuid(Class, params) {
    return new Class({
      type: "string",
      format: "cuid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _cuid2(Class, params) {
    return new Class({
      type: "string",
      format: "cuid2",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _ulid(Class, params) {
    return new Class({
      type: "string",
      format: "ulid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _xid(Class, params) {
    return new Class({
      type: "string",
      format: "xid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _ksuid(Class, params) {
    return new Class({
      type: "string",
      format: "ksuid",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _ipv4(Class, params) {
    return new Class({
      type: "string",
      format: "ipv4",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _ipv6(Class, params) {
    return new Class({
      type: "string",
      format: "ipv6",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _cidrv4(Class, params) {
    return new Class({
      type: "string",
      format: "cidrv4",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _cidrv6(Class, params) {
    return new Class({
      type: "string",
      format: "cidrv6",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _base64(Class, params) {
    return new Class({
      type: "string",
      format: "base64",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _base64url(Class, params) {
    return new Class({
      type: "string",
      format: "base64url",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _e164(Class, params) {
    return new Class({
      type: "string",
      format: "e164",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _jwt(Class, params) {
    return new Class({
      type: "string",
      format: "jwt",
      check: "string_format",
      abort: false,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _isoDateTime(Class, params) {
    return new Class({
      type: "string",
      format: "datetime",
      check: "string_format",
      offset: false,
      local: false,
      precision: null,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _isoDate(Class, params) {
    return new Class({
      type: "string",
      format: "date",
      check: "string_format",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _isoTime(Class, params) {
    return new Class({
      type: "string",
      format: "time",
      check: "string_format",
      precision: null,
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _isoDuration(Class, params) {
    return new Class({
      type: "string",
      format: "duration",
      check: "string_format",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _number(Class, params) {
    return new Class(snapshotChecks({ type: "number", checks: [], ...normalizeParams(params) }));
  }
  // @__NO_SIDE_EFFECTS__
  function _int(Class, params) {
    return new Class({
      type: "number",
      check: "number_format",
      abort: false,
      format: "safeint",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _boolean(Class, params) {
    return new Class({
      type: "boolean",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _any(Class) {
    return new Class({
      type: "any"
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _unknown(Class) {
    return new Class({
      type: "unknown"
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _never(Class, params) {
    return new Class({
      type: "never",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _lt(value, params) {
    return new $ZodCheckLessThan({
      check: "less_than",
      ...normalizeParams(params),
      value,
      inclusive: false
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _lte(value, params) {
    return new $ZodCheckLessThan({
      check: "less_than",
      ...normalizeParams(params),
      value,
      inclusive: true
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _gt(value, params) {
    return new $ZodCheckGreaterThan({
      check: "greater_than",
      ...normalizeParams(params),
      value,
      inclusive: false
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _gte(value, params) {
    return new $ZodCheckGreaterThan({
      check: "greater_than",
      ...normalizeParams(params),
      value,
      inclusive: true
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _multipleOf(value, params) {
    return new $ZodCheckMultipleOf({
      check: "multiple_of",
      ...normalizeParams(params),
      value
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _maxLength(maximum, params) {
    const ch = new $ZodCheckMaxLength({
      check: "max_length",
      ...normalizeParams(params),
      maximum
    });
    return ch;
  }
  // @__NO_SIDE_EFFECTS__
  function _minLength(minimum, params) {
    return new $ZodCheckMinLength({
      check: "min_length",
      ...normalizeParams(params),
      minimum
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _length(length, params) {
    return new $ZodCheckLengthEquals({
      check: "length_equals",
      ...normalizeParams(params),
      length
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _regex(pattern, params) {
    return new $ZodCheckRegex({
      check: "string_format",
      format: "regex",
      ...normalizeParams(params),
      pattern
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _lowercase(params) {
    return new $ZodCheckLowerCase({
      check: "string_format",
      format: "lowercase",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _uppercase(params) {
    return new $ZodCheckUpperCase({
      check: "string_format",
      format: "uppercase",
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _includes(includes, params) {
    return new $ZodCheckIncludes({
      check: "string_format",
      format: "includes",
      ...normalizeParams(params),
      includes
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _startsWith(prefix, params) {
    return new $ZodCheckStartsWith({
      check: "string_format",
      format: "starts_with",
      ...normalizeParams(params),
      prefix
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _endsWith(suffix, params) {
    return new $ZodCheckEndsWith({
      check: "string_format",
      format: "ends_with",
      ...normalizeParams(params),
      suffix
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _overwrite(tx) {
    return new $ZodCheckOverwrite({
      check: "overwrite",
      tx
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _normalize(form) {
    return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
  }
  // @__NO_SIDE_EFFECTS__
  function _trim() {
    return /* @__PURE__ */ _overwrite((input) => input.trim());
  }
  // @__NO_SIDE_EFFECTS__
  function _toLowerCase() {
    return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
  }
  // @__NO_SIDE_EFFECTS__
  function _toUpperCase() {
    return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
  }
  // @__NO_SIDE_EFFECTS__
  function _slugify() {
    return /* @__PURE__ */ _overwrite((input) => slugify(input));
  }
  // @__NO_SIDE_EFFECTS__
  function _array(Class, element, params) {
    return new Class({
      type: "array",
      element,
      // get element() {
      //   return element;
      // },
      ...normalizeParams(params)
    });
  }
  // @__NO_SIDE_EFFECTS__
  function _refine(Class, fn, _params) {
    const schema = new Class({
      type: "custom",
      check: "custom",
      fn,
      ...normalizeParams(_params)
    });
    return schema;
  }
  // @__NO_SIDE_EFFECTS__
  function _superRefine(fn, params) {
    const ch = /* @__PURE__ */ _check((payload) => {
      payload.addIssue = (issue$1) => {
        if (typeof issue$1 === "string") {
          payload.issues.push(issue(issue$1, payload.value, ch._zod.def));
        } else {
          const _issue = issue$1;
          if (_issue.fatal)
            _issue.continue = false;
          _issue.code ?? (_issue.code = "custom");
          if (!("input" in _issue))
            _issue.input = payload.value;
          _issue.inst ?? (_issue.inst = ch);
          _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
          payload.issues.push(issue(_issue));
        }
      };
      return fn(payload.value, payload);
    }, params);
    return ch;
  }
  // @__NO_SIDE_EFFECTS__
  function _check(fn, params) {
    const ch = new $ZodCheck({
      check: "custom",
      ...normalizeParams(params)
    });
    ch._zod.check = fn;
    return ch;
  }
  function assignProps(target, ...sources) {
    for (const source of sources) {
      for (const key of Reflect.ownKeys(source)) {
        if (Object.prototype.propertyIsEnumerable.call(source, key)) {
          assignProp(target, key, source[key]);
        }
      }
    }
    return target;
  }
  function initializeContext(params) {
    let target = (params == null ? void 0 : params.target) ?? "draft-2020-12";
    if (target === "draft-4")
      target = "draft-04";
    if (target === "draft-7")
      target = "draft-07";
    return {
      processors: params.processors ?? {},
      metadataRegistry: (params == null ? void 0 : params.metadata) ?? globalRegistry,
      target,
      unrepresentable: (params == null ? void 0 : params.unrepresentable) ?? "throw",
      override: (params == null ? void 0 : params.override) ?? (() => {
      }),
      io: (params == null ? void 0 : params.io) ?? "output",
      counter: 0,
      seen: /* @__PURE__ */ new Map(),
      sharedDefsExtractedFor: void 0,
      sharedEmitDoneFor: void 0,
      cycles: (params == null ? void 0 : params.cycles) ?? "ref",
      reused: (params == null ? void 0 : params.reused) ?? "inline",
      intersections: [],
      deferred: [],
      external: (params == null ? void 0 : params.external) ?? void 0
    };
  }
  function handleUnrepresentable(schema, ctx, json, params, message) {
    const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({ zodSchema: schema, path: params.path, message }) : ctx.unrepresentable;
    if (result === "any")
      return false;
    if (result === void 0 || result === "throw")
      throw new Error(message);
    Object.assign(json, result);
    return true;
  }
  function processSchema(schema, ctx, _params = { path: [], schemaPath: [] }) {
    var _a3, _b;
    var _a2;
    const def = schema._zod.def;
    const seen = ctx.seen.get(schema);
    if (seen) {
      seen.count++;
      const isCycle = _params.schemaPath.includes(schema);
      if (isCycle) {
        seen.cycle = _params.path;
      }
      return seen.schema;
    }
    const result = { schema: {}, count: 1, cycle: void 0, path: _params.path };
    ctx.seen.set(schema, result);
    ctx.sharedDefsExtractedFor = void 0;
    ctx.sharedEmitDoneFor = void 0;
    const overrideSchema = (_b = (_a3 = schema._zod).toJSONSchema) == null ? void 0 : _b.call(_a3);
    if (overrideSchema) {
      result.schema = overrideSchema;
    } else {
      const params = {
        ..._params,
        schemaPath: [..._params.schemaPath, schema],
        path: _params.path
      };
      if (schema._zod.processJSONSchema) {
        schema._zod.processJSONSchema(ctx, result.schema, params);
      } else {
        const _json = result.schema;
        const processor = ctx.processors[def.type];
        if (!processor) {
          throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
        }
        processor(schema, ctx, _json, params);
      }
      const parent = schema._zod.parent;
      if (parent) {
        if (!result.ref)
          result.ref = parent;
        processSchema(parent, ctx, params);
        ctx.seen.get(parent).isParent = true;
      }
    }
    const meta = ctx.metadataRegistry.get(schema);
    if (meta)
      assignProps(result.schema, meta);
    if (ctx.io === "input" && isTransforming(schema)) {
      delete result.schema.examples;
      delete result.schema.default;
    }
    if (ctx.io === "input" && "_prefault" in result.schema)
      (_a2 = result.schema).default ?? (_a2.default = result.schema._prefault);
    delete result.schema._prefault;
    const _result = ctx.seen.get(schema);
    return _result.schema;
  }
  function encodeJSONPointerSegment(segment) {
    return segment.replace(/~/g, "~0").replace(/\//g, "~1");
  }
  function extractDefs(ctx, schema) {
    var _a2, _b, _c, _d;
    const root = ctx.seen.get(schema);
    if (!root)
      throw new Error("Unprocessed schema. This is a bug in Zod.");
    if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external)
      return;
    const idToSchema = /* @__PURE__ */ new Map();
    for (const entry of ctx.seen.entries()) {
      const id = (_a2 = ctx.metadataRegistry.get(entry[0])) == null ? void 0 : _a2.id;
      if (id) {
        const existing = idToSchema.get(id);
        if (existing && existing !== entry[0]) {
          throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
        }
        idToSchema.set(id, entry[0]);
      }
    }
    const makeURI = (entry) => {
      var _a3;
      const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
      if (ctx.external) {
        const externalId = (_a3 = ctx.external.registry.get(entry[0])) == null ? void 0 : _a3.id;
        const uriGenerator = ctx.external.uri ?? ((id2) => id2);
        if (externalId) {
          return { ref: uriGenerator(externalId) };
        }
        const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
        entry[1].defId = id;
        return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}` };
      }
      const uriPrefix = `#`;
      const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
      if (entry[1] === root && !entry[1].schema.id) {
        return { ref: uriPrefix };
      }
      const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
      return { defId, ref: defUriPrefix + encodeJSONPointerSegment(defId) };
    };
    const extractToDef = (entry) => {
      if (entry[1].schema.$ref) {
        return;
      }
      const seen = entry[1];
      const { ref, defId } = makeURI(entry);
      seen.def = { ...seen.schema };
      if (defId)
        seen.defId = defId;
      const schema2 = seen.schema;
      for (const key in schema2) {
        delete schema2[key];
      }
      schema2.$ref = ref;
    };
    if (ctx.cycles === "throw") {
      for (const entry of ctx.seen.entries()) {
        const seen = entry[1];
        if (seen.cycle) {
          throw new Error(`Cycle detected: #/${(_b = seen.cycle) == null ? void 0 : _b.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
        }
      }
    }
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (schema === entry[0]) {
        extractToDef(entry);
        continue;
      }
      if (ctx.external) {
        const ext = (_c = ctx.external.registry.get(entry[0])) == null ? void 0 : _c.id;
        if (schema !== entry[0] && ext) {
          extractToDef(entry);
          continue;
        }
      }
      const id = (_d = ctx.metadataRegistry.get(entry[0])) == null ? void 0 : _d.id;
      if (id) {
        extractToDef(entry);
        continue;
      }
      if (seen.cycle) {
        extractToDef(entry);
        continue;
      }
      if (seen.count > 1) {
        if (ctx.reused === "ref") {
          extractToDef(entry);
        }
      }
    }
    if (ctx.external)
      ctx.sharedDefsExtractedFor = ctx.external;
  }
  function compactTypeUnion(schema) {
    const options = schema.anyOf;
    if (!Array.isArray(options) || options.length === 0 || schema.type !== void 0)
      return;
    const types = [];
    for (const option of options) {
      if (!option || typeof option !== "object")
        return;
      compactTypeUnion(option);
      const keys = Object.keys(option);
      if (keys.length !== 1 || keys[0] !== "type")
        return;
      const type = option.type;
      for (const member of Array.isArray(type) ? type : [type]) {
        if (typeof member !== "string")
          return;
        if (!types.includes(member))
          types.push(member);
      }
    }
    delete schema.anyOf;
    schema.type = types.length === 1 ? types[0] : types;
  }
  const FOLDABLE_KEYS = /* @__PURE__ */ new Set(["type", "properties", "required", "additionalProperties"]);
  const UNION_KEYS = ["oneOf", "anyOf"];
  function undeclaredConstraint(member) {
    const extra = member.additionalProperties;
    if (extra === void 0 || extra === false || typeof extra !== "object" || extra === null)
      return null;
    return Object.keys(extra).length ? extra : null;
  }
  function foldObjects(members2) {
    var _a2;
    const objects = [];
    for (const member of members2) {
      if (typeof member !== "object" || member.type !== "object")
        return null;
      for (const key in member) {
        if (!FOLDABLE_KEYS.has(key))
          return null;
      }
      objects.push(member);
    }
    const properties = {};
    const required2 = /* @__PURE__ */ new Set();
    for (const object2 of objects) {
      for (const key in object2.properties) {
        if (Object.prototype.hasOwnProperty.call(properties, key))
          continue;
        const parts = [];
        for (const other of objects) {
          const part = ((_a2 = other.properties) == null ? void 0 : _a2[key]) ?? undeclaredConstraint(other);
          if (part === null || part === void 0)
            continue;
          if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part)))
            parts.push(part);
        }
        const merged = parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts };
        assignProp(properties, key, merged);
      }
      for (const key of object2.required ?? [])
        required2.add(key);
    }
    const folded = { type: "object", properties };
    if (required2.size)
      folded.required = [...required2];
    if (objects.every((object2) => object2.additionalProperties === false)) {
      folded.additionalProperties = false;
    } else {
      const constraints = [];
      for (const object2 of objects) {
        const constraint = undeclaredConstraint(object2);
        if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint)))
          constraints.push(constraint);
      }
      if (constraints.length === 1)
        folded.additionalProperties = constraints[0];
      else if (constraints.length > 1)
        folded.additionalProperties = { allOf: constraints };
    }
    return folded;
  }
  function foldIntersection(json) {
    const allOf = json.allOf;
    if (!Array.isArray(allOf) || allOf.length < 2)
      return;
    for (const key of FOLDABLE_KEYS)
      if (key in json)
        return;
    const unions = allOf.filter((m2) => UNION_KEYS.some((k2) => Array.isArray(m2[k2])));
    let folded = null;
    if (!unions.length) {
      folded = foldObjects(allOf);
    } else {
      const union2 = unions[0];
      const keyword = UNION_KEYS.find((k2) => Array.isArray(union2[k2]));
      if (Object.keys(union2).length !== 1)
        return;
      const rest = allOf.filter((m2) => m2 !== union2);
      const branches = union2[keyword].map((branch) => foldObjects([...rest, branch]));
      if (branches.some((b2) => !b2))
        return;
      folded = { [keyword]: branches };
    }
    if (!folded)
      return;
    delete json.allOf;
    assignProps(json, folded);
  }
  function finalize(ctx, schema) {
    var _a2, _b, _c, _d;
    const root = ctx.seen.get(schema);
    if (!root)
      throw new Error("Unprocessed schema. This is a bug in Zod.");
    const flattenRef = (zodSchema) => {
      const seen = ctx.seen.get(zodSchema);
      if (seen.ref === null)
        return;
      const schema2 = seen.def ?? seen.schema;
      const _cached = { ...schema2 };
      const ref = seen.ref;
      seen.ref = null;
      if (ref) {
        flattenRef(ref);
        const refSeen = ctx.seen.get(ref);
        const refSchema = refSeen.schema;
        if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
          schema2.allOf = schema2.allOf ?? [];
          schema2.allOf.push(refSchema);
        } else {
          assignProps(schema2, refSchema);
        }
        assignProps(schema2, _cached);
        const isParentRef = zodSchema._zod.parent === ref;
        if (isParentRef) {
          for (const key in schema2) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (!(key in _cached)) {
              delete schema2[key];
            }
          }
        }
        if (refSchema.$ref && refSeen.def) {
          for (const key in schema2) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in refSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(refSeen.def[key])) {
              delete schema2[key];
            }
          }
        }
      }
      const parent = zodSchema._zod.parent;
      if (parent && parent !== ref) {
        flattenRef(parent);
        const parentSeen = ctx.seen.get(parent);
        if (parentSeen == null ? void 0 : parentSeen.schema.$ref) {
          schema2.$ref = parentSeen.schema.$ref;
          if (parentSeen.def) {
            for (const key in schema2) {
              if (key === "$ref" || key === "allOf")
                continue;
              if (key in parentSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(parentSeen.def[key])) {
                delete schema2[key];
              }
            }
          }
        }
      }
      ctx.override({
        zodSchema,
        jsonSchema: schema2,
        path: seen.path ?? []
      });
    };
    if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
      for (const entry of [...ctx.seen.entries()].reverse()) {
        flattenRef(entry[0]);
      }
      if (ctx.target !== "openapi-3.0") {
        for (const entry of ctx.seen.entries()) {
          compactTypeUnion(entry[1].def ?? entry[1].schema);
        }
      }
      for (const rewrite of ctx.deferred)
        rewrite();
      if (ctx.intersections.length) {
        const carriers = /* @__PURE__ */ new Map();
        for (const seen of ctx.seen.values()) {
          for (const json of [seen.schema, seen.def]) {
            const allOf = json == null ? void 0 : json.allOf;
            if (!Array.isArray(allOf))
              continue;
            const existing = carriers.get(allOf);
            if (existing)
              existing.push(json);
            else
              carriers.set(allOf, [json]);
          }
        }
        for (const allOf of ctx.intersections) {
          for (const json of carriers.get(allOf) ?? [])
            foldIntersection(json);
        }
      }
    }
    const result = {};
    if (ctx.target === "draft-2020-12") {
      result.$schema = "https://json-schema.org/draft/2020-12/schema";
    } else if (ctx.target === "draft-07") {
      result.$schema = "http://json-schema.org/draft-07/schema#";
    } else if (ctx.target === "draft-04") {
      result.$schema = "http://json-schema.org/draft-04/schema#";
    } else if (ctx.target === "openapi-3.0") ;
    else ;
    if ((_a2 = ctx.external) == null ? void 0 : _a2.uri) {
      const id = (_b = ctx.external.registry.get(schema)) == null ? void 0 : _b.id;
      if (!id)
        throw new Error("Schema is missing an `id` property");
      result.$id = ctx.external.uri(id);
    }
    assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
    const rootMetaId = (_c = ctx.metadataRegistry.get(schema)) == null ? void 0 : _c.id;
    if (rootMetaId !== void 0 && result.id === rootMetaId)
      delete result.id;
    const defs = ((_d = ctx.external) == null ? void 0 : _d.defs) ?? {};
    if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
      for (const entry of ctx.seen.entries()) {
        const seen = entry[1];
        if (seen.def && seen.defId) {
          if (seen.def.id === seen.defId)
            delete seen.def.id;
          assignProp(defs, seen.defId, seen.def);
        }
      }
    }
    if (ctx.external)
      ctx.sharedEmitDoneFor = ctx.external;
    if (ctx.external) ;
    else {
      if (Object.keys(defs).length > 0) {
        if (ctx.target === "draft-2020-12") {
          result.$defs = defs;
        } else {
          result.definitions = defs;
        }
      }
    }
    try {
      const finalized = JSON.parse(JSON.stringify(result));
      Object.defineProperty(finalized, "~standard", {
        value: {
          ...schema["~standard"],
          jsonSchema: {
            input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
            output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
          }
        },
        enumerable: false,
        writable: false
      });
      return finalized;
    } catch (_err) {
      throw new Error("Error converting schema to JSON.");
    }
  }
  function isTransforming(_schema, _ctx) {
    const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
    if (ctx.seen.has(_schema))
      return false;
    ctx.seen.add(_schema);
    const def = _schema._zod.def;
    if (def.type === "transform")
      return true;
    if (def.type === "array")
      return isTransforming(def.element, ctx);
    if (def.type === "set")
      return isTransforming(def.valueType, ctx);
    if (def.type === "lazy")
      return isTransforming(def.getter(), ctx);
    if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") {
      return isTransforming(def.innerType, ctx);
    }
    if (def.type === "intersection") {
      return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
    }
    if (def.type === "record" || def.type === "map") {
      return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
    }
    if (def.type === "pipe") {
      if (_schema._zod.traits.has("$ZodCodec"))
        return true;
      return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
    }
    if (def.type === "object") {
      for (const key in def.shape) {
        if (isTransforming(def.shape[key], ctx))
          return true;
      }
      return false;
    }
    if (def.type === "union") {
      for (const option of def.options) {
        if (isTransforming(option, ctx))
          return true;
      }
      return false;
    }
    if (def.type === "tuple") {
      for (const item of def.items) {
        if (isTransforming(item, ctx))
          return true;
      }
      if (def.rest && isTransforming(def.rest, ctx))
        return true;
      return false;
    }
    return false;
  }
  const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
    const ctx = initializeContext({ ...params, processors });
    processSchema(schema, ctx);
    extractDefs(ctx, schema);
    return finalize(ctx, schema);
  };
  const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
    const { libraryOptions, target } = params ?? {};
    const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
    processSchema(schema, ctx);
    extractDefs(ctx, schema);
    return finalize(ctx, schema);
  };
  const narrowMin = (agg, key, value) => {
    if (agg[key] === void 0 || value > agg[key])
      agg[key] = value;
  };
  const narrowMax = (agg, key, value) => {
    if (agg[key] === void 0 || value < agg[key])
      agg[key] = value;
  };
  const narrowBoth = (agg, value) => {
    narrowMin(agg, "minimum", value);
    narrowMax(agg, "maximum", value);
  };
  const addDivisor = (agg, value) => {
    agg.multipleOf ?? (agg.multipleOf = []);
    if (!agg.multipleOf.includes(value))
      agg.multipleOf.push(value);
  };
  const addPattern = (agg, pattern) => {
    agg.patterns ?? (agg.patterns = /* @__PURE__ */ new Set());
    agg.patterns.add(pattern);
  };
  const intersectMime = (agg, mime) => {
    agg.mime = agg.mime ? agg.mime.filter((m2) => mime.includes(m2)) : [...mime];
  };
  const setFormat = (agg, format) => {
    agg.format = format;
    if (format.includes("int"))
      agg.isInt = true;
  };
  const minContributor = (agg, def) => narrowMin(agg, "minimum", def.minimum);
  const maxContributor = (agg, def) => narrowMax(agg, "maximum", def.maximum);
  const formatContributor = (ranges) => (agg, def) => {
    setFormat(agg, def.format);
    const [minimum, maximum] = ranges[def.format];
    narrowMin(agg, "minimum", minimum);
    narrowMax(agg, "maximum", maximum);
  };
  const contributors = {
    greater_than: (agg, def) => narrowMin(agg, def.inclusive ? "minimum" : "exclusiveMinimum", def.value),
    less_than: (agg, def) => narrowMax(agg, def.inclusive ? "maximum" : "exclusiveMaximum", def.value),
    multiple_of: (agg, def) => addDivisor(agg, def.value),
    number_format: formatContributor(NUMBER_FORMAT_RANGES),
    bigint_format: formatContributor(BIGINT_FORMAT_RANGES),
    min_length: minContributor,
    max_length: maxContributor,
    length_equals: (agg, def) => narrowBoth(agg, def.length),
    min_size: minContributor,
    max_size: maxContributor,
    size_equals: (agg, def) => narrowBoth(agg, def.size),
    string_format: (agg, def) => {
      setFormat(agg, def.format);
      if (def.pattern)
        addPattern(agg, def.pattern);
      if (def.format === "base64" || def.format === "base64url")
        agg.contentEncoding = def.format;
      if (def.local || def.precision === -1)
        agg.laxFormat = true;
    },
    mime_type: (agg, def) => intersectMime(agg, def.mime)
  };
  function aggregateChecks(schema) {
    var _a2;
    const agg = {};
    const def = schema._zod.def;
    const list = schema._zod.traits.has("$ZodCheck") ? [schema, ...def.checks ?? []] : def.checks ?? [];
    for (const ch of list)
      (_a2 = contributors[ch._zod.def.check]) == null ? void 0 : _a2.call(contributors, agg, ch._zod.def);
    const bag = schema._zod.bag;
    if (bag.minimum !== void 0)
      narrowMin(agg, "minimum", bag.minimum);
    if (bag.exclusiveMinimum !== void 0)
      narrowMin(agg, "exclusiveMinimum", bag.exclusiveMinimum);
    if (bag.maximum !== void 0)
      narrowMax(agg, "maximum", bag.maximum);
    if (bag.exclusiveMaximum !== void 0)
      narrowMax(agg, "exclusiveMaximum", bag.exclusiveMaximum);
    if (bag.multipleOf !== void 0)
      addDivisor(agg, bag.multipleOf);
    if (bag.format !== void 0) {
      agg.format ?? (agg.format = bag.format);
      if (bag.format.includes("int"))
        agg.isInt = true;
    }
    if (bag.mime)
      intersectMime(agg, bag.mime);
    for (const pattern of bag.patterns ?? [])
      addPattern(agg, pattern);
    return agg;
  }
  const formatMap = {
    guid: "uuid",
    url: "uri",
    datetime: "date-time",
    json_string: "json-string",
    regex: ""
    // do not set
  };
  const exactPatterns = /* @__PURE__ */ new Map([
    [base64Charset, base64],
    [base64urlCharset, base64url]
  ]);
  const exactPattern = (p2) => exactPatterns.get(p2) ?? p2;
  const stringProcessor = (schema, ctx, _json, _params) => {
    const json = _json;
    json.type = "string";
    const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = aggregateChecks(schema);
    if (typeof minimum === "number")
      json.minLength = minimum;
    if (typeof maximum === "number")
      json.maxLength = maximum;
    if (format) {
      json.format = formatMap[format] ?? format;
      if (json.format === "")
        delete json.format;
      if (format === "time" || laxFormat) {
        delete json.format;
      }
    }
    if (contentEncoding)
      json.contentEncoding = contentEncoding;
    if (patterns && patterns.size > 0) {
      const patternList = [...patterns].map(exactPattern);
      if (patternList.length === 1)
        json.pattern = patternList[0].source;
      else if (patternList.length > 1) {
        json.allOf = [
          ...patternList.map((regex) => ({
            ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
            pattern: regex.source
          }))
        ];
      }
    }
  };
  const numberProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const { minimum, maximum, multipleOf, exclusiveMaximum, exclusiveMinimum, isInt } = aggregateChecks(schema);
    json.type = isInt ? "integer" : "number";
    const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
    const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
    const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
    if (exMin) {
      if (legacy) {
        json.minimum = exclusiveMinimum;
        json.exclusiveMinimum = true;
      } else {
        json.exclusiveMinimum = exclusiveMinimum;
      }
    } else if (typeof minimum === "number") {
      json.minimum = minimum;
    }
    if (exMax) {
      if (legacy) {
        json.maximum = exclusiveMaximum;
        json.exclusiveMaximum = true;
      } else {
        json.exclusiveMaximum = exclusiveMaximum;
      }
    } else if (typeof maximum === "number") {
      json.maximum = maximum;
    }
    if (multipleOf) {
      const divisors = /* @__PURE__ */ new Set();
      for (const divisor of multipleOf) {
        if (Number.isFinite(divisor) && divisor !== 0)
          divisors.add(Math.abs(divisor));
        else
          handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${divisor} cannot be represented in JSON Schema`);
      }
      const [first, ...rest] = divisors;
      if (first !== void 0)
        json.multipleOf = first;
      if (rest.length)
        json.allOf = [...json.allOf ?? [], ...rest.map((m2) => ({ multipleOf: m2 }))];
    }
  };
  const booleanProcessor = (_schema, _ctx, json, _params) => {
    json.type = "boolean";
  };
  const neverProcessor = (_schema, _ctx, json, _params) => {
    json.not = {};
  };
  const anyProcessor = (_schema, _ctx, _json, _params) => {
  };
  const unknownProcessor = (_schema, _ctx, _json, _params) => {
  };
  const enumProcessor = (schema, _ctx, json, _params) => {
    const def = schema._zod.def;
    const values = getEnumValues(def.entries);
    if (values.length === 0) {
      json.not = {};
      return;
    }
    if (values.every((v2) => typeof v2 === "number"))
      json.type = "number";
    if (values.every((v2) => typeof v2 === "string"))
      json.type = "string";
    json.enum = values;
  };
  const literalProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    if (def.values.length === 0) {
      json.not = {};
      return;
    }
    const vals = [];
    for (const val of def.values) {
      if (val === void 0) {
        if (handleUnrepresentable(schema, ctx, json, params, "Literal `undefined` cannot be represented in JSON Schema"))
          return;
      } else if (typeof val === "bigint") {
        if (handleUnrepresentable(schema, ctx, json, params, "BigInt literals cannot be represented in JSON Schema"))
          return;
        vals.push(Number(val));
      } else {
        vals.push(val);
      }
    }
    if (vals.length === 0) ;
    else if (vals.length === 1) {
      const val = vals[0];
      json.type = val === null ? "null" : typeof val;
      if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
        json.enum = [val];
      } else {
        json.const = val;
      }
    } else {
      if (vals.every((v2) => typeof v2 === "number"))
        json.type = "number";
      if (vals.every((v2) => typeof v2 === "string"))
        json.type = "string";
      if (vals.every((v2) => typeof v2 === "boolean"))
        json.type = "boolean";
      if (vals.every((v2) => v2 === null))
        json.type = "null";
      json.enum = vals;
    }
  };
  const customProcessor = (schema, ctx, json, params) => {
    handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
  };
  const transformProcessor = (schema, ctx, json, params) => {
    handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
  };
  const arrayProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    const { minimum, maximum } = aggregateChecks(schema);
    if (typeof minimum === "number")
      json.minItems = minimum;
    if (typeof maximum === "number")
      json.maxItems = maximum;
    json.type = "array";
    json.items = processSchema(def.element, ctx, {
      ...params,
      path: [...params.path, "items"]
    });
  };
  function inputOptin(schema) {
    const def = schema._zod.def;
    if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) {
      return inputOptin(def.out);
    }
    if (def.type === "catch") {
      return inputOptin(def.innerType);
    }
    return schema._zod.optin;
  }
  const objectProcessor = (schema, ctx, _json, params) => {
    var _a2;
    const json = _json;
    const def = schema._zod.def;
    const shape = def.shape;
    const symbolKeys = Object.getOwnPropertySymbols(shape);
    if (symbolKeys.length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) {
      return;
    }
    json.type = "object";
    json.properties = {};
    for (const key in shape) {
      assignProp(json.properties, key, processSchema(shape[key], ctx, {
        ...params,
        path: [...params.path, "properties", key]
      }));
    }
    const requiredKeys = [];
    for (const key of Object.keys(shape)) {
      const field = def.shape[key];
      if (ctx.io === "input" ? inputOptin(field) === void 0 : field._zod.optout === void 0) {
        requiredKeys.push(key);
      }
    }
    if (requiredKeys.length > 0) {
      json.required = requiredKeys;
    }
    if (((_a2 = def.catchall) == null ? void 0 : _a2._zod.def.type) === "never") {
      json.additionalProperties = false;
    } else if (!def.catchall) {
      if (ctx.io === "output")
        json.additionalProperties = false;
    } else if (def.catchall) {
      json.additionalProperties = processSchema(def.catchall, ctx, {
        ...params,
        path: [...params.path, "additionalProperties"]
      });
    }
  };
  const unionProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const isExclusive = def.inclusive === false;
    const options = def.options.map((x2, i2) => processSchema(x2, ctx, {
      ...params,
      path: [...params.path, isExclusive ? "oneOf" : "anyOf", i2]
    }));
    if (isExclusive) {
      json.oneOf = options;
    } else {
      json.anyOf = options;
    }
  };
  const intersectionProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const a2 = processSchema(def.left, ctx, {
      ...params,
      path: [...params.path, "allOf", 0]
    });
    const b2 = processSchema(def.right, ctx, {
      ...params,
      path: [...params.path, "allOf", 1]
    });
    const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
    const allOf = [
      ...isSimpleIntersection(a2) ? a2.allOf : [a2],
      ...isSimpleIntersection(b2) ? b2.allOf : [b2]
    ];
    json.allOf = allOf;
    ctx.intersections.push(allOf);
  };
  function stringifyKeyNames(bySchema, json, visited) {
    var _a2;
    if (json.$ref) {
      if (visited.has(json))
        return json;
      visited.add(json);
      const def = (_a2 = bySchema.get(json)) == null ? void 0 : _a2.def;
      if (!def)
        return json;
      const inlined = stringifyKeyNames(bySchema, def, visited);
      return inlined === def ? json : inlined;
    }
    for (const keyword of ["anyOf", "oneOf"]) {
      const branches = json[keyword];
      if (!Array.isArray(branches))
        continue;
      const mapped = branches.map((branch) => stringifyKeyNames(bySchema, branch, visited));
      if (mapped.some((branch, i2) => branch !== branches[i2]))
        json = { ...json, [keyword]: mapped };
    }
    const types = Array.isArray(json.type) ? json.type : [json.type];
    const numericType = !types.includes("string") && types.some((t2) => t2 === "number" || t2 === "integer");
    const values = json.enum ?? (json.const !== void 0 ? [json.const] : void 0);
    if (!numericType && !(values == null ? void 0 : values.some((v2) => typeof v2 === "number")))
      return json;
    const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, format, id, ...rest } = json;
    if (rest.enum)
      rest.enum = rest.enum.map((v2) => typeof v2 === "number" ? String(v2) : v2);
    else if (typeof rest.const === "number")
      rest.const = String(rest.const);
    if (!numericType)
      return rest;
    rest.type = "string";
    if (!values)
      rest.pattern = (types.includes("number") ? number$1 : integer).source;
    return rest;
  }
  const pendingRecords = /* @__PURE__ */ new WeakMap();
  function rewriteKeyNames(ctx) {
    var _a2;
    const bySchema = /* @__PURE__ */ new Map();
    for (const entry of ctx.seen.values()) {
      if (entry.def && !bySchema.has(entry.schema))
        bySchema.set(entry.schema, entry);
    }
    const rewrites = /* @__PURE__ */ new Map();
    for (const record2 of pendingRecords.get(ctx) ?? []) {
      const seen = ctx.seen.get(record2);
      const names = (_a2 = (seen == null ? void 0 : seen.def) ?? (seen == null ? void 0 : seen.schema)) == null ? void 0 : _a2.propertyNames;
      if (!names || names === true || rewrites.has(names))
        continue;
      const rewritten = stringifyKeyNames(bySchema, names, /* @__PURE__ */ new Set());
      if (rewritten !== names)
        rewrites.set(names, rewritten);
    }
    if (!rewrites.size)
      return;
    for (const entry of ctx.seen.values()) {
      for (const carrier of [entry.schema, entry.def]) {
        const rewritten = carrier && rewrites.get(carrier.propertyNames);
        if (rewritten)
          carrier.propertyNames = rewritten;
      }
    }
  }
  const recordProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "object";
    const keyType = def.keyType;
    const patterns = aggregateChecks(keyType).patterns;
    if (def.mode === "loose" && patterns && patterns.size > 0) {
      const valueSchema = processSchema(def.valueType, ctx, {
        ...params,
        path: [...params.path, "patternProperties", "*"]
      });
      json.patternProperties = {};
      for (const pattern of patterns) {
        assignProp(json.patternProperties, exactPattern(pattern).source, valueSchema);
      }
    } else {
      if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
        json.propertyNames = processSchema(def.keyType, ctx, {
          ...params,
          path: [...params.path, "propertyNames"]
        });
        let pending = pendingRecords.get(ctx);
        if (!pending) {
          pending = [];
          pendingRecords.set(ctx, pending);
          ctx.deferred.push(() => rewriteKeyNames(ctx));
        }
        pending.push(schema);
      }
      json.additionalProperties = processSchema(def.valueType, ctx, {
        ...params,
        path: [...params.path, "additionalProperties"]
      });
    }
    const keyValues = keyType._zod.values;
    const omittableOnInput = ctx.io === "input" && inputOptin(def.valueType) !== void 0;
    if (keyValues && !def.partial && !omittableOnInput) {
      const validKeyValues = [...keyValues].filter((v2) => typeof v2 === "string" || typeof v2 === "number");
      if (validKeyValues.length > 0) {
        json.required = validKeyValues.map(String);
      }
    }
  };
  const nullableProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const inner = processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    if (ctx.target === "openapi-3.0") {
      seen.ref = def.innerType;
      json.nullable = true;
    } else {
      json.anyOf = [inner, { type: "null" }];
    }
  };
  const nonoptionalProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
  };
  const UNREPRESENTABLE_DEFAULT = Symbol();
  function serializeDefaultValue(value, schema, ctx, json, params) {
    let unrepresentable = false;
    const serialized = JSON.stringify(value, (_2, val) => {
      if (typeof val !== "bigint")
        return val;
      unrepresentable = true;
      return null;
    });
    if (!unrepresentable)
      return JSON.parse(serialized);
    handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
    return UNREPRESENTABLE_DEFAULT;
  }
  const defaultProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
    if (value !== UNREPRESENTABLE_DEFAULT)
      json.default = value;
  };
  const prefaultProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    if (ctx.io !== "input")
      return;
    const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
    if (value !== UNREPRESENTABLE_DEFAULT)
      json._prefault = value;
  };
  const catchProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    let catchValue;
    try {
      catchValue = def.catchValue(void 0);
    } catch {
      handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
      return;
    }
    json.default = catchValue;
  };
  const pipeProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    const inIsTransform = def.in._zod.traits.has("$ZodTransform");
    const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
    processSchema(innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = innerType;
  };
  const readonlyProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    json.readOnly = true;
  };
  const optionalProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    processSchema(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
  };
  const _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
  function _lazyMethod(proto, key, make) {
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: false,
      get() {
        const value = make(this);
        Object.defineProperty(this, key, { value, configurable: true, writable: true });
        return value;
      },
      set(value) {
        Object.defineProperty(this, key, { value, configurable: true, writable: true });
      }
    });
  }
  const initializer = (inst, issues) => {
    $ZodError.init(inst, issues);
    inst.name = "ZodError";
    const proto = Object.getPrototypeOf(inst);
    if (_installedErrorProtos.has(proto))
      return;
    _installedErrorProtos.add(proto);
    _lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
    _lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
    _lazyMethod(proto, "addIssue", (self) => (issue2) => {
      self.issues.push(issue2);
      self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
    });
    _lazyMethod(proto, "addIssues", (self) => (issues2) => {
      self.issues.push(...issues2);
      self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
    });
    Object.defineProperty(proto, "isEmpty", {
      configurable: true,
      enumerable: false,
      get() {
        return this.issues.length === 0;
      }
    });
  };
  const ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer, void 0, {
    Parent: Error
  });
  const parse = /* @__PURE__ */ _parse(ZodRealError);
  const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
  const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
  const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
  const encode = /* @__PURE__ */ _encode(ZodRealError);
  const decode = /* @__PURE__ */ _decode(ZodRealError);
  const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
  const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
  const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
  const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
  const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
  const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
  function _ensureDefaultLocale() {
    if (!globalConfig.localeError)
      config(en());
  }
  function _ensureDefaultMemoizer() {
    if (!globalConfig.memoizer)
      config({ memoizer: memoizer() });
  }
  const ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
    _ensureDefaultLocale();
    $ZodType.init(inst, def);
    inst.def = def;
    inst.type = def.type;
    return inst;
  }, {
    check(...chks) {
      const def = this.def;
      return this.clone(mergeDefs(def, {
        checks: [
          ...def.checks ?? [],
          ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }), { parent: true });
    },
    with(...chks) {
      return this.check(...chks);
    },
    clone(def, params) {
      return clone(this, def, params);
    },
    brand() {
      return this;
    },
    register(reg, meta) {
      reg.add(this, meta);
      return this;
    },
    refine(check, params) {
      return this.check(refine(check, params));
    },
    superRefine(refinement, params) {
      return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
      return this.check(/* @__PURE__ */ _overwrite(fn));
    },
    optional() {
      return optional(this);
    },
    exactOptional() {
      return exactOptional(this);
    },
    nullable() {
      return nullable(this);
    },
    nullish() {
      return optional(nullable(this));
    },
    nonoptional(params) {
      return nonoptional(this, params);
    },
    array() {
      return array(this);
    },
    or(arg) {
      return union([this, arg]);
    },
    and(arg) {
      return intersection(this, arg);
    },
    transform(tx) {
      return pipe(this, transform(tx));
    },
    default(d2) {
      return _default(this, d2);
    },
    prefault(d2) {
      return prefault(this, d2);
    },
    catch(params) {
      return _catch(this, params);
    },
    pipe(target) {
      return pipe(this, target);
    },
    readonly() {
      return readonly(this);
    },
    describe(description) {
      const cl = this.clone();
      globalRegistry.add(cl, { description });
      return cl;
    },
    meta(...args) {
      if (args.length === 0)
        return globalRegistry.get(this);
      const cl = this.clone();
      globalRegistry.add(cl, args[0]);
      return cl;
    },
    isOptional() {
      return this.safeParse(void 0).success;
    },
    isNullable() {
      return this.safeParse(null).success;
    },
    apply(fn, ...args) {
      return args.length === 0 ? fn(this) : fn(this, ...args);
    },
    // Overrides core's `~standard` to add `jsonSchema`. Must stay a prototype entry: redefining it per instance demotes instances to dictionary mode.
    get "~standard"() {
      return hide(this, "~standard", {
        ...standardProps(this),
        jsonSchema: {
          input: createStandardJSONSchemaMethod(this, "input"),
          output: createStandardJSONSchemaMethod(this, "output")
        }
      });
    },
    set "~standard"(value) {
      own(this, "~standard", value);
    },
    parse: function _parse2(data, params) {
      return parse(this, data, params, { callee: _parse2 });
    },
    parseAsync: async function _parseAsync2(data, params) {
      return await parseAsync(this, data, params, { callee: _parseAsync2 });
    },
    safeParse(data, params) {
      return safeParse(this, data, params);
    },
    async safeParseAsync(data, params) {
      return safeParseAsync(this, data, params);
    },
    // `spa` is an alias: same function object as `safeParseAsync`, as before.
    get spa() {
      return this == null ? void 0 : this.safeParseAsync;
    },
    set spa(value) {
      own(this, "spa", value);
    },
    validate(data, params) {
      return validate(this, data, params);
    },
    validateAsync(data, params) {
      return validateAsync$1(this, data, params);
    },
    encode: function _encode2(data, params) {
      return encode(this, data, params, { callee: _encode2 });
    },
    decode: function _decode2(data, params) {
      return decode(this, data, params, { callee: _decode2 });
    },
    encodeAsync: async function _encodeAsync2(data, params) {
      return await encodeAsync(this, data, params, { callee: _encodeAsync2 });
    },
    decodeAsync: async function _decodeAsync2(data, params) {
      return await decodeAsync(this, data, params, { callee: _decodeAsync2 });
    },
    safeEncode(data, params) {
      return safeEncode(this, data, params);
    },
    safeDecode(data, params) {
      return safeDecode(this, data, params);
    },
    async safeEncodeAsync(data, params) {
      return safeEncodeAsync(this, data, params);
    },
    async safeDecodeAsync(data, params) {
      return safeDecodeAsync(this, data, params);
    },
    toJSONSchema(params) {
      return createToJSONSchemaMethod(this, {})(params);
    },
    // Reads through to the registry on every access, so it must not cache.
    get description() {
      var _a2;
      return (_a2 = globalRegistry.get(this)) == null ? void 0 : _a2.description;
    },
    // No setter: `schema._def = x` throws, as it did when `_def` was a non-writable own property.
    get _def() {
      return this._zod.def;
    }
  });
  const _ZodString = /* @__PURE__ */ $constructor(
    "_ZodString",
    (inst, def) => {
      $ZodString.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json);
    },
    /* @__PURE__ */ derived({
      format: (inst) => aggregateChecks(inst).format ?? null,
      minLength: (inst) => aggregateChecks(inst).minimum ?? null,
      maxLength: (inst) => aggregateChecks(inst).maximum ?? null
    }, {
      regex(...args) {
        return this.check(/* @__PURE__ */ _regex(...args));
      },
      includes(...args) {
        return this.check(/* @__PURE__ */ _includes(...args));
      },
      startsWith(...args) {
        return this.check(/* @__PURE__ */ _startsWith(...args));
      },
      endsWith(...args) {
        return this.check(/* @__PURE__ */ _endsWith(...args));
      },
      min(...args) {
        return this.check(/* @__PURE__ */ _minLength(...args));
      },
      max(...args) {
        return this.check(/* @__PURE__ */ _maxLength(...args));
      },
      length(...args) {
        return this.check(/* @__PURE__ */ _length(...args));
      },
      nonempty(...args) {
        return this.check(/* @__PURE__ */ _minLength(1, ...args));
      },
      lowercase(params) {
        return this.check(/* @__PURE__ */ _lowercase(params));
      },
      uppercase(params) {
        return this.check(/* @__PURE__ */ _uppercase(params));
      },
      trim() {
        return this.check(/* @__PURE__ */ _trim());
      },
      normalize(...args) {
        return this.check(/* @__PURE__ */ _normalize(...args));
      },
      toLowerCase() {
        return this.check(/* @__PURE__ */ _toLowerCase());
      },
      toUpperCase() {
        return this.check(/* @__PURE__ */ _toUpperCase());
      },
      slugify() {
        return this.check(/* @__PURE__ */ _slugify());
      }
    })
  );
  const ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
    $ZodString.init(inst, def);
    _ZodString.init(inst, def);
  }, {
    email(params) {
      return this.check(/* @__PURE__ */ _email(ZodEmail, params));
    },
    url(params) {
      return this.check(/* @__PURE__ */ _url(ZodURL, params));
    },
    jwt(params) {
      return this.check(/* @__PURE__ */ _jwt(ZodJWT, params));
    },
    emoji(params) {
      return this.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
    },
    guid(params) {
      return this.check(/* @__PURE__ */ _guid(ZodGUID, params));
    },
    uuid(params) {
      return this.check(/* @__PURE__ */ _uuid(ZodUUID, params));
    },
    uuidv4(params) {
      return this.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
    },
    uuidv6(params) {
      return this.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
    },
    uuidv7(params) {
      return this.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
    },
    nanoid(params) {
      return this.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
    },
    cuid(params) {
      return this.check(/* @__PURE__ */ _cuid(ZodCUID, params));
    },
    cuid2(params) {
      return this.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
    },
    ulid(params) {
      return this.check(/* @__PURE__ */ _ulid(ZodULID, params));
    },
    base64(params) {
      return this.check(/* @__PURE__ */ _base64(ZodBase64, params));
    },
    base64url(params) {
      return this.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
    },
    xid(params) {
      return this.check(/* @__PURE__ */ _xid(ZodXID, params));
    },
    ksuid(params) {
      return this.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
    },
    ipv4(params) {
      return this.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
    },
    ipv6(params) {
      return this.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
    },
    cidrv4(params) {
      return this.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
    },
    cidrv6(params) {
      return this.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
    },
    e164(params) {
      return this.check(/* @__PURE__ */ _e164(ZodE164, params));
    },
    datetime(params) {
      return this.check(/* @__PURE__ */ _isoDateTime(ZodISODateTime, params));
    },
    date(params) {
      return this.check(/* @__PURE__ */ _isoDate(ZodISODate, params));
    },
    time(params) {
      return this.check(/* @__PURE__ */ _isoTime(ZodISOTime, params));
    },
    duration(params) {
      return this.check(/* @__PURE__ */ _isoDuration(ZodISODuration, params));
    }
  });
  function string(params) {
    return /* @__PURE__ */ _string(ZodString, params);
  }
  const ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    _ZodString.init(inst, def);
  });
  const ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
    $ZodISODateTime.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
    $ZodISODate.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
    $ZodISOTime.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
    $ZodISODuration.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
    $ZodEmail.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
    $ZodGUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
    $ZodUUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
    $ZodURL.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
    $ZodEmoji.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
    $ZodNanoID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
    $ZodCUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
    $ZodCUID2.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
    $ZodULID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
    $ZodXID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
    $ZodKSUID.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
    $ZodIPv4.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
    $ZodIPv6.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
    $ZodCIDRv4.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
    $ZodCIDRv6.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
    $ZodBase64.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
    $ZodBase64URL.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
    $ZodE164.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
    $ZodJWT.init(inst, def);
    ZodStringFormat.init(inst, def);
  });
  const ZodNumber = /* @__PURE__ */ $constructor(
    "ZodNumber",
    (inst, def) => {
      $ZodNumber.init(inst, def);
      ZodType.init(inst, def);
      inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
      inst.isFinite = true;
    },
    /* @__PURE__ */ derived({
      minValue: (inst) => {
        const { minimum, exclusiveMinimum } = aggregateChecks(inst);
        return Math.max(minimum ?? Number.NEGATIVE_INFINITY, exclusiveMinimum ?? Number.NEGATIVE_INFINITY);
      },
      maxValue: (inst) => {
        const { maximum, exclusiveMaximum } = aggregateChecks(inst);
        return Math.min(maximum ?? Number.POSITIVE_INFINITY, exclusiveMaximum ?? Number.POSITIVE_INFINITY);
      },
      isInt: (inst) => {
        const { isInt, multipleOf } = aggregateChecks(inst);
        return !!isInt || !!(multipleOf == null ? void 0 : multipleOf.some(Number.isSafeInteger));
      },
      format: (inst) => aggregateChecks(inst).format ?? null
    }, {
      gt(value, params) {
        return this.check(/* @__PURE__ */ _gt(value, params));
      },
      gte(value, params) {
        return this.check(/* @__PURE__ */ _gte(value, params));
      },
      min(value, params) {
        return this.check(/* @__PURE__ */ _gte(value, params));
      },
      lt(value, params) {
        return this.check(/* @__PURE__ */ _lt(value, params));
      },
      lte(value, params) {
        return this.check(/* @__PURE__ */ _lte(value, params));
      },
      max(value, params) {
        return this.check(/* @__PURE__ */ _lte(value, params));
      },
      int(params) {
        return this.check(int(params));
      },
      safe(params) {
        return this.check(int(params));
      },
      positive(params) {
        return this.check(/* @__PURE__ */ _gt(0, params));
      },
      nonnegative(params) {
        return this.check(/* @__PURE__ */ _gte(0, params));
      },
      negative(params) {
        return this.check(/* @__PURE__ */ _lt(0, params));
      },
      nonpositive(params) {
        return this.check(/* @__PURE__ */ _lte(0, params));
      },
      multipleOf(value, params) {
        return this.check(/* @__PURE__ */ _multipleOf(value, params));
      },
      step(value, params) {
        return this.check(/* @__PURE__ */ _multipleOf(value, params));
      },
      finite() {
        return this;
      }
    })
  );
  function number(params) {
    return /* @__PURE__ */ _number(ZodNumber, params);
  }
  const ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
    $ZodNumberFormat.init(inst, def);
    ZodNumber.init(inst, def);
  });
  function int(params) {
    return /* @__PURE__ */ _int(ZodNumberFormat, params);
  }
  const ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
    $ZodBoolean.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json);
  });
  function boolean(params) {
    return /* @__PURE__ */ _boolean(ZodBoolean, params);
  }
  const ZodAny = /* @__PURE__ */ $constructor("ZodAny", (inst, def) => {
    $ZodAny.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => anyProcessor();
  });
  function any() {
    return /* @__PURE__ */ _any(ZodAny);
  }
  const ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
    $ZodUnknown.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor();
  });
  function unknown() {
    return /* @__PURE__ */ _unknown(ZodUnknown);
  }
  const ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
    $ZodNever.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json);
  });
  function never(params) {
    return /* @__PURE__ */ _never(ZodNever, params);
  }
  const ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodArray.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
    inst.element = def.element;
  }, {
    min(n2, params) {
      return this.check(/* @__PURE__ */ _minLength(n2, params));
    },
    nonempty(params) {
      return this.check(/* @__PURE__ */ _minLength(1, params));
    },
    max(n2, params) {
      return this.check(/* @__PURE__ */ _maxLength(n2, params));
    },
    length(n2, params) {
      return this.check(/* @__PURE__ */ _length(n2, params));
    },
    unwrap() {
      return this.element;
    }
  });
  function array(element, params) {
    return /* @__PURE__ */ _array(ZodArray, element, params);
  }
  const ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodObjectJIT.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
    installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
  }, {
    keyof() {
      return _enum(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
      return this.clone(mergeDefs(this._zod.def, { catchall }));
    },
    passthrough() {
      return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
    },
    loose() {
      return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
    },
    strict() {
      return this.clone(mergeDefs(this._zod.def, { catchall: never() }));
    },
    strip() {
      return this.clone(mergeDefs(this._zod.def, { catchall: void 0 }));
    },
    extend(incoming) {
      return extend(this, incoming);
    },
    safeExtend(incoming) {
      return safeExtend(this, incoming);
    },
    merge(other) {
      return merge(this, other);
    },
    pick(mask) {
      return pick(this, mask);
    },
    omit(mask) {
      return omit(this, mask);
    },
    partial(...args) {
      return partial(ZodOptional, this, args[0]);
    },
    exactPartial(...args) {
      return partial(ZodExactOptional, this, args[0], "exactPartial");
    },
    required(...args) {
      return required(ZodNonOptional, this, args[0]);
    }
  });
  function object(shape, params) {
    const def = {
      type: "object",
      shape: shape ?? {},
      ...normalizeParams(params)
    };
    return new ZodObject(def);
  }
  const ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
    $ZodUnion.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
    inst.options = def.options;
  });
  function union(options, params) {
    return new ZodUnion({
      type: "union",
      options,
      ...normalizeParams(params)
    });
  }
  const ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodDiscriminatedUnion", (inst, def) => {
    ZodUnion.init(inst, def);
    $ZodDiscriminatedUnion.init(inst, def);
  });
  function discriminatedUnion(discriminator, options, params) {
    return new ZodDiscriminatedUnion({
      type: "union",
      options,
      discriminator,
      ...normalizeParams(params)
    });
  }
  const ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
    $ZodIntersection.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
  });
  function intersection(left, right) {
    return new ZodIntersection({
      type: "intersection",
      left,
      right
    });
  }
  const ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodRecord.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
    inst.keyType = def.keyType;
    inst.valueType = def.valueType;
  });
  function record(keyType, valueType, params) {
    if (!valueType || !valueType._zod) {
      return new ZodRecord({
        type: "record",
        keyType: string(),
        valueType: keyType,
        ...normalizeParams(valueType)
      });
    }
    return new ZodRecord({
      type: "record",
      keyType,
      valueType,
      ...normalizeParams(params)
    });
  }
  const ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
    $ZodEnum.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json);
    inst.enum = def.entries;
    inst.options = [...inst._zod.values];
    const keys = new Set(Object.keys(def.entries));
    inst.extract = (values, params) => {
      const newEntries = {};
      for (const value of values) {
        if (keys.has(value)) {
          newEntries[value] = def.entries[value];
        } else
          throw new Error(`Key ${value} not found in enum`);
      }
      return new ZodEnum({
        ...def,
        checks: [],
        ...normalizeParams(params),
        entries: newEntries
      });
    };
    inst.exclude = (values, params) => {
      const newEntries = { ...def.entries };
      for (const value of values) {
        if (keys.has(value)) {
          delete newEntries[value];
        } else
          throw new Error(`Key ${value} not found in enum`);
      }
      return new ZodEnum({
        ...def,
        checks: [],
        ...normalizeParams(params),
        entries: newEntries
      });
    };
  });
  function _enum(values, params) {
    const entries = Array.isArray(values) ? Object.fromEntries(values.map((v2) => [v2, v2])) : values;
    return new ZodEnum({
      type: "enum",
      entries,
      ...normalizeParams(params)
    });
  }
  const ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
    $ZodLiteral.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
    inst.values = new Set(def.values);
    Object.defineProperty(inst, "value", {
      get() {
        if (def.values.length > 1) {
          throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
        }
        return def.values[0];
      }
    });
  });
  function literal(value, params) {
    return new ZodLiteral({
      type: "literal",
      values: Array.isArray(value) ? value : [value],
      ...normalizeParams(params)
    });
  }
  const ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
    _ensureDefaultMemoizer();
    $ZodTransform.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
    inst._zod.parse = (payload, _ctx) => {
      if (_ctx.direction === "backward") {
        throw new $ZodEncodeError(inst.constructor.name);
      }
      payload.addIssue = (issue$1) => {
        if (typeof issue$1 === "string") {
          payload.issues.push(issue(issue$1, payload.value, def));
        } else {
          const _issue = issue$1;
          if (_issue.fatal)
            _issue.continue = false;
          _issue.code ?? (_issue.code = "custom");
          if (!("input" in _issue))
            _issue.input = payload.value;
          _issue.inst ?? (_issue.inst = inst);
          payload.issues.push(issue(_issue));
        }
      };
      const output = def.transform(payload.value, payload);
      if (output instanceof Promise) {
        return output.then((output2) => {
          payload.value = output2;
          return payload;
        });
      }
      payload.value = output;
      return payload;
    };
  });
  function transform(fn) {
    return new ZodTransform({
      type: "transform",
      transform: fn
    });
  }
  const ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
    $ZodOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function optional(innerType) {
    return new ZodOptional({
      type: "optional",
      innerType
    });
  }
  const ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
    $ZodExactOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function exactOptional(innerType) {
    return new ZodExactOptional({
      type: "optional",
      innerType
    });
  }
  const ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
    $ZodNullable.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function nullable(innerType) {
    return new ZodNullable({
      type: "nullable",
      innerType
    });
  }
  const ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
    $ZodDefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeDefault = inst.unwrap;
  });
  function _default(innerType, defaultValue) {
    return new ZodDefault({
      type: "default",
      innerType,
      get defaultValue() {
        return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
      }
    });
  }
  const ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
    $ZodPrefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function prefault(innerType, defaultValue) {
    return new ZodPrefault({
      type: "prefault",
      innerType,
      get defaultValue() {
        return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
      }
    });
  }
  const ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
    $ZodNonOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function nonoptional(innerType, params) {
    return new ZodNonOptional({
      type: "nonoptional",
      innerType,
      ...normalizeParams(params)
    });
  }
  const ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
    $ZodCatch.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeCatch = inst.unwrap;
  });
  function _catch(innerType, catchValue) {
    return new ZodCatch({
      type: "catch",
      innerType,
      catchValue: typeof catchValue === "function" ? catchValue : constantCatch(catchValue)
    });
  }
  const ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
    $ZodPipe.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
    inst.in = def.in;
    inst.out = def.out;
  });
  function pipe(in_, out) {
    return new ZodPipe({
      type: "pipe",
      in: in_,
      out
      // ...util.normalizeParams(params),
    });
  }
  const ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
    $ZodReadonly.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
  });
  function readonly(innerType) {
    return new ZodReadonly({
      type: "readonly",
      innerType
    });
  }
  const ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
    $ZodCustom.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
  });
  function refine(fn, _params = {}) {
    return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
  }
  function superRefine(fn, params) {
    return /* @__PURE__ */ _superRefine(fn, params);
  }
  const QuestionTypeEnum = _enum([
    "MCQ",
    "MULTI_SELECT",
    "TRUE_FALSE",
    "FILL_BLANK",
    "NUMERICAL",
    "CODING",
    "DEBUGGING",
    "OUTPUT_PREDICTION",
    "CODE_MCQ",
    "COMPLEXITY",
    "FILL_IN_CODE",
    "SQL",
    "CONCEPTUAL",
    "SHORT_ANSWER"
  ]);
  const CodingQuestionSubTypeEnum = _enum([
    "coding_problem",
    "debug_my_code",
    "predict_the_output",
    "code_mcq",
    "sql_query",
    "complexity_question",
    "fill_in_the_code"
  ]);
  const DifficultyEnum = _enum([
    "Introductory",
    "Intermediate",
    "Advanced"
  ]);
  const ConfidenceEnum = _enum([
    "HIGH",
    "MEDIUM",
    "LOW",
    "UNVERIFIED"
  ]);
  const VerificationStatusEnum = _enum([
    "SUPPORTED",
    "PARTIALLY_SUPPORTED",
    "INFERRED",
    "CONFLICTING",
    "UNVERIFIED"
  ]);
  const QuestionQualityStatusEnum = _enum([
    "clear",
    "ambiguous",
    "missing_info",
    "multiple_correct",
    "contradictory_options",
    "truncated"
  ]);
  const ExplanationLevelEnum = _enum([
    "Simple",
    "Technical",
    "Interview"
  ]);
  _enum([
    "python",
    "javascript",
    "c",
    "cpp",
    "java",
    "go",
    "rust",
    "sql"
  ]);
  const SampleTestCaseSchema = object({
    stdin: string().default(""),
    expectedOutput: string().default(""),
    explanation: string().optional().default("")
  });
  const ExtractedEditorStateSchema = object({
    adapter: _enum(["MonacoAdapter", "CodeMirror6Adapter", "CodeMirror5Adapter", "AceAdapter", "TextareaAdapter", "PreCodeAdapter", "none"]).default("none"),
    code: string().default(""),
    language: string().default(""),
    selectedText: string().default(""),
    cursorLine: number().int().nonnegative().nullable().default(null),
    consoleOutput: string().default("")
  });
  const ExtractedCodingProblemSchema = object({
    platform: _enum(["Generic", "HackerRank", "LeetCode", "GeeksforGeeks", "Moodle", "Canvas", "CustomPortal"]).default("Generic"),
    questionSubType: CodingQuestionSubTypeEnum.default("coding_problem"),
    title: string().default(""),
    statement: string().default(""),
    constraints: string().default(""),
    inputFormat: string().default(""),
    outputFormat: string().default(""),
    sampleTests: array(SampleTestCaseSchema).default([]),
    starterCode: string().default(""),
    language: string().default("python"),
    failingOutput: string().default(""),
    options: array(string()).default([]),
    editor: ExtractedEditorStateSchema.optional()
  });
  const AssessmentAnalyzeRequestSchema = object({
    question: string().optional(),
    text: string().optional(),
    options: array(union([string(), record(string(), any())])).optional().default([]),
    type: string().optional(),
    subject: string().optional(),
    context: string().max(1e4).optional().default(""),
    codeSnippet: string().optional(),
    tableData: string().optional(),
    mathFormula: string().optional(),
    maxSources: number().int().min(1).max(10).optional().default(5),
    mode: _enum(["Practice Mode", "Authorized Assessment Mode"]).optional().default("Practice Mode")
  });
  object({
    question: string().min(3).max(5e4),
    title: string().max(500).optional().default(""),
    questionSubType: CodingQuestionSubTypeEnum.optional(),
    language: string().max(40).optional().default("python"),
    starterCode: string().max(64e3).optional().default(""),
    userCode: string().max(64e3).optional().default(""),
    constraints: string().max(1e4).optional().default(""),
    inputFormat: string().max(5e3).optional().default(""),
    outputFormat: string().max(5e3).optional().default(""),
    sampleTests: array(SampleTestCaseSchema).max(20).optional().default([]),
    failingOutput: string().max(16e3).optional().default(""),
    options: array(string()).max(12).optional().default([]),
    sqlSchema: string().max(64e3).optional().default(""),
    dialect: _enum(["SQLite", "PostgreSQL", "MySQL"]).optional().default("SQLite"),
    explanationLevel: ExplanationLevelEnum.optional().default("Technical"),
    mode: _enum(["Practice Mode", "Authorized Assessment Mode"]).optional().default("Practice Mode")
  });
  object({
    question: string().min(3).max(5e4),
    language: string().max(40).optional().default("python"),
    userCode: string().min(1).max(64e3),
    failingOutput: string().max(16e3).optional().default(""),
    sampleTests: array(SampleTestCaseSchema).max(20).optional().default([]),
    explanationLevel: ExplanationLevelEnum.optional().default("Technical")
  });
  object({
    question: string().min(3).max(5e4),
    language: string().max(40).optional().default("python"),
    userCode: string().max(64e3).optional().default(""),
    level: number().int().min(1).max(4).optional().default(1),
    explanationLevel: ExplanationLevelEnum.optional().default("Technical")
  });
  object({
    question: string().min(3).max(5e4),
    code: string().min(1).max(64e3),
    language: string().max(40).optional().default("python"),
    explanationLevel: ExplanationLevelEnum.optional().default("Technical")
  });
  object({
    code: string().min(1).max(64e3),
    language: string().max(40).optional().default("python"),
    question: string().max(25e3).optional().default(""),
    measureEmpirical: boolean().optional().default(true)
  });
  object({
    userCode: string().min(1).max(64e3),
    language: string().max(40).optional().default("python"),
    sampleTests: array(SampleTestCaseSchema).max(20).optional().default([])
  });
  object({
    question: string().max(5e4).optional().default(""),
    code: string().min(1).max(64e3),
    language: string().max(40).optional().default("python")
  });
  object({
    question: string().max(5e4).optional().default(""),
    sourceCode: string().min(1).max(64e3),
    sourceLanguage: string().max(40).optional().default("python"),
    targetLanguage: string().min(1).max(40),
    sampleTests: array(SampleTestCaseSchema).max(20).optional().default([])
  });
  object({
    code: string().max(64e3).optional().default(""),
    language: string().max(40).optional().default("python"),
    errorOutput: string().min(1).max(32e3)
  });
  object({
    code: string().min(1).max(64e3),
    language: string().max(40).optional().default("")
  });
  const VisionExtractRequestSchema = object({
    imageDataUrl: string().min(16).max(6e6),
    mimeType: string().max(40).optional().default(""),
    hintContext: string().max(500).optional().default("")
  });
  object({
    question: string().min(3).max(25e3),
    options: array(any()).optional().default([])
  });
  object({
    queries: array(string()).min(1).max(8),
    maxResults: number().int().min(1).max(15).optional().default(6)
  });
  object({
    question: string().min(3),
    draftAnswer: string().min(1),
    sources: array(object({
      title: string(),
      url: string(),
      snippet: string().optional()
    })).default([])
  });
  object({
    question: string().min(3),
    questionType: QuestionTypeEnum,
    subject: string(),
    options: array(any()).optional().default([]),
    sources: array(any()).default([])
  });
  object({
    query: string().trim().min(3).max(500),
    maxResults: number().int().min(1).max(5).optional().default(5)
  }).strict();
  object({
    query: string().trim().min(3).max(500)
  }).strict();
  object({
    expression: string().trim().min(1).max(1e3),
    operation: _enum(["evaluate", "simplify", "differentiate", "integrate"]).optional().default("evaluate"),
    variable: string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/).optional().default("x")
  }).strict();
  object({
    language: _enum(["python", "javascript", "c", "cpp", "java"]),
    code: string().min(1).max(64e3),
    stdin: string().max(12e3).optional().default(""),
    timeoutSeconds: number().min(0.1).max(3).optional().default(2)
  }).strict();
  object({
    schema: string().max(64e3).optional().default(""),
    query: string().trim().min(1).max(64e3)
  }).strict();
  const SourceItemSchema = object({
    type: _enum(["web", "course_notes"]),
    title: string().optional(),
    url: string().optional(),
    domain: string().optional(),
    file: string().optional(),
    page: number().nullable().optional(),
    section: string().nullable().optional(),
    authorityTier: _enum(["HIGH", "MEDIUM", "LOW", "UNASSESSED"]).optional(),
    relevanceTier: _enum(["HIGH", "MEDIUM", "LOW", "UNASSESSED"]).optional(),
    snippet: string().optional()
  });
  const DirectAnswerSchema = union([
    string(),
    object({
      option: string().optional(),
      text: string().optional()
    })
  ]);
  const OptionAnalysisItemSchema = object({
    option: string().optional(),
    text: string().optional(),
    correct: boolean().optional(),
    isCorrect: boolean().optional(),
    reason: string().optional(),
    analysis: string().optional()
  });
  object({
    directAnswer: union([string(), object({ option: string().optional(), text: string().optional() })]),
    explanation: string().min(1).max(12e3),
    reasoningSteps: array(string().max(2e3)).max(12).optional().default([]),
    confidence: ConfidenceEnum.optional().default("UNVERIFIED"),
    confidenceReason: string().max(2e3).optional().default("Agent result requires verification."),
    optionAnalysis: array(OptionAnalysisItemSchema).max(10).optional().default([])
  }).strict();
  object({
    question: string(),
    questionType: QuestionTypeEnum,
    subject: string(),
    topic: string(),
    difficulty: DifficultyEnum,
    questionQuality: object({
      status: QuestionQualityStatusEnum,
      reason: string(),
      missing: string()
    }).optional(),
    directAnswer: DirectAnswerSchema,
    questionRestated: string().optional(),
    ownSolution: string().optional(),
    evidenceAgreesWithSolution: boolean().optional(),
    evidenceUsed: array(any()).optional(),
    confidence: ConfidenceEnum,
    confidenceReason: string(),
    explanation: string(),
    reasoningSteps: array(string()),
    optionAnalysis: array(OptionAnalysisItemSchema),
    toolEvidence: array(object({
      tool: string(),
      executed: boolean(),
      success: boolean().optional(),
      output: string(),
      language: string().optional(),
      dialect: string().optional(),
      expression: string().optional()
    })).optional(),
    verification: object({
      status: VerificationStatusEnum,
      supported: array(string()),
      conflicting: array(string()),
      unsupported: array(string())
    }),
    sources: array(SourceItemSchema),
    retrievalTimestamp: string()
  });
  const ExtractedQuestionPayloadSchema = object({
    question: string().default(""),
    options: array(string()).default([]),
    codeSnippet: string().optional().default(""),
    tableData: string().optional().default(""),
    mathFormula: string().optional().default(""),
    source: string().optional().default("Generic"),
    success: boolean().optional().default(true)
  });
  const ExtensionMessageSchema = discriminatedUnion("type", [
    object({
      type: literal("RESEARCH_SELECTION"),
      text: string().optional().default("")
    }),
    object({
      type: literal("TRIGGER_EXAM_ASSIST")
    }),
    object({
      type: literal("ASK"),
      question: string().min(1)
    }),
    object({
      type: literal("EXTRACT_CODING_PROBLEM")
    }),
    object({
      type: literal("CAPTURE_VISIBLE_TAB")
    }),
    object({
      type: literal("OPEN_SIDE_PANEL"),
      payload: ExtractedQuestionPayloadSchema.optional()
    })
  ]);
  const LegacyActionMessageSchema = object({
    action: _enum(["EXTRACT_CODING_PROBLEM", "OPEN_SIDE_PANEL"]),
    payload: any().optional()
  });
  const RuntimeMessageEnvelopeSchema = union([
    ExtensionMessageSchema,
    LegacyActionMessageSchema
  ]);
  object({
    event: _enum(["progress", "stage", "partial", "done", "error"]),
    data: record(string(), any())
  });
  function normalizeLanguage(raw = "") {
    const s2 = String(raw || "").toLowerCase().trim();
    if (!s2) return "";
    if (s2.includes("python") || s2 === "py" || s2 === "python3") return "python";
    if (s2.includes("javascript") || s2 === "js" || s2.includes("node") || s2.includes("typescript") || s2 === "ts") return "javascript";
    if (s2.includes("c++") || s2 === "cpp" || s2.includes("gcc") || s2.includes("g++")) return "cpp";
    if (s2 === "c" || s2.includes("ansi c")) return "c";
    if (s2.includes("java")) return "java";
    if (s2.includes("sql") || s2.includes("mysql") || s2.includes("postgres") || s2.includes("sqlite")) return "sql";
    if (s2.includes("go") || s2.includes("golang")) return "go";
    if (s2.includes("rust") || s2 === "rs") return "rust";
    return s2;
  }
  function detectLanguageFromPage(doc = document) {
    var _a2;
    const selectors = [
      "[data-cy='lang-select']",
      ".language-selector",
      "select[name*='lang' i]",
      "select[id*='lang' i]",
      "[aria-label*='Language' i]",
      ".select-language",
      ".hr-monaco-language-select"
    ];
    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const val = "value" in el && el.value || ((_a2 = el.getAttribute) == null ? void 0 : _a2.call(el, "data-lang")) || el.textContent || "";
        const norm = normalizeLanguage(val);
        if (norm) return norm;
      }
    }
    return "";
  }
  function extractConsoleOutputFromPage(doc = document) {
    const selectors = [
      ".console-output",
      ".testcase-output",
      ".compile-error",
      ".hr-test-case-output",
      "[data-e2e-locator='console-result']",
      ".gdb-console",
      ".error-output",
      ".submission-result",
      ".output-block"
    ];
    const outputs = [];
    for (const sel of selectors) {
      const els = doc.querySelectorAll(sel);
      Array.from(els).forEach((el) => {
        const htmlEl = el;
        const text = (htmlEl.innerText || htmlEl.textContent || "").trim();
        if (text && !outputs.includes(text)) outputs.push(text);
      });
    }
    return outputs.join("\n---\n").slice(0, 12e3);
  }
  class MonacoAdapter {
    constructor() {
      __publicField(this, "name", "MonacoAdapter");
    }
    canHandle(doc = document) {
      return Boolean(doc.querySelector(".monaco-editor, [data-mode-id]"));
    }
    extract(doc = document) {
      var _a2, _b, _c;
      const editorEl = doc.querySelector(".monaco-editor, [data-mode-id]");
      if (!editorEl) return null;
      const modeAttr = ((_a2 = editorEl.getAttribute) == null ? void 0 : _a2.call(editorEl, "data-mode-id")) || ((_c = (_b = editorEl.closest) == null ? void 0 : _b.call(editorEl, "[data-mode-id]")) == null ? void 0 : _c.getAttribute("data-mode-id")) || "";
      const lineEls = editorEl.querySelectorAll(".view-lines .view-line, .view-line");
      let code = "";
      if (lineEls.length > 0) {
        code = Array.from(lineEls).map((line) => (line.innerText || line.textContent || "").replace(/\u00a0/g, " ")).join("\n");
      } else {
        code = (editorEl.innerText || editorEl.textContent || "").replace(/\u00a0/g, " ").trim();
      }
      const activeLineEl = editorEl.querySelector(".current-line, .active-line-number");
      const cursorLine = activeLineEl ? parseInt(activeLineEl.textContent || "1", 10) || 1 : null;
      return ExtractedEditorStateSchema.parse({
        adapter: this.name,
        code: code.trim(),
        language: normalizeLanguage(modeAttr) || detectLanguageFromPage(doc) || "python",
        selectedText: "",
        cursorLine,
        consoleOutput: extractConsoleOutputFromPage(doc)
      });
    }
  }
  class CodeMirror6Adapter {
    constructor() {
      __publicField(this, "name", "CodeMirror6Adapter");
    }
    canHandle(doc = document) {
      return Boolean(doc.querySelector(".cm-editor .cm-content, .cm-content[contenteditable]"));
    }
    extract(doc = document) {
      var _a2, _b, _c;
      const contentEl = doc.querySelector(".cm-editor .cm-content, .cm-content[contenteditable]");
      if (!contentEl) return null;
      const lineEls = contentEl.querySelectorAll(".cm-line");
      let code = "";
      if (lineEls.length > 0) {
        code = Array.from(lineEls).map((l2) => l2.innerText || l2.textContent || "").join("\n");
      } else {
        code = (contentEl.innerText || contentEl.textContent || "").trim();
      }
      const langAttr = ((_a2 = contentEl.getAttribute) == null ? void 0 : _a2.call(contentEl, "data-language")) || ((_c = (_b = contentEl.closest) == null ? void 0 : _b.call(contentEl, ".cm-editor")) == null ? void 0 : _c.getAttribute("data-language")) || "";
      return ExtractedEditorStateSchema.parse({
        adapter: this.name,
        code: code.trim(),
        language: normalizeLanguage(langAttr) || detectLanguageFromPage(doc) || "python",
        selectedText: "",
        cursorLine: null,
        consoleOutput: extractConsoleOutputFromPage(doc)
      });
    }
  }
  class CodeMirror5Adapter {
    constructor() {
      __publicField(this, "name", "CodeMirror5Adapter");
    }
    canHandle(doc = document) {
      return Boolean(doc.querySelector(".CodeMirror"));
    }
    extract(doc = document) {
      var _a2;
      const cmEl = doc.querySelector(".CodeMirror");
      if (!cmEl) return null;
      const lineEls = cmEl.querySelectorAll(".CodeMirror-line");
      let code = "";
      if (lineEls.length > 0) {
        code = Array.from(lineEls).map((l2) => (l2.innerText || l2.textContent || "").replace(/\u200b/g, "")).join("\n");
      } else {
        code = (cmEl.innerText || cmEl.textContent || "").trim();
      }
      const langAttr = ((_a2 = cmEl.getAttribute) == null ? void 0 : _a2.call(cmEl, "data-mode")) || "";
      return ExtractedEditorStateSchema.parse({
        adapter: this.name,
        code: code.trim(),
        language: normalizeLanguage(langAttr) || detectLanguageFromPage(doc) || "python",
        selectedText: "",
        cursorLine: null,
        consoleOutput: extractConsoleOutputFromPage(doc)
      });
    }
  }
  class AceAdapter {
    constructor() {
      __publicField(this, "name", "AceAdapter");
    }
    canHandle(doc = document) {
      return Boolean(doc.querySelector(".ace_editor"));
    }
    extract(doc = document) {
      var _a2, _b;
      const aceEl = doc.querySelector(".ace_editor");
      if (!aceEl) return null;
      const lineEls = aceEl.querySelectorAll(".ace_line");
      let code = "";
      if (lineEls.length > 0) {
        code = Array.from(lineEls).map((l2) => l2.innerText || l2.textContent || "").join("\n");
      } else {
        code = (aceEl.innerText || aceEl.textContent || "").trim();
      }
      const langAttr = ((_a2 = aceEl.getAttribute) == null ? void 0 : _a2.call(aceEl, "data-mode")) || ((_b = aceEl.getAttribute) == null ? void 0 : _b.call(aceEl, "data-language")) || "";
      return ExtractedEditorStateSchema.parse({
        adapter: this.name,
        code: code.trim(),
        language: normalizeLanguage(langAttr) || detectLanguageFromPage(doc) || "python",
        selectedText: "",
        cursorLine: null,
        consoleOutput: extractConsoleOutputFromPage(doc)
      });
    }
  }
  class TextareaAdapter {
    constructor() {
      __publicField(this, "name", "TextareaAdapter");
    }
    canHandle(doc = document) {
      return Boolean(
        doc.querySelector("textarea.code-editor, textarea[name*='code' i], textarea[id*='code' i], textarea[data-code-editor]")
      );
    }
    extract(doc = document) {
      var _a2, _b;
      const ta = doc.querySelector(
        "textarea.code-editor, textarea[name*='code' i], textarea[id*='code' i], textarea[data-code-editor]"
      );
      if (!ta) return null;
      const code = (ta.value !== void 0 ? ta.value : ta.textContent) || "";
      const langAttr = ((_a2 = ta.getAttribute) == null ? void 0 : _a2.call(ta, "data-language")) || ((_b = ta.getAttribute) == null ? void 0 : _b.call(ta, "data-lang")) || "";
      return ExtractedEditorStateSchema.parse({
        adapter: this.name,
        code: String(code).trim(),
        language: normalizeLanguage(langAttr) || detectLanguageFromPage(doc) || "python",
        selectedText: "",
        cursorLine: null,
        consoleOutput: extractConsoleOutputFromPage(doc)
      });
    }
  }
  class PreCodeAdapter {
    constructor() {
      __publicField(this, "name", "PreCodeAdapter");
    }
    canHandle(doc = document) {
      return Boolean(doc.querySelector("pre code, pre.code-block, .highlight pre"));
    }
    extract(doc = document) {
      var _a2;
      const el = doc.querySelector("pre code, pre.code-block, .highlight pre");
      if (!el) return null;
      const cls = el.className || ((_a2 = el.parentElement) == null ? void 0 : _a2.className) || "";
      const langMatch = cls.match(/language-([a-z0-9_+]+)/i) || cls.match(/lang-([a-z0-9_+]+)/i);
      const code = (el.innerText || el.textContent || "").trim();
      return ExtractedEditorStateSchema.parse({
        adapter: this.name,
        code,
        language: normalizeLanguage(langMatch ? langMatch[1] : "") || detectLanguageFromPage(doc) || "python",
        selectedText: "",
        cursorLine: null,
        consoleOutput: extractConsoleOutputFromPage(doc)
      });
    }
  }
  function extractEditorState(doc = document) {
    const adapters = [
      new MonacoAdapter(),
      new CodeMirror6Adapter(),
      new CodeMirror5Adapter(),
      new AceAdapter(),
      new TextareaAdapter(),
      new PreCodeAdapter()
    ];
    for (const adapter of adapters) {
      if (adapter.canHandle(doc)) {
        const res = adapter.extract(doc);
        if (res && res.code) return res;
      }
    }
    return ExtractedEditorStateSchema.parse({
      adapter: "none",
      code: "",
      language: detectLanguageFromPage(doc) || "python",
      selectedText: "",
      cursorLine: null,
      consoleOutput: extractConsoleOutputFromPage(doc)
    });
  }
  const EditorAdapters = {
    MonacoAdapter,
    CodeMirror6Adapter,
    CodeMirror5Adapter,
    AceAdapter,
    TextareaAdapter,
    PreCodeAdapter,
    extractEditorState,
    normalizeLanguage,
    detectLanguageFromPage,
    extractConsoleOutputFromPage
  };
  if (typeof window !== "undefined") {
    const w2 = window;
    w2.ExamAssist = w2.ExamAssist || {};
    w2.ExamAssist.EditorAdapters = EditorAdapters;
  }
  function detectCodingSubType({
    statement = "",
    code = "",
    failingOutput = "",
    options = []
  }) {
    const lower = `${statement}
${code}`.toLowerCase();
    if (/\b(select\s+.*from|create\s+table|group\s+by|inner\s+join|left\s+join|sql\s+query)\b/i.test(lower)) {
      return "sql_query";
    }
    if (failingOutput || /\b(debug|find the bug|fix the bug|fix the error|why does this fail|runtime error|compile error)\b/i.test(lower)) {
      return "debug_my_code";
    }
    if (/\b(what is the output|predict the output|what does the following .* print|trace the output)\b/i.test(lower)) {
      return "predict_the_output";
    }
    if (/\b(time complexity|space complexity|big-o|asymptotic complexity|order of growth)\b/i.test(lower)) {
      return "complexity_question";
    }
    if (/\b(fill in the blank|complete the missing line|__+|\/\*+\s*todo\s*\*+\/|#\s*todo)\b/i.test(lower)) {
      return "fill_in_the_code";
    }
    if (options.length >= 2) {
      return "code_mcq";
    }
    return "coding_problem";
  }
  function parseSampleTestsFromText(text = "") {
    const samples = [];
    const raw = String(text || "");
    const regex = /(?:sample\s+input|input|example\s*\d*\s*:?\s*input)\s*[:\n]\s*([\s\S]*?)\s*(?:sample\s+output|output|expected\s+output)\s*[:\n]\s*([^\n\r]+(?:\n(?!\s*(?:explanation|example|input|constraints|note)\b)[^\n\r]+)*)/gi;
    for (const match of raw.matchAll(regex)) {
      const stdin = (match[1] || "").trim();
      const expectedOutput = (match[2] || "").trim();
      if (stdin || expectedOutput) {
        samples.push({ stdin, expectedOutput, explanation: "" });
      }
    }
    return samples.slice(0, 8);
  }
  function extractSectionsFromText(text = "") {
    const raw = String(text || "");
    const constraintsMatch = raw.match(
      /constraints\s*[:\n]([\s\S]*?)(?:\n\s*(?:sample|example|input format|output format|note)|$)/i
    );
    const inputMatch = raw.match(
      /input\s+format\s*[:\n]([\s\S]*?)(?:\n\s*(?:output format|constraints|sample|example)|$)/i
    );
    const outputMatch = raw.match(
      /output\s+format\s*[:\n]([\s\S]*?)(?:\n\s*(?:constraints|sample|example)|$)/i
    );
    return {
      constraints: constraintsMatch ? constraintsMatch[1].trim() : "",
      inputFormat: inputMatch ? inputMatch[1].trim() : "",
      outputFormat: outputMatch ? outputMatch[1].trim() : ""
    };
  }
  class HackerRankAdapter {
    constructor() {
      __publicField(this, "name", "HackerRankAdapter");
      __publicField(this, "platform", "HackerRank");
    }
    canHandle(doc = document) {
      return Boolean(
        doc.querySelector(".hr-challenge-body, .challenge-body-html, .problem-statement, [data-analytics='ChallengeView']")
      );
    }
    extract(doc = document) {
      var _a2, _b;
      const title = (((_a2 = doc.querySelector(".challenge-view h1, .hr-challenge-title, .page-label")) == null ? void 0 : _a2.textContent) || "").trim();
      const bodyEl = doc.querySelector(".challenge-body-html, .hr-challenge-body, .problem-statement");
      const statement = ((bodyEl == null ? void 0 : bodyEl.innerText) || (bodyEl == null ? void 0 : bodyEl.textContent) || "").trim();
      const constraintsEl = doc.querySelector(".challenge_constraints, .constraints");
      const inputFormatEl = doc.querySelector(".challenge_input_format, .input-format");
      const outputFormatEl = doc.querySelector(".challenge_output_format, .output-format");
      const parsedSections = extractSectionsFromText(statement);
      const sampleInputs = Array.from(doc.querySelectorAll(".challenge_sample_input pre, .sample-input pre")).map(
        (el) => (el.innerText || el.textContent || "").trim()
      );
      const sampleOutputs = Array.from(doc.querySelectorAll(".challenge_sample_output pre, .sample-output pre")).map(
        (el) => (el.innerText || el.textContent || "").trim()
      );
      const sampleTests = [];
      for (let i2 = 0; i2 < Math.max(sampleInputs.length, sampleOutputs.length); i2++) {
        sampleTests.push({
          stdin: sampleInputs[i2] || "",
          expectedOutput: sampleOutputs[i2] || "",
          explanation: ""
        });
      }
      if (sampleTests.length === 0) {
        sampleTests.push(...parseSampleTestsFromText(statement));
      }
      const editor = extractEditorState(doc);
      const failingOutput = editor.consoleOutput || (((_b = doc.querySelector(".testcase-error, .compile-error")) == null ? void 0 : _b.textContent) || "").trim();
      return ExtractedCodingProblemSchema.parse({
        platform: this.platform,
        questionSubType: detectCodingSubType({ statement, code: editor.code, failingOutput }),
        title,
        statement,
        constraints: ((constraintsEl == null ? void 0 : constraintsEl.innerText) || (constraintsEl == null ? void 0 : constraintsEl.textContent) || parsedSections.constraints || "").trim(),
        inputFormat: ((inputFormatEl == null ? void 0 : inputFormatEl.innerText) || (inputFormatEl == null ? void 0 : inputFormatEl.textContent) || parsedSections.inputFormat || "").trim(),
        outputFormat: ((outputFormatEl == null ? void 0 : outputFormatEl.innerText) || (outputFormatEl == null ? void 0 : outputFormatEl.textContent) || parsedSections.outputFormat || "").trim(),
        sampleTests,
        starterCode: editor.code,
        language: editor.language || "python",
        failingOutput,
        options: [],
        editor
      });
    }
  }
  class LeetCodeAdapter {
    constructor() {
      __publicField(this, "name", "LeetCodeAdapter");
      __publicField(this, "platform", "LeetCode");
    }
    canHandle(doc = document) {
      return Boolean(
        doc.querySelector("[data-track-load='description_content'], .elfjS, [data-cy='question-title'], .question-content__JfgR")
      );
    }
    extract(doc = document) {
      var _a2, _b;
      const title = (((_a2 = doc.querySelector("[data-cy='question-title'], .text-title-large, .question-title")) == null ? void 0 : _a2.textContent) || "").trim();
      const descEl = doc.querySelector(
        "[data-track-load='description_content'], .elfjS, .question-content__JfgR"
      );
      const statement = ((descEl == null ? void 0 : descEl.innerText) || (descEl == null ? void 0 : descEl.textContent) || "").trim();
      const parsedSections = extractSectionsFromText(statement);
      const sampleTests = parseSampleTestsFromText(statement);
      const editor = extractEditorState(doc);
      const failingOutput = editor.consoleOutput || (((_b = doc.querySelector("[data-e2e-locator='console-result']")) == null ? void 0 : _b.textContent) || "").trim();
      return ExtractedCodingProblemSchema.parse({
        platform: this.platform,
        questionSubType: detectCodingSubType({ statement, code: editor.code, failingOutput }),
        title,
        statement,
        constraints: parsedSections.constraints,
        inputFormat: parsedSections.inputFormat,
        outputFormat: parsedSections.outputFormat,
        sampleTests,
        starterCode: editor.code,
        language: editor.language || "python",
        failingOutput,
        options: [],
        editor
      });
    }
  }
  class GeeksforGeeksAdapter {
    constructor() {
      __publicField(this, "name", "GeeksforGeeksAdapter");
      __publicField(this, "platform", "GeeksforGeeks");
    }
    canHandle(doc = document) {
      return Boolean(doc.querySelector(".problems_problem_content__Xm_eO, .problem-statement-gfg, #problem-statement"));
    }
    extract(doc = document) {
      var _a2;
      const title = (((_a2 = doc.querySelector(".problems_header_content__title__L2cB2, .problem-title, h3.gfg-title")) == null ? void 0 : _a2.textContent) || "").trim();
      const bodyEl = doc.querySelector(
        ".problems_problem_content__Xm_eO, .problem-statement-gfg, #problem-statement"
      );
      const statement = ((bodyEl == null ? void 0 : bodyEl.innerText) || (bodyEl == null ? void 0 : bodyEl.textContent) || "").trim();
      const parsedSections = extractSectionsFromText(statement);
      const sampleTests = parseSampleTestsFromText(statement);
      const editor = extractEditorState(doc);
      return ExtractedCodingProblemSchema.parse({
        platform: this.platform,
        questionSubType: detectCodingSubType({ statement, code: editor.code, failingOutput: editor.consoleOutput }),
        title,
        statement,
        constraints: parsedSections.constraints,
        inputFormat: parsedSections.inputFormat,
        outputFormat: parsedSections.outputFormat,
        sampleTests,
        starterCode: editor.code,
        language: editor.language || "python",
        failingOutput: editor.consoleOutput,
        options: [],
        editor
      });
    }
  }
  class GenericCodingAdapter {
    constructor() {
      __publicField(this, "name", "GenericCodingAdapter");
      __publicField(this, "platform", "Generic");
    }
    canHandle(_doc = document) {
      return true;
    }
    extract(doc = document) {
      var _a2;
      const title = (((_a2 = doc.querySelector("h1, h2, .problem-title, .question-title")) == null ? void 0 : _a2.textContent) || "").trim();
      const container = doc.querySelector(
        ".problem-description, .coding-question, .que.coderunner, .question_holder, main, article, body"
      );
      const statement = ((container == null ? void 0 : container.innerText) || (container == null ? void 0 : container.textContent) || "").trim();
      const parsedSections = extractSectionsFromText(statement);
      const sampleTests = parseSampleTestsFromText(statement);
      const editor = extractEditorState(doc);
      return ExtractedCodingProblemSchema.parse({
        platform: this.platform,
        questionSubType: detectCodingSubType({ statement, code: editor.code, failingOutput: editor.consoleOutput }),
        title,
        statement,
        constraints: parsedSections.constraints,
        inputFormat: parsedSections.inputFormat,
        outputFormat: parsedSections.outputFormat,
        sampleTests,
        starterCode: editor.code,
        language: editor.language || "python",
        failingOutput: editor.consoleOutput,
        options: [],
        editor
      });
    }
  }
  function extractCodingProblem(doc = document) {
    const specificAdapters = [new HackerRankAdapter(), new LeetCodeAdapter(), new GeeksforGeeksAdapter()];
    for (const adapter of specificAdapters) {
      if (adapter.canHandle(doc)) {
        return adapter.extract(doc);
      }
    }
    return new GenericCodingAdapter().extract(doc);
  }
  function observeCodingProblemChanges(doc = document, onChange, debounceMs = 350) {
    if (typeof MutationObserver === "undefined" || !(doc == null ? void 0 : doc.body)) return () => {
    };
    let timer = null;
    let lastSignature = "";
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const extracted = extractCodingProblem(doc);
        const sig = `${extracted.platform}|${extracted.title}|${extracted.statement.slice(0, 160)}|${extracted.language}`;
        if (sig !== lastSignature) {
          lastSignature = sig;
          onChange(extracted);
        }
      }, debounceMs);
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }
  const ProblemAdapters = {
    HackerRankAdapter,
    LeetCodeAdapter,
    GeeksforGeeksAdapter,
    GenericCodingAdapter,
    detectCodingSubType,
    parseSampleTestsFromText,
    extractSectionsFromText,
    extractCodingProblem,
    observeCodingProblemChanges
  };
  if (typeof window !== "undefined") {
    const w2 = window;
    w2.ExamAssist = w2.ExamAssist || {};
    w2.ExamAssist.ProblemAdapters = ProblemAdapters;
  }
  function getElText(el) {
    if (!el) return "";
    const htmlEl = el;
    return (htmlEl.innerText || htmlEl.textContent || "").trim();
  }
  class BaseExtractor {
    constructor(name = "BaseExtractor") {
      __publicField(this, "name");
      this.name = name;
    }
    extractMath(container) {
      if (!container) return "";
      const formulas = [];
      const katexEls = container.querySelectorAll('.katex-mathml annotation, [data-latex], script[type="math/tex"]');
      Array.from(katexEls).forEach((el) => {
        var _a2;
        const tex = el.getAttribute("data-latex") || ((_a2 = el.textContent) == null ? void 0 : _a2.trim());
        if (tex && !formulas.includes(tex)) formulas.push(tex);
      });
      const mathEls = container.querySelectorAll("math");
      Array.from(mathEls).forEach((el) => {
        var _a2;
        const alt = el.getAttribute("alttext") || ((_a2 = el.textContent) == null ? void 0 : _a2.trim());
        if (alt && !formulas.includes(alt)) formulas.push(alt);
      });
      return formulas.join("; ");
    }
    extractCode(container) {
      if (!container) return "";
      const codeBlocks = [];
      const preEls = container.querySelectorAll("pre, code, .highlight, .code-block, .ace_editor");
      Array.from(preEls).forEach((el) => {
        const text = getElText(el);
        if (text && text.length > 15 && !codeBlocks.includes(text)) {
          codeBlocks.push(text);
        }
      });
      return codeBlocks.join("\n\n---\n\n");
    }
    extractTables(container) {
      if (!container) return "";
      const tables = container.querySelectorAll("table");
      if (tables.length === 0) return "";
      const tableTexts = [];
      Array.from(tables).forEach((table) => {
        const rows = [];
        Array.from(table.querySelectorAll("tr")).forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll("th, td")).map((td) => getElText(td));
          if (cells.length > 0) rows.push(cells.join(" | "));
        });
        if (rows.length > 0) tableTexts.push(rows.join("\n"));
      });
      return tableTexts.join("\n\n");
    }
    extractOptionsFromContainer(container) {
      if (!container) return [];
      const options = [];
      const seen = /* @__PURE__ */ new Set();
      const inputEls = container.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      Array.from(inputEls).forEach((input) => {
        let labelText = "";
        const parentLabel = input.closest("label");
        if (parentLabel) labelText = getElText(parentLabel);
        const inputId = input.id;
        if (!labelText && inputId) {
          const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(inputId) : inputId;
          const forLabel = container.querySelector(`label[for="${escapedId}"]`);
          if (forLabel) labelText = getElText(forLabel);
        }
        if (!labelText && input.nextElementSibling) {
          labelText = getElText(input.nextElementSibling);
        }
        if (labelText && !seen.has(labelText) && labelText.length < 300) {
          seen.add(labelText);
          options.push(labelText);
        }
      });
      if (options.length === 0) {
        const choiceEls = container.querySelectorAll(".choice, .option, .answer, .quiz-option, .form-check");
        Array.from(choiceEls).forEach((el) => {
          const text = getElText(el);
          if (text && !seen.has(text) && text.length < 300) {
            seen.add(text);
            options.push(text);
          }
        });
      }
      const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
      return options.map((opt, i2) => {
        if (/^[A-H1-8][\).\s]/i.test(opt)) return opt;
        return `${letters[i2] || i2 + 1}) ${opt}`;
      });
    }
  }
  class GenericExtractor extends BaseExtractor {
    constructor() {
      super("GenericExtractor");
    }
    canHandle(_element) {
      return true;
    }
    extract(selectedText = "", anchorElement = null) {
      var _a2;
      const raw = String(selectedText || "").trim();
      let question = raw;
      let options = [];
      const textOptions = [...raw.matchAll(/(?:^|\n|\s+)(?:\(?([A-Ha-h1-8])[\).:\-]\s+)([^\n\r]+)/g)];
      if (textOptions.length >= 2) {
        options = textOptions.map((m2) => `${m2[1].toUpperCase()}) ${m2[2].trim()}`);
        const firstOptIndex = raw.search(/(?:^|\n|\s+)(?:\(?([A-Ha-h1-8])[\).:\-]\s+)/);
        if (firstOptIndex > 5) {
          question = raw.slice(0, firstOptIndex).trim();
        }
      }
      let mathFormula = "";
      let codeSnippet = "";
      let tableData = "";
      if (anchorElement) {
        const container = anchorElement.closest(
          [
            ".question",
            ".quiz_question",
            ".form-group",
            "fieldset",
            "form",
            '[role="radiogroup"]',
            '[role="group"]',
            ".card",
            ".assessment-question",
            ".multiple-choice-question",
            ".question-container",
            ".quiz-card",
            "article",
            "li"
          ].join(", ")
        ) || ((_a2 = anchorElement.parentElement) == null ? void 0 : _a2.parentElement);
        if (container) {
          mathFormula = this.extractMath(container);
          codeSnippet = this.extractCode(container);
          tableData = this.extractTables(container);
          if (options.length === 0) {
            options = this.extractOptionsFromContainer(container);
          }
        }
      }
      return {
        success: Boolean(question && question.length >= 3),
        question,
        options,
        mathFormula,
        codeSnippet,
        tableData,
        sourceAdapter: this.name
      };
    }
  }
  class MoodleAdapter extends BaseExtractor {
    constructor() {
      super("MoodleAdapter");
    }
    canHandle(element, doc = document) {
      var _a2, _b, _c;
      if (!element && !doc) return false;
      return Boolean(
        ((_a2 = element == null ? void 0 : element.closest) == null ? void 0 : _a2.call(element, ".que")) || ((_b = doc == null ? void 0 : doc.querySelector) == null ? void 0 : _b.call(doc, ".path-mod-quiz")) || ((_c = doc == null ? void 0 : doc.querySelector) == null ? void 0 : _c.call(doc, ".que.multichoice, .que.numerical, .que.shortanswer"))
      );
    }
    extract(selectedText = "", anchorElement = null, doc = document) {
      var _a2, _b;
      const queContainer = ((_a2 = anchorElement == null ? void 0 : anchorElement.closest) == null ? void 0 : _a2.call(anchorElement, ".que")) || ((_b = doc == null ? void 0 : doc.querySelector) == null ? void 0 : _b.call(doc, ".que"));
      if (!queContainer) return null;
      const qTextEl = queContainer.querySelector(".qtext, .formulation .qtext");
      const question = qTextEl ? getElText(qTextEl) : selectedText || "";
      const options = [];
      const answerContainer = queContainer.querySelector(".answer");
      if (answerContainer) {
        const optionRows = answerContainer.querySelectorAll(".r0, .r1, div, p");
        Array.from(optionRows).forEach((row) => {
          const text = getElText(row);
          if (text && text.length < 250 && !options.includes(text)) {
            options.push(text);
          }
        });
      }
      const mathFormula = this.extractMath(queContainer);
      const codeSnippet = this.extractCode(queContainer);
      const tableData = this.extractTables(queContainer);
      return {
        success: Boolean(question && question.length >= 3),
        question,
        options: options.length > 0 ? options : this.extractOptionsFromContainer(queContainer),
        mathFormula,
        codeSnippet,
        tableData,
        sourceAdapter: this.name
      };
    }
  }
  class CanvasAdapter extends BaseExtractor {
    constructor() {
      super("CanvasAdapter");
    }
    canHandle(element, doc = document) {
      var _a2, _b;
      if (!element && !doc) return false;
      return Boolean(
        ((_a2 = element == null ? void 0 : element.closest) == null ? void 0 : _a2.call(element, ".question_holder, .display_question, #questions.quiz_sortable")) || ((_b = doc == null ? void 0 : doc.querySelector) == null ? void 0 : _b.call(doc, ".canvas-quiz, #quiz-instructions, .question_holder"))
      );
    }
    extract(selectedText = "", anchorElement = null, doc = document) {
      var _a2, _b;
      const qHolder = ((_a2 = anchorElement == null ? void 0 : anchorElement.closest) == null ? void 0 : _a2.call(anchorElement, ".question_holder, .display_question, .question")) || ((_b = doc == null ? void 0 : doc.querySelector) == null ? void 0 : _b.call(doc, ".question_holder"));
      if (!qHolder) return null;
      const qTextEl = qHolder.querySelector(".question_text, .original_question_text");
      const question = qTextEl ? getElText(qTextEl) : selectedText || "";
      const options = [];
      const answerEls = qHolder.querySelectorAll(".answers .answer, .answers .answer_label, .answers .select_answer");
      Array.from(answerEls).forEach((el) => {
        const text = getElText(el);
        if (text && text.length < 250 && !options.includes(text)) {
          options.push(text);
        }
      });
      const mathFormula = this.extractMath(qHolder);
      const codeSnippet = this.extractCode(qHolder);
      const tableData = this.extractTables(qHolder);
      return {
        success: Boolean(question && question.length >= 3),
        question,
        options: options.length > 0 ? options : this.extractOptionsFromContainer(qHolder),
        mathFormula,
        codeSnippet,
        tableData,
        sourceAdapter: this.name
      };
    }
  }
  class CustomPortalAdapter extends BaseExtractor {
    constructor() {
      super("CustomPortalAdapter");
    }
    canHandle(element) {
      var _a2;
      if (!element) return false;
      return Boolean(
        (_a2 = element.closest) == null ? void 0 : _a2.call(element, '.takeQuestionDiv, [role="listitem"], .freebirdFormviewerViewNumberedItem, .assessment-item, .quiz-card')
      );
    }
    extract(selectedText = "", anchorElement = null) {
      var _a2;
      const container = (_a2 = anchorElement == null ? void 0 : anchorElement.closest) == null ? void 0 : _a2.call(
        anchorElement,
        [
          ".takeQuestionDiv",
          '[role="listitem"]',
          ".freebirdFormviewerViewNumberedItem",
          ".assessment-item",
          ".quiz-card"
        ].join(", ")
      );
      if (!container) return null;
      const gTitleEl = container.querySelector('[role="heading"], .freebirdFormviewerComponentsQuestionBaseTitle, .title');
      const question = gTitleEl ? getElText(gTitleEl) : selectedText || "";
      const options = this.extractOptionsFromContainer(container);
      const mathFormula = this.extractMath(container);
      const codeSnippet = this.extractCode(container);
      const tableData = this.extractTables(container);
      return {
        success: Boolean(question && question.length >= 3),
        question,
        options,
        mathFormula,
        codeSnippet,
        tableData,
        sourceAdapter: this.name
      };
    }
  }
  class ExtractionManager {
    constructor() {
      __publicField(this, "generic");
      __publicField(this, "adapters");
      this.generic = new GenericExtractor();
      this.adapters = [new MoodleAdapter(), new CanvasAdapter(), new CustomPortalAdapter()];
    }
    extractFromSelection(selection) {
      var _a2, _b;
      if (!selection) return null;
      const selectedText = ((_a2 = selection.toString()) == null ? void 0 : _a2.trim()) || "";
      if (selectedText.length < 3) return null;
      let anchorElement = null;
      if (selection.anchorNode) {
        anchorElement = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
      }
      const genericResult = this.generic.extract(selectedText, anchorElement);
      if (genericResult && genericResult.options && genericResult.options.length >= 2) {
        return genericResult;
      }
      for (const adapter of this.adapters) {
        if (adapter.canHandle(anchorElement)) {
          const platformResult = adapter.extract(selectedText, anchorElement);
          if (platformResult && platformResult.success) {
            if ((genericResult == null ? void 0 : genericResult.question) && genericResult.question.length > (((_b = platformResult.question) == null ? void 0 : _b.length) || 0)) {
              platformResult.question = genericResult.question;
            }
            return platformResult;
          }
        }
      }
      return genericResult;
    }
    extract(element = null, doc = document) {
      for (const adapter of this.adapters) {
        if (adapter.canHandle(element, doc)) {
          const res = adapter.extract("", element, doc);
          if (res && res.success) return res;
        }
      }
      const text = getElText(element || doc.body);
      return this.generic.extract(text, element || doc.body);
    }
  }
  function parseQuestionAndOptions(raw) {
    if (!raw || typeof raw !== "string") {
      return { question: "", options: [] };
    }
    const text = raw.trim();
    const lines = text.split(/\r?\n/).map((l2) => l2.trim()).filter(Boolean);
    const optionRegex = /^(?:\(?([A-Ha-h0-9])[\.\)\:\-\]]|\[([A-Ha-h0-9])\])\s+(.+)$/;
    const rawMatches = [];
    const questionLines = [];
    let foundFirstOption = false;
    for (let i2 = 0; i2 < lines.length; i2++) {
      const line = lines[i2];
      const match = line.match(optionRegex);
      if (match) {
        const key = (match[1] || match[2] || "").toUpperCase();
        const isDigit = /^\d+$/.test(key);
        const hasQuestionMark = line.includes("?");
        const laterHasLetters = lines.slice(i2 + 1).some((l2) => /^(?:\(?[A-Da-d][\.\)\:\-\]]|\[[A-Da-d]\])/.test(l2));
        if (isDigit && (hasQuestionMark || laterHasLetters)) {
          questionLines.push(line);
          continue;
        }
        foundFirstOption = true;
        const optText = match[3].trim();
        rawMatches.push({ letter: key, text: optText });
      } else if (!foundFirstOption) {
        questionLines.push(line);
      } else if (rawMatches.length > 0) {
        rawMatches[rawMatches.length - 1].text += " " + line;
      } else {
        questionLines.push(line);
      }
    }
    if (rawMatches.length >= 2) {
      const q2 = questionLines.join("\n").trim();
      return {
        question: q2.length >= 3 ? q2 : text,
        options: rawMatches.map((m2) => `${m2.letter}) ${m2.text}`)
      };
    }
    const markerRegex = /(?:^|\s+)(?:\(?([A-Ha-h1-8])[\.\)\:\-]|\[([A-Ha-h1-8])\])(?=\s+)/g;
    const matches = [...text.matchAll(markerRegex)];
    if (matches.length >= 2) {
      const keys = matches.map((m2) => (m2[1] || m2[2]).toUpperCase());
      const isAlphaSeq = keys[0] === "A" && keys[1] === "B";
      const isNumSeq = keys[0] === "1" && keys[1] === "2";
      const uniqueKeys = new Set(keys);
      if (isAlphaSeq || isNumSeq || uniqueKeys.size === keys.length) {
        const q2 = text.slice(0, matches[0].index).trim();
        const inlineOpts = [];
        for (let i2 = 0; i2 < matches.length; i2++) {
          const key = keys[i2];
          const start = (matches[i2].index || 0) + matches[i2][0].length;
          const end = i2 + 1 < matches.length ? matches[i2 + 1].index || text.length : text.length;
          const optBody = text.slice(start, end).trim();
          if (optBody) {
            inlineOpts.push(`${key}) ${optBody}`);
          }
        }
        if (inlineOpts.length >= 2) {
          return {
            question: q2.length >= 3 ? q2 : text,
            options: inlineOpts
          };
        }
      }
    }
    return {
      question: text,
      options: []
    };
  }
  if (typeof window !== "undefined") {
    const w2 = window;
    w2.ExamAssist = w2.ExamAssist || {};
    w2.ExamAssist.BaseExtractor = BaseExtractor;
    w2.ExamAssist.GenericExtractor = GenericExtractor;
    w2.ExamAssist.MoodleAdapter = MoodleAdapter;
    w2.ExamAssist.CanvasAdapter = CanvasAdapter;
    w2.ExamAssist.CustomPortalAdapter = CustomPortalAdapter;
    w2.ExamAssist.ExtractionManager = ExtractionManager;
  }
  function isExtensionContextAlive() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }
  async function getStorageConfig(defaults) {
    var _a2;
    if (!isExtensionContextAlive() || !((_a2 = chrome.storage) == null ? void 0 : _a2.local)) return { ...defaults };
    try {
      return await chrome.storage.local.get(defaults);
    } catch {
      return { ...defaults };
    }
  }
  async function setStorageConfig(items) {
    var _a2;
    if (!isExtensionContextAlive() || !((_a2 = chrome.storage) == null ? void 0 : _a2.local)) return;
    try {
      await chrome.storage.local.set(items);
    } catch {
    }
  }
  async function getApiBaseUrl() {
    const cfg = await getStorageConfig({ apiBase: "http://localhost:8787" });
    return String(cfg.apiBase || "http://localhost:8787").replace(/\/+$/, "");
  }
  function validateRuntimeMessage(raw) {
    const parsed = RuntimeMessageEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        valid: false,
        error: parsed.error.issues.map((i2) => `${i2.path.join(".")}: ${i2.message}`).join("; ")
      };
    }
    return { valid: true, message: parsed.data };
  }
  function validateExtensionMessage(raw) {
    return ExtensionMessageSchema.parse(raw);
  }
  const STAGE_LABELS = {
    classifying: "Classifying question & checking quality...",
    classified: "Classified question & checked quality...",
    searching: "Searching verified sources & course notes...",
    retrieving: "Retrieving verified evidence & course notes...",
    retrieved: "Retrieved supporting sources...",
    solving: "Deriving first-principles solution...",
    verifying: "Verifying claims & checking option integrity...",
    complete: "Analysis complete."
  };
  async function readAssessmentStreamResponse(response, onProgress) {
    var _a2, _b;
    const reader = (_a2 = response.body) == null ? void 0 : _a2.getReader();
    if (!reader) {
      throw new Error("Streaming response body is unavailable.");
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const rawEvent of events) {
        const lines = rawEvent.split(/\r?\n/);
        const eventType = (_b = lines.find((line) => line.startsWith("event:"))) == null ? void 0 : _b.slice(6).trim();
        const dataLine = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
        if (!dataLine) continue;
        const payload = JSON.parse(dataLine);
        if (eventType === "progress" && typeof payload.stage === "string") {
          onProgress == null ? void 0 : onProgress({
            stage: payload.stage,
            label: STAGE_LABELS[payload.stage] || payload.stage,
            data: payload
          });
        } else if (eventType && ["classifying", "classified", "searching", "retrieving", "retrieved", "solving", "verifying"].includes(eventType)) {
          onProgress == null ? void 0 : onProgress({
            stage: eventType,
            label: STAGE_LABELS[eventType] || eventType,
            data: payload
          });
        } else if (eventType === "partial") {
          onProgress == null ? void 0 : onProgress({
            stage: "partial",
            label: "Streaming intermediate reasoning...",
            data: payload
          });
        } else if (eventType === "error") {
          const err = new Error(
            String(payload.message || payload.error || "Streaming analysis failed.")
          );
          err.code = typeof payload.code === "string" ? payload.code : void 0;
          throw err;
        } else if (eventType === "done") {
          finalResult = payload.response && typeof payload.response === "object" ? payload.response : payload;
        }
      }
    }
    if (!finalResult) {
      throw new Error("Stream ended before a final result was received.");
    }
    return finalResult;
  }
  async function streamAssessmentAnalysis({
    request,
    apiBase,
    localUserId,
    signal,
    onProgress
  }) {
    const validated = AssessmentAnalyzeRequestSchema.parse(request);
    const res = await fetch(`${apiBase.replace(/\/+$/, "")}/api/assessment/analyze/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Local-User-Id": localUserId
      },
      signal,
      body: JSON.stringify(validated)
    });
    if (!res.ok) {
      let errPayload = {};
      try {
        errPayload = await res.json();
      } catch {
      }
      const err = new Error(
        String(errPayload.error || `Streaming request failed (${res.status})`)
      );
      err.code = typeof errPayload.code === "string" ? errPayload.code : void 0;
      throw err;
    }
    return readAssessmentStreamResponse(res, onProgress);
  }
  async function requestVisionExtraction(request, apiBase, signal) {
    const validated = VisionExtractRequestSchema.parse(request);
    const res = await fetch(`${apiBase.replace(/\/+$/, "")}/api/vision/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify(validated)
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(String(data.error || `HTTP ${res.status}`));
      err.code = typeof data.code === "string" ? data.code : void 0;
      throw err;
    }
    return data;
  }
  async function captureAndCropVisibleRegion(rect) {
    var _a2;
    const w2 = Math.max(16, Math.round(rect.width));
    const h2 = Math.max(16, Math.round(rect.height));
    let rawTabDataUrl = null;
    if (isExtensionContextAlive() && ((_a2 = chrome.runtime) == null ? void 0 : _a2.sendMessage)) {
      try {
        const msg = validateExtensionMessage({ type: "CAPTURE_VISIBLE_TAB" });
        const response = await chrome.runtime.sendMessage(msg);
        if ((response == null ? void 0 : response.ok) && typeof response.dataUrl === "string") {
          rawTabDataUrl = response.dataUrl;
        }
      } catch {
        rawTabDataUrl = null;
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = w2;
    canvas.height = h2;
    const ctx = canvas.getContext("2d");
    if (rawTabDataUrl && ctx) {
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const dpr = window.devicePixelRatio || 1;
          ctx.drawImage(
            img,
            Math.max(0, Math.round(rect.x * dpr)),
            Math.max(0, Math.round(rect.y * dpr)),
            Math.round(w2 * dpr),
            Math.round(h2 * dpr),
            0,
            0,
            w2,
            h2
          );
          resolve();
        };
        img.onerror = () => resolve();
        img.src = rawTabDataUrl;
      });
    } else if (ctx) {
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, w2, h2);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w2 - 2, h2 - 2);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "12px monospace";
      ctx.fillText(`Captured Region (${w2}x${h2})`, 10, 22);
    }
    return {
      croppedDataUrl: canvas.toDataURL("image/png"),
      width: w2,
      height: h2
    };
  }
  const DEFAULT_ALLOWED_SITES = [
    "localhost",
    "127.0.0.1",
    "hackerrank.com",
    "leetcode.com",
    "geeksforgeeks.org",
    "instructure.com"
  ];
  async function isSiteAllowed(hostname = window.location.hostname) {
    const cfg = await getStorageConfig({
      enableAllSites: false,
      allowedSites: DEFAULT_ALLOWED_SITES
    });
    if (cfg.enableAllSites) return true;
    const host = String(hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || !host) return true;
    return (cfg.allowedSites || []).some((site) => {
      const clean = String(site || "").toLowerCase().replace(/^\*\./, "");
      return host === clean || host.endsWith("." + clean);
    });
  }
  function registerUserTriggers(doc, extractionManager, callbacks) {
    const handleMouseUp = async (e2) => {
      if (!isExtensionContextAlive() && typeof window.__EXAMASSIST_E2E__ === "undefined") {
        return;
      }
      if (callbacks.isEventInsideOverlay(e2.target)) return;
      const allowed = await isSiteAllowed();
      if (!allowed) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        callbacks.onHideFloatingTrigger();
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 5) {
        callbacks.onHideFloatingTrigger();
        return;
      }
      const cfg = await getStorageConfig({ showFloatingButton: true });
      if (!cfg.showFloatingButton) return;
      const captured = extractionManager.extractFromSelection(sel) || {
        success: true,
        question: text,
        options: [],
        mathFormula: "",
        codeSnippet: "",
        tableData: "",
        sourceAdapter: "Selection"
      };
      if (!captured.options || captured.options.length === 0) {
        const parsed = parseQuestionAndOptions(text);
        if (parsed.options.length >= 2) {
          captured.question = parsed.question;
          captured.options = parsed.options;
        }
      }
      if (captured && captured.question) {
        callbacks.onShowFloatingTrigger(sel.getRangeAt(0), captured);
      }
    };
    const handleCopy = async () => {
      var _a2;
      if (!isExtensionContextAlive()) return;
      const allowed = await isSiteAllowed();
      if (!allowed) return;
      const sel = window.getSelection();
      const text = (_a2 = sel == null ? void 0 : sel.toString()) == null ? void 0 : _a2.trim();
      const cfg = await getStorageConfig({ autoAnswerOnCopy: false });
      if (cfg.autoAnswerOnCopy && text && text.length >= 5) {
        callbacks.onHideFloatingTrigger();
        const captured = extractionManager.extractFromSelection(sel) || {
          success: true,
          question: text,
          options: [],
          mathFormula: "",
          codeSnippet: "",
          tableData: "",
          sourceAdapter: "Copy"
        };
        if (captured && captured.question) {
          callbacks.onExecuteAnalyze(captured);
        }
      }
    };
    const handleKeyDown = async (e2) => {
      if ((e2.ctrlKey || e2.metaKey) && e2.shiftKey && (e2.key === "E" || e2.key === "e")) {
        e2.preventDefault();
        callbacks.onHideFloatingTrigger();
        const allowed = await isSiteAllowed();
        if (!allowed) return;
        const sel = window.getSelection();
        let captured = null;
        if (sel && sel.toString().trim().length >= 5) {
          captured = extractionManager.extractFromSelection(sel);
        } else {
          captured = extractionManager.extract(doc.activeElement, doc);
        }
        if (captured && captured.question) {
          callbacks.onExecuteAnalyze(captured);
        }
      }
    };
    doc.addEventListener("mouseup", handleMouseUp);
    doc.addEventListener("copy", handleCopy);
    doc.addEventListener("keydown", handleKeyDown);
    return () => {
      doc.removeEventListener("mouseup", handleMouseUp);
      doc.removeEventListener("copy", handleCopy);
      doc.removeEventListener("keydown", handleKeyDown);
    };
  }
  var n, l$1, u$2, i$1, r$1, o$1, e$1, f$2, c$1, a$1, s$1, h$1, p$1, v$1, d$1 = {}, w$1 = [], _ = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i, g = Array.isArray;
  function m$1(n2, l2) {
    for (var u2 in l2) n2[u2] = l2[u2];
    return n2;
  }
  function b(n2) {
    n2 && n2.parentNode && n2.parentNode.removeChild(n2);
  }
  function k$1(l2, u2, t2) {
    var i2, r2, o2, e2 = {};
    for (o2 in u2) "key" == o2 ? i2 = u2[o2] : "ref" == o2 ? r2 = u2[o2] : e2[o2] = u2[o2];
    if (arguments.length > 2 && (e2.children = arguments.length > 3 ? n.call(arguments, 2) : t2), "function" == typeof l2 && null != l2.defaultProps) for (o2 in l2.defaultProps) void 0 === e2[o2] && (e2[o2] = l2.defaultProps[o2]);
    return x(l2, e2, i2, r2, null);
  }
  function x(n2, t2, i2, r2, o2) {
    var e2 = { type: n2, props: t2, key: i2, ref: r2, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o2 ? ++u$2 : o2, __i: -1, __u: 0 };
    return null == o2 && null != l$1.vnode && l$1.vnode(e2), e2;
  }
  function S(n2) {
    return n2.children;
  }
  function C$1(n2, l2) {
    this.props = n2, this.context = l2;
  }
  function $(n2, l2) {
    if (null == l2) return n2.__ ? $(n2.__, n2.__i + 1) : null;
    for (var u2; l2 < n2.__k.length; l2++) if (null != (u2 = n2.__k[l2]) && null != u2.__e) return u2.__e;
    return "function" == typeof n2.type ? $(n2) : null;
  }
  function I(n2) {
    if (n2.__P && n2.__d) {
      var u2 = n2.__v, t2 = u2.__e, i2 = [], r2 = [], o2 = m$1({}, u2);
      o2.__v = u2.__v + 1, l$1.vnode && l$1.vnode(o2), q(n2.__P, o2, u2, n2.__n, n2.__P.namespaceURI, 32 & u2.__u ? [t2] : null, i2, null == t2 ? $(u2) : t2, !!(32 & u2.__u), r2), o2.__v = u2.__v, o2.__.__k[o2.__i] = o2, D$1(i2, o2, r2), u2.__e = u2.__ = null, o2.__e != t2 && P(o2);
    }
  }
  function P(n2) {
    if (null != (n2 = n2.__) && null != n2.__c) return n2.__e = n2.__c.base = null, n2.__k.some(function(l2) {
      if (null != l2 && null != l2.__e) return n2.__e = n2.__c.base = l2.__e;
    }), P(n2);
  }
  function A(n2) {
    (!n2.__d && (n2.__d = true) && i$1.push(n2) && !H.__r++ || r$1 != l$1.debounceRendering) && ((r$1 = l$1.debounceRendering) || o$1)(H);
  }
  function H() {
    try {
      for (var n2, l2 = 1; i$1.length; ) i$1.length > l2 && i$1.sort(e$1), n2 = i$1.shift(), l2 = i$1.length, I(n2);
    } finally {
      i$1.length = H.__r = 0;
    }
  }
  function L(n2, l2, u2, t2, i2, r2, o2, e2, f2, c2, a2) {
    var s2, h2, p2, v2, y2, _2, g2 = t2 && t2.__k || w$1, m2 = l2.length;
    for (f2 = T(u2, l2, g2, f2, m2), s2 = 0; s2 < m2; s2++) null != (p2 = u2.__k[s2]) && (h2 = -1 != p2.__i && g2[p2.__i] || d$1, p2.__i = s2, _2 = q(n2, p2, h2, i2, r2, o2, e2, f2, c2, a2), v2 = p2.__e, p2.ref && h2.ref != p2.ref && (h2.ref && J(h2.ref, null, p2), a2.push(p2.ref, p2.__c || v2, p2)), null == y2 && null != v2 && (y2 = v2), 4 & p2.__u ? (f2 = j$1(p2, f2, n2), h2.__e && (h2.__e = null)) : "function" == typeof p2.type && void 0 !== _2 ? f2 = _2 : v2 && (f2 = v2.nextSibling), p2.__u &= -7);
    return u2.__e = y2, f2;
  }
  function T(n2, l2, u2, t2, i2) {
    var r2, o2, e2, f2, c2, a2 = u2.length, s2 = a2, h2 = 0;
    for (n2.__k = new Array(i2), r2 = 0; r2 < i2; r2++) null != (o2 = l2[r2]) && "boolean" != typeof o2 && "function" != typeof o2 ? ("string" == typeof o2 || "number" == typeof o2 || "bigint" == typeof o2 || o2.constructor == String ? o2 = n2.__k[r2] = x(null, o2, null, null, null) : g(o2) ? o2 = n2.__k[r2] = x(S, { children: o2 }, null, null, null) : void 0 === o2.constructor && o2.__b > 0 ? o2 = n2.__k[r2] = x(o2.type, o2.props, o2.key, o2.ref ? o2.ref : null, o2.__v) : n2.__k[r2] = o2, f2 = r2 + h2, o2.__ = n2, o2.__b = n2.__b + 1, e2 = null, -1 != (c2 = o2.__i = O(o2, u2, f2, s2)) && (s2--, (e2 = u2[c2]) && (e2.__u |= 2)), null == e2 || null == e2.__v ? (-1 == c2 && (i2 > a2 ? h2-- : i2 < a2 && h2++), "function" != typeof o2.type && (o2.__u |= 4)) : c2 != f2 && (c2 == f2 - 1 ? h2-- : c2 == f2 + 1 ? h2++ : (c2 > f2 ? h2-- : h2++, o2.__u |= 4))) : n2.__k[r2] = null;
    if (s2) for (r2 = 0; r2 < a2; r2++) null != (e2 = u2[r2]) && 0 == (2 & e2.__u) && (e2.__e == t2 && (t2 = $(e2)), K(e2, e2));
    return t2;
  }
  function j$1(n2, l2, u2) {
    var t2, i2;
    if ("function" == typeof n2.type) {
      for (t2 = n2.__k, i2 = 0; t2 && i2 < t2.length; i2++) t2[i2] && (t2[i2].__ = n2, l2 = j$1(t2[i2], l2, u2));
      return l2;
    }
    n2.__e != l2 && (l2 && n2.type && !l2.parentNode && (l2 = $(n2)), l2 = u2.insertBefore(n2.__e, l2 || null));
    do {
      l2 = l2 && l2.nextSibling;
    } while (null != l2 && 8 == l2.nodeType);
    return l2;
  }
  function O(n2, l2, u2, t2) {
    var i2, r2, o2, e2 = n2.key, f2 = n2.type, c2 = l2[u2], a2 = null != c2 && 0 == (2 & c2.__u);
    if (null === c2 && null == e2 || a2 && e2 == c2.key && f2 == c2.type) return u2;
    if (t2 > (a2 ? 1 : 0)) {
      for (i2 = u2 - 1, r2 = u2 + 1; i2 >= 0 || r2 < l2.length; ) if (null != (c2 = l2[o2 = i2 >= 0 ? i2-- : r2++]) && 0 == (2 & c2.__u) && e2 == c2.key && f2 == c2.type) return o2;
    }
    return -1;
  }
  function z$1(n2, l2, u2) {
    "-" == l2[0] ? n2.setProperty(l2, null == u2 ? "" : u2) : n2[l2] = null == u2 ? "" : "number" != typeof u2 || _.test(l2) ? u2 : u2 + "px";
  }
  function N(n2, l2, u2, t2, i2) {
    var r2, o2;
    n: if ("style" == l2) if ("string" == typeof u2) n2.style.cssText = u2;
    else {
      if ("string" == typeof t2 && (n2.style.cssText = t2 = ""), t2) for (l2 in t2) u2 && l2 in u2 || z$1(n2.style, l2, "");
      if (u2) for (l2 in u2) t2 && u2[l2] == t2[l2] || z$1(n2.style, l2, u2[l2]);
    }
    else if ("o" == l2[0] && "n" == l2[1]) r2 = l2 != (l2 = l2.replace(s$1, "$1")), o2 = l2.toLowerCase(), l2 = o2 in n2 || "onFocusOut" == l2 || "onFocusIn" == l2 ? o2.slice(2) : l2.slice(2), n2.l || (n2.l = {}), n2.l[l2 + r2] = u2, u2 ? t2 ? u2[a$1] = t2[a$1] : (u2[a$1] = h$1, n2.addEventListener(l2, r2 ? v$1 : p$1, r2)) : n2.removeEventListener(l2, r2 ? v$1 : p$1, r2);
    else {
      if ("http://www.w3.org/2000/svg" == i2) l2 = l2.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
      else if ("width" != l2 && "height" != l2 && "href" != l2 && "list" != l2 && "form" != l2 && "tabIndex" != l2 && "download" != l2 && "rowSpan" != l2 && "colSpan" != l2 && "role" != l2 && "popover" != l2 && l2 in n2) try {
        n2[l2] = null == u2 ? "" : u2;
        break n;
      } catch (n3) {
      }
      "function" == typeof u2 || (null == u2 || false === u2 && "-" != l2[4] ? n2.removeAttribute(l2) : n2.setAttribute(l2, "popover" == l2 && 1 == u2 ? "" : u2));
    }
  }
  function V(n2) {
    return function(u2) {
      if (this.l) {
        var t2 = this.l[u2.type + n2];
        if (null == u2[c$1]) u2[c$1] = h$1++;
        else if (u2[c$1] < t2[a$1]) return;
        return t2(l$1.event ? l$1.event(u2) : u2);
      }
    };
  }
  function q(n2, u2, t2, i2, r2, o2, e2, f2, c2, a2) {
    var s2, h2, p2, v2, y2, d2, _2, k2, x2, M, I2, P2, A2, H2, T2, j2, F = u2.type;
    if (void 0 !== u2.constructor) return null;
    128 & t2.__u && (c2 = !!(32 & t2.__u), o2 = [f2 = u2.__e = t2.__e]), (s2 = l$1.__b) && s2(u2);
    n: if ("function" == typeof F) {
      h2 = e2.length;
      try {
        if (x2 = u2.props, M = F.prototype && F.prototype.render, I2 = (s2 = F.contextType) && i2[s2.__c], P2 = s2 ? I2 ? I2.props.value : s2.__ : i2, t2.__c ? k2 = (p2 = u2.__c = t2.__c).__ = p2.__E : (M ? u2.__c = p2 = new F(x2, P2) : (u2.__c = p2 = new C$1(x2, P2), p2.constructor = F, p2.render = Q), I2 && I2.sub(p2), p2.state || (p2.state = {}), p2.__n = i2, v2 = p2.__d = true, p2.__h = [], p2._sb = []), M && null == p2.__s && (p2.__s = p2.state), M && null != F.getDerivedStateFromProps && (p2.__s == p2.state && (p2.__s = m$1({}, p2.__s)), m$1(p2.__s, F.getDerivedStateFromProps(x2, p2.__s))), y2 = p2.props, d2 = p2.state, p2.__v = u2, v2) M && null == F.getDerivedStateFromProps && null != p2.componentWillMount && p2.componentWillMount(), M && null != p2.componentDidMount && p2.__h.push(p2.componentDidMount);
        else {
          if (M && null == F.getDerivedStateFromProps && x2 !== y2 && null != p2.componentWillReceiveProps && p2.componentWillReceiveProps(x2, P2), u2.__v == t2.__v || !p2.__e && null != p2.shouldComponentUpdate && false === p2.shouldComponentUpdate(x2, p2.__s, P2)) {
            u2.__v != t2.__v && (p2.props = x2, p2.state = p2.__s, p2.__d = false), u2.__e = t2.__e, u2.__k = t2.__k, u2.__k.some(function(n3) {
              n3 && (n3.__ = u2);
            }), w$1.push.apply(p2.__h, p2._sb), p2._sb = [], p2.__h.length && e2.push(p2), f2 = $(t2);
            break n;
          }
          null != p2.componentWillUpdate && p2.componentWillUpdate(x2, p2.__s, P2), M && null != p2.componentDidUpdate && p2.__h.push(function() {
            p2.componentDidUpdate(y2, d2, _2);
          });
        }
        if (p2.context = P2, p2.props = x2, p2.__P = n2, p2.__e = false, A2 = l$1.__r, H2 = 0, M) p2.state = p2.__s, p2.__d = false, A2 && A2(u2), s2 = p2.render(p2.props, p2.state, p2.context), w$1.push.apply(p2.__h, p2._sb), p2._sb = [];
        else do {
          p2.__d = false, A2 && A2(u2), s2 = p2.render(p2.props, p2.state, p2.context), p2.state = p2.__s;
        } while (p2.__d && ++H2 < 25);
        p2.state = p2.__s, null != p2.getChildContext && (i2 = m$1(m$1({}, i2), p2.getChildContext())), M && !v2 && null != p2.getSnapshotBeforeUpdate && (_2 = p2.getSnapshotBeforeUpdate(y2, d2)), T2 = null != s2 && s2.type === S && null == s2.key ? E(s2.props.children) : s2, f2 = L(n2, g(T2) ? T2 : [T2], u2, t2, i2, r2, o2, e2, f2, c2, a2), p2.base = u2.__e, u2.__u &= -161, p2.__h.length && e2.push(p2), k2 && (p2.__E = p2.__ = null);
      } catch (n3) {
        if (e2.length = h2, u2.__v = null, c2 || null != o2) {
          if (n3.then) {
            for (u2.__u |= c2 ? 160 : 128; f2 && 8 == f2.nodeType && f2.nextSibling; ) f2 = f2.nextSibling;
            null != o2 && (o2[o2.indexOf(f2)] = null), u2.__e = f2;
          } else if (null != o2) for (j2 = o2.length; j2--; ) b(o2[j2]);
        } else u2.__e = t2.__e;
        null == u2.__k && (u2.__k = t2.__k || []), n3.then || B$1(u2), l$1.__e(n3, u2, t2);
      }
    } else null == o2 && u2.__v == t2.__v ? (u2.__k = t2.__k, u2.__e = t2.__e) : f2 = u2.__e = G(t2.__e, u2, t2, i2, r2, o2, e2, c2, a2);
    return (s2 = l$1.diffed) && s2(u2), 128 & u2.__u ? void 0 : f2;
  }
  function B$1(n2) {
    n2 && (n2.__c && (n2.__c.__e = true), n2.__k && n2.__k.some(B$1));
  }
  function D$1(n2, u2, t2) {
    for (var i2 = 0; i2 < t2.length; i2++) J(t2[i2], t2[++i2], t2[++i2]);
    l$1.__c && l$1.__c(u2, n2), n2.some(function(u3) {
      try {
        n2 = u3.__h, u3.__h = [], n2.some(function(n3) {
          n3.call(u3);
        });
      } catch (n3) {
        l$1.__e(n3, u3.__v);
      }
    });
  }
  function E(n2) {
    return "object" != typeof n2 || null == n2 || n2.__b > 0 ? n2 : g(n2) ? n2.map(E) : void 0 !== n2.constructor ? null : m$1({}, n2);
  }
  function G(u2, t2, i2, r2, o2, e2, f2, c2, a2) {
    var s2, h2, p2, v2, y2, w2, _2, m2 = i2.props || d$1, k2 = t2.props, x2 = t2.type;
    if ("svg" == x2 ? o2 = "http://www.w3.org/2000/svg" : "math" == x2 ? o2 = "http://www.w3.org/1998/Math/MathML" : o2 || (o2 = "http://www.w3.org/1999/xhtml"), null != e2) {
      for (s2 = 0; s2 < e2.length; s2++) if ((y2 = e2[s2]) && "setAttribute" in y2 == !!x2 && (x2 ? y2.localName == x2 : 3 == y2.nodeType)) {
        u2 = y2, e2[s2] = null;
        break;
      }
    }
    if (null == u2) {
      if (null == x2) return document.createTextNode(k2);
      u2 = document.createElementNS(o2, x2, k2.is && k2), c2 && (l$1.__m && l$1.__m(t2, e2), c2 = false), e2 = null;
    }
    if (null == x2) m2 === k2 || c2 && u2.data == k2 || (u2.data = k2);
    else {
      if (e2 = "textarea" == x2 && null != k2.defaultValue ? null : e2 && n.call(u2.childNodes), !c2 && null != e2) for (m2 = {}, s2 = 0; s2 < u2.attributes.length; s2++) m2[(y2 = u2.attributes[s2]).name] = y2.value;
      for (s2 in m2) y2 = m2[s2], "dangerouslySetInnerHTML" == s2 ? p2 = y2 : "children" == s2 || s2 in k2 || "value" == s2 && "defaultValue" in k2 || "checked" == s2 && "defaultChecked" in k2 || N(u2, s2, null, y2, o2);
      for (s2 in k2) y2 = k2[s2], "children" == s2 ? v2 = y2 : "dangerouslySetInnerHTML" == s2 ? h2 = y2 : "value" == s2 ? w2 = y2 : "checked" == s2 ? _2 = y2 : c2 && "function" != typeof y2 || m2[s2] === y2 || N(u2, s2, y2, m2[s2], o2);
      if (h2) c2 || p2 && (h2.__html == p2.__html || h2.__html == u2.innerHTML) || (u2.innerHTML = h2.__html), t2.__k = [];
      else if (p2 && (u2.innerHTML = ""), L("template" == t2.type ? u2.content : u2, g(v2) ? v2 : [v2], t2, i2, r2, "foreignObject" == x2 ? "http://www.w3.org/1999/xhtml" : o2, e2, f2, e2 ? e2[0] : i2.__k && $(i2, 0), c2, a2), null != e2) for (s2 = e2.length; s2--; ) b(e2[s2]);
      c2 && "textarea" != x2 || (s2 = "value", "progress" == x2 && null == w2 ? u2.removeAttribute("value") : null != w2 && (w2 !== u2[s2] || "progress" == x2 && !w2 || "option" == x2 && w2 != m2[s2]) && N(u2, s2, w2, m2[s2], o2), s2 = "checked", null != _2 && _2 != u2[s2] && N(u2, s2, _2, m2[s2], o2));
    }
    return u2;
  }
  function J(n2, u2, t2) {
    try {
      if ("function" == typeof n2) {
        var i2 = "function" == typeof n2.__u;
        i2 && n2.__u(), i2 && null == u2 || (n2.__u = n2(u2));
      } else n2.current = u2;
    } catch (n3) {
      l$1.__e(n3, t2);
    }
  }
  function K(n2, u2, t2) {
    var i2, r2;
    if (l$1.unmount && l$1.unmount(n2), (i2 = n2.ref) && (i2.current && i2.current != n2.__e || J(i2, null, u2)), null != (i2 = n2.__c)) {
      if (i2.componentWillUnmount) try {
        i2.componentWillUnmount();
      } catch (n3) {
        l$1.__e(n3, u2);
      }
      i2.base = i2.__P = i2.__n = null;
    }
    if (i2 = n2.__k) for (r2 = 0; r2 < i2.length; r2++) i2[r2] && K(i2[r2], u2, t2 || "function" != typeof n2.type);
    t2 || b(n2.__e), n2.__c = n2.__ = n2.__e = void 0;
  }
  function Q(n2, l2, u2) {
    return this.constructor(n2, u2);
  }
  function R(u2, t2, i2) {
    var r2, o2, e2, f2;
    t2 == document && (t2 = document.documentElement), l$1.__ && l$1.__(u2, t2), o2 = (r2 = false) ? null : t2.__k, e2 = [], f2 = [], q(t2, u2 = t2.__k = k$1(S, null, [u2]), o2 || d$1, d$1, t2.namespaceURI, o2 ? null : t2.firstChild ? n.call(t2.childNodes) : null, e2, o2 ? o2.__e : t2.firstChild, r2, f2), D$1(e2, u2, f2), u2.props.children = null;
  }
  n = w$1.slice, l$1 = { __e: function(n2, l2, u2, t2) {
    for (var i2, r2, o2; l2 = l2.__; ) if ((i2 = l2.__c) && !i2.__) try {
      if ((r2 = i2.constructor) && null != r2.getDerivedStateFromError && (i2.setState(r2.getDerivedStateFromError(n2)), o2 = i2.__d), null != i2.componentDidCatch && (i2.componentDidCatch(n2, t2 || {}), o2 = i2.__d), o2) return i2.__E = i2;
    } catch (l3) {
      n2 = l3;
    }
    throw n2;
  } }, u$2 = 0, C$1.prototype.setState = function(n2, l2) {
    var u2;
    u2 = null != this.__s && this.__s != this.state ? this.__s : this.__s = m$1({}, this.state), "function" == typeof n2 && (n2 = n2(m$1({}, u2), this.props)), n2 && m$1(u2, n2), null != n2 && this.__v && (l2 && this._sb.push(l2), A(this));
  }, C$1.prototype.forceUpdate = function(n2) {
    this.__v && (this.__e = true, n2 && this.__h.push(n2), A(this));
  }, C$1.prototype.render = S, i$1 = [], o$1 = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e$1 = function(n2, l2) {
    return n2.__v.__b - l2.__v.__b;
  }, H.__r = 0, f$2 = Math.random().toString(8), c$1 = "__d" + f$2, a$1 = "__a" + f$2, s$1 = /(PointerCapture)$|Capture$/i, h$1 = 0, p$1 = V(false), v$1 = V(true);
  var f$1 = 0;
  function u$1(e2, t2, n2, o2, i2, u2) {
    t2 || (t2 = {});
    var a2, c2, p2 = t2;
    if ("ref" in p2) for (c2 in p2 = {}, t2) "ref" == c2 ? a2 = t2[c2] : p2[c2] = t2[c2];
    var l2 = { type: e2, props: p2, key: n2, ref: a2, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: --f$1, __i: -1, __u: 0, __source: i2, __self: u2 };
    if ("function" == typeof e2 && (a2 = e2.defaultProps)) for (c2 in a2) void 0 === p2[c2] && (p2[c2] = a2[c2]);
    return l$1.vnode && l$1.vnode(l2), l2;
  }
  var t, r, u, i, o = 0, f = [], c = l$1, e = c.__b, a = c.__r, v = c.diffed, l = c.__c, m = c.unmount, p = c.__;
  function s(n2, t2) {
    c.__h && c.__h(r, n2, o || t2), o = 0;
    var u2 = r.__H || (r.__H = { __: [], __h: [] });
    return n2 >= u2.__.length && u2.__.push({}), u2.__[n2];
  }
  function d(n2) {
    return o = 1, y(D, n2);
  }
  function y(n2, u2, i2) {
    var o2 = s(t++, 2);
    if (o2.t = n2, !o2.__c && (o2.__ = [D(void 0, u2), function(n3) {
      var t2 = o2.__N ? o2.__N[0] : o2.__[0], r2 = o2.t(t2, n3);
      t2 !== r2 && (o2.__N = [r2, o2.__[1]], o2.__c.setState({}));
    }], o2.__c = r, !r.__f)) {
      var f2 = function(n3, t2, r2) {
        if (!o2.__c.__H) return true;
        var u3 = false, i3 = o2.__c.props !== n3;
        if (o2.__c.__H.__.some(function(n4) {
          if (n4.__N) {
            u3 = true;
            var t3 = n4.__[0];
            n4.__ = n4.__N, n4.__N = void 0, t3 !== n4.__[0] && (i3 = true);
          }
        }), c2) {
          var f3 = c2.call(this, n3, t2, r2);
          return u3 ? f3 || i3 : f3;
        }
        return !u3 || i3;
      };
      r.__f = true;
      var c2 = r.shouldComponentUpdate, e2 = r.componentWillUpdate;
      r.componentWillUpdate = function(n3, t2, r2) {
        if (this.__e) {
          var u3 = c2;
          c2 = void 0, f2(n3, t2, r2), c2 = u3;
        }
        e2 && e2.call(this, n3, t2, r2);
      }, r.shouldComponentUpdate = f2;
    }
    return o2.__N || o2.__;
  }
  function h(n2, u2) {
    var i2 = s(t++, 3);
    !c.__s && C(i2.__H, u2) && (i2.__ = n2, i2.u = u2, r.__H.__h.push(i2));
  }
  function j() {
    for (var n2; n2 = f.shift(); ) {
      var t2 = n2.__H;
      if (n2.__P && t2) try {
        t2.__h.some(z), t2.__h.some(B), t2.__h = [];
      } catch (r2) {
        t2.__h = [], c.__e(r2, n2.__v);
      }
    }
  }
  c.__b = function(n2) {
    r = null, e && e(n2);
  }, c.__ = function(n2, t2) {
    n2 && t2.__k && t2.__k.__m && (n2.__m = t2.__k.__m), p && p(n2, t2);
  }, c.__r = function(n2) {
    a && a(n2), t = 0;
    var i2 = (r = n2.__c).__H;
    i2 && (u === r ? (i2.__h = [], r.__h = [], i2.__.some(function(n3) {
      n3.__N && (n3.__ = n3.__N), n3.u = n3.__N = void 0;
    })) : (i2.__h.some(z), i2.__h.some(B), i2.__h = [], t = 0)), u = r;
  }, c.diffed = function(n2) {
    v && v(n2);
    var t2 = n2.__c;
    t2 && t2.__H && (t2.__H.__h.length && (1 !== f.push(t2) && i === c.requestAnimationFrame || ((i = c.requestAnimationFrame) || w)(j)), t2.__H.__.some(function(n3) {
      n3.u && (n3.__H = n3.u, n3.u = void 0);
    })), u = r = null;
  }, c.__c = function(n2, t2) {
    t2.some(function(n3) {
      try {
        n3.__h.some(z), n3.__h = n3.__h.filter(function(n4) {
          return !n4.__ || B(n4);
        });
      } catch (r2) {
        t2.some(function(n4) {
          n4.__h && (n4.__h = []);
        }), t2 = [], c.__e(r2, n3.__v);
      }
    }), l && l(n2, t2);
  }, c.unmount = function(n2) {
    m && m(n2);
    var t2, r2 = n2.__c;
    r2 && r2.__H && (r2.__H.__.some(function(n3) {
      try {
        z(n3);
      } catch (n4) {
        t2 = n4;
      }
    }), r2.__H = void 0, t2 && c.__e(t2, r2.__v));
  };
  var k = "function" == typeof requestAnimationFrame;
  function w(n2) {
    var t2, r2 = function() {
      clearTimeout(u2), k && cancelAnimationFrame(t2), setTimeout(n2);
    }, u2 = setTimeout(r2, 35);
    k && (t2 = requestAnimationFrame(r2));
  }
  function z(n2) {
    var t2 = r, u2 = n2.__c;
    "function" == typeof u2 && (n2.__c = void 0, u2()), r = t2;
  }
  function B(n2) {
    var t2 = r;
    n2.__c = n2.__(), r = t2;
  }
  function C(n2, t2) {
    return !n2 || n2.length !== t2.length || t2.some(function(t3, r2) {
      return t3 !== n2[r2];
    });
  }
  function D(n2, t2) {
    return "function" == typeof t2 ? t2(n2) : t2;
  }
  const SHADOW_DOM_STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f8fafc;
  }
  *, *::before, *::after {
    box-sizing: border-box;
  }
  .examai-floating-trigger {
    position: absolute;
    z-index: 2147483646;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: 1px solid #38bdf8;
    box-shadow: 0 8px 24px rgba(2, 132, 199, 0.45);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    user-select: none;
  }
  .examai-floating-trigger:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
  }
  .examai-panel {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 410px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 40px);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    background: #0f172a;
    color: #f8fafc;
    border: 1px solid #1e293b;
    border-radius: 12px;
    box-shadow: 0 20px 45px rgba(2, 6, 23, 0.75);
    overflow: hidden;
    font-size: 13px;
    line-height: 1.5;
  }
  .examai-panel.light {
    background: #ffffff;
    color: #0f172a;
    border-color: #cbd5e1;
  }
  .examai-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
  }
  .examai-panel.light .examai-head {
    background: #f1f5f9;
    border-bottom-color: #cbd5e1;
  }
  .examai-brand {
    font-weight: 800;
    font-size: 14px;
    color: #38bdf8;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .examai-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .examai-body {
    padding: 12px 14px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .examai-btn {
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #f8fafc;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .examai-btn.primary {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }
  .examai-btn.danger {
    background: #7f1d1d;
    border-color: #ef4444;
    color: #fecaca;
  }
  .examai-select, .examai-textarea {
    width: 100%;
    border-radius: 6px;
    border: 1px solid #334155;
    background: #0b1120;
    color: #f8fafc;
    padding: 6px 8px;
    font-size: 12px;
    font-family: inherit;
  }
  .examai-textarea {
    min-height: 58px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .examai-card {
    background: #111827;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 10px;
  }
  .examai-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }
  .examai-badge.HIGH { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid #10b981; }
  .examai-badge.MEDIUM { background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid #0284c7; }
  .examai-badge.LOW, .examai-badge.UNVERIFIED { background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid #f59e0b; }
  .examai-error {
    background: #451a1a;
    border: 1px solid #ef4444;
    color: #fecaca;
    border-radius: 8px;
    padding: 10px;
    font-size: 12px;
  }
  .examai-notice {
    background: rgba(245, 158, 11, 0.14);
    border: 1px solid #f59e0b;
    color: #fde68a;
    border-radius: 8px;
    padding: 9px;
    font-size: 11.5px;
  }
  .examai-hint-row {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  pre.examai-pre {
    background: #050814;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 8px;
    overflow-x: auto;
    white-space: pre-wrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    margin-top: 6px;
  }
`;
  const SHADOW_HOST_ID = "examai-shadow-host";
  const PANEL_ID = "examai-panel";
  const FLOAT_BTN_ID = "examai-floating-btn";
  let currentProps = {
    initialTrigger: { visible: false, top: 0, left: 0, captured: null },
    initialPanelOpen: false,
    initialCaptured: null,
    autoRunToken: 0
  };
  function formatDirectAnswer(directAnswer, fullResult) {
    if (directAnswer) {
      if (typeof directAnswer === "string" && directAnswer.trim()) return directAnswer.trim();
      if (typeof directAnswer === "object") {
        const obj = directAnswer;
        const formatted = `${obj.option ? obj.option + ". " : ""}${obj.text || ""}`.trim();
        if (formatted) return formatted;
      }
    }
    const fallbackText = String((fullResult == null ? void 0 : fullResult.directAnswerText) || (fullResult == null ? void 0 : fullResult.ownSolution) || "").trim();
    return fallbackText;
  }
  function InPageOverlayApp(props) {
    var _a2, _b, _c;
    const [trigger, setTrigger] = d(props.initialTrigger);
    const [panelOpen, setPanelOpen] = d(props.initialPanelOpen);
    const [theme, setTheme] = d("dark");
    const [mode, setMode] = d("Practice Mode");
    const [authorizedRevealed, setAuthorizedRevealed] = d(false);
    const [questionText, setQuestionText] = d(((_a2 = props.initialCaptured) == null ? void 0 : _a2.question) || "");
    const [optionsText, setOptionsText] = d((((_b = props.initialCaptured) == null ? void 0 : _b.options) || []).join("\n"));
    const [codeSnippet, setCodeSnippet] = d(((_c = props.initialCaptured) == null ? void 0 : _c.codeSnippet) || "");
    const [, setLanguage] = d("python");
    const [streaming, setStreaming] = d(false);
    const [streamStage, setStreamStage] = d("");
    const [abortCtrl, setAbortCtrl] = d(null);
    const [result, setResult] = d(null);
    const [errorState, setErrorState] = d(null);
    const [copyStatus, setCopyStatus] = d("📋 Copy Answer");
    const [selectingRegion, setSelectingRegion] = d(false);
    const [dragStart, setDragStart] = d(null);
    const [dragCurrent, setDragCurrent] = d(null);
    const [visionPreview, setVisionPreview] = d(null);
    const [visionLoading, setVisionLoading] = d(false);
    const [visionMeta, setVisionMeta] = d(null);
    h(() => {
      getStorageConfig({ theme: "dark", mode: "Practice Mode" }).then((cfg) => {
        if (cfg.theme === "light" || cfg.theme === "dark") setTheme(cfg.theme);
        if (cfg.mode === "Practice Mode" || cfg.mode === "Authorized Assessment Mode") setMode(cfg.mode);
      });
    }, []);
    h(() => {
      setTrigger(props.initialTrigger);
    }, [props.initialTrigger]);
    h(() => {
      setPanelOpen(props.initialPanelOpen);
    }, [props.initialPanelOpen]);
    h(() => {
      if (props.initialCaptured) {
        const cap = props.initialCaptured;
        setQuestionText(cap.question || "");
        setOptionsText((cap.options || []).join("\n"));
        setCodeSnippet(cap.codeSnippet || "");
        if (props.autoRunToken > 0) {
          void runAnalyze(cap.question, cap.options || [], cap.codeSnippet || "");
        }
      }
    }, [props.autoRunToken, props.initialCaptured]);
    async function runAnalyze(qOverride, optsOverride, codeOverride) {
      const rawInput = (qOverride !== void 0 ? qOverride : questionText).trim();
      const parsedInline = parseQuestionAndOptions(rawInput);
      const manualOpts = optsOverride !== void 0 ? optsOverride : optionsText.split(/\r?\n/).map((l2) => l2.trim()).filter(Boolean);
      const opts = manualOpts.length > 0 ? manualOpts : parsedInline.options;
      const q2 = (manualOpts.length > 0 ? rawInput : parsedInline.question || rawInput).trim();
      const code = codeOverride !== void 0 ? codeOverride : codeSnippet;
      if (q2.length < 3) {
        setErrorState({ code: "EMPTY_QUESTION", message: "Please enter or select a question with at least 3 characters." });
        return;
      }
      abortCtrl == null ? void 0 : abortCtrl.abort();
      const controller = new AbortController();
      setAbortCtrl(controller);
      setStreaming(true);
      setStreamStage("Generating answer...");
      setErrorState(null);
      setResult(null);
      setAuthorizedRevealed(false);
      try {
        const apiBase = await getApiBaseUrl();
        const identity = await getStorageConfig({ localUserId: "" });
        let userId = identity.localUserId;
        if (!userId) {
          userId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`;
          await setStorageConfig({ localUserId: userId });
        }
        const data = await streamAssessmentAnalysis({
          request: {
            question: q2,
            options: opts,
            codeSnippet: code,
            tableData: "",
            mathFormula: "",
            context: "",
            maxSources: 5,
            mode
          },
          apiBase,
          localUserId: userId,
          signal: controller.signal,
          onProgress: (p2) => {
            setStreamStage(p2.label);
          }
        });
        setResult(data);
      } catch (err) {
        const e2 = err;
        if (e2.name === "AbortError") {
          setErrorState({ code: "CANCELLED", message: "Analysis cancelled by user. No answer was generated." });
        } else {
          setErrorState({ code: e2.code || "ERROR", message: e2.message || "Request failed." });
        }
      } finally {
        setStreaming(false);
        setAbortCtrl(null);
      }
    }
    function handleCancelStream() {
      abortCtrl == null ? void 0 : abortCtrl.abort();
    }
    function handleExtractPageCoding() {
      const extracted = extractCodingProblem(document);
      const manager = new ExtractionManager();
      const pageExtracted = manager.extract(document.activeElement, document);
      const nextQ = extracted.statement || (pageExtracted == null ? void 0 : pageExtracted.question) || "";
      const nextOpts = (pageExtracted == null ? void 0 : pageExtracted.options) || [];
      const nextCode = extracted.starterCode || (pageExtracted == null ? void 0 : pageExtracted.codeSnippet) || "";
      if (nextQ) setQuestionText(nextQ);
      if (nextOpts.length > 0) setOptionsText(nextOpts.join("\n"));
      if (nextCode) setCodeSnippet(nextCode);
      if (extracted.language) setLanguage(extracted.language);
      if (nextQ.trim().length >= 3) {
        void runAnalyze(nextQ, nextOpts, nextCode);
      }
    }
    async function extractAndSolveImage(imageDataUrl, mimeType) {
      setVisionLoading(true);
      setErrorState(null);
      setStreaming(true);
      setStreamStage("Extracting question from uploaded image...");
      try {
        const apiBase = await getApiBaseUrl();
        const res = await requestVisionExtraction(
          {
            imageDataUrl,
            mimeType: mimeType || "image/png",
            hintContext: document.title || ""
          },
          apiBase
        );
        setVisionMeta(res);
        setVisionPreview(null);
        const q2 = (res.extractedQuestion || res.extractedCode || "").trim();
        const opts = res.extractedOptions || [];
        const code = res.extractedCode || "";
        if (q2) setQuestionText(q2);
        if (opts.length) setOptionsText(opts.join("\n"));
        if (code) setCodeSnippet(code);
        if (res.detectedLanguage) setLanguage(res.detectedLanguage);
        if (q2.length >= 3) {
          await runAnalyze(q2, opts, code);
        } else {
          setStreaming(false);
          setErrorState({
            code: "VISION_EMPTY",
            message: "Could not detect a readable question in the image. Please try a clearer image or paste the question."
          });
        }
      } catch (err) {
        setStreaming(false);
        const e2 = err;
        setErrorState({ code: e2.code || "VISION_ERROR", message: e2.message || "Vision extraction failed." });
      } finally {
        setVisionLoading(false);
      }
    }
    function handleUploadQuestionFile(e2) {
      var _a3;
      const input = e2.target;
      const file = (_a3 = input.files) == null ? void 0 : _a3[0];
      if (!file) return;
      input.value = "";
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          if (dataUrl) {
            void extractAndSolveImage(dataUrl, file.type || "image/png");
          }
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result || "").trim();
          if (text) {
            const parsed = parseQuestionAndOptions(text);
            const q2 = parsed.question || text;
            const opts = parsed.options || [];
            setQuestionText(q2);
            if (opts.length > 0) setOptionsText(opts.join("\n"));
            void runAnalyze(q2, opts, codeSnippet);
          }
        };
        reader.readAsText(file);
      }
    }
    function handleStartRegionSelect() {
      setErrorState(null);
      setVisionPreview(null);
      setVisionMeta(null);
      setDragStart(null);
      setDragCurrent(null);
      setSelectingRegion(true);
    }
    async function handleFinishRegionSelect(start, end) {
      setSelectingRegion(false);
      setDragStart(null);
      setDragCurrent(null);
      const x2 = Math.min(start.x, end.x);
      const y2 = Math.min(start.y, end.y);
      const width = Math.max(24, Math.abs(end.x - start.x));
      const height = Math.max(24, Math.abs(end.y - start.y));
      const cropped = await captureAndCropVisibleRegion({ x: x2, y: y2, width, height });
      setVisionPreview(cropped);
      void extractAndSolveImage(cropped.croppedDataUrl, "image/png");
    }
    async function handleSendVisionPreview() {
      if (!visionPreview) return;
      await extractAndSolveImage(visionPreview.croppedDataUrl, "image/png");
    }
    const answerStr = result ? formatDirectAnswer(result.directAnswer, result) : "";
    const confidence = String((result == null ? void 0 : result.confidence) || "UNVERIFIED");
    return /* @__PURE__ */ u$1("div", { children: [
      selectingRegion && /* @__PURE__ */ u$1(
        "div",
        {
          id: "examai-region-selector",
          style: {
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            background: "rgba(15, 23, 42, 0.35)",
            cursor: "crosshair",
            userSelect: "none"
          },
          onMouseDown: (e2) => {
            e2.preventDefault();
            e2.stopPropagation();
            const pt = { x: e2.clientX, y: e2.clientY };
            setDragStart(pt);
            setDragCurrent(pt);
          },
          onMouseMove: (e2) => {
            if (!dragStart) return;
            e2.preventDefault();
            setDragCurrent({ x: e2.clientX, y: e2.clientY });
          },
          onMouseUp: (e2) => {
            e2.preventDefault();
            e2.stopPropagation();
            const start = dragStart || { x: Math.max(0, e2.clientX - 160), y: Math.max(0, e2.clientY - 90) };
            const end = { x: e2.clientX, y: e2.clientY };
            void handleFinishRegionSelect(start, end);
          },
          children: [
            /* @__PURE__ */ u$1(
              "div",
              {
                style: {
                  position: "fixed",
                  top: "14px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#0f172a",
                  color: "#e2e8f0",
                  border: "1px solid #38bdf8",
                  borderRadius: "8px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center"
                },
                children: [
                  /* @__PURE__ */ u$1("span", { children: "Drag a rectangle over the diagram, equation, table, or code to capture locally" }),
                  /* @__PURE__ */ u$1(
                    "button",
                    {
                      id: "examai-cancel-region-select",
                      className: "examai-btn danger",
                      onMouseDown: (e2) => e2.stopPropagation(),
                      onClick: (e2) => {
                        e2.stopPropagation();
                        setSelectingRegion(false);
                        setDragStart(null);
                        setDragCurrent(null);
                      },
                      children: "Cancel"
                    }
                  )
                ]
              }
            ),
            dragStart && dragCurrent && /* @__PURE__ */ u$1(
              "div",
              {
                id: "examai-region-box",
                style: {
                  position: "fixed",
                  left: `${Math.min(dragStart.x, dragCurrent.x)}px`,
                  top: `${Math.min(dragStart.y, dragCurrent.y)}px`,
                  width: `${Math.max(4, Math.abs(dragCurrent.x - dragStart.x))}px`,
                  height: `${Math.max(4, Math.abs(dragCurrent.y - dragStart.y))}px`,
                  border: "2px dashed #38bdf8",
                  background: "rgba(56, 189, 248, 0.14)",
                  pointerEvents: "none"
                }
              }
            )
          ]
        }
      ),
      trigger.visible && trigger.captured && /* @__PURE__ */ u$1(
        "button",
        {
          id: FLOAT_BTN_ID,
          className: "examai-floating-trigger",
          style: { top: `${trigger.top}px`, left: `${trigger.left}px` },
          onMouseDown: (e2) => {
            e2.preventDefault();
            e2.stopPropagation();
          },
          onClick: (e2) => {
            e2.preventDefault();
            e2.stopPropagation();
            const cap = trigger.captured;
            setTrigger({ visible: false, top: 0, left: 0, captured: null });
            setPanelOpen(true);
            setQuestionText(cap.question);
            setOptionsText((cap.options || []).join("\n"));
            setCodeSnippet(cap.codeSnippet || "");
            void runAnalyze(cap.question, cap.options || [], cap.codeSnippet || "");
          },
          children: /* @__PURE__ */ u$1("span", { children: "⚡ ExamAssist AI" })
        }
      ),
      panelOpen && /* @__PURE__ */ u$1("aside", { id: PANEL_ID, className: `examai-panel ${theme === "light" ? "light" : ""}`, role: "dialog", "aria-label": "ExamAssist AI Panel", children: [
        /* @__PURE__ */ u$1("div", { className: "examai-head", children: [
          /* @__PURE__ */ u$1("div", { className: "examai-brand", children: /* @__PURE__ */ u$1("span", { children: "⚡ ExamAssist AI" }) }),
          /* @__PURE__ */ u$1("div", { className: "examai-actions", children: [
            /* @__PURE__ */ u$1(
              "select",
              {
                id: "examai-mode-select",
                className: "examai-select",
                style: { width: "auto" },
                value: mode,
                onChange: (e2) => {
                  const nextMode = e2.target.value;
                  setMode(nextMode);
                  setAuthorizedRevealed(false);
                  void setStorageConfig({ mode: nextMode });
                },
                children: [
                  /* @__PURE__ */ u$1("option", { value: "Practice Mode", children: "Practice Mode" }),
                  /* @__PURE__ */ u$1("option", { value: "Authorized Assessment Mode", children: "Authorized Mode" })
                ]
              }
            ),
            /* @__PURE__ */ u$1(
              "button",
              {
                id: "examai-theme-toggle",
                className: "examai-btn",
                title: "Toggle theme",
                onClick: () => {
                  const next = theme === "dark" ? "light" : "dark";
                  setTheme(next);
                  void setStorageConfig({ theme: next });
                },
                children: theme === "dark" ? "☀️" : "🌙"
              }
            ),
            /* @__PURE__ */ u$1("button", { id: "examai-close", className: "examai-btn", title: "Close", onClick: () => setPanelOpen(false), children: "✕" })
          ] })
        ] }),
        /* @__PURE__ */ u$1("div", { className: "examai-body", children: [
          visionPreview && /* @__PURE__ */ u$1("div", { id: "examai-vision-preview-card", className: "examai-card", style: { borderColor: "#38bdf8" }, children: [
            /* @__PURE__ */ u$1("strong", { style: { fontSize: "11px", color: "#38bdf8", textTransform: "uppercase", display: "block", marginBottom: "4px" }, children: [
              "📷 Local Region Preview (",
              visionPreview.width,
              "×",
              visionPreview.height,
              "px)"
            ] }),
            /* @__PURE__ */ u$1("p", { style: { fontSize: "11px", color: "#94a3b8", margin: "0 0 6px 0" }, children: "Cropped locally in browser. Nothing leaves your browser until you click Send to OCR. Images are never stored or logged." }),
            /* @__PURE__ */ u$1(
              "img",
              {
                id: "examai-vision-preview-img",
                src: visionPreview.croppedDataUrl,
                alt: "Captured region preview",
                style: { maxWidth: "100%", maxHeight: "140px", borderRadius: "6px", border: "1px solid #334155", display: "block", marginBottom: "8px" }
              }
            ),
            /* @__PURE__ */ u$1("div", { style: { display: "flex", gap: "6px" }, children: [
              /* @__PURE__ */ u$1(
                "button",
                {
                  id: "examai-vision-send-btn",
                  className: "examai-btn primary",
                  disabled: visionLoading,
                  onClick: () => void handleSendVisionPreview(),
                  children: visionLoading ? "⏳ Extracting OCR..." : "📤 Send to OCR"
                }
              ),
              /* @__PURE__ */ u$1(
                "button",
                {
                  id: "examai-vision-cancel-btn",
                  className: "examai-btn danger",
                  disabled: visionLoading,
                  onClick: () => setVisionPreview(null),
                  children: "✕ Cancel"
                }
              )
            ] })
          ] }),
          visionMeta && /* @__PURE__ */ u$1(
            "div",
            {
              id: "examai-vision-meta-card",
              className: "examai-card",
              style: { borderColor: "#10b981" },
              children: [
                /* @__PURE__ */ u$1("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                  /* @__PURE__ */ u$1("strong", { style: { fontSize: "11px", color: "#e2e8f0" }, children: [
                    "OCR Confidence: ",
                    Math.round(visionMeta.ocrConfidence * 100),
                    "% (",
                    visionMeta.ocrEngine,
                    ")"
                  ] }),
                  /* @__PURE__ */ u$1("span", { style: { fontSize: "10px", color: "#94a3b8" }, children: "Image not stored" })
                ] }),
                visionMeta.diagramSummary && /* @__PURE__ */ u$1("div", { style: { fontSize: "11px", color: "#cbd5e1", marginTop: "4px" }, children: [
                  "Diagram/Table: ",
                  visionMeta.diagramSummary
                ] })
              ]
            }
          ),
          /* @__PURE__ */ u$1("div", { className: "examai-card", children: [
            /* @__PURE__ */ u$1("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", gap: "4px", flexWrap: "wrap" }, children: [
              /* @__PURE__ */ u$1("strong", { style: { fontSize: "11px", color: "#94a3b8", textTransform: "uppercase" }, children: "Question (Upload, Capture, or Paste to Get Answer)" }),
              /* @__PURE__ */ u$1("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap" }, children: [
                /* @__PURE__ */ u$1(
                  "label",
                  {
                    id: "examai-upload-btn",
                    className: "examai-btn",
                    style: { cursor: "pointer", display: "inline-flex", alignItems: "center", margin: 0 },
                    children: [
                      "📤 Upload Question",
                      /* @__PURE__ */ u$1(
                        "input",
                        {
                          id: "examai-upload-input",
                          type: "file",
                          accept: "image/png,image/jpeg,image/webp,.txt,.md",
                          style: { display: "none" },
                          onChange: handleUploadQuestionFile
                        }
                      )
                    ]
                  }
                ),
                /* @__PURE__ */ u$1("button", { id: "examai-capture-region-btn", className: "examai-btn", onClick: handleStartRegionSelect, children: "📷 Capture Region" }),
                /* @__PURE__ */ u$1("button", { id: "examai-extract-coding", className: "examai-btn", onClick: handleExtractPageCoding, children: "🔍 Extract Page" })
              ] })
            ] }),
            /* @__PURE__ */ u$1(
              "textarea",
              {
                id: "examai-edit-question",
                className: "examai-textarea",
                value: questionText,
                onInput: (e2) => setQuestionText(e2.target.value),
                onPaste: (e2) => {
                  var _a3, _b2, _c2;
                  const items = (_a3 = e2.clipboardData) == null ? void 0 : _a3.items;
                  if (items) {
                    for (let i2 = 0; i2 < items.length; i2++) {
                      const item = items[i2];
                      if (item.type.startsWith("image/")) {
                        e2.preventDefault();
                        const file = item.getAsFile();
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const dataUrl = String(reader.result || "");
                            if (dataUrl) void extractAndSolveImage(dataUrl, file.type || "image/png");
                          };
                          reader.readAsDataURL(file);
                        }
                        return;
                      }
                    }
                  }
                  const pastedText = ((_c2 = (_b2 = e2.clipboardData) == null ? void 0 : _b2.getData("text/plain")) == null ? void 0 : _c2.trim()) || "";
                  if (pastedText.length >= 5) {
                    setTimeout(() => {
                      const parsed = parseQuestionAndOptions(pastedText);
                      const q2 = parsed.question || pastedText;
                      const opts = parsed.options || [];
                      setQuestionText(q2);
                      if (opts.length > 0) setOptionsText(opts.join("\n"));
                      void runAnalyze(q2, opts, codeSnippet);
                    }, 20);
                  }
                },
                placeholder: "Paste or upload a question (or image screenshot) to get the answer immediately..."
              }
            ),
            /* @__PURE__ */ u$1(
              "textarea",
              {
                id: "examai-edit-options",
                className: "examai-textarea",
                style: { marginTop: "6px", minHeight: "44px" },
                value: optionsText,
                onInput: (e2) => setOptionsText(e2.target.value),
                placeholder: "Options (one per line, optional)..."
              }
            ),
            /* @__PURE__ */ u$1("div", { style: { display: "flex", gap: "6px", marginTop: "6px" }, children: [
              /* @__PURE__ */ u$1(
                "button",
                {
                  id: "examai-reanalyze-btn",
                  className: "examai-btn primary",
                  disabled: streaming,
                  onClick: () => void runAnalyze(),
                  children: [
                    "🚀 ",
                    streaming ? "Getting Answer..." : "Get Answer"
                  ]
                }
              ),
              streaming && /* @__PURE__ */ u$1("button", { id: "examai-cancel-stream", className: "examai-btn danger", onClick: handleCancelStream, children: "⏹ Cancel" })
            ] })
          ] }),
          streaming && /* @__PURE__ */ u$1("div", { id: "examai-stream-status", className: "examai-card", style: { borderColor: "#0284c7" }, children: /* @__PURE__ */ u$1("strong", { id: "examai-stream-stage", style: { color: "#38bdf8" }, children: [
            "⏳ ",
            streamStage
          ] }) }),
          errorState && /* @__PURE__ */ u$1("div", { id: "examai-error-banner", className: "examai-error", "data-error-code": errorState.code, children: [
            /* @__PURE__ */ u$1("strong", { style: { display: "block", marginBottom: "4px" }, children: errorState.code === "CANCELLED" ? "Analysis Cancelled" : errorState.code === "AI_NOT_CONFIGURED" ? "⚠️ AI Key Not Configured" : "Assessment Error" }),
            /* @__PURE__ */ u$1("span", { children: errorState.message })
          ] }),
          result && /* @__PURE__ */ u$1("div", { id: "examai-result-card", className: "examai-card", children: [
            /* @__PURE__ */ u$1("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }, children: [
              /* @__PURE__ */ u$1("span", { id: "examai-confidence-badge", className: `examai-badge ${confidence}`, children: [
                "Confidence: ",
                confidence
              ] }),
              /* @__PURE__ */ u$1(
                "button",
                {
                  id: "examai-copy-btn",
                  className: "examai-btn",
                  onClick: () => {
                    var _a3;
                    (_a3 = navigator.clipboard) == null ? void 0 : _a3.writeText(answerStr);
                    setCopyStatus("✓ Copied");
                    setTimeout(() => setCopyStatus("📋 Copy Answer"), 1400);
                  },
                  children: copyStatus
                }
              )
            ] }),
            mode === "Authorized Assessment Mode" && !authorizedRevealed ? /* @__PURE__ */ u$1("div", { id: "examai-auth-gate", className: "examai-notice", children: [
              /* @__PURE__ */ u$1("strong", { children: "Authorized Assessment Mode Notice:" }),
              " Confirm that viewing the full solution is permitted for this assessment.",
              /* @__PURE__ */ u$1("div", { style: { marginTop: "6px" }, children: /* @__PURE__ */ u$1(
                "button",
                {
                  id: "examai-reveal-auth-sol",
                  className: "examai-btn primary",
                  onClick: () => setAuthorizedRevealed(true),
                  children: "Show Full Solution"
                }
              ) })
            ] }) : /* @__PURE__ */ u$1("div", { id: "examai-solution-view", children: [
              /* @__PURE__ */ u$1("div", { id: "examai-direct-answer", style: { fontWeight: 700, fontSize: "14px", color: "#38bdf8", marginBottom: "6px", whiteSpace: "pre-wrap" }, children: answerStr }),
              typeof result.ownSolution === "string" && result.ownSolution.trim() && result.ownSolution.trim() !== answerStr && result.ownSolution.trim() !== String(result.explanation || "").trim() && /* @__PURE__ */ u$1(
                "div",
                {
                  id: "examai-own-solution",
                  style: {
                    fontSize: "12.5px",
                    whiteSpace: "pre-wrap",
                    background: "rgba(15, 23, 42, 0.55)",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid rgba(148, 163, 184, 0.25)",
                    marginBottom: "8px",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
                  },
                  children: result.ownSolution
                }
              ),
              /* @__PURE__ */ u$1("div", { id: "examai-explanation", style: { fontSize: "12.5px", whiteSpace: "pre-wrap", marginBottom: "6px" }, children: String(result.explanation || "") }),
              Array.isArray(result.reasoningSteps) && result.reasoningSteps.length > 0 && /* @__PURE__ */ u$1("div", { id: "examai-reasoning-steps", style: { fontSize: "12px", marginTop: "6px" }, children: [
                /* @__PURE__ */ u$1("strong", { style: { color: "#94a3b8" }, children: "Reasoning Steps:" }),
                /* @__PURE__ */ u$1("ol", { style: { margin: "4px 0 0 18px", padding: 0 }, children: result.reasoningSteps.map((step, idx) => /* @__PURE__ */ u$1("li", { style: { marginBottom: "2px" }, children: String(step) }, idx)) })
              ] }),
              Array.isArray(result.optionAnalysis) && result.optionAnalysis.length > 0 && /* @__PURE__ */ u$1("div", { id: "examai-option-analysis", style: { fontSize: "12px", marginTop: "6px" }, children: [
                /* @__PURE__ */ u$1("strong", { style: { color: "#94a3b8" }, children: "Option Analysis:" }),
                /* @__PURE__ */ u$1("ul", { style: { margin: "4px 0 0 16px", padding: 0 }, children: result.optionAnalysis.map((opt, idx) => /* @__PURE__ */ u$1("li", { style: { marginBottom: "2px" }, children: [
                  /* @__PURE__ */ u$1("strong", { children: [
                    opt.option ? `${opt.option}. ` : "",
                    opt.text || ""
                  ] }),
                  " ",
                  opt.correct || opt.isCorrect ? "✅ " : "❌ ",
                  opt.reason || opt.analysis || ""
                ] }, idx)) })
              ] }),
              typeof result.confidenceReason === "string" && result.confidenceReason.trim() && /* @__PURE__ */ u$1("div", { id: "examai-confidence-reason", style: { fontSize: "11px", color: "#94a3b8", marginTop: "6px" }, children: result.confidenceReason })
            ] })
          ] })
        ] })
      ] })
    ] });
  }
  function ensureShadowOverlayRoot(doc = document) {
    let host = doc.getElementById(SHADOW_HOST_ID);
    if (!host) {
      host = doc.createElement("div");
      host.id = SHADOW_HOST_ID;
      doc.body.appendChild(host);
    }
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    if (!shadow.querySelector("style[data-examai-shadow-styles]")) {
      const styleEl = doc.createElement("style");
      styleEl.setAttribute("data-examai-shadow-styles", "true");
      styleEl.textContent = SHADOW_DOM_STYLES;
      shadow.appendChild(styleEl);
    }
    let mountNode = shadow.querySelector("#examai-shadow-mount");
    if (!mountNode) {
      mountNode = doc.createElement("div");
      mountNode.id = "examai-shadow-mount";
      shadow.appendChild(mountNode);
    }
    R(/* @__PURE__ */ u$1(InPageOverlayApp, { ...currentProps }), mountNode);
    return shadow;
  }
  function updateOverlay(next) {
    currentProps = { ...currentProps, ...next };
    ensureShadowOverlayRoot(document);
  }
  function showInPageFloatingTrigger(range, captured) {
    const rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0 && rect.height === 0) return;
    const top = window.scrollY + rect.bottom + 8;
    const left = Math.max(10, Math.min(window.scrollX + rect.left, window.innerWidth - 180));
    updateOverlay({
      initialTrigger: { visible: true, top, left, captured }
    });
  }
  function hideInPageFloatingTrigger() {
    if (!document.getElementById(SHADOW_HOST_ID)) return;
    updateOverlay({
      initialTrigger: { visible: false, top: 0, left: 0, captured: null }
    });
  }
  function openInPageOverlayAndAnalyze(captured) {
    updateOverlay({
      initialTrigger: { visible: false, top: 0, left: 0, captured: null },
      initialPanelOpen: true,
      initialCaptured: captured,
      autoRunToken: Date.now()
    });
  }
  function isEventFromShadowOverlay(target) {
    if (!target || !(target instanceof Node)) return false;
    const host = document.getElementById(SHADOW_HOST_ID);
    if (!host) return false;
    return target === host || host.contains(target);
  }
  (() => {
    if (typeof window === "undefined") return;
    if (window.__EXAMASSIST_CONTENT_LOADED__) return;
    window.__EXAMASSIST_CONTENT_LOADED__ = true;
    const extractionManager = new ExtractionManager();
    window.__EXAMASSIST_TEST_API__ = {
      extractCodingProblem,
      parseQuestionAndOptions,
      openInPageOverlayAndAnalyze,
      ensureShadowOverlayRoot
    };
    registerUserTriggers(document, extractionManager, {
      onShowFloatingTrigger: (range, captured) => {
        showInPageFloatingTrigger(range, captured);
      },
      onHideFloatingTrigger: () => {
        hideInPageFloatingTrigger();
      },
      onExecuteAnalyze: (captured) => {
        openInPageOverlayAndAnalyze(captured);
      },
      isEventInsideOverlay: (target) => isEventFromShadowOverlay(target)
    });
    if (isExtensionContextAlive()) {
      try {
        chrome.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
          if (!isExtensionContextAlive()) return false;
          const validation = validateRuntimeMessage(rawMsg);
          if (!validation.valid || !validation.message) {
            sendResponse == null ? void 0 : sendResponse({ error: validation.error || "Invalid extension message" });
            return false;
          }
          const msg = validation.message;
          if ("action" in msg && msg.action === "EXTRACT_CODING_PROBLEM") {
            const problem = extractCodingProblem(document);
            sendResponse == null ? void 0 : sendResponse(problem);
            return true;
          }
          if ("type" in msg) {
            if (msg.type === "EXTRACT_CODING_PROBLEM") {
              const problem = extractCodingProblem(document);
              sendResponse == null ? void 0 : sendResponse(problem);
              return true;
            }
            if (msg.type === "RESEARCH_SELECTION") {
              hideInPageFloatingTrigger();
              const sel = window.getSelection();
              const captured = extractionManager.extractFromSelection(sel) || {
                success: true,
                question: msg.text || "",
                options: [],
                mathFormula: "",
                codeSnippet: "",
                tableData: "",
                sourceAdapter: "ContextMenu"
              };
              openInPageOverlayAndAnalyze(captured);
              sendResponse == null ? void 0 : sendResponse({ ok: true });
              return true;
            }
            if (msg.type === "TRIGGER_EXAM_ASSIST") {
              hideInPageFloatingTrigger();
              const sel = window.getSelection();
              const captured = sel && sel.toString().trim().length >= 5 ? extractionManager.extractFromSelection(sel) : extractionManager.extract(document.activeElement, document);
              if (captured && captured.question) {
                openInPageOverlayAndAnalyze(captured);
              }
              sendResponse == null ? void 0 : sendResponse({ ok: true });
              return true;
            }
            if (msg.type === "ASK") {
              hideInPageFloatingTrigger();
              openInPageOverlayAndAnalyze({
                success: true,
                question: msg.question,
                options: [],
                mathFormula: "",
                codeSnippet: "",
                tableData: "",
                sourceAdapter: "PopupAsk"
              });
              sendResponse == null ? void 0 : sendResponse({ ok: true });
              return true;
            }
          }
          return false;
        });
      } catch (err) {
        console.warn("[ExamAssist] Could not register runtime message listener:", err);
      }
    }
  })();
})();
