import {describe, expect, it} from "vitest";
import {HASH_CHAIN_RANDAO_DST} from "@lodestar/params";
import {toHex} from "@lodestar/utils";
import {blake3Hash, hashChainStep} from "../../../src/util/index.js";

describe("blake3", () => {
  it("should match the official BLAKE3 vector for empty input", () => {
    expect(toHex(blake3Hash(new Uint8Array()))).toBe(
      "0xaf1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"
    );
  });

  it("hashChainStep should prefix the hash-chain DST", () => {
    const value = new Uint8Array(32).fill(0xab);
    expect(hashChainStep(value)).toEqual(blake3Hash(Uint8Array.from([...HASH_CHAIN_RANDAO_DST, ...value])));
    expect(hashChainStep(value)).not.toEqual(blake3Hash(value));
  });
});
