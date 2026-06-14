/**
 * Asset provider registry. Mỗi provider plug vào đây.
 */
import type { AssetProvider } from "./types";
import { wikimediaProvider } from "./wikimedia";
import { metProvider } from "./met";

export const PROVIDERS: AssetProvider[] = [wikimediaProvider, metProvider];

export const PROVIDERS_BY_ID: Record<string, AssetProvider> = Object.fromEntries(
  PROVIDERS.map((p) => [p.info.id, p]),
);

export * from "./types";
