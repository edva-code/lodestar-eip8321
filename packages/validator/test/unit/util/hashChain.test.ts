import {describe, expect, it} from "vitest";
import {hashChainStep} from "@lodestar/state-transition";
import {computeHashChainTip, getHashChainReveal} from "../../../src/util/hashChain.js";

describe("util / hashChain", () => {
  const secret = new Uint8Array(32).fill(7);
  const length = 16;

  it("tip is the secret hashed length times", () => {
    let link: Uint8Array = secret;
    for (let i = 0; i < length; i++) link = hashChainStep(link);
    expect(computeHashChainTip(secret, length)).toEqual(link);
  });

  it("reveals walk down the chain until the secret", () => {
    let commitment = computeHashChainTip(secret, length);
    for (let i = 0; i < length; i++) {
      const reveal = getHashChainReveal(secret, length, commitment);
      expect(reveal, `reveal ${i}`).not.toBeNull();
      expect(hashChainStep(reveal as Uint8Array), `reveal ${i}`).toEqual(commitment);
      commitment = reveal as Uint8Array;
    }
    expect(commitment).toEqual(secret);
    // Chain is exhausted once the commitment is the secret
    expect(getHashChainReveal(secret, length, commitment)).toBeNull();
  });

  it("returns null for a commitment not on the chain", () => {
    expect(getHashChainReveal(secret, length, new Uint8Array(32).fill(1))).toBeNull();
  });

  it("rejects a chain with a zero link", () => {
    expect(() => computeHashChainTip(new Uint8Array(32), length)).toThrow();
  });
});
