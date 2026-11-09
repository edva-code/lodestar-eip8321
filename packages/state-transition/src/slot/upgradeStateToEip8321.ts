import {ssz} from "@lodestar/types";
import {getCachedBeaconState} from "../cache/stateCache.js";
import {ZERO_HASH} from "../constants/index.js";
import {CachedBeaconStateEip8321, CachedBeaconStateHeze} from "../types.js";

/**
 * Upgrade a state from Heze to Eip8321.
 * Every validator starts with a zero commitment and the pending queue is empty.
 */
export function upgradeStateToEip8321(stateHeze: CachedBeaconStateHeze): CachedBeaconStateEip8321 {
  const {config} = stateHeze;

  ssz.heze.BeaconState.commitViewDU(stateHeze);

  const stateView = ssz.eip8321.BeaconState.defaultViewDU();

  stateView.genesisTime = stateHeze.genesisTime;
  stateView.genesisValidatorsRoot = stateHeze.genesisValidatorsRoot;
  stateView.slot = stateHeze.slot;
  stateView.latestBlockHeader = stateHeze.latestBlockHeader;
  stateView.blockRoots = stateHeze.blockRoots;
  stateView.stateRoots = stateHeze.stateRoots;
  stateView.historicalRoots = stateHeze.historicalRoots;
  stateView.validators = stateHeze.validators;
  stateView.balances = stateHeze.balances;
  stateView.randaoMixes = stateHeze.randaoMixes;
  stateView.slashings = stateHeze.slashings;
  stateView.previousEpochParticipation = stateHeze.previousEpochParticipation;
  stateView.currentEpochParticipation = stateHeze.currentEpochParticipation;
  stateView.justificationBits = stateHeze.justificationBits;
  stateView.previousJustifiedCheckpoint = stateHeze.previousJustifiedCheckpoint;
  stateView.currentJustifiedCheckpoint = stateHeze.currentJustifiedCheckpoint;
  stateView.finalizedCheckpoint = stateHeze.finalizedCheckpoint;
  stateView.inactivityScores = stateHeze.inactivityScores;
  stateView.currentSyncCommittee = stateHeze.currentSyncCommittee;
  stateView.nextSyncCommittee = stateHeze.nextSyncCommittee;
  stateView.latestBlockHash = stateHeze.latestBlockHash;
  stateView.nextWithdrawalIndex = stateHeze.nextWithdrawalIndex;
  stateView.nextWithdrawalValidatorIndex = stateHeze.nextWithdrawalValidatorIndex;
  stateView.historicalSummaries = stateHeze.historicalSummaries;
  stateView.depositBalanceToConsume = stateHeze.depositBalanceToConsume;
  stateView.exitBalanceToConsume = stateHeze.exitBalanceToConsume;
  stateView.earliestExitEpoch = stateHeze.earliestExitEpoch;
  stateView.consolidationBalanceToConsume = stateHeze.consolidationBalanceToConsume;
  stateView.earliestConsolidationEpoch = stateHeze.earliestConsolidationEpoch;
  stateView.pendingDeposits = stateHeze.pendingDeposits;
  stateView.pendingPartialWithdrawals = stateHeze.pendingPartialWithdrawals;
  stateView.pendingConsolidations = stateHeze.pendingConsolidations;
  stateView.proposerLookahead = stateHeze.proposerLookahead;
  stateView.builders = stateHeze.builders;
  stateView.nextWithdrawalBuilderIndex = stateHeze.nextWithdrawalBuilderIndex;
  stateView.executionPayloadAvailability = stateHeze.executionPayloadAvailability;
  stateView.builderPendingPayments = stateHeze.builderPendingPayments;
  stateView.builderPendingWithdrawals = stateHeze.builderPendingWithdrawals;
  stateView.latestExecutionPayloadBid = stateHeze.latestExecutionPayloadBid;
  stateView.payloadExpectedWithdrawals = stateHeze.payloadExpectedWithdrawals;
  stateView.ptcWindow = stateHeze.ptcWindow;
  stateView.fork = ssz.phase0.Fork.toViewDU({
    previousVersion: stateHeze.fork.currentVersion,
    currentVersion: config.EIP8321_FORK_VERSION,
    epoch: stateHeze.epochCtx.epoch,
  });
  stateView.randaoCommitments = ssz.eip8321.RandaoCommitments.toViewDU(
    Array.from({length: stateHeze.validators.length}, () => ZERO_HASH)
  );

  const stateEip8321 = getCachedBeaconState(stateView, stateHeze);
  stateEip8321.commit();
  // biome-ignore lint/complexity/useLiteralKeys: It is a protected attribute
  stateEip8321["clearCache"]();

  return stateEip8321;
}
