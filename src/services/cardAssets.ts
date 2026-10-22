import type { CardDefinition } from "../game/types";
import { imageUrl } from "../game/catalogue";

// The official international Pokémon TCG reverse, served by Pokémon TCG API.
export const CARD_BACK_URL = "https://images.pokemontcg.io/card-back.png";
export function cardImageSources(card: CardDefinition) {
  return [
    ...new Set(
      [imageUrl(card), card.image && `${card.image}/low.webp`].filter(Boolean),
    ),
  ];
}
const pending = new Map<string, Promise<boolean>>();
function preload(url: string) {
  if (!pending.has(url))
    pending.set(
      url,
      new Promise<boolean>((resolve) => {
        const image = new Image();
        const timer = window.setTimeout(() => resolve(false), 8000);
        image.onload = () => {
          window.clearTimeout(timer);
          resolve(true);
        };
        image.onerror = () => {
          window.clearTimeout(timer);
          resolve(false);
        };
        image.src = url;
      }),
    );
  return pending.get(url)!;
}
/** Load both actual CDN resolutions, even when a build advertises missing local files. */
export async function preloadCard(card: CardDefinition) {
  void preload(CARD_BACK_URL);
  if (!card.image) return;
  await Promise.allSettled([
    ...cardImageSources(card).map(preload),
    preload(`${card.image}/high.webp`),
  ]);
}
