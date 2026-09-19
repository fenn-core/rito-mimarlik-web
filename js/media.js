const MEDIA_ROOT = "/assets/media";

const image = (path, alt = "", options = {}) => ({
  avif: `${MEDIA_ROOT}/${path}.avif`,
  webp: `${MEDIA_ROOT}/${path}.webp`,
  width: 1600,
  height: 900,
  alt,
  ...options,
});

const projectAlt = {
  "01": "Çerkezköy–Edirne demiryolu hattı gürültü bariyeri uygulaması",
  "02": "Pendik–Halkalı banliyö hattı Haydarpaşa tarihi köprü korkuluk bariyeri uygulaması",
  "03": "Acun Medya Alaçatı gürültü bariyeri uygulaması",
};

const MEDIA = {
  "home-hero": image("home/home-hero", "Rito Mimarlık proje ve saha uygulamasını gösteren görsel", { width: 1920, height: 1080, eager: true }),
  "home-noise-barrier": image("home/home-noise-barrier", "Gürültü bariyeri uygulamasını gösteren proje görseli"),
  "home-project-01": image("home/home-project-01", "", { width: 1200, height: 675 }),
  "home-project-02": image("home/home-project-02", "", { width: 1200, height: 675 }),
  "home-project-03": image("home/home-project-03", "", { width: 1200, height: 675 }),
  "noise-barriers-hero": image("noise-barriers/noise-barriers-hero", "Gürültü bariyeri uygulamasını gösteren proje görseli", { eager: true }),
  "noise-barriers-showcase-wide": image("noise-barriers/noise-barriers-showcase-wide", "Gürültü bariyeri uygulama alanını gösteren görsel"),
  "noise-barriers-showcase-detail": image("noise-barriers/noise-barriers-showcase-detail", "Gürültü bariyeri uygulamasının detayını gösteren görsel"),
  "noise-barriers-showcase-site": image("noise-barriers/noise-barriers-showcase-site", "Gürültü bariyeri saha uygulamasını gösteren görsel"),
};

const PROJECT_MEDIA = {
  "01": [
    image("projects/projects-index-01", projectAlt["01"]),
    image("projects/projects-index-01-01", `${projectAlt["01"]} — ek görsel`),
  ],
  "02": [
    image("projects/projects-index-02", projectAlt["02"]),
    image("projects/projects-index-02-01", `${projectAlt["02"]} — ek görsel 1`),
    image("projects/projects-index-02-02", `${projectAlt["02"]} — ek görsel 2`),
  ],
  "03": [
    image("projects/projects-index-03", projectAlt["03"]),
    image("projects/projects-index-03-01", `${projectAlt["03"]} — ek görsel`),
  ],
  // Galataport has consultancy / hakediş work but no documentary project photography.
  "04": [
    image("generated/consultancy-placeholder", "Teknik danışmanlık ve proje yönetimini temsil eden soyut grafik"),
  ],
};

function createPicture(asset, { eager = false } = {}) {
  const picture = document.createElement("picture");
  const source = document.createElement("source");
  source.type = "image/avif";
  source.srcset = asset.avif;
  const img = document.createElement("img");
  img.src = asset.webp;
  img.alt = asset.alt;
  img.width = asset.width;
  img.height = asset.height;
  img.decoding = eager ? "sync" : "async";
  if (eager) img.fetchPriority = "high";
  else img.loading = "lazy";
  picture.append(source, img);
  return picture;
}

function updateControls(gallery) {
  const track = gallery.querySelector(".media-gallery-track");
  const previous = gallery.querySelector("[data-gallery-previous]");
  const next = gallery.querySelector("[data-gallery-next]");
  if (!track || !previous || !next) return;
  const maxScroll = track.scrollWidth - track.clientWidth - 1;
  previous.disabled = track.scrollLeft <= 1;
  next.disabled = track.scrollLeft >= maxScroll;
}

function createGallery(slot, assets, label) {
  slot.classList.add("is-media-populated");
  slot.removeAttribute("aria-hidden");
  slot.replaceChildren();

  if (assets.length === 1) {
    slot.append(createPicture(assets[0]));
    return;
  }

  slot.classList.add("media-gallery");
  const track = document.createElement("div");
  track.className = "media-gallery-track";
  track.setAttribute("tabindex", "0");
  track.setAttribute("role", "region");
  track.setAttribute("aria-label", `${label} görsel galerisi`);

  assets.forEach((asset, index) => {
    const slide = document.createElement("div");
    slide.className = "media-gallery-slide";
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-label", `${index + 1} / ${assets.length}`);
    slide.append(createPicture(asset));
    track.append(slide);
  });

  const controls = document.createElement("div");
  controls.className = "media-gallery-controls";
  controls.innerHTML = `
    <button type="button" class="media-gallery-button" data-gallery-previous aria-label="Önceki görsel">←</button>
    <button type="button" class="media-gallery-button" data-gallery-next aria-label="Sonraki görsel">→</button>
  `;
  slot.append(track, controls);

  const move = (direction) => track.scrollBy({
    left: direction * track.clientWidth,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
  controls.querySelector("[data-gallery-previous]").addEventListener("click", () => move(-1));
  controls.querySelector("[data-gallery-next]").addEventListener("click", () => move(1));
  track.addEventListener("scroll", () => updateControls(slot), { passive: true });
  window.addEventListener("resize", () => updateControls(slot));
  updateControls(slot);
}

function populateMedia() {
  document.querySelectorAll("[data-media-slot]").forEach((slot) => {
    const projectIndex = slot.dataset.projectMedia;
    const assets = projectIndex ? PROJECT_MEDIA[projectIndex] : MEDIA[slot.dataset.mediaSlot];
    if (!assets) return;
    createGallery(slot, Array.isArray(assets) ? assets : [assets], slot.closest(".portfolio-card")?.querySelector("h3")?.textContent || "Proje");
  });
}

populateMedia();
