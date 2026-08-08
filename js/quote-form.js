export function initializeQuoteForm() {
  const form = document.querySelector("#project-inquiry");

  if (form === null) {
    return;
  }

  const customerTypeInputs = form.querySelectorAll(
    'input[name="customer-type"]',
  );

  const conditionalFieldGroups = form.querySelectorAll(
    "[data-customer-fields]",
  );

  function updateCustomerFields() {
    const selectedInput = form.querySelector(
      'input[name="customer-type"]:checked',
    );

    if (selectedInput === null) {
      return;
    }

    const selectedCustomerType = selectedInput.value;

    conditionalFieldGroups.forEach((fieldGroup) => {
      const groupCustomerType = fieldGroup.dataset.customerFields;

      const shouldBeActive = groupCustomerType === selectedCustomerType;

      fieldGroup.hidden = !shouldBeActive;
      fieldGroup.disabled = !shouldBeActive;
    });
  }

  customerTypeInputs.forEach((input) => {
    input.addEventListener("change", updateCustomerFields);
  });

  updateCustomerFields();

  const phoneInput = form.querySelector("#phone");

  const contactMethodInputs =
    form.querySelectorAll('input[name="contact-method"]');

  function updatePhoneRequirement() {
    if (phoneInput === null) {
      return;
    }

    const selectedContactMethod =
      form.querySelector('input[name="contact-method"]:checked');

    const phoneIsPreferred =
      selectedContactMethod?.value === "phone";

    phoneInput.required = phoneIsPreferred;
  }

  contactMethodInputs.forEach((input) => {
    input.addEventListener("change", updatePhoneRequirement);
  });

  updatePhoneRequirement();

  const submissionStatus = form.querySelector("#submission-status");
  const submissionTrigger = form.querySelector("[data-submission-trigger]");

  function showDisabledSubmissionStatus() {
    if (submissionStatus !== null) {
      submissionStatus.textContent =
        "Çevrimiçi proje talebi gönderimi henüz aktif değildir. Girdiğiniz bilgiler iletilmemiştir.";
    }
  }

  function preventDisabledSubmission(event) {
    if (form.dataset.submissionMode !== "disabled") {
      return;
    }

    event.preventDefault();
    showDisabledSubmissionStatus();
  }

  form.addEventListener("submit", preventDisabledSubmission);

  submissionTrigger?.addEventListener("click", () => {
    if (form.dataset.submissionMode !== "disabled") {
      return;
    }

    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return;
    }

    if (form.reportValidity()) {
      showDisabledSubmissionStatus();
    }
  });
}
