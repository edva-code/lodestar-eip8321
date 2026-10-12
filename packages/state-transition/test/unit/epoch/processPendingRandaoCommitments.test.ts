import {describe, expect, it} from "vitest";
import {pubkeyCache} from "@chainsafe/lodestar-z/pubkeys";
import {createBeaconConfig} from "@lodestar/config";
import {getConfig} from "@lodestar/config/test-utils";
import {ForkName} from "@lodestar/params";
import {ssz} from "@lodestar/types";
import {processPendingRandaoCommitments} from "../../../src/epoch/processPendingRandaoCommitments.js";
import {createCachedBeaconState} from "../../../src/index.js";

describe("processPendingRandaoCommitments", () => {
  it("applies due commitments and keeps the rest in order", () => {
    const config = getConfig(ForkName.heze);
    const view = ssz.heze.BeaconState.defaultViewDU();
    for (let i = 0; i < 3; i++) view.randaoCommitments.push(new Uint8Array(32));
    const pending = [
      {validatorIndex: 0, commitment: new Uint8Array(32).fill(1), activationEpoch: 1},
      {validatorIndex: 1, commitment: new Uint8Array(32).fill(2), activationEpoch: 3},
      {validatorIndex: 2, commitment: new Uint8Array(32).fill(3), activationEpoch: 2},
    ];
    for (const p of pending) view.pendingRandaoCommitments.push(ssz.heze.PendingRandaoCommitment.toViewDU(p));
    view.commit();
    const state = createCachedBeaconState(
      view,
      {config: createBeaconConfig(config, view.genesisValidatorsRoot), pubkeyCache},
      {skipSyncCommitteeCache: true}
    );

    processPendingRandaoCommitments(state);

    expect(state.randaoCommitments.get(0)).toEqual(pending[0].commitment);
    expect(state.randaoCommitments.get(1)).toEqual(new Uint8Array(32));
    expect(state.randaoCommitments.get(2)).toEqual(new Uint8Array(32));
    expect(state.pendingRandaoCommitments.getAllReadonlyValues()).toEqual([pending[1], pending[2]]);
  });
});
