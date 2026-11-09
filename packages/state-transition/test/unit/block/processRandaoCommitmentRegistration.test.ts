import {describe, expect, it} from "vitest";
import {pubkeyCache} from "@chainsafe/lodestar-z/pubkeys";
import {createBeaconConfig} from "@lodestar/config";
import {getConfig} from "@lodestar/config/test-utils";
import {COMMITMENT_REGISTRATION_DELAY, DOMAIN_RANDAO_COMMITMENT_REGISTRATION, ForkName} from "@lodestar/params";
import {ssz} from "@lodestar/types";
import {processRandaoCommitmentRegistration} from "../../../src/block/processRandaoCommitmentRegistration.js";
import {createCachedBeaconState} from "../../../src/index.js";
import {computeSigningRoot, interopSecretKeys} from "../../../src/util/index.js";

const sk = interopSecretKeys(1)[0];

function buildEip8321State(storedCommitment = new Uint8Array(32)) {
  const config = getConfig(ForkName.eip8321);
  const view = ssz.eip8321.BeaconState.defaultViewDU();
  view.validators.push(
    ssz.phase0.Validator.toViewDU({...ssz.phase0.Validator.defaultValue(), pubkey: sk.toPublicKey().toBytes()})
  );
  view.randaoCommitments.push(storedCommitment);
  view.commit();
  return createCachedBeaconState(
    view,
    {config: createBeaconConfig(config, view.genesisValidatorsRoot), pubkeyCache},
    {skipSyncCommitteeCache: true}
  );
}

function registration(validatorIndex: number, commitment: Uint8Array) {
  return {message: {validatorIndex, commitment}, signature: new Uint8Array(96)};
}

describe("processRandaoCommitmentRegistration", () => {
  const commitment = new Uint8Array(32).fill(0x11);

  it("queues a pending commitment", () => {
    const state = buildEip8321State();
    processRandaoCommitmentRegistration(state, registration(0, commitment), false);
    expect(state.pendingRandaoCommitments.toValue()).toEqual([
      {validatorIndex: 0, commitment, activationEpoch: COMMITMENT_REGISTRATION_DELAY},
    ]);
    expect(state.randaoCommitments.get(0)).toEqual(new Uint8Array(32));
  });

  it("verifies the registration signature", () => {
    const state = buildEip8321State();
    const message = {validatorIndex: 0, commitment};
    const domain = state.config.getDomainAtFork(ForkName.phase0, DOMAIN_RANDAO_COMMITMENT_REGISTRATION);
    const signature = sk.sign(computeSigningRoot(ssz.eip8321.RandaoCommitmentRegistration, message, domain)).toBytes();
    expect(() => processRandaoCommitmentRegistration(state, {message, signature: new Uint8Array(96)})).toThrow(
      "Invalid randao commitment registration signature"
    );
    processRandaoCommitmentRegistration(state, {message, signature});
    expect(state.pendingRandaoCommitments.length).toBe(1);
  });

  it("rejects a second registration while one is pending", () => {
    const state = buildEip8321State();
    processRandaoCommitmentRegistration(state, registration(0, commitment), false);
    expect(() => processRandaoCommitmentRegistration(state, registration(0, commitment), false)).toThrow("pending");
  });

  it("rejects unknown validator", () => {
    expect(() => processRandaoCommitmentRegistration(buildEip8321State(), registration(1, commitment), false)).toThrow(
      "validatorIndex"
    );
  });

  it("rejects zero commitment", () => {
    expect(() =>
      processRandaoCommitmentRegistration(buildEip8321State(), registration(0, new Uint8Array(32)), false)
    ).toThrow("zero commitment");
  });

  it("rejects already registered validator", () => {
    expect(() =>
      processRandaoCommitmentRegistration(buildEip8321State(commitment), registration(0, commitment), false)
    ).toThrow("already has a randao commitment");
  });
});
