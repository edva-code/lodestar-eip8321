import fs from "node:fs";
import path from "node:path";
import {beforeEach, describe, it} from "vitest";
import {pubkeyCache} from "@chainsafe/lodestar-z/pubkeys";
import {defaultChainConfig} from "@lodestar/config";
import {ACTIVE_PRESET, ForkName, PresetName} from "@lodestar/params";
import {describeDirectorySpecTest} from "@lodestar/spec-test-util";
import {fromHex} from "@lodestar/utils";
import {RunnerType, TestRunner} from "./types.js";

// Pyspec builds EIP-8321 as a feature fork on top of heze with its own fork version, which signs every
// generated vector. Lodestar ships EIP-8321 inside heze, so those vectors run as heze with that version.
const EIP8321_FORK_DIR = "eip8321";
const EIP8321_FORK_VERSION = ACTIVE_PRESET === PresetName.minimal ? "0xe8321001" : "0xe8321000";

const ARTIFACT_FILENAMES = new Set([
  // MacOS artifacts
  "._.DS_Store",
  ".DS_Store",
  // File included by spec tests downloader
  "version.txt",
]);

export interface SkipOpts {
  skippedTestSuites?: RegExp[];
  skippedTests?: RegExp[];
  skippedForks?: string[];
  skippedRunners?: string[];
  skippedHandlers?: string[];
}

/**
 * Because we want to execute the spec tests in parallel so one or two runners will be executed
 * in isolation at a time and would not be available how many runners are there in total.
 * This list is curated manually and should be updated when new runners are added.
 * It will make sure if specs introduce new runner, we should cover in our spec tests.
 */
const coveredTestRunners = [
  "light_client",
  "epoch_processing",
  "fast_confirmation",
  "finality",
  "fork",
  "fork_choice",
  "fork_choice_compliance",
  "sync",
  "fork",
  "genesis",
  "merkle_proof",
  "networking",
  "operations",
  "rewards",
  "sanity",
  "random",
  "shuffling",
  "ssz_static",
  "transition",
];

// NOTE: You MUST always provide a detailed reason of why a spec test is skipped plus link
// to an issue marking it as pending to re-enable and an aproximate timeline of when it will
// be fixed.
// NOTE: Comment the minimum set of test necessary to unblock PRs: For example, instead of
// skipping all `bls_to_execution_change` tests, just skip for a fork setting:
// ```
// skippedPrefixes: [
//    // Skipped since this only test that withdrawals are de-activated
//    "eip4844/operations/bls_to_execution_change",
// ],
// ```
export const defaultSkipOpts: SkipOpts = {
  skippedForks: [],
  skippedTestSuites: [
    // Merge transition tests are skipped because we no longer support performing the merge transition.
    // All networks have already completed the merge, so this code path is no longer needed.
    /^bellatrix\/fork_choice\/on_merge_block\/.*/,
    /^.+\/light_client\/data_collection\/.*/,
    // The gossip harness still lacks coverage for parent validation and voluntary-exit anchors.
    /^.+\/networking\/gossip_beacon_block\/.*$/,
    /^.+\/networking\/gossip_voluntary_exit\/.*$/,
    // Deneb+ epoch-boundary attestations and Electra+ single attestations need harness updates.
    /^(deneb|electra|fulu|gloas|heze|eip8321)\/networking\/gossip_beacon_(attestation|aggregate_and_proof)\/.*$/,
    // Ignore the partial data column container additions for now. Unskip them when
    // cell level DAS is ready
    /^fulu\/ssz_static\/PartialDataColumn(GroupID|Header|PartsMetadata|Sidecar)\/.*$/,
    /^gloas\/ssz_static\/PartialDataColumn(GroupID|PartsMetadata|Sidecar)\/.*$/,
    /^heze\/ssz_static\/PartialDataColumn(GroupID|PartsMetadata|Sidecar)\/.*$/,
    /^heze\/fork_choice_compliance\/.*/,
    // TODO-HEZE: re-enable after on_inclusion_list (FOCIL) fork choice is implemented.
    /^heze\/fork_choice\/on_inclusion_list\/.*$/,
    // TODO-HEZE: EIP-8321 adds fields to the Heze BeaconState and BeaconBlockBody. The pinned
    // consensus-specs vectors predate them, so every vector that decodes either container fails on
    // layout. Re-enable when the vectors include EIP-8321.
    /^heze\/(epoch_processing|fast_confirmation|finality|fork|fork_choice|operations|random|rewards|sanity|transition)\/.*$/,
    /^heze\/ssz_static\/(BeaconState|BeaconBlockBody|BeaconBlock|SignedBeaconBlock)\/.*$/,
    /^heze\/light_client\/single_merkle_proof\/.*$/,
    /^heze\/networking\/gossip_(attester_slashing|bls_to_execution_change|proposer_slashing|sync_committee_contribution_and_proof|sync_committee_message)\/.*$/,
    // Pyspec upgrades a heze pre-state without the EIP-8321 fields, a layout Lodestar's heze does not have.
    /^eip8321\/fork\/.*$/,
  ],
  skippedTests: [
    // The pyspec test primes its `seen` set in code, nothing in the vector carries that state.
    /\/?gossip_randao_commitment_registration__ignore_already_seen$/,
    // The vector rewrites state.fork.current_version to a pre-EIP-8321 value, but Lodestar derives the
    // fork from the slot and the fork schedule, so the head state is still heze.
    /\/?gossip_randao_commitment_registration__ignore_pre_eip8321_head_state$/,
    // The eip8321 vectors are generated from v1.7.0-beta.3, which reorders gloas builder payment settlement
    // (consensus-specs#5695). Lodestar still implements v1.7.0-beta.2 there.
    /\/process_parent_execution_payload__older_than_previous_epoch_builder_exit$/,
    // Same, for the gloas empty slot support discount fix in fast confirmation (consensus-specs#5672).
    /\/is_one_confirmed_(delayed_with_mixed_payload_votes_in_empty_slot|passes_with_empty_slot_and_attester_in_two_consecutive_slots_1)$/,
  ],
  skippedRunners: [],
  // Gossip handlers not implemented in the spec runner.
  skippedHandlers: [
    "gossip_blob_sidecar",
    "gossip_data_column_sidecar",
    "gossip_partial_data_column_sidecar",
    "gossip_execution_payload_bid",
    "gossip_execution_payload_envelope",
    "gossip_payload_attestation_message",
    "gossip_proposer_preferences",
    "gossip_inclusion_list",
  ],
};

/**
 * This helper ensures that strictly all tests are run. There's no hardcoded value beyond "config".
 * Any additional unknown fork, testRunner, testHandler, or testSuite will result in an error.
 *
 * File path structure:
 * ```
 * tests/
 *   <config name>/                     [general, mainnet, minimal]
 *     <fork or phase name>/            [phase0, altair, bellatrix]
 *       <test runner name>/            [bls, ssz_static, fork]
 *         <test handler name>/         ...
 *           <test suite name>/
 *             <test case>/<output part>
 * ```
 *
 * Examples
 * ```
 *       / config  / fork   / test runner      / test handler / test suite   / test case
 *
 * tests / general / phase0 / bls              / aggregate    / small        / aggregate_na_signatures/data.yaml
 * tests / mainnet / altair / ssz_static       / Validator    / ssz_random   / case_0/roots.yaml
 * tests / mainnet / altair / fork             / fork         / pyspec_tests / altair_fork_random_0/meta.yaml
 * ```
 * Ref: https://github.com/ethereum/consensus-specs/blob/v1.6.1/tests/formats/README.md#test-structure
 */
export function specTestIterator(
  configDirpath: string,
  testRunners: Record<string, TestRunner>,
  opts: SkipOpts = defaultSkipOpts
): void {
  const forkStrs = readdirSyncSpec(configDirpath);
  for (const forkStr of forkStrs) {
    if (
      opts?.skippedForks?.includes(forkStr) ||
      (process.env.SPEC_FILTER_FORK && forkStr !== process.env.SPEC_FILTER_FORK) ||
      // Both run as heze with different fork versions, and the eip8321 vectors supersede the older heze ones
      (forkStr === ForkName.heze && forkStrs.includes(EIP8321_FORK_DIR))
    ) {
      continue;
    }
    let fork = forkStr as ForkName;
    if (forkStr === EIP8321_FORK_DIR) {
      fork = ForkName.heze;
      defaultChainConfig.HEZE_FORK_VERSION = fromHex(EIP8321_FORK_VERSION);
    }

    const forkDirpath = path.join(configDirpath, forkStr);
    for (const testRunnerName of readdirSyncSpec(forkDirpath)) {
      if (opts?.skippedRunners?.includes(testRunnerName)) {
        continue;
      }

      const testRunnerDirpath = path.join(forkDirpath, testRunnerName);
      const testRunner = testRunners[testRunnerName];

      if (testRunner === undefined && coveredTestRunners.includes(testRunnerName)) {
        // That runner is not part of the current call to specTestIterator
        continue;
      }

      if (testRunner === undefined && !coveredTestRunners.includes(testRunnerName)) {
        throw new Error(
          `No test runner for ${testRunnerName}. Please make sure it is covered in "coveredTestRunners" if you added new runner.`
        );
      }

      for (const testHandler of readdirSyncSpec(testRunnerDirpath)) {
        if (opts?.skippedHandlers?.includes(testHandler)) {
          continue;
        }

        const testHandlerDirpath = path.join(testRunnerDirpath, testHandler);
        for (const testSuite of readdirSyncSpec(testHandlerDirpath)) {
          const testId = `${forkStr}/${testRunnerName}/${testHandler}/${testSuite}`;

          if (opts?.skippedTestSuites?.some((skippedMatch) => testId.match(skippedMatch))) {
            displaySkipTest(testId);
          } else if (fork === undefined) {
            displayFailTest(testId, `Unknown fork ${forkStr}`);
          } else {
            const testSuiteDirpath = path.join(testHandlerDirpath, testSuite);
            // Specific logic for ssz_static since it has one extra level of directories
            if (testRunner.type === RunnerType.custom) {
              describe(testId, () => {
                beforeEach(() => pubkeyCache.reset());
                testRunner.fn(fork, testHandler, testSuite, testSuiteDirpath);
              });
            }

            // Generic testRunner
            else {
              const {testFunction, options} = testRunner.fn(fork, testHandler, testSuite);
              if (opts.skippedTests) {
                // Compose with any runner-local shouldSkip — overwriting it would silently
                // disable SkipOpts.skippedTests for runners that define their own (fork_choice).
                const runnerShouldSkip = options.shouldSkip;
                options.shouldSkip = (testCase: any, name: string, index: number): boolean => {
                  return (
                    (runnerShouldSkip?.(testCase, name, index) ?? false) ||
                    (opts.skippedTests?.some((skippedMatch) => name.match(skippedMatch)) ?? false)
                  );
                };
              }
              describeDirectorySpecTest(
                testId,
                testSuiteDirpath,
                (testCase, directoryName, testCaseName) => {
                  pubkeyCache.reset();
                  return testFunction(testCase, directoryName, testCaseName);
                },
                options
              );
            }
          }
        }
      }
    }
  }
}

function displayFailTest(testId: string, msg: string): void {
  describe(testId, () => {
    it(testId, () => {
      throw Error(msg);
    });
  });
}

function displaySkipTest(testId: string): void {
  describe(testId, () => {
    it.skip(testId, () => {
      //
    });
  });
}

export function readdirSyncSpec(dirpath: string): string[] {
  const files = fs.readdirSync(dirpath);
  return files.filter((file) => !ARTIFACT_FILENAMES.has(file));
}
