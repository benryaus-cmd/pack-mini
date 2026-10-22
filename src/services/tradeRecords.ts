import {
  tradeDigest,
  tradeRecordId,
  type TradeTerms,
  type TradeJournal,
} from "../game/trading.ts";
type RecordValue = { data: TradeJournal; owner?: string; revision: number };
type Request = (path: string, options?: RequestInit) => Promise<any>;
const spaces = ["trading", "social"] as const;
const code = (e: unknown) => (e as { status?: number })?.status;
export class TradeRecordError extends Error {
  definitive: boolean;
  constructor(message: string, definitive = false) {
    super(message);
    this.definitive = definitive;
  }
}
/** Both stores are existing generic JSON namespaces. A missing record is normal;
 * a rejected write is not a confirmation. Never fall back on auth/timeout errors. */
export class TradeRecords {
  private request: Request;
  constructor(request: Request) {
    this.request = request;
  }
  private async records(id: string, player: string) {
    const rows: { namespace: (typeof spaces)[number]; record: RecordValue }[] =
      [];
    for (const namespace of spaces) {
      try {
        const result = await this.request(
          `/data/${namespace}/${tradeRecordId(id, player)}`,
        );
        const record = result.record as RecordValue | undefined;
        if (!record?.data) continue;
        if (record.owner && record.owner !== player)
          throw new TradeRecordError(
            "Trade record belongs to a different collector.",
          );
        const data = record.data;
        if (
          data.id !== id ||
          !Array.isArray(data.parties) ||
          !data.parties.includes(player) ||
          !data.offers ||
          !["ready", "cancelled", "completed"].includes(data.status) ||
          data.digest !== tradeDigest(data)
        )
          throw new TradeRecordError(
            "Trade record could not be verified. Your cards remain reserved.",
          );
        rows.push({ namespace, record });
      } catch (e) {
        if (code(e) !== 404 && code(e) !== 405) throw e;
      }
    }
    if (
      rows.length > 1 &&
      rows.some((r) => r.record.data.digest !== rows[0].record.data.digest)
    )
      throw new TradeRecordError(
        "Trade records disagree. Your cards remain reserved.",
      );
    return rows.sort(
      (a, b) =>
        ({ ready: 0, cancelled: 1, completed: 2 })[b.record.data.status] -
        { ready: 0, cancelled: 1, completed: 2 }[a.record.data.status],
    );
  }
  async read(id: string, player: string): Promise<RecordValue | null> {
    return (await this.records(id, player))[0]?.record ?? null;
  }
  async write(
    terms: TradeTerms,
    player: string,
    status: TradeJournal["status"],
  ) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const records = await this.records(terms.id, player);
      const prior = records[0];
      const digest = tradeDigest(terms);
      if (prior) {
        if (prior.record.data.digest !== digest)
          throw new TradeRecordError(
            "Trade terms changed. Please review the cards again.",
          );
        if (
          prior.record.data.status === "completed" ||
          prior.record.data.status === status
        )
          return prior.record;
        if (prior.record.data.status === "cancelled")
          throw new TradeRecordError("This trade was cancelled.");
        if (status === "cancelled")
          throw new TradeRecordError(
            "Confirmation is already saved; wait for the trade to complete.",
          );
      }
      let conflict = false;
      const candidates = prior ? [prior.namespace] : [...spaces];
      for (const namespace of candidates) {
        const existing = records.find((r) => r.namespace === namespace)?.record;
        const data: TradeJournal = { ...terms, digest, status, at: Date.now() };
        try {
          const result = await this.request(
            `/data/${namespace}/${tradeRecordId(terms.id, player)}`,
            {
              method: "PUT",
              body: JSON.stringify({
                data,
                expectedRevision: existing?.revision ?? 0,
              }),
            },
          );
          return (result.record ?? {
            data,
            owner: player,
            revision: (existing?.revision ?? 0) + 1,
          }) as RecordValue;
        } catch (e) {
          if (code(e) === 409) {
            conflict = true;
            break;
          }
          if (code(e) !== 404 && code(e) !== 405) throw e;
        }
      }
      if (conflict) continue;
      throw new TradeRecordError(
        "Trade could not be saved: storage is unavailable. No cards were exchanged.",
        !prior,
      );
    }
    throw new TradeRecordError(
      "Trade changed while saving. Retry after reviewing the cards.",
    );
  }
}
