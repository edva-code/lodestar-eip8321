import {describe, expect, it} from "vitest";
import {pubkeyCache} from "@chainsafe/lodestar-z/pubkeys";
import {createBeaconConfig} from "@lodestar/config";
import {getConfig} from "@lodestar/config/test-utils";
import {ForkName, ForkSeq} from "@lodestar/params";
import {ssz} from "@lodestar/types";
import {addValidatorToRegistry} from "../../../src/block/processDeposit.js";
import {createCachedBeaconState} from "../../../src/index.js";
import {interopSecretKeys} from "../../../src/util/index.js";

describe("addValidatorToRegistry in Eip8321", () => {
  it("appends a zero randao commitment aligned with the new validator", () => {
    const [existing, added] = interopSecretKeys(2);
    const view = ssz.eip8321.BeaconState.defaultViewDU();
    view.validators.push(
      ssz.phase0.Validator.toViewDU({...ssz.phase0.Validator.defaultValue(), pubkey: existing.toPublicKey().toBytes()})
    );
    view.randaoCommitments.push(new Uint8Array(32).fill(0x11));
    view.commit();
    const state = createCachedBeaconState(
      view,
      {config: createBeaconConfig(getConfig(ForkName.eip8321), view.genesisValidatorsRoot), pubkeyCache},
      {skipSyncCommitteeCache: true}
    );

    addValidatorToRegistry(ForkSeq.eip8321, state, added.toPublicKey().toBytes(), new Uint8Array(32), 32_000_000_000);

    expect(state.validators.length).toBe(2);
    expect(state.randaoCommitments.length).toBe(2);
    expect(state.randaoCommitments.get(0)).toEqual(new Uint8Array(32).fill(0x11));
    expect(state.randaoCommitments.get(1)).toEqual(new Uint8Array(32));
  });
});
