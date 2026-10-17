import { MAX_MESSAGE_SIZE_BYTES, PROTOCOL_VERSION } from "../constants";
import { ButtonBits, InputCmd } from "./types";

export interface ValidationResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Validates and sanitizes a player nickname.
 * - Trims whitespace
 * - Strips control characters
 * - Enforces length between 1 and 16 characters
 */
export function sanitizeNickname(rawName: unknown): ValidationResult<string> {
  if (typeof rawName !== "string") {
    return { ok: false, error: "NAME_INVALID: Nickname must be a string" };
  }

  // Remove control characters and newlines
  const sanitized = rawName.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();

  if (sanitized.length < 1 || sanitized.length > 16) {
    return {
      ok: false,
      error: "NAME_INVALID: Nickname must be between 1 and 16 characters",
    };
  }

  return { ok: true, data: sanitized };
}

/**
 * Validates an InputCmd object according to NETWORK_PROTOCOL.md specification.
 */
export function validateInputCmd(raw: unknown): ValidationResult<InputCmd> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "InputCmd must be an object" };
  }

  const obj = raw as Record<string, unknown>;

  // s: sequence number (finite positive integer)
  if (
    typeof obj.s !== "number" ||
    !Number.isFinite(obj.s) ||
    obj.s <= 0 ||
    !Number.isInteger(obj.s)
  ) {
    return { ok: false, error: "Invalid seq 's': must be a positive integer" };
  }

  // mx: move x (-1 to 1, finite)
  if (typeof obj.mx !== "number" || !Number.isFinite(obj.mx)) {
    return { ok: false, error: "Invalid 'mx': must be a finite number" };
  }

  // my: move y (-1 to 1, finite)
  if (typeof obj.my !== "number" || !Number.isFinite(obj.my)) {
    return { ok: false, error: "Invalid 'my': must be a finite number" };
  }

  // a: aim angle in radians (finite)
  if (typeof obj.a !== "number" || !Number.isFinite(obj.a)) {
    return { ok: false, error: "Invalid aim 'a': must be a finite number" };
  }

  // d: aim distance (0 to 2000, finite)
  if (typeof obj.d !== "number" || !Number.isFinite(obj.d) || obj.d < 0) {
    return { ok: false, error: "Invalid distance 'd': must be >= 0" };
  }

  // b: button bitmask (finite integer >= 0)
  if (
    typeof obj.b !== "number" ||
    !Number.isFinite(obj.b) ||
    obj.b < 0 ||
    !Number.isInteger(obj.b)
  ) {
    return { ok: false, error: "Invalid buttons 'b': must be a non-negative integer" };
  }

  // w: weapon slot (0 or 1)
  if (obj.w !== 0 && obj.w !== 1) {
    return { ok: false, error: "Invalid slot 'w': must be 0 or 1" };
  }

  // Clamp move vector magnitude to <= 1.0 (anti-speedhack check)
  let mx = Math.max(-1, Math.min(1, obj.mx));
  let my = Math.max(-1, Math.min(1, obj.my));
  const lenSq = mx * mx + my * my;
  if (lenSq > 1.0) {
    const len = Math.sqrt(lenSq);
    mx /= len;
    my /= len;
  }

  // Clamp distance to 2000
  const d = Math.min(2000, Math.max(0, obj.d));

  return {
    ok: true,
    data: {
      s: obj.s,
      mx,
      my,
      a: obj.a,
      d,
      b: obj.b,
      w: obj.w as 0 | 1,
    },
  };
}

/**
 * Validates a raw WebSocket message string before full processing.
 */
export function validateRawMessage(rawText: string): ValidationResult<{ t: string; d: unknown }> {
  // Check raw message size (<= 1KB)
  if (rawText.length > MAX_MESSAGE_SIZE_BYTES) {
    return {
      ok: false,
      error: `MESSAGE_TOO_LARGE: Length ${rawText.length} exceeds ${MAX_MESSAGE_SIZE_BYTES} bytes`,
    };
  }

  // Heartbeat special case
  if (rawText === "hb") {
    return { ok: true, data: { t: "hb", d: null } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "BAD_MESSAGE: Invalid JSON syntax" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "BAD_MESSAGE: Message envelope must be a JSON object" };
  }

  const envelope = parsed as Record<string, unknown>;
  if (typeof envelope.t !== "string" || !envelope.t) {
    return { ok: false, error: "BAD_MESSAGE: Missing or invalid message type 't'" };
  }

  return {
    ok: true,
    data: {
      t: envelope.t,
      d: envelope.d,
    },
  };
}

/**
 * Validates client `hello` payload.
 */
export function validateHelloPayload(
  payload: unknown
): ValidationResult<{ proto: number; name: string; token?: string }> {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "BAD_MESSAGE: Hello payload must be an object" };
  }

  const p = payload as Record<string, unknown>;
  if (p.proto !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error: `BAD_VERSION: Client protocol version ${p.proto} does not match server version ${PROTOCOL_VERSION}`,
    };
  }

  const nickRes = sanitizeNickname(p.name);
  if (!nickRes.ok || !nickRes.data) {
    return { ok: false, error: nickRes.error };
  }

  const token = typeof p.token === "string" && p.token.length > 0 ? p.token : undefined;

  return {
    ok: true,
    data: {
      proto: PROTOCOL_VERSION,
      name: nickRes.data,
      token,
    },
  };
}
