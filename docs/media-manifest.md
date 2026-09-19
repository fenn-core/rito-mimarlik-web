# Rito Mimarlık media manifest

`assets/media/` is the authoritative media root. The static pages keep their
existing `data-media-slot` hooks; [`js/media.js`](../js/media.js) is the single
explicit data layer that maps those slots and project gallery entries to the
processed files.

## Rendered slots

| Slot ID | Route | Purpose | Layout | Loading policy |
| --- | --- | --- | --- | --- |
| `home-hero` | `/` | Primary hero | 16:9 | Eager, `fetchpriority="high"`; never lazy |
| `home-noise-barrier` | `/` | Specialization image | 16:9 | Lazy, async |
| `home-project-01` | `/` | Homepage project card 01 | 16:9 | Lazy, async |
| `home-project-02` | `/` | Homepage project card 02 | 16:9 | Lazy, async |
| `home-project-03` | `/` | Homepage project card 03 | 16:9 | Lazy, async |
| `projects-index-01` | `/projects/` | Project 01 gallery | 16:9 | Lazy, async |
| `projects-index-02` | `/projects/` | Project 02 gallery | 16:9 | Lazy, async |
| `projects-index-03` | `/projects/` | Project 03 gallery | 16:9 | Lazy, async |
| `projects-index-04` | `/projects/` | Galataport consultancy artwork | 16:9 | Lazy, async |
| `noise-barriers-hero` | `/noise-barriers/` | Primary hero | 16:9 | Eager, `fetchpriority="high"`; never lazy |
| `noise-barriers-showcase-wide` | `/noise-barriers/` | Wide showcase | 16:9 | Lazy, async |
| `noise-barriers-showcase-detail` | `/noise-barriers/` | Detail showcase | 16:9 | Lazy, async |
| `noise-barriers-showcase-site` | `/noise-barriers/` | Site showcase | 16:9 | Lazy, async |

## Baseline assets

All entries below require both `.avif` and `.webp` variants.

| Area | Logical assets |
| --- | --- |
| Homepage | `home/home-hero`, `home/home-noise-barrier`, `home/home-project-01`, `home/home-project-02`, `home/home-project-03` |
| Noise barriers | `noise-barriers/noise-barriers-hero`, `noise-barriers/noise-barriers-showcase-wide`, `noise-barriers/noise-barriers-showcase-detail`, `noise-barriers/noise-barriers-showcase-site` |
| Projects | `projects/projects-index-01`, `projects/projects-index-01-01`, `projects/projects-index-02`, `projects/projects-index-02-01`, `projects/projects-index-02-02`, `projects/projects-index-03`, `projects/projects-index-03-01` |
| Generated | `generated/consultancy-placeholder` |

## Current project order and mapping

The current authoritative order in `/projects/` is:

| Index | Project | Media |
| ---: | --- | --- |
| 01 | Marmaray Pendik–Çerkezköy Banliyö Hattı | `projects-index-01`, `projects-index-01-01` |
| 02 | Pendik–Halkalı Banliyö Hattı — Haydarpaşa Tarihi Köprü Korkuluk Bariyeri | `projects-index-02`, `projects-index-02-01`, `projects-index-02-02` |
| 03 | Acun Medya Alaçatı | `projects-index-03`, `projects-index-03-01` |
| 04 | Galataport İstanbul | `generated/consultancy-placeholder` only; generic consultancy artwork, not documentary photography |

Homepage `home-project-01..03` follows the first three cards in this same
corrected order. `home-project-02` is Haydarpaşa, not Galataport.

## Delivery policy

Use semantic AVIF-first/WebP-fallback `<picture>` markup. Heroes are eager and
use `fetchpriority="high"`; below-the-fold images are lazy and async. All
images retain 16:9 intrinsic dimensions and existing fit/position overrides.

Project galleries use horizontal scroll-snap with native touch/swipe, desktop
previous/next buttons, keyboard-accessible controls, reduced-motion support,
and no autoplay or infinite loop. A cover-only project renders as one image
without controls.

Run `node scripts/validate-media.mjs` after changes. The validator checks the
baseline inventory, AVIF/WebP pairs, project naming and numeric gallery suffixes,
runtime media mapping, and markup/media-hook integrity.
