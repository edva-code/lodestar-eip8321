import {describe, expect, it} from "vitest";
import {pubkeyCache} from "@chainsafe/lodestar-z/pubkeys";
import {createBeaconConfig} from "@lodestar/config";
import {getConfig} from "@lodestar/config/test-utils";
import {ForkName} from "@lodestar/params";
import {ssz} from "@lodestar/types";
import {createCachedBeaconState} from "../../../src/index.js";
import {upgradeStateToEip8321} from "../../../src/slot/upgradeStateToEip8321.js";
import {interopSecretKeys} from "../../../src/util/index.js";

describe("upgradeStateToEip8321", () => {
  it("sets a zero randao commitment per validator and an empty pending list", () => {
    const view = ssz.heze.BeaconState.defaultViewDU();
    const secretKeys = interopSecretKeys(3);
    for (const sk of secretKeys) {
      view.validators.push(
        ssz.phase0.Validator.toViewDU({...ssz.phase0.Validator.defaultValue(), pubkey: sk.toPublicKey().toBytes()})
      );
    }
    view.commit();
    const stateHeze = createCachedBeaconState(
      view,
      {config: createBeaconConfig(getConfig(ForkName.heze), view.genesisValidatorsRoot), pubkeyCache},
      {skipSyncCommitteeCache: true}
    );

    const stateEip8321 = upgradeStateToEip8321(stateHeze);

    expect(stateEip8321.validators.length).toBe(secretKeys.length);
    expect(stateEip8321.randaoCommitments.length).toBe(secretKeys.length);
    for (let i = 0; i < secretKeys.length; i++) {
      expect(stateEip8321.randaoCommitments.get(i), `commitment ${i}`).toEqual(new Uint8Array(32));
    }
    expect(stateEip8321.pendingRandaoCommitments.length).toBe(0);
  });
});
