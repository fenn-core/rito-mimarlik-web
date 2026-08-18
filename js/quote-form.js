export function initializeQuoteForm() {
  const form = document.querySelector("#project-inquiry");
  if (form === null) return;

  const customerTypeInputs = form.querySelectorAll('input[name="customer-type"]');
  const conditionalFieldGroups = form.querySelectorAll("[data-customer-fields]");
  const phoneInput = form.querySelector("#phone");
  const contactMethodInputs = form.querySelectorAll('input[name="contact-method"]');
  const submissionStatus = form.querySelector("#submission-status");
  const submissionTrigger = form.querySelector("[data-submission-trigger]");
  const defaultButtonText = submissionTrigger?.textContent || "Proje Talebini Gönder";
  let submissionPending = false;

  function updateCustomerFields() {
    const selected = form.querySelector('input[name="customer-type"]:checked')?.value;
    conditionalFieldGroups.forEach((group) => {
      const active = group.dataset.customerFields === selected;
      group.hidden = !active;
      group.disabled = !active;
    });
  }

  function updatePhoneRequirement() {
    if (phoneInput !== null) {
      phoneInput.required = form.querySelector('input[name="contact-method"]:checked')?.value === "phone";
    }
  }

  function clearServerFieldState() {
    form.querySelectorAll('[aria-invalid="true"]').forEach((field) => field.removeAttribute("aria-invalid"));
  }

  function payloadFromForm() {
    const values = Object.fromEntries(new FormData(form));
    values["kvkk-consent"] = form.elements.namedItem("kvkk-consent")?.checked === true;
    return values;
  }

  function setStatus(message) {
    if (submissionStatus !== null) {
      submissionStatus.textContent = message;
      submissionStatus.hidden = message.length === 0;
    }
  }

  function markInvalidFields(fields) {
    clearServerFieldState();
    let first = null;
    fields.forEach((name) => {
      const field = form.elements.namedItem(name);
      const input = field instanceof RadioNodeList ? field[0] : field;
      if (input instanceof HTMLElement) {
        input.setAttribute("aria-invalid", "true");
        first ||= input;
      }
    });
    first?.focus();
  }

  function failureMessage(code) {
    if (code === "rate_limited") return "Kısa süre içinde çok sayıda gönderim denendi. Lütfen daha sonra tekrar deneyin.";
    return "Talebiniz şu anda iletilemedi. Bilgileriniz form üzerinden gönderilmedi. Lütfen daha sonra tekrar deneyin veya info@ritomimarlik.com üzerinden bizimle iletişime geçin.";
  }

  async function submitInquiry(event) {
    event.preventDefault();
    if (submissionPending) return;
    clearServerFieldState();
    submissionPending = true;
    if (submissionTrigger !== null) {
      submissionTrigger.disabled = true;
      submissionTrigger.textContent = "Gönderiliyor…";
    }
    setStatus("Proje talebiniz iletiliyor.");

    try {
      const response = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm()),
      });
      const result = await response.json().catch(() => ({ ok: false, code: "delivery_unavailable" }));
      if (response.status === 202 && result.ok === true) {
        form.reset();
        updateCustomerFields();
        updatePhoneRequirement();
        setStatus("Proje talebiniz iletildi.");
        return;
      }
      if (response.status === 400 && result.code === "invalid_submission") {
        const fields = Array.isArray(result.fields) ? result.fields : [];
        markInvalidFields(fields);
        setStatus("Lütfen işaretlenen alanları kontrol ederek yeniden deneyin.");
        return;
      }
      setStatus(failureMessage(result.code));
    } catch {
      setStatus(failureMessage("delivery_unavailable"));
    } finally {
      submissionPending = false;
      if (submissionTrigger !== null) {
        submissionTrigger.disabled = false;
        submissionTrigger.textContent = defaultButtonText;
      }
    }
  }

  customerTypeInputs.forEach((input) => input.addEventListener("change", updateCustomerFields));
  contactMethodInputs.forEach((input) => input.addEventListener("change", updatePhoneRequirement));
  form.addEventListener("input", clearServerFieldState);
  form.addEventListener("change", clearServerFieldState);
  form.addEventListener("submit", submitInquiry);
  updateCustomerFields();
  updatePhoneRequirement();
}
