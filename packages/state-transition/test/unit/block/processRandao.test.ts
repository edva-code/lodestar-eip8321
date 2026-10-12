import {describe, expect, it} from "vitest";
import {pubkeyCache} from "@chainsafe/lodestar-z/pubkeys";
import {createBeaconConfig} from "@lodestar/config";
import {getConfig} from "@lodestar/config/test-utils";
import {ForkName} from "@lodestar/params";
import {ssz} from "@lodestar/types";
import {processRandao} from "../../../src/block/processRandao.js";
import {G2_POINT_AT_INFINITY} from "../../../src/constants/constants.js";
import {createCachedBeaconState} from "../../../src/index.js";
import {blake3Hash, hashChainStep} from "../../../src/util/index.js";

function buildHezeState(commitment: Uint8Array) {
  const config = getConfig(ForkName.heze);
  const view = ssz.heze.BeaconState.defaultViewDU();
  view.randaoCommitments.push(commitment);
  return createCachedBeaconState(
    view,
    {config: createBeaconConfig(config, view.genesisValidatorsRoot), pubkeyCache},
    {skipSyncCommitteeCache: true}
  );
}

function buildBlock(hashChainReveal: Uint8Array, randaoReveal = G2_POINT_AT_INFINITY) {
  const block = ssz.heze.BeaconBlock.defaultValue();
  block.body.hashChainReveal = hashChainReveal;
  block.body.randaoReveal = randaoReveal;
  return block;
}

describe("processRandao heze", () => {
  const reveal = new Uint8Array(32).fill(0x11);
  const commitment = hashChainStep(reveal);

  it("hash chain reveal updates mix and commitment", () => {
    const state = buildHezeState(commitment);
    const prevMix = state.randaoMixes.get(0);
    processRandao(state, buildBlock(reveal));
    expect(state.randaoMixes.get(0)).toEqual(blake3Hash(Uint8Array.from([...prevMix, ...reveal])));
    expect(state.randaoCommitments.get(0)).toEqual(reveal);
  });

  it("rejects wrong preimage", () => {
    const state = buildHezeState(commitment);
    expect(() => processRandao(state, buildBlock(new Uint8Array(32).fill(0x22)))).toThrow("preimage");
  });

  it("rejects zero reveal for registered proposer", () => {
    const state = buildHezeState(commitment);
    expect(() => processRandao(state, buildBlock(new Uint8Array(32)))).toThrow("must not be zero");
  });

  it("rejects non-infinity randao reveal for registered proposer", () => {
    const state = buildHezeState(commitment);
    expect(() => processRandao(state, buildBlock(reveal, new Uint8Array(96)))).toThrow("point at infinity");
  });

  it("rejects non-zero reveal for unregistered proposer", () => {
    const state = buildHezeState(new Uint8Array(32));
    expect(() => processRandao(state, buildBlock(reveal))).toThrow("must be zero for unregistered");
  });
});
