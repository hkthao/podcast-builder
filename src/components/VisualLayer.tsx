import { useEffect, useMemo, useRef, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { VisualPlan, VisualScene } from "../visualPlan";
import { AiImage } from "./visuals/AiImage";
import { PlaceholderScene } from "./visuals/PlaceholderScene";

type Props = {
  planSrc: string | null;
  /** Map: imageHash → filename trong public/ (vd "scene-abc123.png").
   * Truyền vào để VisualLayer biết ảnh nào đã có cache. */
  availableImages: Record<string, string>;
};

const CROSSFADE_MS = 1200;

export const VisualLayer: React.FC<Props> = ({ planSrc, availableImages }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [plan, setPlan] = useState<VisualPlan | null>(null);
  const handleRef = useRef<number | null>(null);

  useEffect(() => {
    if (!planSrc) return;
    handleRef.current = delayRender(`visual-plan:${planSrc}`);
    fetch(staticFile(planSrc))
      .then((r) => {
        if (!r.ok) throw new Error(`fetch ${planSrc} ${r.status}`);
        return r.json() as Promise<VisualPlan>;
      })
      .then((p) => {
        setPlan(p);
        if (handleRef.current !== null) continueRender(handleRef.current);
      })
      .catch((e: unknown) => {
        if (handleRef.current !== null) cancelRender(e);
      });
    return () => {
      if (handleRef.current !== null) continueRender(handleRef.current);
    };
  }, [planSrc]);

  const currentMs = useMemo(() => (frame / fps) * 1000, [frame, fps]);

  if (!plan) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {plan.scenes.map((scene) => {
        const enter = interpolate(
          currentMs,
          [scene.startMs - CROSSFADE_MS / 2, scene.startMs + CROSSFADE_MS / 2],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const exit = interpolate(
          currentMs,
          [scene.endMs - CROSSFADE_MS / 2, scene.endMs + CROSSFADE_MS / 2],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const opacity = Math.min(enter, exit);
        if (opacity <= 0.001) return null;

        const sceneDuration = scene.endMs - scene.startMs;
        const elapsed = Math.max(0, currentMs - scene.startMs);
        const progress = Math.min(1, elapsed / sceneDuration);

        return (
          <AbsoluteFill key={scene.startMs} style={{ opacity }}>
            <SceneVisual
              scene={scene}
              progress={progress}
              imageSrc={availableImages[scene.imageHash] ?? null}
            />
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

type SceneVisualProps = {
  scene: VisualScene;
  progress: number;
  imageSrc: string | null;
};

const SceneVisual: React.FC<SceneVisualProps> = ({ scene, progress, imageSrc }) => {
  if (imageSrc) {
    const panDir = (scene.index % 4) as 0 | 1 | 2 | 3;
    return <AiImage src={staticFile(imageSrc)} progress={progress} panDir={panDir} />;
  }
  return (
    <PlaceholderScene
      index={scene.index}
      mood={scene.mood}
      prompt={scene.visualPrompt}
      text={scene.text}
      progress={progress}
    />
  );
};
