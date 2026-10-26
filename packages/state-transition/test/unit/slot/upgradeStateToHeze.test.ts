import {describe, expect, it} from "vitest";
import {pubkeyCache} from "@chainsafe/lodestar-z/pubkeys";
import {createBeaconConfig} from "@lodestar/config";
import {getConfig} from "@lodestar/config/test-utils";
import {ForkName} from "@lodestar/params";
import {ssz} from "@lodestar/types";
import {createCachedBeaconState} from "../../../src/index.js";
import {upgradeStateToHeze} from "../../../src/slot/upgradeStateToHeze.js";
import {CachedBeaconStateGloas} from "../../../src/types.js";

const NUM_VALIDATORS = 4;

function buildGloasState(opts: {eth1DepositIndex?: number} = {}) {
  const config = getConfig(ForkName.gloas);
  const view = ssz.gloas.BeaconState.defaultViewDU();
  view.slot = 0;
  view.fork = ssz.phase0.Fork.toViewDU({
    previousVersion: config.GENESIS_FORK_VERSION,
    currentVersion: config.GLOAS_FORK_VERSION,
    epoch: 0,
  });
  for (let i = 0; i < NUM_VALIDATORS; i++) {
    view.validators.push(ssz.phase0.Validator.defaultViewDU());
    view.balances.push(0);
  }
  // Legacy deposit mechanism fully drained: eth1_deposit_index == deposit_requests_start_index
  view.eth1DepositIndex = opts.eth1DepositIndex ?? 0;
  view.depositRequestsStartIndex = 0n;
  view.commit();

  const state = createCachedBeaconState(
    view,
    {config: createBeaconConfig(config, view.genesisValidatorsRoot), pubkeyCache},
    {skipSyncCommitteeCache: true, skipSyncPubkeys: true}
  ) as CachedBeaconStateGloas;
  return {state, config};
}

describe("upgradeStateToHeze (EIP-8321)", () => {
  it("sets an unset randao commitment for every validator and no pending commitments", () => {
    const {state} = buildGloasState();
    const heze = upgradeStateToHeze(state);

    expect(heze.randaoCommitments.length).toBe(NUM_VALIDATORS);
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      expect(heze.randaoCommitments.get(i)).toEqual(new Uint8Array(32));
    }
    expect(heze.pendingRandaoCommitments.length).toBe(0);
  });

  it("sets the Heze fork version and keeps the previous version", () => {
    const {state, config} = buildGloasState();
    const heze = upgradeStateToHeze(state);

    expect(heze.fork.currentVersion).toEqual(config.HEZE_FORK_VERSION);
    expect(heze.fork.previousVersion).toEqual(config.GLOAS_FORK_VERSION);
  });

  it("keeps the validator and balance lists", () => {
    const {state} = buildGloasState();
    const heze = upgradeStateToHeze(state);

    expect(heze.validators.length).toBe(NUM_VALIDATORS);
    expect(heze.balances.length).toBe(NUM_VALIDATORS);
  });

  it("throws while the legacy deposit mechanism is still active", () => {
    const {state} = buildGloasState({eth1DepositIndex: 1});
    expect(() => upgradeStateToHeze(state)).toThrow(/legacy deposit mechanism still active/);
  });

  it("does not carry the eth1 fields", () => {
    const fields = Object.keys(ssz.heze.BeaconState.fields);
    for (const name of ["eth1Data", "eth1DataVotes", "eth1DepositIndex", "depositRequestsStartIndex"]) {
      expect(fields).not.toContain(name);
    }
  });
});
