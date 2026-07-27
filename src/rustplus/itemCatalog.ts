export interface ItemDef {
    name: string;
    shortName: string;
}

let itemCatalog: Map<number, ItemDef> | null = null;

/** Cached lookup of Rust's item definitions (id -> display/short name), loaded from `items.json`. */
export async function getItemCatalog(): Promise<Map<number, ItemDef>> {
    if (itemCatalog) return itemCatalog;
    const raw = (await Bun.file("./items.json").json()) as { Id: number; DisplayName: string; ShortName: string }[];
    itemCatalog = new Map(raw.map(i => [i.Id, { name: i.DisplayName, shortName: i.ShortName }]));
    return itemCatalog;
}
