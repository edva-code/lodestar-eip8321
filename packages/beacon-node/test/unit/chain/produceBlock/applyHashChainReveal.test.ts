import {describe, expect, it} from "vitest";
import {ZERO_HASH} from "@lodestar/params";
import {G2_POINT_AT_INFINITY} from "@lodestar/state-transition";
import {applyHashChainReveal} from "../../../../src/chain/produceBlock/produceBlockBody.js";

describe("chain / produceBlock / applyHashChainReveal", () => {
  const blsReveal = Buffer.alloc(96, 0xab);
  const makeBody = () => ({hashChainReveal: Buffer.alloc(32, 0xff), randaoReveal: blsReveal});

  it("defaults to a zero reveal and keeps the BLS reveal", () => {
    const body = makeBody();
    applyHashChainReveal(body);
    expect(body.hashChainReveal).toEqual(ZERO_HASH);
    expect(body.randaoReveal).toBe(blsReveal);
  });

  it("keeps the BLS reveal for an explicit zero reveal", () => {
    const body = makeBody();
    applyHashChainReveal(body, Buffer.alloc(32, 0));
    expect(body.randaoReveal).toBe(blsReveal);
  });

  it("uses the hash chain reveal and clears the BLS reveal when provided", () => {
    const body = makeBody();
    const reveal = Buffer.alloc(32, 0x07);
    applyHashChainReveal(body, reveal);
    expect(body.hashChainReveal).toBe(reveal);
    expect(body.randaoReveal).toEqual(G2_POINT_AT_INFINITY);
  });
});
