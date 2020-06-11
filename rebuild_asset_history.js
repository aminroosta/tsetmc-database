const fs = require('fs');
const api = require('tsetmc-api');
const async_pool = require('tiny-async-pool');
const progress_bar = require('progress');

const UPDATE_HISTORY = true;

async function rebuild_asset_history() {
    fs.existsSync("db") || fs.mkdirSync("db");

    // get the list of symbols
    const assets = await api.assets();
    fs.writeFileSync("db/assets.json", JSON.stringify(assets, null, 1), "utf-8");

    // update the history
    var bar = new progress_bar('history :bar :current/:total :symbol', { total: assets.length, width: 60 });
    async_pool(5, assets, async (asset) => {
        await messages(asset, UPDATE_HISTORY);
        bar.tick(asset);
    });
}

console.log("running ...");
rebuild_asset_history()
.catch(e => console.error(e));

async function messages(asset, force) {
    const dir = `db/${asset.symbol}`;
    const file = `db/${asset.symbol}/history.json`;

    if(!force && fs.existsSync(file)) { return; }

    const history = await api.history(asset.id);
    fs.existsSync(dir) || fs.mkdirSync(dir);
    await fs.promises.writeFile(file, JSON.stringify(history, null, 1), "utf-8");
}
