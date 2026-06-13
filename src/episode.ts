import { z } from "zod";
import { MOOD_ACCENTS, SCENE_TYPES } from "./theme";

export const MoodKeySchema = z.enum(
  Object.keys(MOOD_ACCENTS) as [keyof typeof MOOD_ACCENTS, ...Array<keyof typeof MOOD_ACCENTS>],
);

export const SceneTypeSchema = z.enum(SCENE_TYPES);

export const SceneOverrideSchema = z.object({
  startMs: z.number().nonnegative(),
  mood: MoodKeySchema.optional(),
  sceneType: SceneTypeSchema.optional(),
});

export const EpisodeConfigSchema = z.object({
  title: z.string().min(1, "title không được để trống"),
  hook: z.string().nullable().default(null),
  episodeNumber: z.number().int().positive(),
  moodOverride: MoodKeySchema.nullable().default(null),
  bgm: z.string().nullable().default(null),
  bgmVolumeDb: z.number().default(-28),
  showIntro: z.boolean().default(true),
  showOutro: z.boolean().default(true),
  sceneOverrides: z.array(SceneOverrideSchema).nullable().default(null),
  /** ID essay đã dùng làm input cho NotebookLM. Traceability. */
  essayId: z.string().nullable().default(null),
});

export type EpisodeConfig = z.infer<typeof EpisodeConfigSchema>;

export const buildEpisodeTemplate = (name: string): EpisodeConfig => ({
  title: name,
  hook: null,
  episodeNumber: 1,
  moodOverride: null,
  bgm: null,
  bgmVolumeDb: -28,
  showIntro: true,
  showOutro: true,
  sceneOverrides: null,
  essayId: null,
});
