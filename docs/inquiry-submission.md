# Project inquiry submission contract

## Current state

`/contact/#project-inquiry` is intentionally configured with `data-submission-mode="disabled"`. The browser performs native constraint validation, but valid submit attempts are cancelled locally. No form values are transmitted, persisted, logged, or added to the URL. The entered values remain in the DOM.

Do not change the mode or add an endpoint until the privacy dependencies below are resolved. A real implementation must retain the existing field names unless a coordinated frontend/backend migration is made.

## Payload fields

| Field name | Meaning | Required / conditional | Future JSON type | Personal or sensitive context |
| --- | --- | --- | --- | --- |
| `customer-type` | Inquiry owner type: `individual` or `business` | Required | string enum | Describes the requester context |
| `full-name` | Requester's name | Required | string | Personal data |
| `email` | Reply email | Required | string | Personal/contact data |
| `phone` | Reply telephone | Optional; required when `contact-method` is `phone` | string | Personal/contact data |
| `contact-method` | Preferred reply channel: `email` or `phone` | Required | string enum | Communication preference |
| `company-name` | Institution or company name | Required only for `business`; omit for `individual` | string | Institutional data; may identify affiliation |
| `company-role` | Role or department | Optional; relevant only for `business` | string | Professional affiliation data |
| `requested-service` | Selected Rito Mimarlık service | Required | string enum | Project-context data |
| `project-type` | Broad project environment | Required | string enum | Project-context data |
| `address` | Project location or site description | Optional | string | May contain location or confidential project data |
| `message` | Project scope, stage, and requested support | Required | string | May contain personal, commercial, or project-sensitive data |
| `kvkk-consent` | Confirmation that the displayed notice was read | Required in the current UI | boolean | Consent/notice interaction record; legal treatment requires review |

Disabled conditional controls must be omitted from the future payload. Trim text values without silently rewriting their meaning. The server must treat all client-provided values as untrusted.

## Future HTTP contract

Use a real HTTPS `POST` endpoint with `Content-Type: application/json`. Do not send inquiry values in a query string.

A future implementation must:

1. Run native client validation, then construct the documented payload.
2. Enter `PENDING` only after a request actually begins.
3. Show `SUCCESS` only after the server confirms acceptance with a successful response.
4. Show an honest `ERROR` when transport or server processing fails.
5. Keep server-side validation authoritative even when browser validation passes.
6. Avoid logging sensitive payload values in the browser.

No endpoint URL, response schema, authentication model, retry policy, or delivery provider is defined yet.

The verified future project-inquiry mailbox is `proje@ritomimarlik.com`. It is a delivery destination for the future backend, not a current form endpoint; documenting it here does not activate or imply transmission.

## UI states

- `IDLE`: form is available and no submission has been attempted.
- `VALIDATING`: native browser constraints are being evaluated.
- `PRE-BACKEND / DISABLED`: current state; a valid attempt is cancelled locally and non-transmission is announced.
- `PENDING`: future state after a real request starts; repeated submission should be controlled.
- `SUCCESS`: future state only after confirmed server acceptance.
- `ERROR`: future state for network or server failure, without claiming delivery.

Current code implements only `IDLE` and `PRE-BACKEND / DISABLED`.

## Privacy prerequisites

Backend activation must wait until the privacy/KVKK material is reconciled with verified facts about:

- Legal entity and data-controller identity
- Real contact and data-subject application channel
- Actual inquiry destination and authorized recipients
- Storage and retention behavior
- Service providers or processors, if any
- The final server response and operational workflow

Do not infer a retention period, lawful basis, transfer practice, or compliance status. Substantive legal text requires qualified review before production processing begins.
