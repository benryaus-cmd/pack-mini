import type { CSSProperties } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { heroCard, imageUrl } from "../game/catalogue";
import type { SetDefinition } from "../game/types";
export function BoosterPack({
  set,
  small = false,
  rip = 0,
  count = 5,
}: {
  set: SetDefinition;
  small?: boolean;
  rip?: number;
  count?: number;
}) {
  const hero = heroCard(set);
  return (
    <div
      className={`booster ${small ? "small" : ""}`}
      style={{ "--pack-color": set.color, "--rip": rip } as CSSProperties}
    >
      <div className="pack-cap">
        <span>PACK MINI® · COLLECTOR SERIES</span>
      </div>
      <div className="pack-face">
        <div className="pack-brand">
          <Sparkles size={16} />
          <b>PACK MINI</b>
        </div>
        <small className="pack-era">{set.era.toUpperCase()} COLLECTION</small>
        <div className="pack-art">
          {hero.image && <img src={imageUrl(hero)} alt="" draggable={false} />}
          <div className="pack-orbit" />
          <Sparkles className="pack-star" />
        </div>
        <div className="pack-title">{set.title}</div>
        <span className="pack-rule" />
        <small className="pack-footer">{count} CARDS · ELEVEN FAVOURITES</small>
      </div>
      <div className="pack-seal" />
      <div className="pack-shine" />
      {!small && (
        <div className="tear-guide">
          <span>RIP HERE</span>
          <ArrowRight size={16} />
        </div>
      )}
    </div>
  );
}
