import fs from "fs/promises";
export default async () => {
    let data = await fetch("https://api.carbonmod.gg/meta/rust/items.json");
    await fs.writeFile("./items.json", await data.text(), "utf-8");
}
//https://cdn.carbonmod.gg/items/ <= / 'short.name' .png = image
