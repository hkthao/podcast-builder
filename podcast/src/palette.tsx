/**
 * Bảng màu khung video theo series — Video.tsx bọc PaletteProvider, các thành phần
 * khung (Intro/Hook/Outro/Background/Watermark/Captions/EditorialOverlay/Visualizer)
 * đọc màu qua usePalette() thay vì COLORS cố định. Cảnh sticker giữ COLORS (ByteCast).
 */
import { createContext, useContext } from "react";
import { COLORS } from "./theme";
import { getSeries, type SeriesPalette } from "./series";

const PaletteContext = createContext<SeriesPalette>(COLORS);

export const PaletteProvider = PaletteContext.Provider;
export const usePalette = (): SeriesPalette => useContext(PaletteContext);
export const paletteFor = (series: string | null | undefined): SeriesPalette =>
  getSeries(series).palette ?? COLORS;
