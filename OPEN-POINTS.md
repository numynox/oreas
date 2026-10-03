# Open points

## Offline: app shell & map tiles

- Add a **service worker** that caches the app shell (`index.html`, JS/CSS assets, favicon, MapLibre worker) so Oreas starts without a network connection.
- **Cache-as-you-go for map tiles**: runtime-cache OpenFreeMap requests (style JSON, vector tiles, glyphs, sprites) so every area that was viewed once keeps working offline.
- Optional **"Download Japan for offline"** button: pre-fetch Japan at low/medium zoom (≈ z0–10) plus higher zooms around each activity (order of tens of MB). Show progress and storage use in Settings next to the existing image stats.

## Installable app & persistent storage

- Add a **web app manifest** (name, icons, theme color, `display: standalone`) so Oreas can be installed to the home screen.
- Call `navigator.storage.persist()` (e.g. after "Download everything for offline") so the browser does not evict cached data and images; show the persistence state in Settings. Note: Safari may evict storage of non-installed sites after ~7 days without use – installing to the home screen avoids that.
