/**
 * Client operators we do work for.
 *
 * Each becomes its own map layer, filtered from Fiskeridirektoratet's official
 * locality register by licence holder (`til_innehavere`). Sites are often held
 * jointly — the holder field can read "EIDESVIK LAKS AS, LINGALAKS AS, …" — so
 * matching is a case-insensitive *contains*, not equality.
 *
 * To add a client: append an entry. `match` is upper-cased and used verbatim in
 * the register's SQL LIKE, so keep it short and distinctive.
 */
export type ClientOperator = {
  id: string;
  label: string;
  /** Distinctive fragment of the licence-holder name, upper case. */
  match: string;
  /** Layer colour — distinct per client so their sites read at a glance. */
  color: string;
};

export const CLIENT_OPERATORS: ClientOperator[] = [
  { id: "lingalaks", label: "Lingalaks", match: "LINGALAKS", color: "#4ea8de" },
  { id: "hardingsmolt", label: "Hardingsmolt", match: "HARDINGSMOLT", color: "#f4a261" },
  { id: "eidesvik", label: "Eidesvik Laks", match: "EIDESVIK LAKS", color: "#c77dff" },
  { id: "tombre", label: "Tombre Fiskeanlegg", match: "TOMBRE", color: "#80ed99" },
];

export function clientById(id: string): ClientOperator | undefined {
  return CLIENT_OPERATORS.find((c) => c.id === id);
}

/** Catalog layer id for a client, e.g. "client:lingalaks". */
export function clientLayerId(c: ClientOperator): `client:${string}` {
  return `client:${c.id}`;
}

/** Extract the client from a catalog layer id, if it is one. */
export function clientFromLayerId(layerId: string): ClientOperator | undefined {
  return layerId.startsWith("client:") ? clientById(layerId.slice("client:".length)) : undefined;
}
