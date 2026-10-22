import type { CardDefinition, Finish } from "../game/types";
import { imageUrl } from "../game/catalogue";
export const CARD_BACK_URL = "https://images.pokemontcg.io/card-back.png";
const objectUrls = new Map<string, string>();
export function cardImageSources(card: CardDefinition, finish?: Finish) {
  const base = finish && card.finishImages?.[finish];
  const url = base ? `${base}/low.webp` : imageUrl(card);
  return [
    ...new Set([objectUrls.get(url), url].filter((s): s is string => !!s)),
  ];
}
const pending = new Map<string, Promise<boolean>>();
function preload(url: string) {
  if (!pending.has(url))
    pending.set(
      url,
      new Promise<boolean>((resolve) => {
        const image = new Image();
        const timer = window.setTimeout(() => {
          pending.delete(url);
          resolve(false);
        }, 6000);
        image.onload = () => {
          clearTimeout(timer);
          resolve(true);
        };
        image.onerror = () => {
          clearTimeout(timer);
          pending.delete(url);
          resolve(false);
        };
        image.src = url;
      }),
    );
  return pending.get(url)!;
}
export async function preloadCard(card: CardDefinition) {
  void preload(CARD_BACK_URL);
  if (card.image) await preload(cardImageSources(card)[0]);
  // High resolution upgrades progressively and never delays a reveal.
}
export type ThumbnailProgress = { done: number; total: number; failed: number };
let warming: Promise<void> | undefined;
const listeners = new Set<(p: ThumbnailProgress) => void>();
let progress: ThumbnailProgress = { done: 0, total: 0, failed: 0 };
/** Cache only tiny catalogue scans. Six workers keep memory and network use bounded. */
export function warmThumbnails(
  cards: CardDefinition[],
  report: (p: ThumbnailProgress) => void,
) {
  listeners.add(report);
  report(progress);
  if (!warming)
    warming = (async () => {
      const urls = [...new Set(cards.map((c) => imageUrl(c)).filter(Boolean))];
      progress = { done: 0, total: urls.length, failed: 0 };
      let cache: Cache | undefined;
      try {
        cache = await caches.open("packmini-thumbnails-v1");
      } catch {}
      let cursor = 0;
      await Promise.all(
        Array.from({ length: 6 }, async () => {
          while (cursor < urls.length) {
            const url = urls[cursor++];
            let ok = false;
            for (let attempt = 0; attempt < 2 && !ok; attempt++)
              try {
                let response = await cache?.match(url);
                if (!response) {
                  response = await fetch(url, {
                    signal: AbortSignal.timeout(5000),
                  });
                  if (
                    !response.ok ||
                    !response.headers.get("content-type")?.startsWith("image/")
                  )
                    throw Error("Missing thumbnail");
                  try {
                    await cache?.put(url, response.clone());
                  } catch {}
                }
                const blob = await response.blob();
                objectUrls.set(url, URL.createObjectURL(blob));
                ok = true;
              } catch {}
            progress = {
              ...progress,
              done: progress.done + 1,
              failed: progress.failed + (ok ? 0 : 1),
            };
            listeners.forEach((fn) => fn(progress));
          }
        }),
      );
    })();
  return () => listeners.delete(report);
}
