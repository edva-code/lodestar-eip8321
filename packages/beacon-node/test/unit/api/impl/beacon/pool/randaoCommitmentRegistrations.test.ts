import {beforeEach, describe, expect, it, vi} from "vitest";
import {heze} from "@lodestar/types";
import {getBeaconPoolApi} from "../../../../../../src/api/impl/beacon/pool/index.js";
import {RandaoCommitmentRegistrationPool} from "../../../../../../src/chain/opPools/randaoCommitmentRegistrationPool.js";
import {ApiTestModules, getApiTestModules} from "../../../../../utils/api.js";

describe("api - beacon - pool - randao commitment registrations", () => {
  const registration: heze.SignedRandaoCommitmentRegistration = {
    message: {validatorIndex: 1, commitment: Buffer.alloc(32, 0xab)},
    signature: Buffer.alloc(96, 0),
  };
  let pool: RandaoCommitmentRegistrationPool;
  let modules: ApiTestModules;
  let api: ReturnType<typeof getBeaconPoolApi>;

  beforeEach(() => {
    pool = new RandaoCommitmentRegistrationPool();
    modules = getApiTestModules();
    Object.defineProperty(modules.chain, "randaoCommitmentRegistrationPool", {value: pool});
    modules.network.publishRandaoCommitmentRegistration = vi.fn();
    api = getBeaconPoolApi(modules);
  });

  it("returns pooled registrations", async () => {
    pool.add(registration);
    expect((await api.getPoolRandaoCommitmentRegistrations()).data).toEqual([registration]);
  });

  it("accepts a resubmitted registration that is already pooled", async () => {
    pool.add(registration);
    await expect(api.submitPoolRandaoCommitmentRegistrations({registrations: [registration]})).resolves.toBeUndefined();
    expect(modules.network.publishRandaoCommitmentRegistration).not.toHaveBeenCalled();
  });
});
