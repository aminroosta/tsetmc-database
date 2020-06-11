const fs = require('fs');
const api = require('tsetmc-api');
const async_pool = require('tiny-async-pool');
const progress_bar = require('progress');
const util = require('util');
const zlib = require('zlib');
const deflate = util.promisify(zlib.deflate);

async function update_intraday() {
    // get the list of symbols
    const assets = JSON.parse(fs.readFileSync("db/assets.json", "utf-8"));

    // update the history
    var bar = new progress_bar('intraday :bar :current/:total :symbol', { total: assets.length, width: 60 });
    async_pool(1, assets, async (asset) => {
        await intraday(asset);
        bar.tick(asset);
    });
}

console.log("running ...");
update_intraday().catch(e => console.error(e));

async function intraday({id, symbol}) {
    let history = JSON.parse(
        fs.readFileSync(`db/${symbol}/history.json`, 'utf-8')
    );

    // filter out existing intraday dates.
    history = history.filter(day => !fs.existsSync(`db/${symbol}/${day.date}.zlib`));

    if(!history.length) { return; }

    // update remaining/new intraday dates
    var bar = new progress_bar(`${symbol} :bar failed=:failed :current/:total :date`, { total: history.length, width: 60 });
    let failed = 0;
    await async_pool(40, history, async (day) => {
        try {
            const intraday = await api.intraday(id, day.date);
            // compress intraday data
            const buffer = new Buffer(JSON.stringify(intraday), 'utf8');
            const input = await deflate(buffer);
            // write to disk
            await fs.promises.writeFile(`db/${symbol}/${day.date}.zlib`, input);
        } catch {
            ++failed;
        }
        bar.tick({date: day.date, failed});
    });
}
