/**
 * Asset provider registry. Mỗi provider plug vào đây.
 */
import type { AssetProvider } from "./types";
import { wikimediaProvider } from "./wikimedia";
import { metProvider } from "./met";
import { pexelsProvider } from "./pexels";
import { pixabayProvider } from "./pixabay";
import { coverrProvider } from "./coverr";

export const PROVIDERS: AssetProvider[] = [
  wikimediaProvider,
  metProvider,
  pexelsProvider,
  pixabayProvider,
  coverrProvider,
];

export const PROVIDERS_BY_ID: Record<string, AssetProvider> = Object.fromEntries(
  PROVIDERS.map((p) => [p.info.id, p]),
);

export * from "./types";
