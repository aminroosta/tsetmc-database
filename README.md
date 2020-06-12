<h1 dir="rtl">
دیتابیس tsetmc.ir
</h1>

<p dir="rtl">
این ریپازیتوی شامل قیمت های روزانه هر نماد و همچنین ریز عرضه و تقاضا برای تمامی نماد ها میباشد
<br/>
ساختار فولدر ها بصورت زیر است
</p>

```js
// لیست تمامی نماد ها
`/db/assets.json`
// [
//  {
//      id: 'loader.aspx?ParTree=111C1412&inscode=32338211917133256',
//      asset_code: 'IRR1YASA0101',
//      group_code: 'N2',
//      industry: 'لاستيك و پلاستيك',
//      board: 'فهرست اوليه',
//      symbol_latin: 'YASX1',
//      name_latin: 'Iran Yasa Tire-R',
//      symbol: 'پاساح',
//      name: 'ح . ايران‌ياساتايرورابر'
//  },
//  ...
//]
```

```js
// سابقه ی نماد - شامل قیمت های روزانه
`/db/<symbol>/history.json`
// [
//   {
//     tarikh: '۱۳۹۹/۳/۱۰',     // تاریخ به فارسی
//     date: '2020-05-30',      // تاریخ به میلادی
//     count: 19256,            // تعداد
//     volume: 239302335,       // حجم معاملات
//     value: 2174536324247,    // ارزش معاملات
//     open: 9087,              // اولین قیمت
//     high: 9087,              // بیشترین قیمت
//     low: 9080,               // کمترین قیمت
//     close: 9087,             // قیمت آخرین معامله
//     final: 9087              // قیمت پایانی
//   },
//   ...
// ]
```

<p dir='rtl'>
ریز خرید و فروش نماد ها، بدیل حجم بسیار زیاد، با <a href="https://nodejs.org/api/zlib.html">zlib</a> فشرده شده اند.
</p>

```js
// ریز خرید و فروش هر نماد
`/db/<symbol>/<YYYY-MM-DD>.zlib`
```

<p dir="rtl">
برای خواندن این فایل ها از تکه کد پایین اسفتاده کنید
</p>

```js
const zlib = require('zlib');
const fs = require('fs');
const util = require('util');
const inflate = util.promisify(zlib.inflate);

async function read_zlib(symbol, date) {
    const path = `db/${symbol}/${date}.zlib`;
    let buffer = await fs.promises.read(path);
    buffer = await inflate(buffer);
    return JSON.parse(buffer.toString('utf8'));
}

const symobl = 'آپ';
const date = '2020-06-10';
await read_zlib(symbol, date);
// {
//   spot_prices: [                // اخرین قیمت و قیمت نهایی
//     {
//         "time": "09:02:22",     // زمان
//         "close": 7452,          // آخرین قیمت
//         "final": 7722           // قیمت نهایی
//     },
//     ...
//   ],
//   trades: [                     // معاملات
//     {
//       "time": "09:02:27",       // زمان
//       "volume": 872,            // تعداد
//       "price": 8001             // قیمت
//     },
//      ...
//   ],
//   order_book: [                 // عرضه و تقاضا
//     {
//         "time": "08:48:13",     // زمان
//         "bid": 8390,            // خرید
//         "ask": 8390             // فروش
//     },
//     ...
//   ]
// }
```

<p dir="rtl">
بدلیل تعداد بالای نماد ها (بیش از 800 نماد) حجم این ریپازیتوری هم اکنون بیشتر از 2 گیگابایت است.
<br/>
اگر تمام فایل تمام نمادها را لازم ندارید، میتوانید از <a href="https://github.com/aminroosta/tsetmc-api">tsetmc-api</a> استفاده کنید
</p>