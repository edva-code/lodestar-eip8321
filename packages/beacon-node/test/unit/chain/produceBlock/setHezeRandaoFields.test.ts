import {describe, expect, it} from "vitest";
import {ForkName, ForkPostGloas, ZERO_HASH} from "@lodestar/params";
import {G2_POINT_AT_INFINITY, IBeaconStateView, hashChainStep} from "@lodestar/state-transition";
import {BeaconBlockBody, heze} from "@lodestar/types";
import {BeaconChain} from "../../../../src/chain/chain.js";
import {RandaoCommitmentRegistrationPool} from "../../../../src/chain/opPools/randaoCommitmentRegistrationPool.js";
import {setHezeRandaoFields} from "../../../../src/chain/produceBlock/produceBlockBody.js";

describe("chain / produceBlock / setHezeRandaoFields", () => {
  const proposerIndex = 3;
  const blsReveal = Buffer.alloc(96, 0xab);
  const reveal = Buffer.alloc(32, 0x07);
  const commitment = hashChainStep(reveal);

  const makeState = (opts: {forkName?: ForkName; commitment?: Uint8Array; active?: number[]} = {}): IBeaconStateView =>
    ({
      forkName: opts.forkName ?? ForkName.heze,
      validatorCount: 8,
      getRandaoCommitment: (index: number) =>
        index === proposerIndex
          ? (opts.commitment ?? ZERO_HASH)
          : opts.active?.includes(index)
            ? Buffer.alloc(32, 0x01)
            : ZERO_HASH,
      hasPendingRandaoCommitment: () => false,
    }) as unknown as IBeaconStateView;

  const makeChain = (registrations: heze.SignedRandaoCommitmentRegistration[] = []): BeaconChain => {
    const pool = new RandaoCommitmentRegistrationPool();
    for (const registration of registrations) pool.add(registration);
    return {randaoCommitmentRegistrationPool: pool} as unknown as BeaconChain;
  };

  const makeBody = () => ({randaoReveal: blsReveal}) as unknown as BeaconBlockBody<ForkPostGloas>;

  const makeRegistration = (validatorIndex: number): heze.SignedRandaoCommitmentRegistration => ({
    message: {validatorIndex, commitment: Buffer.alloc(32, 0xcd)},
    signature: Buffer.alloc(96, 0),
  });

  it("does nothing before heze", () => {
    const body = makeBody();
    setHezeRandaoFields(makeChain(), body, makeState(), ForkName.gloas, proposerIndex, reveal);
    expect(body).toEqual({randaoReveal: blsReveal});
  });

  it("keeps the BLS reveal and a zero hash chain reveal for an unregistered proposer", () => {
    const body = makeBody();
    setHezeRandaoFields(makeChain(), body, makeState(), ForkName.heze, proposerIndex, reveal);
    const hezeBody = body as heze.BeaconBlockBody;
    expect(hezeBody.hashChainReveal).toEqual(ZERO_HASH);
    expect(hezeBody.randaoReveal).toBe(blsReveal);
  });

  it("uses the hash chain reveal and the point at infinity for a registered proposer", () => {
    const body = makeBody();
    setHezeRandaoFields(makeChain(), body, makeState({commitment}), ForkName.heze, proposerIndex, reveal);
    const hezeBody = body as heze.BeaconBlockBody;
    expect(hezeBody.hashChainReveal).toBe(reveal);
    expect(hezeBody.randaoReveal).toEqual(G2_POINT_AT_INFINITY);
  });

  it("throws for a registered proposer without a reveal", () => {
    expect(() =>
      setHezeRandaoFields(makeChain(), makeBody(), makeState({commitment}), ForkName.heze, proposerIndex, undefined)
    ).toThrow(/hash chain reveal/);
  });

  it("throws for a registered proposer whose reveal is not the preimage of its commitment", () => {
    expect(() =>
      setHezeRandaoFields(
        makeChain(),
        makeBody(),
        makeState({commitment}),
        ForkName.heze,
        proposerIndex,
        Buffer.alloc(32, 0x08)
      )
    ).toThrow(/hash chain reveal/);
  });

  it("includes only registrations that are includable against the state", () => {
    const body = makeBody();
    const chain = makeChain([makeRegistration(1), makeRegistration(2), makeRegistration(9)]);
    setHezeRandaoFields(chain, body, makeState({active: [2]}), ForkName.heze, proposerIndex, undefined);
    const indices = (body as heze.BeaconBlockBody).randaoCommitmentRegistrations.map((r) => r.message.validatorIndex);
    expect(indices).toEqual([1]);
  });
});
