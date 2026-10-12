import {describe, expect, it} from "vitest";
import {pubkeyCache} from "@chainsafe/lodestar-z/pubkeys";
import {createBeaconConfig} from "@lodestar/config";
import {getConfig} from "@lodestar/config/test-utils";
import {ForkName} from "@lodestar/params";
import {ssz} from "@lodestar/types";
import {createCachedBeaconState} from "../../../src/index.js";
import {upgradeStateToHeze} from "../../../src/slot/upgradeStateToHeze.js";
import {interopSecretKeys} from "../../../src/util/index.js";

describe("upgradeStateToHeze", () => {
  it("sets a zero randao commitment per validator and an empty pending list", () => {
    const view = ssz.gloas.BeaconState.defaultViewDU();
    const secretKeys = interopSecretKeys(3);
    for (const sk of secretKeys) {
      view.validators.push(
        ssz.phase0.Validator.toViewDU({...ssz.phase0.Validator.defaultValue(), pubkey: sk.toPublicKey().toBytes()})
      );
    }
    view.commit();
    const stateGloas = createCachedBeaconState(
      view,
      {config: createBeaconConfig(getConfig(ForkName.gloas), view.genesisValidatorsRoot), pubkeyCache},
      {skipSyncCommitteeCache: true}
    );

    const stateHeze = upgradeStateToHeze(stateGloas);

    expect(stateHeze.validators.length).toBe(secretKeys.length);
    expect(stateHeze.randaoCommitments.length).toBe(secretKeys.length);
    for (let i = 0; i < secretKeys.length; i++) {
      expect(stateHeze.randaoCommitments.get(i), `commitment ${i}`).toEqual(new Uint8Array(32));
    }
    expect(stateHeze.pendingRandaoCommitments.length).toBe(0);
  });
});
