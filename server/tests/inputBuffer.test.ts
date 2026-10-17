import { describe, it, expect } from "vitest";
import { InputBuffer } from "../src/inputBuffer";
import { ButtonBits, InputCmd } from "@veylcore/shared";

describe("InputBuffer (P2 Requirements)", () => {
  it("consumes exactly 1 input per tick", () => {
    const buffer = new InputBuffer();
    buffer.push([
      { s: 1, mx: 1, my: 0, a: 0, d: 100, b: 0, w: 0 },
      { s: 2, mx: 0, my: 1, a: 0, d: 100, b: 0, w: 0 },
    ]);

    expect(buffer.getQueueLength()).toBe(2);

    const c1 = buffer.consume();
    expect(c1?.s).toBe(1);
    expect(c1?.mx).toBe(1);

    const c2 = buffer.consume();
    expect(c2?.s).toBe(2);
    expect(c2?.my).toBe(1);

    // Now empty - repeats movement for up to 2 ticks, but no buttons
    const c3 = buffer.consume();
    expect(c3?.s).toBe(2);
    expect(c3?.my).toBe(1);
    expect(c3?.b).toBe(0);

    const c4 = buffer.consume();
    expect(c4?.s).toBe(2);
    expect(c4?.my).toBe(1);

    // After 2 ticks of empty, movement stops
    const c5 = buffer.consume();
    expect(c5?.mx).toBe(0);
    expect(c5?.my).toBe(0);
  });

  it("handles input flood: drops oldest inputs to cap queue at 4 and merges edge bits", () => {
    const buffer = new InputBuffer();

    // Flood with 10 inputs in 1 tick, including a RELOAD (bit 4) in one of the dropped commands
    const flood: InputCmd[] = [];
    for (let i = 1; i <= 10; i++) {
      flood.push({
        s: i,
        mx: 1,
        my: 0,
        a: 0,
        d: 100,
        b: i === 3 ? ButtonBits.RELOAD : 0, // Reload pressed at seq 3
        w: 0,
      });
    }

    buffer.push(flood);

    // Queue size capped at 4
    expect(buffer.getQueueLength()).toBe(4);

    // First consumed must have seq 7 (commands 1..6 dropped)
    const first = buffer.consume();
    expect(first?.s).toBe(7);

    // Edge bit RELOAD (4) was preserved by merging into the active command!
    expect((first?.b || 0) & ButtonBits.RELOAD).toBe(ButtonBits.RELOAD);
  });

  it("discards commands with older or duplicate sequence numbers", () => {
    const buffer = new InputBuffer();
    buffer.push([{ s: 5, mx: 1, my: 0, a: 0, d: 100, b: 0, w: 0 }]);
    buffer.consume(); // lastProcessedSeq = 5

    // Push older inputs
    buffer.push([
      { s: 4, mx: 1, my: 0, a: 0, d: 100, b: 0, w: 0 },
      { s: 5, mx: 1, my: 0, a: 0, d: 100, b: 0, w: 0 },
      { s: 6, mx: 0, my: -1, a: 0, d: 100, b: 0, w: 0 },
    ]);

    expect(buffer.getQueueLength()).toBe(1);
    const cmd = buffer.consume();
    expect(cmd?.s).toBe(6);
  });
});
