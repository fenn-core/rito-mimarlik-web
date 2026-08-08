# Media conventions

Add verified assets only after usage rights and project information are confirmed.
The authoritative placement inventory is in [`media-manifest.md`](media-manifest.md).

## Directory and naming

- Brand files: `assets/branding/`
- Homepage media: `assets/media/home/`
- Project media: `assets/media/projects/<project-slug>/`
- Noise-barrier media: `assets/media/noise-barriers/`
- Use lowercase ASCII kebab-case names with a role suffix, for example:
  - `project-slug__hero.webp`
  - `project-slug__site-01.webp`
  - `project-slug__detail-01.webp`
  - `noise-barrier__hero.webp`

Responsive exports append a width suffix to the complete role name, for example
`home__hero--1280w.webp`, `home__hero--1920w.webp`, and `home__hero--2560w.webp`.

Prefer AVIF or WebP for photography, JPEG only when a fallback is needed, and SVG for verified logos or line graphics.
Do not create empty asset directories; add each path with its first verified file.

## HTML insertion

- Preserve the element carrying `data-media-slot` and the `media-slot` class. Replace only its placeholder label/content with a native `<picture>` and `<img>`.
- Add `is-media-populated` to the slot so temporary pseudo-graphics are suppressed. Page CSS continues to own the slot's dimensions and aspect ratio.
- Remove the wrapper's placeholder-only `aria-hidden="true"` when the real image and its alternative text must be exposed. It may remain hidden when the image is genuinely decorative.
- Provide accurate `alt` text when an image communicates project information; use `alt=""` when it is purely decorative.
- Include intrinsic `width` and `height` to prevent layout shifts.
- Use `loading="lazy"` and `decoding="async"` for below-the-fold images.
- Do not lazy-load the primary hero/LCP image.
- Use `srcset` and `sizes` when multiple verified responsive variants are available.
- Set a crop without new CSS by adding `style="--media-position: 42% 50%"` to the slot. Use `--media-fit: contain` only for drawings or diagrams that must remain fully visible.

Conceptual populated-slot pattern (replace brace values only after assets exist):

```html
<div class="... media-slot is-media-populated" data-media-slot="{slot-id}"
  style="--media-position: 50% 50%">
  <picture>
    <source type="image/avif" srcset="{avif-srcset}" sizes="{sizes}">
    <img src="{webp-path}" srcset="{webp-srcset}" sizes="{sizes}"
      width="{intrinsic-width}" height="{intrinsic-height}" alt="{verified-alt}"
      loading="lazy" decoding="async">
  </picture>
</div>
```

Omit unsupported `<source>` formats rather than adding broken references. For an LCP hero, omit `loading="lazy"` and use `fetchpriority="high"`.

## Responsive export policy

- Create variants only when the slot materially benefits. Major heroes and wide project imagery normally need 1280, 1920, and 2560px-class exports; compact cards rarely need every size.
- Let `width` and `height` reflect the chosen fallback file's real intrinsic dimensions. Never use invented dimensions merely to satisfy markup.
- Prefer AVIF when the export is visually reliable, with WebP as the practical default. Add JPEG only for a demonstrated compatibility need.
- Keep hero/LCP files eager. Use lazy loading for media below the first viewport. `decoding="async"` is appropriate for non-critical imagery.
- Do not export native 4K width automatically. The slot's maximum rendered width and crop determine whether a 2560px or larger source is justified.

## Media preflight

Run the dependency-free validator after any media or brand insertion:

```sh
node scripts/validate-media.mjs
```

Use `node scripts/validate-media.mjs --json` for a machine-readable report. The validator checks slot/manifest synchronization, populated-state consistency, local asset existence, intrinsic dimensions, alt attributes, loading policy, srcset candidates, duplicate asset use, and placeholder accessibility state.

Exit code `0` means no blocking integrity errors. Exit code `1` means media-integrity errors were found; optimization warnings alone do not fail the command. Exit code `2` indicates an unexpected validator failure. No package installation is required.
