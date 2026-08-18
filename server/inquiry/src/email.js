const LABELS = {
  customerType: { individual: "Bireysel", business: "Kurum / Şirket" },
  contactMethod: { email: "E-posta", phone: "Telefon" },
  service: {
    "architectural-consulting": "Mimari Danışmanlık",
    "project-development": "Proje Geliştirme",
    "project-implementation-coordination": "Proje ve Teknik Koordinasyon",
    "contractor-coordination": "Yüklenici / Alt Yüklenici Koordinasyonu",
    "field-process": "Uygulama ve Saha Süreci",
    "noise-barriers": "Gürültü Bariyeri Uygulamaları",
    other: "Diğer",
  },
  projectType: {
    public: "Kamu Projesi",
    corporate: "Özel Sektör / Kurumsal Proje",
    infrastructure: "Altyapı / Ulaşım Bağlantılı Proje",
    "noise-barrier": "Gürültü Bariyeri Uygulaması",
    other: "Diğer",
  },
};

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeSubjectPart(value) {
  return String(value).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Yeni başvuru";
}

function groups(data) {
  const result = [
    ["Talep Sahibi", [["Talep Sahibi Türü", LABELS.customerType[data["customer-type"]]], ["Ad Soyad", data["full-name"]]]],
    ["İletişim Bilgileri", [["E-posta Adresi", data.email], ["Telefon Numarası", data.phone || "—"], ["Tercih Edilen İletişim Yöntemi", LABELS.contactMethod[data["contact-method"]]]]],
  ];
  if (data["customer-type"] === "business") {
    result.push(["Kurum / Şirket Bilgileri", [["Kurum / Şirket Adı", data["company-name"]], ["Görev veya Departman", data["company-role"] || "—"]]]);
  }
  result.push(["Proje Bilgileri", [["Talep Edilen Hizmet", LABELS.service[data["requested-service"]]], ["Proje Türü", LABELS.projectType[data["project-type"]]], ["Proje Adresi veya Mevkii", data.address || "—"], ["Proje Açıklaması", data.message], ["Aydınlatma Metni", "Okunduğu onaylandı"]]]);
  return result;
}

export function buildMail({ data, reference, timestamp, fromAddress, toAddress }) {
  const subjectIdentity = data["company-name"] || data["full-name"];
  const subject = `[Web Proje Talebi] ${safeSubjectPart(subjectIdentity)}`;
  const sections = groups(data);
  const text = [
    ...sections.flatMap(([heading, rows]) => [heading.toUpperCase(), ...rows.map(([label, value]) => `${label}: ${value}`), ""]),
    "---",
    `Gönderim zamanı: ${timestamp}`,
    `Referans: ${reference}`,
    "Kaynak: ritomimarlik.com proje talep formu",
  ].join("\n");
  const htmlSections = sections.map(([heading, rows]) => `
    <h2 style="font:600 15px Arial,sans-serif;margin:24px 0 8px;color:#222;">${escapeHtml(heading)}</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
      ${rows.map(([label, value]) => `<tr><th scope="row" style="width:34%;padding:8px 12px 8px 0;border-top:1px solid #d8d5cf;text-align:left;vertical-align:top;font:600 12px Arial,sans-serif;color:#666;">${escapeHtml(label)}</th><td style="padding:8px 0;border-top:1px solid #d8d5cf;vertical-align:top;white-space:pre-wrap;font:14px/1.5 Arial,sans-serif;color:#222;">${escapeHtml(value)}</td></tr>`).join("")}
    </table>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2ed;"><main style="max-width:720px;margin:0 auto;padding:32px;background:#fff;"><h1 style="font:600 20px Arial,sans-serif;margin:0 0 8px;color:#222;">Yeni Proje Talebi</h1>${htmlSections}<p style="margin:28px 0 0;padding-top:12px;border-top:1px solid #aaa;font:11px/1.6 Arial,sans-serif;color:#666;">Gönderim zamanı: ${escapeHtml(timestamp)}<br>Referans: ${escapeHtml(reference)}<br>Kaynak: ritomimarlik.com proje talep formu</p></main></body></html>`;
  return {
    from: { name: "Rito Mimarlık Web Formu", address: fromAddress },
    to: toAddress,
    ...(data.email ? { replyTo: data.email } : {}),
    subject,
    text,
    html,
  };
}
