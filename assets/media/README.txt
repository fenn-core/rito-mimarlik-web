RİTO MİMARLIK — PROCESSED SITE MEDIA

All output images are cropped to an exact 16:9 aspect ratio.

Formats
-------
- AVIF: preferred modern delivery format
- WebP: fallback / simpler deployment format

Target sizes
------------
- home-hero: 1920x1080
- home-noise-barrier: 1600x900
- home-project-* cards: 1200x675
- projects-index-* covers + gallery images: 1600x900
- noise-barriers-* images: 1600x900
- consultancy-placeholder: 1600x900

Project gallery naming
----------------------
projects-index-NN.ext       = project cover
projects-index-NN-01.ext    = gallery image 1
projects-index-NN-02.ext    = gallery image 2
...

The generated consultancy-placeholder remains intentionally unnumbered. It is
mapped to Galataport's consultancy / hakediş-management card because no
documentary project photography exists; do not describe it as a site photo or
rename it into the projects naming sequence.

Directory note
--------------
This flat /projects directory is authoritative. Do not create per-project
subdirectories, move files into project slug folders, or rename the supplied
files. See docs/media-conventions.md for the full contract.
