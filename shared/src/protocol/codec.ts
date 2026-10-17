import { validateRawMessage, ValidationResult } from "./validator";

export interface CodecMessage<T = unknown> {
  t: string;
  d: T;
}

export class JsonCodec {
  /**
   * Encodes a message envelope to string.
   */
  public static encode<T>(type: string, data: T): string {
    if (type === "hb") {
      return "hb";
    }
    return JSON.stringify({ t: type, d: data });
  }

  /**
   * Decodes and validates a raw message string.
   */
  public static decode(rawText: string): ValidationResult<CodecMessage> {
    return validateRawMessage(rawText);
  }
}
