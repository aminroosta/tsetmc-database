const { Pool, Client } = require('pg')
const fs = require('fs');
const async_pool = require('tiny-async-pool');
const progress_bar = require('progress');
const zlib = require('zlib');
const util = require('util');
const inflate = util.promisify(zlib.inflate);


const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    /**
     * postgres default database doesn't have password.
     * use the following command to set one.
     * 
     * sudo -u postgres psql
     * \password
     */
    password: 'postgres',
    port: 5432,
});

async function read_json(path) {
   return JSON.parse(
       await fs.promises.readFile(path, 'utf8')
   );
}

async function read_zlib(symbol, date) {
    const path = `db/${symbol}/${date}.zlib`;
    let buffer = await fs.promises.readFile(path);
    buffer = await inflate(buffer);
    return JSON.parse(buffer.toString('utf8'));
}

async function rebuild_schema() {
    await pool.query(`DROP TABLE IF EXISTS tick`);
    await pool.query(`DROP TABLE IF EXISTS orderbook`);
    const durations = ['1d'];
    for(let d of durations) {
        await pool.query(`DROP TABLE IF EXISTS ohlc_${d}`);
    }
    await pool.query(`DROP TABLE IF EXISTS asset`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS asset (
        symbol       VARCHAR(20) PRIMARY KEY NOT NULL,
        name         VARCHAR(100) NOT NULL,
        industry     VARCHAR(100) NOT NULL,
        board        VARCHAR(100) NOT NULL,
        id           VARCHAR(20),
        asset_code   VARCHAR(20),
        group_code   VARCHAR(10),
        symbol_latin VARCHAR(20),
        name_latin   VARCHAR(100)
      )`
    );
    for(let d of durations) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS ohlc_${d} (
            symbol  VARCHAR(20) NOT NULL,
            date    TIMESTAMP WITHOUT TIME ZONE NOT NULL,
            open    NUMERIC NOT NULL, 
            high    NUMERIC NOT NULL, 
            low     NUMERIC NOT NULL, 
            close   NUMERIC NOT NULL, 
            volume  NUMERIC NOT NULL,
            final   NUMERIC, 
            count   NUMERIC,
            value   NUMERIC,
            PRIMARY KEY (symbol, date),
            FOREIGN KEY (symbol) REFERENCES asset(symbol)
          )
        `);
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tick (
        symbol  VARCHAR(20) NOT NULL,
        date    TIMESTAMP WITHOUT TIME ZONE NOT NULL,
        volume  NUMERIC NOT NULL DEFAULT 0,
        price   NUMERIC NOT NULL,
        PRIMARY KEY (symbol, date),
        FOREIGN KEY (symbol) REFERENCES asset(symbol)
      )`
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orderbook (
        symbol  VARCHAR(20) NOT NULL,
        date    TIMESTAMP WITHOUT TIME ZONE NOT NULL,
        bid     NUMERIC NOT NULL DEFAULT 0,
        ask     NUMERIC NOT NULL,
        PRIMARY KEY (symbol, date),
        FOREIGN KEY (symbol) REFERENCES asset(symbol)
      )`
    );
}

async function insert_assets(assets) {
    await async_pool(5, assets, async a => {
        await pool.query(`
          INSERT INTO asset (
            symbol, name, industry, board, id, asset_code,
            group_code, symbol_latin, name_latin
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
              a.symbol, a.name, a.industry, a.board, a.id, a.asset_code,
              a.group_code, a.symbol_latin, a.name_latin
          ]
        );
    });
    console.log(`inserted ${assets.length} assets`);
}

async function insert_ohlc_1d(assets) {
    let bar = new progress_bar(
        'ohld_1d :bar :current/:total :symbol',
        { total: assets.length, width: 40 }
    );
    await async_pool(20, assets, async a => {
        const ohlc_1d = await read_json(`db/${a.symbol}/history.json`);
        for(let v of ohlc_1d) {
            await pool.query({
                name: 'insert-ohlc-1d',
                text: `
                  INSERT INTO ohlc_1d (
                    symbol, date, open, high, low, close,
                    volume, final, count, value
                  ) values (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
                  )`,
                values: [
                    a.symbol, v.date, v.open, v.high, v.low, v.close,
                    v.volume, v.final, v.count, v.value
                ]
            });
        }
        bar.tick(a);
    });
    console.log();
}

async function insert_intraday(assets) {
    const intraday = [];
    await async_pool(5, assets, async a => {
        const files = await fs.promises.readdir(`db/${a.symbol}/`);
        const dates = files.filter(f => f.endsWith('.zlib'))
            .map(f => ({
                date: f.split('.')[0],
                symbol: a.symbol
            }));
        intraday.push(...dates);
    });

    let bar = new progress_bar(
        'intraday :bar :current/:total :symbol :date',
        { total: intraday.length, width: 40 }
    );

    await async_pool(20, intraday, async day => {
        const { order_book, trades} = await read_zlib(day.symbol, day.date);
        order_book.sort((a,b) => a.time > b.time ? +1 : a.time < b.time ? -1 : 0);
        trades.sort((a,b) => a.time > b.time ? +1 : a.time < b.time ? -1 : 0);

        // sum the trades with the same time
        const ticks = [];
        let last = null;
        for(let trade of trades) {
            if(last && last.time === trade.time) {
                last.volume += trade.volume;
                last.price = trade.price;
            } else {
                last = trade;
                ticks.push(last);
            }
        }

        // filter duplicate orderbooks and 
        // those with ask = 0 or bid = 0
        const orders = order_book.filter((_, idx) => {
            return idx === order_book.length - 1 ||
                order_book[idx].time !== order_book[idx+1].time;
        }).filter(order => order.ask || order.bid);


        // insert ticks
        if(ticks.length) {
            await pool.query(
                `INSERT INTO tick (symbol, date, volume, price)
                VALUES ${ticks.map(
                    tick => `('${day.symbol}','${day.date} ${tick.time}',${tick.volume},${tick.price})`
                ).join(',')}`
            );
        }

        // insert orders
        if(orders.length) {
            await pool.query(
                `INSERT INTO orderbook (symbol, date, ask, bid)
              VALUES ${orders.map(
                  order => `('${day.symbol}','${day.date} ${order.time}',${order.ask},${order.bid})`
              ).join(',')}`
            );
        }

        bar.tick(day);
    });
    console.log();
}

async function main() {
    await rebuild_schema();

    const assets = await read_json('db/assets.json');
    await insert_assets(assets);

    await insert_ohlc_1d(assets);
    await insert_intraday(assets);

    await pool.end();
}

main();
