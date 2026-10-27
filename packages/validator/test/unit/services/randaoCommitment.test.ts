import {beforeEach, describe, expect, it, vi} from "vitest";
import {createBeaconConfig, createChainForkConfig} from "@lodestar/config";
import {config as mainnetConfig} from "@lodestar/config/default";
import {SLOTS_PER_EPOCH} from "@lodestar/params";
import {ZERO_HASH, hashChainStep} from "@lodestar/state-transition";
import {Bytes32, ValidatorIndex, heze} from "@lodestar/types";
import {toHex} from "@lodestar/utils";
import {RandaoHashChainRepository} from "../../../src/repositories/index.js";
import {RandaoCommitmentService} from "../../../src/services/randaoCommitment.js";
import {ValidatorStore} from "../../../src/services/validatorStore.js";
import {LodestarValidatorDatabaseController} from "../../../src/types.js";
import {HASH_CHAIN_LENGTH, computeHashChainTip} from "../../../src/util/hashChain.js";
import {getApiClientStub, mockApiResponse} from "../../utils/apiStub.js";
import {ClockMock} from "../../utils/clock.js";
import {loggerVc} from "../../utils/logger.js";

function getInMemoryDb(): LodestarValidatorDatabaseController {
  const store = new Map<string, Uint8Array>();
  return {
    get: async (key: Uint8Array) => store.get(toHex(key)) ?? null,
    put: async (key: Uint8Array, value: Uint8Array) => {
      store.set(toHex(key), value);
    },
  } as unknown as LodestarValidatorDatabaseController;
}

describe("RandaoHashChainRepository", () => {
  it("round trips a chain by pubkey", async () => {
    const repository = new RandaoHashChainRepository(getInMemoryDb());
    const pubkey = Buffer.alloc(48, 0x01);
    expect(await repository.get(pubkey)).toBeNull();

    const chain = {secret: new Uint8Array(32).fill(0x02), length: 1024};
    await repository.set(pubkey, chain);
    expect(await repository.get(pubkey)).toEqual(chain);
    expect(await repository.get(Buffer.alloc(48, 0x03))).toBeNull();
  });
});

describe("RandaoCommitmentService", () => {
  const hezeEpoch = 2;
  const config = createBeaconConfig(
    createChainForkConfig({
      ...mainnetConfig,
      ALTAIR_FORK_EPOCH: 0,
      BELLATRIX_FORK_EPOCH: 0,
      CAPELLA_FORK_EPOCH: 0,
      DENEB_FORK_EPOCH: 0,
      ELECTRA_FORK_EPOCH: 0,
      FULU_FORK_EPOCH: 0,
      GLOAS_FORK_EPOCH: 0,
      HEZE_FORK_EPOCH: hezeEpoch,
    }),
    ZERO_HASH
  );
  const meta = {executionOptimistic: false, finalized: false};
  const validatorIndex = 7;
  const pubkey = Buffer.alloc(48, 0xaa);
  const pubkeyHex = toHex(pubkey);
  const chain = {secret: new Uint8Array(32).fill(0x05), length: 16};
  const tip = computeHashChainTip(chain.secret, chain.length);

  let api: ReturnType<typeof getApiClientStub>;
  let clock: ClockMock;
  let repository: RandaoHashChainRepository;
  let signRandaoCommitmentRegistration: ReturnType<typeof vi.fn>;
  let service: RandaoCommitmentService;

  const mockCommitment = (commitment: Bytes32, pending = false) =>
    api.beacon.getStateRandaoCommitment.mockResolvedValue(mockApiResponse({data: {commitment, pending}, meta}));

  beforeEach(() => {
    api = getApiClientStub();
    Object.assign(api.beacon, {getStateRandaoCommitment: vi.fn(), submitPoolRandaoCommitmentRegistrations: vi.fn()});
    clock = new ClockMock();
    repository = new RandaoHashChainRepository(getInMemoryDb());
    signRandaoCommitmentRegistration = vi.fn(
      async (
        _pubkey: string,
        index: ValidatorIndex,
        commitment: Bytes32
      ): Promise<heze.SignedRandaoCommitmentRegistration> => ({
        message: {validatorIndex: index, commitment},
        signature: Buffer.alloc(96, 0x01),
      })
    );
    const validatorStore = {
      getAllLocalIndices: () => [validatorIndex],
      getPubkeyOfIndex: (index: ValidatorIndex) => (index === validatorIndex ? pubkeyHex : undefined),
      signRandaoCommitmentRegistration,
    } as unknown as ValidatorStore;
    api.beacon.submitPoolRandaoCommitmentRegistrations.mockResolvedValue(mockApiResponse({}));
    service = new RandaoCommitmentService(config, loggerVc, api, clock, validatorStore, repository);
  });

  const tickEpoch = (epoch: number) => clock.tickEpochFns(epoch, new AbortController().signal);

  describe("registration", () => {
    it("does nothing before heze", async () => {
      mockCommitment(ZERO_HASH);
      await tickEpoch(hezeEpoch - 1);
      expect(api.beacon.getStateRandaoCommitment).not.toHaveBeenCalled();
      expect(api.beacon.submitPoolRandaoCommitmentRegistrations).not.toHaveBeenCalled();
    });

    it("persists a new secret before submitting its chain tip", async () => {
      mockCommitment(ZERO_HASH);
      await tickEpoch(hezeEpoch);

      const stored = await repository.get(pubkey);
      expect(stored?.length).toBe(HASH_CHAIN_LENGTH);
      const expectedTip = computeHashChainTip(stored?.secret ?? ZERO_HASH, HASH_CHAIN_LENGTH);
      expect(signRandaoCommitmentRegistration).toHaveBeenCalledWith(
        pubkeyHex,
        validatorIndex,
        expectedTip,
        hezeEpoch * SLOTS_PER_EPOCH
      );
      const {registrations} = api.beacon.submitPoolRandaoCommitmentRegistrations.mock.calls[0][0];
      expect(registrations.map((r) => r.message)).toEqual([{validatorIndex, commitment: expectedTip}]);
    });

    it("reuses a stored secret", async () => {
      await repository.set(pubkey, chain);
      mockCommitment(ZERO_HASH);
      await tickEpoch(hezeEpoch);
      expect(signRandaoCommitmentRegistration).toHaveBeenCalledWith(
        pubkeyHex,
        validatorIndex,
        tip,
        hezeEpoch * SLOTS_PER_EPOCH
      );
    });

    it("submits once and does not resubmit on later epochs", async () => {
      mockCommitment(ZERO_HASH);
      await tickEpoch(hezeEpoch);
      await tickEpoch(hezeEpoch + 1);
      expect(api.beacon.submitPoolRandaoCommitmentRegistrations).toHaveBeenCalledOnce();
    });

    it("skips a validator with a pending registration", async () => {
      mockCommitment(ZERO_HASH, true);
      await tickEpoch(hezeEpoch);
      expect(signRandaoCommitmentRegistration).not.toHaveBeenCalled();
      expect(api.beacon.submitPoolRandaoCommitmentRegistrations).not.toHaveBeenCalled();
    });

    it("skips an already registered validator", async () => {
      mockCommitment(tip);
      await tickEpoch(hezeEpoch);
      expect(signRandaoCommitmentRegistration).not.toHaveBeenCalled();
      expect(api.beacon.submitPoolRandaoCommitmentRegistrations).not.toHaveBeenCalled();
    });
  });

  describe("getHashChainReveal", () => {
    it("returns undefined for an unregistered validator", async () => {
      mockCommitment(ZERO_HASH);
      expect(await service.getHashChainReveal(pubkeyHex, validatorIndex)).toBeUndefined();
    });

    it("returns the preimage of the active commitment", async () => {
      await repository.set(pubkey, chain);
      mockCommitment(tip);
      const reveal = await service.getHashChainReveal(pubkeyHex, validatorIndex);
      expect(reveal && hashChainStep(reveal)).toEqual(tip);
    });

    it("walks down the chain as the commitment advances", async () => {
      await repository.set(pubkey, chain);
      const firstReveal = computeHashChainTip(chain.secret, chain.length - 1);
      mockCommitment(firstReveal);
      expect(await service.getHashChainReveal(pubkeyHex, validatorIndex)).toEqual(
        computeHashChainTip(chain.secret, chain.length - 2)
      );
    });

    it("reveals against its own tip while the registration is pending", async () => {
      await repository.set(pubkey, chain);
      mockCommitment(ZERO_HASH, true);
      const reveal = await service.getHashChainReveal(pubkeyHex, validatorIndex);
      expect(reveal && hashChainStep(reveal)).toEqual(tip);
    });

    it("throws for a registered validator without a stored chain", async () => {
      mockCommitment(tip);
      await expect(service.getHashChainReveal(pubkeyHex, validatorIndex)).rejects.toThrow(/No hash chain stored/);
    });

    it("throws when the commitment is not on the stored chain", async () => {
      await repository.set(pubkey, chain);
      mockCommitment(Buffer.alloc(32, 0x09));
      await expect(service.getHashChainReveal(pubkeyHex, validatorIndex)).rejects.toThrow(
        /not on the stored hash chain/
      );
    });

    it("throws when the chain is exhausted", async () => {
      await repository.set(pubkey, chain);
      mockCommitment(chain.secret);
      await expect(service.getHashChainReveal(pubkeyHex, validatorIndex)).rejects.toThrow(/exhausted/);
    });
  });
});
