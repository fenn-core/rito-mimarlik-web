# Media conventions

The authoritative processed-media root is `assets/media/`. Preserve this exact
layout; project files are not placed in per-project directories.

```text
assets/media/
├── generated/
│   └── consultancy-placeholder.{avif,webp}
├── home/
│   ├── home-hero.{avif,webp}
│   ├── home-noise-barrier.{avif,webp}
│   └── home-project-01..03.{avif,webp}
├── noise-barriers/
│   └── noise-barriers-{hero,showcase-wide,showcase-detail,showcase-site}.{avif,webp}
└── projects/
    └── projects-index-NN[-01][-02...].{avif,webp}
```

Every production image is an AVIF/WebP pair with the same stem. AVIF is the
preferred `<source>` and WebP is the fallback `<img>`. Do not add JPEG/PNG
references or invent another naming convention. The processed images are 16:9
and use their real 16:9 dimensions in generated markup.

Homepage slots use `home-*` assets and are independent from project galleries.
Noise-barrier slots use the `noise-barriers/` assets. Project galleries use one
explicit mapping in [`js/media.js`](../js/media.js): the cover is
`projects-index-NN`, followed numerically by `-01`, `-02`, `-03`, and so on.
The extension is not another gallery item.

Keep the existing `data-media-slot`, `.media-slot`, `.is-media-populated`,
`--media-fit`, and `--media-position` hooks. Hero images are eager and use
`fetchpriority="high"`; below-the-fold images use lazy loading and async
decoding. Preserve width/height and do not use autoplay or a carousel library.

The generated consultancy placeholder is generic technical artwork. It may
represent consultancy, calculations, or hakediş/project-management work such
as Galataport, but must not be described as a photograph or physical site.

Run the dependency-free preflight after media changes:

```sh
node scripts/validate-media.mjs
```
