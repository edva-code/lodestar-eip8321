import {randomBytes} from "node:crypto";
import {ApiClient} from "@lodestar/api";
import {BeaconConfig} from "@lodestar/config";
import {ForkSeq} from "@lodestar/params";
import {IClock, ZERO_HASH, computeStartSlotAtEpoch} from "@lodestar/state-transition";
import {Bytes32, Epoch, Slot, ValidatorIndex, heze} from "@lodestar/types";
import {byteArrayEquals, fromHex} from "@lodestar/utils";
import {RandaoHashChainRepository} from "../repositories/index.js";
import {PubkeyHex} from "../types.js";
import {HASH_CHAIN_LENGTH, computeHashChainTip, getHashChainReveal} from "../util/hashChain.js";
import {LoggerVc} from "../util/index.js";
import {ValidatorStore} from "./validatorStore.js";

/**
 * EIP-8321: registers a hash chain RANDAO commitment for every local validator once Heze is active,
 * and computes the hash chain reveal a validator must include when proposing.
 */
export class RandaoCommitmentService {
  /** Validators whose registration was accepted by the beacon node, avoids resubmitting while it waits for inclusion */
  private readonly submitted = new Set<ValidatorIndex>();

  constructor(
    private readonly config: BeaconConfig,
    private readonly logger: LoggerVc,
    private readonly api: ApiClient,
    clock: IClock,
    private readonly validatorStore: ValidatorStore,
    private readonly repository: RandaoHashChainRepository
  ) {
    clock.runEveryEpoch(this.registerCommitments);
  }

  /**
   * Return the hash chain reveal for a proposal, or undefined if the proposer must use the BLS reveal.
   * Follows `get_hash_chain_reveal` of the EIP-8321 honest validator guide.
   */
  async getHashChainReveal(pubkeyHex: PubkeyHex, validatorIndex: ValidatorIndex): Promise<Bytes32 | undefined> {
    const {commitment, pending} = (
      await this.api.beacon.getStateRandaoCommitment({stateId: "head", validatorIndex})
    ).value();

    const chain = await this.repository.get(fromHex(pubkeyHex));
    let target = commitment;
    if (byteArrayEquals(commitment, ZERO_HASH)) {
      // A pending registration may activate at the epoch boundary between the head state and the proposal
      // slot, so reveal against our own chain tip. The beacon node ignores the reveal if it is not active yet.
      if (!pending || chain === null) return undefined;
      target = computeHashChainTip(chain.secret, chain.length);
    }

    if (chain === null) {
      throw Error(`No hash chain stored for registered validator ${validatorIndex}, it can no longer propose`);
    }
    const reveal = getHashChainReveal(chain.secret, chain.length, target);
    if (reveal === null) {
      throw Error(
        `Commitment of validator ${validatorIndex} is not on the stored hash chain or the chain is exhausted`
      );
    }
    return reveal;
  }

  private registerCommitments = async (epoch: Epoch): Promise<void> => {
    if (this.config.getForkSeq(computeStartSlotAtEpoch(epoch)) < ForkSeq.heze) return;

    const registrations: heze.SignedRandaoCommitmentRegistration[] = [];
    for (const validatorIndex of this.validatorStore.getAllLocalIndices()) {
      if (this.submitted.has(validatorIndex)) continue;
      const pubkeyHex = this.validatorStore.getPubkeyOfIndex(validatorIndex);
      if (pubkeyHex === undefined) continue;

      try {
        const registration = await this.getRegistration(pubkeyHex, validatorIndex, computeStartSlotAtEpoch(epoch));
        if (registration === null) {
          this.submitted.add(validatorIndex);
        } else {
          registrations.push(registration);
        }
      } catch (e) {
        this.logger.error("Failed to prepare randao commitment registration", {epoch, validatorIndex}, e as Error);
      }
    }

    if (registrations.length === 0) return;

    try {
      (await this.api.beacon.submitPoolRandaoCommitmentRegistrations({registrations})).assertOk();
      for (const {message} of registrations) this.submitted.add(message.validatorIndex);
      this.logger.info("Submitted randao commitment registrations", {epoch, count: registrations.length});
    } catch (e) {
      this.logger.error("Failed to submit randao commitment registrations", {epoch}, e as Error);
    }
  };

  /** Returns null if the validator already has an active or pending commitment */
  private async getRegistration(
    pubkeyHex: PubkeyHex,
    validatorIndex: ValidatorIndex,
    signingSlot: Slot
  ): Promise<heze.SignedRandaoCommitmentRegistration | null> {
    const {commitment, pending} = (
      await this.api.beacon.getStateRandaoCommitment({stateId: "head", validatorIndex})
    ).value();
    if (pending || !byteArrayEquals(commitment, ZERO_HASH)) return null;

    const pubkey = fromHex(pubkeyHex);
    let chain = await this.repository.get(pubkey);
    if (chain === null) {
      chain = {secret: randomBytes(32), length: HASH_CHAIN_LENGTH};
      // Persist the secret before the commitment can reach the chain, a commitment without its secret is unrecoverable
      await this.repository.set(pubkey, chain);
    }

    const tip = computeHashChainTip(chain.secret, chain.length);
    return this.validatorStore.signRandaoCommitmentRegistration(pubkeyHex, validatorIndex, tip, signingSlot);
  }
}
