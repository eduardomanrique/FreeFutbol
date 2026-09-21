import { RootMotionWarp } from "./root-motion-warp.js";

const MAX_NODES = 12000;
const MAX_FIELDS = 100000;
const forbidden = new Set(["__proto__", "prototype", "constructor"]);

// Graph encoding preserves shared action/foot references, undefined and signed zero.
// Animation controllers and the physics wrapper are handled outside this graph.
export function encodeMatchState(match) {
  const nodes = [],
    seen = new Map();
  const players = new Set(match.players);
  let fields = 0;
  function encode(value, depth = 0) {
    if (depth > 80 || ++fields > MAX_FIELDS)
      throw Error("State exceeds limits");
    if (value === undefined) return { scalar: "undefined" };
    if (typeof value === "number") {
      if (Object.is(value, -0)) return { scalar: "-0" };
      if (!Number.isFinite(value)) throw Error("Non-finite simulation state");
      return value;
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return value;
    if (typeof value !== "object")
      throw Error("Unsupported simulation state value");
    if (seen.has(value)) return { ref: seen.get(value) };
    if (nodes.length >= MAX_NODES) throw Error("Too many state objects");
    const type = Array.isArray(value)
      ? "array"
      : value instanceof RootMotionWarp
        ? "warp"
        : "object";
    if (
      value !== match &&
      type === "object" &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      throw Error("Unsupported simulation state class");
    const id = nodes.length;
    seen.set(value, id);
    const node = { type, values: type === "array" ? [] : {} };
    nodes.push(node);
    if (type === "array") node.values = value.map((v) => encode(v, depth + 1));
    else
      for (const key of Object.keys(value).sort()) {
        if (forbidden.has(key)) throw Error("Reserved state field");
        if (
          value === match &&
          ["physics", "random", "motionLibrary"].includes(key)
        )
          continue;
        if (players.has(value) && key === "motion") continue;
        node.values[key] = encode(value[key], depth + 1);
      }
    return { ref: id };
  }
  return { root: encode(match), nodes };
}

export function decodeMatchState(graph) {
  if (
    !graph ||
    !Array.isArray(graph.nodes) ||
    !graph.nodes.length ||
    graph.nodes.length > MAX_NODES
  )
    throw Error("Invalid state graph");
  let fields = 0;
  const objects = graph.nodes.map((node) => {
    if (!node || !["array", "object", "warp"].includes(node.type))
      throw Error("Invalid state node");
    if (node.type === "array") {
      if (!Array.isArray(node.values)) throw Error("Invalid state array");
      return [];
    }
    if (
      !node.values ||
      Array.isArray(node.values) ||
      typeof node.values !== "object"
    )
      throw Error("Invalid state object");
    return node.type === "warp" ? Object.create(RootMotionWarp.prototype) : {};
  });
  function decode(value) {
    if (++fields > MAX_FIELDS) throw Error("State exceeds limits");
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value && typeof value === "object" && Object.keys(value).length === 1) {
      if (
        Number.isInteger(value.ref) &&
        value.ref >= 0 &&
        value.ref < objects.length
      )
        return objects[value.ref];
      if (value.scalar === "undefined") return undefined;
      if (value.scalar === "-0") return -0;
    }
    throw Error("Invalid state reference");
  }
  graph.nodes.forEach((node, index) => {
    if (node.type === "array") {
      if (node.values.length > MAX_FIELDS) throw Error("State array too large");
      for (const item of node.values) objects[index].push(decode(item));
    } else
      for (const [key, value] of Object.entries(node.values)) {
        if (forbidden.has(key)) throw Error("Reserved state field");
        objects[index][key] = decode(value);
      }
  });
  return decode(graph.root);
}

// Stable diagnostic checksum, not an authentication/signature mechanism.
export function stateChecksum(value) {
  const text = JSON.stringify(value);
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b ^ text.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
