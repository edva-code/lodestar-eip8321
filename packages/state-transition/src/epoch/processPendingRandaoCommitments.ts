import {ssz} from "@lodestar/types";
import {CachedBeaconStateHeze} from "../types.js";

export function processPendingRandaoCommitments(state: CachedBeaconStateHeze): void {
  if (state.pendingRandaoCommitments.length === 0) {
    return;
  }

  const nextEpoch = state.epochCtx.epoch + 1;
  const remaining = [];
  for (const pending of state.pendingRandaoCommitments.getAllReadonlyValues()) {
    if (pending.activationEpoch <= nextEpoch) {
      state.randaoCommitments.set(pending.validatorIndex, pending.commitment);
    } else {
      remaining.push(pending);
    }
  }

  state.pendingRandaoCommitments = ssz.heze.PendingRandaoCommitments.toViewDU(remaining);
}
