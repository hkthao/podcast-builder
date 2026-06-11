import { AbsoluteFill } from "remotion";
import { COLORS } from "../theme";

export const Background: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 35%, ${COLORS.bgLayer} 0%, ${COLORS.bg} 65%)`,
      }}
    />
  );
};
