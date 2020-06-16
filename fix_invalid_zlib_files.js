const fs = require('fs');
const async_pool = require('tiny-async-pool');
const progress_bar = require('progress');
const zlib = require('zlib');
const util = require('util');
const inflate = util.promisify(zlib.inflate);
const api = require('tsetmc-api');
const deflate = util.promisify(zlib.deflate);

async function read_json(path) {
   return JSON.parse(
       await fs.promises.readFile(path, 'utf8')
   );
}

/**
 * In case `.zlib` files are corrupted, this script tries to fix them.
 * This could happen if you kill the "update_intraday.js" process.
 */
async function main() {
    const assets = await read_json('db/assets.json');

    const intraday = [];
    await async_pool(5, assets, async a => {
        const files = await fs.promises.readdir(`db/${a.symbol}/`);
        const dates = files.filter(f => f.endsWith('.zlib'))
            .map(f => ({
                date: f.split('.')[0],
                symbol: a.symbol,
                id: a.id
            }));
        intraday.push(...dates);
    });

    let bar = new progress_bar(
        'intraday :bar :failed :current/:total :symbol :date',
        { total: intraday.length, width: 40 }
    );

    let failed = 0;
    await async_pool(30, intraday, async day => {
        const path = `db/${day.symbol}/${day.date}.zlib`;
        try {
            let buffer = await fs.promises.readFile(path);
            buffer = await inflate(buffer);
        } catch(e) {
            ++failed;
            const intraday = await api.intraday(day.id, day.date);
            const buffer = new Buffer(JSON.stringify(intraday), 'utf8');
            const input = await deflate(buffer);
            await fs.promises.writeFile(path, input);
            console.log('\nupdated -> ', day);
        }

        bar.tick({symbol: day.symbol, date: day.date, failed});
    });
}

main();
