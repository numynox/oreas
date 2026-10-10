# Test fixtures

`airtable-base.json` is a complete mock Airtable base: the exact responses of the Airtable API for the
schema (`GET /v0/meta/bases/{baseId}/tables`) and the records of both tables. Every field Oreas knows is
present, so nothing shows up as unmapped.

- **Activities** (`tblActs`): 42 activities, 6 around each of 7 places in Japan (Tokyo, Hakone, Matsumoto,
  Kanazawa, Kyoto, Nara, Osaka), with type, region, status, priority, access, duration, cost, booking,
  link and notes. Every other activity has an image.
- **Itinerary** (`tblDays`): 16 days, 7 overnight stops with coordinates, train travel between stops,
  2–3 linked activities per day, notes and photo spots.
- Dates are `{{today±N}}` tokens: the trip starts 4 days ago, so **today is day 5** (Hakone).
- Image URLs point to `https://dl.airtable.test/…`; serve `photo.jpg` for all of them.

`airtable.mjs` resolves the dates and installs the mock in a [Playwright](https://playwright.dev) browser
context (Airtable API routes, images, and the base ID + a dummy token in the app settings):

```js
import { chromium, devices } from 'playwright';
import { installAirtableMock } from './tests/fixtures/airtable.mjs';

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'] });
const fixture = await installAirtableMock(context);
const page = await context.newPage();
await page.goto('http://localhost:5173/#itinerary'); // npm run dev (or npm run build && npm run preview)
```

To edit the data, change the JSON directly (record and field IDs must stay consistent between the schema,
the records and the itinerary's linked `Activities`).
