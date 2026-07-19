export function initializeQuoteForm() {
  const form = document.querySelector("#quote-form");

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


}
