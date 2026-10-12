import {describe, expect, it} from "vitest";
import {pubkeyCache} from "@chainsafe/lodestar-z/pubkeys";
import {createBeaconConfig} from "@lodestar/config";
import {getConfig} from "@lodestar/config/test-utils";
import {ForkName} from "@lodestar/params";
import {ssz} from "@lodestar/types";
import {createCachedBeaconState} from "../../../src/index.js";
import {upgradeStateToHeze} from "../../../src/slot/upgradeStateToHeze.js";
import {CachedBeaconStateGloas} from "../../../src/types.js";
import {interopSecretKeys} from "../../../src/util/index.js";

describe("upgradeStateToHeze", () => {
  it("initializes one zero randao commitment per validator", () => {
    const config = getConfig(ForkName.gloas);
    const view = ssz.gloas.BeaconState.defaultViewDU();
    for (const sk of interopSecretKeys(2)) {
      const validator = ssz.phase0.Validator.defaultValue();
      validator.pubkey = sk.toPublicKey().toBytes();
      view.validators.push(ssz.phase0.Validator.toViewDU(validator));
    }
    view.commit();
    const state = createCachedBeaconState(
      view,
      {config: createBeaconConfig(config, view.genesisValidatorsRoot), pubkeyCache},
      {skipSyncCommitteeCache: true}
    ) as CachedBeaconStateGloas;

    const stateHeze = upgradeStateToHeze(state);

    expect(stateHeze.randaoCommitments.getAllReadonly()).toEqual([new Uint8Array(32), new Uint8Array(32)]);
    expect(stateHeze.pendingRandaoCommitments.length).toBe(0);
  });
});
