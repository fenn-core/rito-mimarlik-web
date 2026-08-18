const CUSTOMER_TYPES = new Set(["individual", "business"]);
const CONTACT_METHODS = new Set(["email", "phone"]);
const SERVICES = new Set([
  "architectural-consulting",
  "project-development",
  "project-implementation-coordination",
  "contractor-coordination",
  "field-process",
  "noise-barriers",
  "other",
]);
const PROJECT_TYPES = new Set([
  "public",
  "corporate",
  "infrastructure",
  "noise-barrier",
  "other",
]);

export const FIELD_NAMES = new Set([
  "customer-type",
  "full-name",
  "email",
  "phone",
  "contact-method",
  "company-name",
  "company-role",
  "requested-service",
  "project-type",
  "address",
  "message",
  "kvkk-consent",
  "website",
]);

const singleLineControlPattern = /[\u0000-\u001f\u007f]/;
const multilineControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+().\s-]+$/;

function cleanString(value, { min = 0, max, multiline = false } = {}) {
  if (typeof value !== "string") return null;
  const cleaned = multiline
    ? value.replace(/\r\n?/g, "\n").trim()
    : value.trim();
  const controls = multiline ? multilineControlPattern : singleLineControlPattern;
  if (cleaned.length < min || cleaned.length > max || controls.test(cleaned)) return null;
  return cleaned;
}

function optionalString(body, field, options) {
  if (!(field in body) || body[field] === "") return "";
  return cleanString(body[field], options);
}

export function validateSubmission(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, fields: ["submission"] };
  }

  const invalid = new Set();
  for (const field of Object.keys(body)) {
    if (!FIELD_NAMES.has(field)) invalid.add(field);
  }

  const customerType = cleanString(body["customer-type"], { min: 1, max: 20 });
  const fullName = cleanString(body["full-name"], { min: 2, max: 120 });
  const email = cleanString(body.email, { min: 3, max: 254 });
  const phone = optionalString(body, "phone", { max: 40 });
  const contactMethod = cleanString(body["contact-method"], { min: 1, max: 20 });
  const companyName = optionalString(body, "company-name", { max: 160 });
  const companyRole = optionalString(body, "company-role", { max: 120 });
  const requestedService = cleanString(body["requested-service"], { min: 1, max: 50 });
  const projectType = cleanString(body["project-type"], { min: 1, max: 30 });
  const address = optionalString(body, "address", { max: 240 });
  const message = cleanString(body.message, { min: 10, max: 4000, multiline: true });
  const website = optionalString(body, "website", { max: 200 });

  if (!CUSTOMER_TYPES.has(customerType)) invalid.add("customer-type");
  if (fullName === null) invalid.add("full-name");
  if (email === null || !emailPattern.test(email)) invalid.add("email");
  if (phone === null || (phone && !phonePattern.test(phone))) invalid.add("phone");
  if (!CONTACT_METHODS.has(contactMethod)) invalid.add("contact-method");
  if (contactMethod === "phone" && (!phone || phone.replace(/\D/g, "").length < 7)) invalid.add("phone");
  if (customerType === "business") {
    if (companyName === null || companyName.length < 2) invalid.add("company-name");
    if (companyRole === null) invalid.add("company-role");
  } else if ((companyName && companyName.length > 0) || (companyRole && companyRole.length > 0)) {
    invalid.add("company-name");
    invalid.add("company-role");
  }
  if (!SERVICES.has(requestedService)) invalid.add("requested-service");
  if (!PROJECT_TYPES.has(projectType)) invalid.add("project-type");
  if (address === null) invalid.add("address");
  if (message === null) invalid.add("message");
  if (body["kvkk-consent"] !== true) invalid.add("kvkk-consent");
  if (website === null) invalid.add("website");

  if (invalid.size > 0) return { ok: false, fields: [...invalid].sort() };

  return {
    ok: true,
    honeypot: website.length > 0,
    value: {
      "customer-type": customerType,
      "full-name": fullName,
      email,
      phone,
      "contact-method": contactMethod,
      "company-name": customerType === "business" ? companyName : "",
      "company-role": customerType === "business" ? companyRole : "",
      "requested-service": requestedService,
      "project-type": projectType,
      address,
      message,
      "kvkk-consent": true,
    },
  };
}
