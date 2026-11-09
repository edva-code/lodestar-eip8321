import {describe, expect, it} from "vitest";
import {ForkName, ForkPostGloas, ZERO_HASH} from "@lodestar/params";
import {G2_POINT_AT_INFINITY, IBeaconStateView, hashChainStep} from "@lodestar/state-transition";
import {BeaconBlockBody, eip8321} from "@lodestar/types";
import {BeaconChain} from "../../../../src/chain/chain.js";
import {RandaoCommitmentRegistrationPool} from "../../../../src/chain/opPools/randaoCommitmentRegistrationPool.js";
import {setEip8321RandaoFields} from "../../../../src/chain/produceBlock/produceBlockBody.js";

describe("chain / produceBlock / setEip8321RandaoFields", () => {
  const proposerIndex = 3;
  const blsReveal = Buffer.alloc(96, 0xab);
  const reveal = Buffer.alloc(32, 0x07);
  const commitment = hashChainStep(reveal);

  const makeState = (opts: {forkName?: ForkName; commitment?: Uint8Array; active?: number[]} = {}): IBeaconStateView =>
    ({
      forkName: opts.forkName ?? ForkName.eip8321,
      validatorCount: 8,
      getRandaoCommitment: (index: number) =>
        index === proposerIndex
          ? (opts.commitment ?? ZERO_HASH)
          : opts.active?.includes(index)
            ? Buffer.alloc(32, 0x01)
            : ZERO_HASH,
      hasPendingRandaoCommitment: () => false,
    }) as unknown as IBeaconStateView;

  const makeChain = (registrations: eip8321.SignedRandaoCommitmentRegistration[] = []): BeaconChain => {
    const pool = new RandaoCommitmentRegistrationPool();
    for (const registration of registrations) pool.add(registration);
    return {randaoCommitmentRegistrationPool: pool} as unknown as BeaconChain;
  };

  const makeBody = () => ({randaoReveal: blsReveal}) as unknown as BeaconBlockBody<ForkPostGloas>;

  const makeRegistration = (validatorIndex: number): eip8321.SignedRandaoCommitmentRegistration => ({
    message: {validatorIndex, commitment: Buffer.alloc(32, 0xcd)},
    signature: Buffer.alloc(96, 0),
  });

  it("does nothing before eip8321", () => {
    const body = makeBody();
    setEip8321RandaoFields(makeChain(), body, makeState(), ForkName.heze, proposerIndex, reveal);
    expect(body).toEqual({randaoReveal: blsReveal});
  });

  it("keeps the BLS reveal and a zero hash chain reveal for an unregistered proposer", () => {
    const body = makeBody();
    setEip8321RandaoFields(makeChain(), body, makeState(), ForkName.eip8321, proposerIndex, reveal);
    const eip8321Body = body as eip8321.BeaconBlockBody;
    expect(eip8321Body.hashChainReveal).toEqual(ZERO_HASH);
    expect(eip8321Body.randaoReveal).toBe(blsReveal);
  });

  it("uses the hash chain reveal and the point at infinity for a registered proposer", () => {
    const body = makeBody();
    setEip8321RandaoFields(makeChain(), body, makeState({commitment}), ForkName.eip8321, proposerIndex, reveal);
    const eip8321Body = body as eip8321.BeaconBlockBody;
    expect(eip8321Body.hashChainReveal).toBe(reveal);
    expect(eip8321Body.randaoReveal).toEqual(G2_POINT_AT_INFINITY);
  });

  it("throws for a registered proposer without a reveal", () => {
    expect(() =>
      setEip8321RandaoFields(
        makeChain(),
        makeBody(),
        makeState({commitment}),
        ForkName.eip8321,
        proposerIndex,
        undefined
      )
    ).toThrow(/hash chain reveal/);
  });

  it("throws for a registered proposer whose reveal is not the preimage of its commitment", () => {
    expect(() =>
      setEip8321RandaoFields(
        makeChain(),
        makeBody(),
        makeState({commitment}),
        ForkName.eip8321,
        proposerIndex,
        Buffer.alloc(32, 0x08)
      )
    ).toThrow(/hash chain reveal/);
  });

  it("includes only registrations that are includable against the state", () => {
    const body = makeBody();
    const chain = makeChain([makeRegistration(1), makeRegistration(2), makeRegistration(9)]);
    setEip8321RandaoFields(chain, body, makeState({active: [2]}), ForkName.eip8321, proposerIndex, undefined);
    const indices = (body as eip8321.BeaconBlockBody).randaoCommitmentRegistrations.map(
      (r) => r.message.validatorIndex
    );
    expect(indices).toEqual([1]);
  });
});
