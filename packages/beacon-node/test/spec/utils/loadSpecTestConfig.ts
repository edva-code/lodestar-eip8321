import fs from "node:fs";
import path from "node:path";
import jsyaml from "js-yaml";
import {ChainConfig, chainConfigFromJson} from "@lodestar/config";

export function loadSpecTestConfig(testCaseDir: string): Partial<ChainConfig> {
  const configPath = path.join(testCaseDir, "config.yaml");
  if (!fs.existsSync(configPath)) return {};

  // Parse config scalars as raw strings so byte values such as `0x00000001`
  // keep their leading zeros before passing through `chainConfigFromJson()`.
  // FAILSAFE_SCHEMA produces strings for scalars and preserves arrays/objects
  // (e.g. `BLOB_SCHEDULE`) as-is for `chainConfigFromJson` to deserialize.
  const configJson = jsyaml.load(fs.readFileSync(configPath, "utf8"), {
    schema: jsyaml.FAILSAFE_SCHEMA,
  }) as Record<string, unknown>;

  // Lodestar runs eip8321 vectors as heze, so heze must sign with the EIP-8321 fork version
  if (configJson.EIP8321_FORK_VERSION !== undefined) {
    configJson.HEZE_FORK_VERSION = configJson.EIP8321_FORK_VERSION;
  }

  return chainConfigFromJson(configJson);
}
