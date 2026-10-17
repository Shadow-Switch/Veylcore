import { describe, it, expect } from "vitest";
import {
  validateRawMessage,
  validateInputCmd,
  sanitizeNickname,
  validateHelloPayload,
  JsonCodec,
  PROTOCOL_VERSION,
  MAX_MESSAGE_SIZE_BYTES,
} from "../src";

describe("Protocol Validation & Codec (P2 Requirements)", () => {
  it("rejects messages exceeding 1KB", () => {
    const hugeData = "a".repeat(MAX_MESSAGE_SIZE_BYTES + 10);
    const res = validateRawMessage(hugeData);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("MESSAGE_TOO_LARGE");
  });

  it("handles valid JSON envelope and rejects malformed JSON", () => {
    // Heartbeat
    const hbRes = validateRawMessage("hb");
    expect(hbRes.ok).toBe(true);
    expect(hbRes.data?.t).toBe("hb");

    // Valid envelope
    const validJson = JSON.stringify({ t: "hello", d: { name: "Tester" } });
    const validRes = validateRawMessage(validJson);
    expect(validRes.ok).toBe(true);
    expect(validRes.data?.t).toBe("hello");

    // Malformed JSON
    const malformedRes = validateRawMessage("{ invalid json");
    expect(malformedRes.ok).toBe(false);
    expect(malformedRes.error).toContain("BAD_MESSAGE");

    // Missing type 't'
    const missingType = JSON.stringify({ d: "something" });
    const missingTypeRes = validateRawMessage(missingType);
    expect(missingTypeRes.ok).toBe(false);
    expect(missingTypeRes.error).toContain("Missing or invalid message type");
  });

  it("validates InputCmd fields, rejects NaN/Infinity and clamps move magnitude", () => {
    // Valid command
    const validCmd = {
      s: 1,
      mx: 1.0,
      my: 0.0,
      a: 1.57,
      d: 300,
      b: 1,
      w: 0,
    };
    const validRes = validateInputCmd(validCmd);
    expect(validRes.ok).toBe(true);
    expect(validRes.data?.s).toBe(1);

    // Rejects NaN in move vector
    const nanCmd = { ...validCmd, mx: NaN };
    const nanRes = validateInputCmd(nanCmd);
    expect(nanRes.ok).toBe(false);

    // Rejects Infinity
    const infCmd = { ...validCmd, my: Infinity };
    const infRes = validateInputCmd(infCmd);
    expect(infRes.ok).toBe(false);

    // Clamps move vector with length > 1 (e.g. mx=10, my=10) to length <= 1.0
    const overSpeedCmd = { ...validCmd, mx: 10, my: 10 };
    const overSpeedRes = validateInputCmd(overSpeedCmd);
    expect(overSpeedRes.ok).toBe(true);
    const len = Math.sqrt(
      (overSpeedRes.data?.mx || 0) ** 2 + (overSpeedRes.data?.my || 0) ** 2
    );
    expect(len).toBeCloseTo(1.0, 5);

    // Rejects non-positive or non-integer sequence
    expect(validateInputCmd({ ...validCmd, s: 0 }).ok).toBe(false);
    expect(validateInputCmd({ ...validCmd, s: -5 }).ok).toBe(false);
    expect(validateInputCmd({ ...validCmd, s: 1.5 }).ok).toBe(false);

    // Rejects invalid weapon slot
    expect(validateInputCmd({ ...validCmd, w: 2 }).ok).toBe(false);
  });

  it("sanitizes nicknames and strips control characters", () => {
    // Valid nickname
    const res1 = sanitizeNickname("PlayerOne");
    expect(res1.ok).toBe(true);
    expect(res1.data).toBe("PlayerOne");

    // Strips control chars and newlines
    const res2 = sanitizeNickname("  \x00Hacker\n\t  ");
    expect(res2.ok).toBe(true);
    expect(res2.data).toBe("Hacker");

    // Rejects empty or too long names
    expect(sanitizeNickname("").ok).toBe(false);
    expect(sanitizeNickname("   ").ok).toBe(false);
    expect(sanitizeNickname("A".repeat(17)).ok).toBe(false);
  });

  it("validates hello payload and protocol version", () => {
    const validHello = { proto: PROTOCOL_VERSION, name: "Soldier" };
    const helloRes = validateHelloPayload(validHello);
    expect(helloRes.ok).toBe(true);
    expect(helloRes.data?.name).toBe("Soldier");

    // Version mismatch
    const badVersion = { proto: PROTOCOL_VERSION + 1, name: "Soldier" };
    const badRes = validateHelloPayload(badVersion);
    expect(badRes.ok).toBe(false);
    expect(badRes.error).toContain("BAD_VERSION");
  });

  it("encodes and decodes messages using JsonCodec", () => {
    const encoded = JsonCodec.encode("pong", { n: 42 });
    const decoded = JsonCodec.decode(encoded);
    expect(decoded.ok).toBe(true);
    expect(decoded.data?.t).toBe("pong");
    expect((decoded.data?.d as { n: number }).n).toBe(42);
  });
});
