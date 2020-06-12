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

    const all = [];
    let idxx = 0;
    for(let asset of assets) {
        let history = JSON.parse(
            fs.readFileSync(`db/${asset.symbol}/history.json`, 'utf-8')
        );
        history = history.filter(day => !fs.existsSync(`db/${asset.symbol}/${day.date}.zlib`));
        history.forEach(day => {
            day.symbol = asset.symbol;
            day.id = asset.id;
        });
        all.push(...history);
        console.log(++idxx + '/' + assets.length);
    }

    // console.log(all[0], all.length);
    // return;

    var bar = new progress_bar(`:symbol :bar failed=:failed :current/:total :date`, { total: all.length, width: 60 });
    let failed = 0;
    await async_pool(60, all, async (day) => {
        try {
            const intraday = await api.intraday(day.id, day.date);
            // compress intraday data
            const buffer = new Buffer(JSON.stringify(intraday), 'utf8');
            const input = await deflate(buffer);
            // write to disk
            await fs.promises.writeFile(`db/${day.symbol}/${day.date}.zlib`, input);
        } catch {
            ++failed;
        }
        bar.tick({date: day.date, failed, symbol: day.symbol});
    });
}

console.log("running ...");
update_intraday().catch(e => console.error(e));
