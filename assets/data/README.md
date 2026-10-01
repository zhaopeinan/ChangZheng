# Data directory · 数据目录

Datasets in this folder are **not published** to the public GitHub repository.

本目录中的数据集**不会**随公开仓库分发。

Typical local files (for maintainers):

| File | Role |
| --- | --- |
| `gates.json` | Gate copy, science cards, decisions |
| `map-geometry.json` | Route / gate pixel geometry |
| `jiajinshan-terrain.json` | 3D terrain metadata |
| `jiajinshan-heights.js` | Inline elevation fallback for `file://` |
| `data.js` | Bundled inline payload for offline open |

Also kept local (see root `.gitignore`):

- `assets/img/map-base-*.jpg` — MNR standard basemap tiers
- `assets/img/jiajinshan-height.png` — SRTM height raster

**Live demo:** https://changzheng.zhaopeinan.com

If you are cloning the public repo, use the live demo to experience the full work. Maintainers who need the private datasets should restore them from their offline backup before local preview.
