import {ssz} from "@lodestar/types";
import {CachedBeaconStateEip8321} from "../types.js";

export function processPendingRandaoCommitments(state: CachedBeaconStateEip8321): void {
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

  state.pendingRandaoCommitments = ssz.eip8321.PendingRandaoCommitments.toViewDU(remaining);
}
