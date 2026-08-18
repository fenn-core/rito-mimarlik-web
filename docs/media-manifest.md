# Rito Mimarlık media manifest

This is the authoritative inventory for real-media insertion. Every `data-media-slot` in public markup appears exactly once below. The current CSS compositions remain active until verified assets replace their placeholder content.

After inserting or changing media, run `node scripts/validate-media.mjs`; the validator reads the slot IDs directly from the first column of the required-media table below.

## A. Required real media

| Slot ID | Route / section | Purpose and priority | Layout / orientation | Future loading | Expected asset | Alt and crop policy | Current hook |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `home-hero` | `/` — hero | Primary company/project image; critical LCP | Wide landscape; fluid desktop field, 16:9 tablet, 4:3 mobile | Eager, `fetchpriority="high"`; never lazy | `assets/media/home/home__hero.webp` plus useful responsive variants | Verified informative alt required; focal position expected | `.hero-visual[data-media-slot="home-hero"]` |
| `home-noise-barrier` | `/` — specialization | Establish noise-barrier work; high | Landscape, crop-safe toward 16:9/4:3 | Lazy, async | `assets/media/home/home__noise-barrier.webp` | Verified alt required unless adjacent final copy fully duplicates the image's meaning; focal position expected | `.noise-visual[data-media-slot="home-noise-barrier"]` |
| `home-project-01` | `/` — selected projects | First verified project card; high | Extra-wide card crop: 2.45:1 desktop, 1.8:1 mobile | Lazy, async | `assets/media/projects/<project-slug>/<project-slug>__card.webp` | Normally `alt=""` when the adjacent verified card title identifies the link; focal position expected | `.project-card-placeholder[data-media-slot="home-project-01"]` |
| `home-project-02` | `/` — selected projects | Second verified project card; high | Same card ratios as above | Lazy, async | Project-directory `__card` asset | Same card policy; focal position expected | `.project-card-placeholder[data-media-slot="home-project-02"]` |
| `home-project-03` | `/` — selected projects | Third verified project card; high | Same card ratios as above | Lazy, async | Project-directory `__card` asset | Same card policy; focal position expected | `.project-card-placeholder[data-media-slot="home-project-03"]` |
| `projects-index-01` | `/projects/` — portfolio index | First verified portfolio entry; high | 16:10 desktop, 4:3 mobile | Lazy, async | `assets/media/projects/<project-slug>/<project-slug>__card.webp` | Usually decorative to the adjacent title (`alt=""`); crop hook expected | `.portfolio-media[data-media-slot="projects-index-01"]` |
| `projects-index-02` | `/projects/` — portfolio index | Second verified portfolio entry; high | 16:10 desktop, 4:3 mobile | Lazy, async | Project-directory `__card` asset | Same portfolio-card policy | `.portfolio-media[data-media-slot="projects-index-02"]` |
| `projects-index-03` | `/projects/` — portfolio index | Third verified portfolio entry; high | 16:10 desktop, 4:3 mobile | Lazy, async | Project-directory `__card` asset | Same portfolio-card policy | `.portfolio-media[data-media-slot="projects-index-03"]` |
| `projects-index-04` | `/projects/` — portfolio index | Fourth verified portfolio entry; high | 16:10 desktop, 4:3 mobile | Lazy, async | Project-directory `__card` asset | Same portfolio-card policy | `.portfolio-media[data-media-slot="projects-index-04"]` |
| `noise-barriers-hero` | `/noise-barriers/` — hero | Primary specialization image; critical route LCP | Wide landscape; fluid desktop, 16:9 tablet, 4:3 mobile | Eager, `fetchpriority="high"`; never lazy | `assets/media/noise-barriers/noise-barrier__hero.webp` plus responsive variants | Verified informative alt required; focal position expected | `.barrier-hero-visual[data-media-slot="noise-barriers-hero"]` |
| `noise-barriers-showcase-wide` | `/noise-barriers/` — showcase | Wide installation/project context; high | 2.25:1 desktop, 4:3 mobile | Lazy, async | `assets/media/noise-barriers/noise-barrier__site-01.webp` | Verified alt based on actual site context; focal position expected | `.showcase-project[data-media-slot="noise-barriers-showcase-wide"]` |
| `noise-barriers-showcase-detail` | `/noise-barriers/` — showcase | Application/material detail; medium | 4:3 landscape | Lazy, async | `assets/media/noise-barriers/noise-barrier__detail-01.webp` | Verified descriptive alt; use `--media-fit: contain` only if this becomes a drawing | `.showcase-detail[data-media-slot="noise-barriers-showcase-detail"]` |
| `noise-barriers-showcase-site` | `/noise-barriers/` — showcase | Field/application-stage context; medium | 4:3 landscape | Lazy, async | `assets/media/noise-barriers/noise-barrier__site-02.webp` | Verified descriptive alt; focal position optional | `.showcase-site[data-media-slot="noise-barriers-showcase-site"]` |

The homepage selected-project entries and project-index entries are layout positions associated with the verified project ordering. Media must be supplied for the corresponding verified project and may not be substituted between projects without updating the association.

## B. Optional real media

No optional public media slot is currently rendered. Future verified project detail pages may add a hero, site sequence, application/process imagery, drawings, and details under `assets/media/projects/<project-slug>/`; those slots should be created only with the real case study.

The About page intentionally remains typographic. Add a corporate/project image there only if supplied media has a clear institutional purpose and the page is deliberately recomposed later.

## C. Permanent graphic / CSS compositions

These are not ingestion targets:

- Home institutional-section structural field.
- About hero field, coordination bands, ruled principles, and sector compositions.
- Services hero field, numbered service rows, lifecycle grid, and coordination rules.
- Shared section rules, CTA line icon, button corner detail, and footer tonal field.
- Contact form composition and Privacy legal layout.

Temporary placeholder backgrounds disappear behind real media; the permanent editorial fields remain CSS.

## D. Brand assets

The existing `.brand` and `.brand.brand-light` text treatments remain accessible fallbacks. Future verified files:

| Role | Expected path | Insertion hook |
| --- | --- | --- |
| Primary logo | `assets/branding/rito-logo.svg` | Header `.brand`; insert with `.brand-logo` and preserve the link and accessible name |
| Reversed logo | `assets/branding/rito-logo-light.svg` | Footer `.brand-light`; insert with `.brand-logo` only if a separate reversed file is genuinely required |
| Favicon | `assets/branding/favicon.svg` | Add a document-head `<link rel="icon">` only after the file exists |
| Social share image | Deferred until domain and verified media exist | Document-head metadata; do not derive from placeholder art |

Logo insertion should replace the two visual text spans with an `<img>` or inline verified SVG while retaining the anchor's `aria-label`. Record real intrinsic dimensions and constrain the asset within the established brand box; do not resize the header or footer pre-emptively.

## Future project detail convention

A verified case study may use:

- `<project-slug>__hero.webp`
- `<project-slug>__site-01.webp`, `__site-02.webp`
- `<project-slug>__application-01.webp`
- `<project-slug>__detail-01.webp`
- `<project-slug>__drawing-01.webp`

Drawings that convey information require alt text describing their contribution, not every visible annotation. Use `--media-fit: contain` when cropping would remove information.
