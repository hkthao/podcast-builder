/**
 * Scene runtime helpers — chia sẻ giữa SceneLayer / Background / Visualizer.
 *
 *  - useScenePlan: fetch plan.json 1 lần (delayRender-safe) → ScenePlan.
 *  - currentSceneIndex: scene đang active tại 1 mốc ms.
 *  - sceneMotionTransform: Ken Burns (zoom/pan) + transition slide/zoom theo
 *    crossfade window → mọi scene "động" + chuyển cảnh có hướng.
 *  - sceneVariant: số 0..3 deterministic theo scene index → để Background /
 *    Visualizer đổi layout theo scene.
 */
import { useEffect, useRef, useState } from "react";
import {
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
} from "remotion";
import type { Scene, ScenePlan } from "../scenes";

export const CROSSFADE_MS = 1000;
/** Số biến thể layout cho Background/Visualizer. */
export const SCENE_VARIANTS = 4;

/** Fetch plan.json 1 lần, an toàn với delayRender khi render. */
export function useScenePlan(planSrc: string | null): ScenePlan | null {
  const [plan, setPlan] = useState<ScenePlan | null>(null);
  const handleRef = useRef<number | null>(null);
  useEffect(() => {
    if (!planSrc) return;
    handleRef.current = delayRender(`scene-plan:${planSrc}`);
    fetch(staticFile(planSrc))
      .then((r) => {
        if (!r.ok) throw new Error(`fetch ${planSrc} ${r.status}`);
        return r.json() as Promise<ScenePlan>;
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
  return plan;
}

/** Index scene active tại `ms` (-1 nếu rỗng). Clamp ra biên cho intro/outro. */
export function currentSceneIndex(scenes: Scene[], ms: number): number {
  if (scenes.length === 0) return -1;
  for (let i = 0; i < scenes.length; i++) {
    if (ms >= scenes[i].startMs && ms < scenes[i].endMs) return i;
  }
  return ms < scenes[0].startMs ? 0 : scenes.length - 1;
}

export const sceneVariant = (index: number): number =>
  ((index % SCENE_VARIANTS) + SCENE_VARIANTS) % SCENE_VARIANTS;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

type KBMode = "in" | "out" | "left" | "right" | "up";
const KB_MODES: KBMode[] = ["in", "out", "left", "right", "up"];

/**
 * Transform tổng cho 1 scene = Ken Burns liên tục (zoom/pan theo progress, mode
 * xoay vòng theo index nên 2 cảnh liền kề chuyển động khác nhau) + micro-scale
 * theo audio + slide vào/ra trong cửa sổ crossfade (transition có hướng).
 */
export function sceneMotionTransform(
  index: number,
  scene: Scene,
  currentMs: number,
  audioLevel: number,
): string {
  const dur = Math.max(1, scene.endMs - scene.startMs);
  const progress = clamp01((currentMs - scene.startMs) / dur);
  const mode = KB_MODES[index % KB_MODES.length];

  // Biên độ nhẹ + chậm: zoom/pan dịu để cảm giác thong dong, không "trôi" mạnh.
  const PAN = 16; // px
  let scale = 1.03;
  let tx = 0;
  let ty = 0;
  switch (mode) {
    case "in":
      scale = lerp(1.0, 1.04, progress);
      break;
    case "out":
      scale = lerp(1.04, 1.0, progress);
      break;
    case "left":
      tx = lerp(PAN, -PAN, progress);
      break;
    case "right":
      tx = lerp(-PAN, PAN, progress);
      break;
    case "up":
      ty = lerp(PAN, -PAN, progress);
      break;
  }

  // Micro-scale theo audio — rất khẽ để không gây cảm giác giật/nhanh.
  scale += clamp01(audioLevel) * 0.005;

  // Transition có hướng: slide vào/ra dịu (cùng phía) + zoom-in rất nhẹ lúc vào.
  const enterT = clamp01((currentMs - scene.startMs) / CROSSFADE_MS);
  const exitT = clamp01((scene.endMs - currentMs) / CROSSFADE_MS);
  const dir = index % 2 === 0 ? 1 : -1;
  tx += (1 - easeOut(enterT)) * 42 * dir;
  tx -= (1 - easeOut(exitT)) * 42 * dir;
  scale *= lerp(0.99, 1, easeOut(enterT));

  return `scale(${scale.toFixed(4)}) translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
}
