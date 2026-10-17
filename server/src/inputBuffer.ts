import { ButtonBits, InputCmd } from "@veylcore/shared";

const MAX_QUEUE_SIZE = 4;
const MAX_EMPTY_REPEAT_TICKS = 2;
const EDGE_BITS = ButtonBits.RELOAD | ButtonBits.EQUIP | ButtonBits.PICKUP; // 4 | 8 | 16 = 28

export class InputBuffer {
  private queue: InputCmd[] = [];
  private lastProcessedSeq = 0;
  private lastProcessedCmd: InputCmd | null = null;
  private emptyRepeatCount = 0;

  /**
   * Pushes incoming validated input commands to the buffer.
   * Merges dropped edge bits and enforces max queue size of 4.
   */
  public push(cmds: InputCmd[]): void {
    for (const cmd of cmds) {
      // Must have strictly increasing seq
      if (cmd.s <= this.lastProcessedSeq) {
        continue;
      }
      this.queue.push(cmd);
    }

    // If queue exceeds max size, drop oldest inputs while accumulating edge bits
    if (this.queue.length > MAX_QUEUE_SIZE) {
      let accumulatedEdgeBits = 0;
      const dropCount = this.queue.length - MAX_QUEUE_SIZE;

      for (let i = 0; i < dropCount; i++) {
        const dropped = this.queue.shift()!;
        accumulatedEdgeBits |= dropped.b & EDGE_BITS;
      }

      // Merge accumulated edge bits into the next active command
      if (this.queue.length > 0 && accumulatedEdgeBits !== 0) {
        this.queue[0].b |= accumulatedEdgeBits;
      }
    }
  }

  /**
   * Consumes exactly 1 input command for this tick.
   * - If queue has inputs: consumes the oldest.
   * - If queue is empty: repeats previous movement for up to 2 ticks (clearing FIRE bit), then stops.
   */
  public consume(): InputCmd | null {
    if (this.queue.length > 0) {
      const cmd = this.queue.shift()!;
      this.lastProcessedSeq = cmd.s;
      this.lastProcessedCmd = cmd;
      this.emptyRepeatCount = 0;
      return cmd;
    }

    // Queue is empty: repeat last movement for up to 2 ticks, NO fire
    if (this.lastProcessedCmd && this.emptyRepeatCount < MAX_EMPTY_REPEAT_TICKS) {
      this.emptyRepeatCount++;
      return {
        s: this.lastProcessedSeq,
        mx: this.lastProcessedCmd.mx,
        my: this.lastProcessedCmd.my,
        a: this.lastProcessedCmd.a,
        d: this.lastProcessedCmd.d,
        b: 0, // Clear all buttons (especially FIRE)
        w: this.lastProcessedCmd.w,
      };
    }

    // Completely stopped
    if (this.lastProcessedCmd) {
      return {
        s: this.lastProcessedSeq,
        mx: 0,
        my: 0,
        a: this.lastProcessedCmd.a,
        d: this.lastProcessedCmd.d,
        b: 0,
        w: this.lastProcessedCmd.w,
      };
    }

    return null;
  }

  public getLastProcessedSeq(): number {
    return this.lastProcessedSeq;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }
}
