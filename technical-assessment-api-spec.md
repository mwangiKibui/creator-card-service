# Creator Card Microservice — Technical API Specification

## Table of Contents

1. [Overview](#overview)
2. [Base URL](#base-url)
3. [The Creator Card Entity](#the-creator-card-entity)
4. [Project Structure](#project-structure)
5. [Custom Error Codes](#custom-error-codes)
6. [Endpoint 1 — Create Creator Card](#endpoint-1--create-creator-card)
7. [Endpoint 2 — Public Card Retrieval](#endpoint-2--public-card-retrieval)
8. [Endpoint 3 — Delete Creator Card](#endpoint-3--delete-creator-card)
9. [Validation Specs (VSL)](#validation-specs-vsl)
10. [Messages File](#messages-file)
11. [Model Definition](#model-definition)
12. [Slug Auto-Generation Algorithm](#slug-auto-generation-algorithm)
13. [ID Serialization Rule](#id-serialization-rule)

---

## Overview

A REST API that allows creators to publish shareable profile cards showcasing their links and service rates. The service exposes **three endpoints** with no authentication required.

---

## Base URL

Endpoints are mounted at the **root** of the base URL with **no versioning prefix**.

```
POST   {base_url}/creator-cards
GET    {base_url}/creator-cards/:slug
DELETE {base_url}/creator-cards/:slug
```

> **CRITICAL**: No `/v1/`, `/api/`, or any other prefix. Endpoints live at the root.

---

## The Creator Card Entity

| Field | Type | Constraints | Description |
|---|---|---|---|
| `id` | string (ULID) | Auto-generated | Stored as `_id` in MongoDB, **always** serialized as `id` in API responses |
| `title` | string | 3–100 characters | e.g. `"George Cooks"` |
| `description` | string | max 500 characters | Optional |
| `slug` | string | 5–50 characters; unique; letters, numbers, hyphens and underscores only | Public identifier used for card retrieval |
| `creator_reference` | string | exactly 20 characters | Identifies the creator on the consuming service |
| `links` | array of objects | Optional | Links the creator wants to showcase |
| `links[].title` | string | 1–100 characters | Title of the link |
| `links[].url` | string | max 200 characters; must start with `http://` or `https://` | Link URL |
| `service_rates` | object | Optional | Rates offered by the creator |
| `service_rates.currency` | string | enum: `NGN \| USD \| GBP \| GHS` | Currency for all rates on the card |
| `service_rates.rates` | array of objects | Non-empty when `service_rates` is present | Individual service rates |
| `service_rates.rates[].name` | string | 3–100 characters | e.g. `"IG Story Post"` |
| `service_rates.rates[].description` | string | max 250 characters | Description of the service |
| `service_rates.rates[].amount` | number | positive integer (min 1, no decimals) | Minor units: kobo (NGN), cents (USD), pence (GBP), pesewas (GHS) |
| `status` | string | enum: `draft \| published` | Drafts can **never** be retrieved via the public endpoint |
| `access_type` | string | enum: `public \| private`; defaults to `public` | Access control mode |
| `access_code` | string | exactly 6 alphanumeric characters | Required when `access_type` is `private`; **must not** be set when `access_type` is `public` |
| `created` | number | Unix epoch milliseconds | Set at creation time |
| `updated` | number | Unix epoch milliseconds | Set at creation and update time |
| `deleted` | number \| null | Unix epoch milliseconds or `null` | `null` unless the card has been deleted |

---

## Project Structure

The following files must be created following the template conventions exactly.

```
models/
  creator-card.js               ← MongoDB model (uses ModelSchema + DatabaseModel)

repository/
  creator-card/
    create.js                   ← Insert a new card
    find-by-slug.js             ← Find a non-deleted card by slug
    delete-by-slug.js           ← Soft-delete a card by slug (set deleted timestamp)
    slug-exists.js              ← Check whether a slug is already taken

services/
  creator-card/
    create-card.js              ← Business logic for POST /creator-cards
    get-card.js                 ← Business logic for GET /creator-cards/:slug
    delete-card.js              ← Business logic for DELETE /creator-cards/:slug

endpoints/
  creator-cards/
    create.js                   ← Route: POST /creator-cards
    get.js                      ← Route: GET /creator-cards/:slug
    delete.js                   ← Route: DELETE /creator-cards/:slug

messages/
  creator-card.js               ← All human-readable message strings for this domain
  index.js                      ← Register CreatorCardMessages here
```

**`app.js`** — Register the endpoint folder in `ENDPOINT_CONFIGS`:

```javascript
const ENDPOINT_CONFIGS = [
  { path: './endpoints/onboarding/' },
  { path: './endpoints/creator-cards/' }, // ← add this
];
```

---

## Custom Error Codes

These are the **business rule** errors that must be implemented manually (the VSL validator handles field-level errors automatically).

| Code | HTTP Status | Trigger | Example Message |
|---|---|---|---|
| `SL02` | 400 | A client-provided slug is already taken by another card | `"Slug is already taken"` |
| `AC01` | 400 | `access_type` is `private` but `access_code` was not provided | `"access_code is required when access_type is private"` |
| `AC05` | 400 | `access_code` is present but `access_type` is `public` (or omitted) | `"access_code can only be set on private cards"` |
| `NF01` | 404 | No card exists with the given slug (or the card has been deleted) | `"Creator card not found"` |
| `NF02` | 404 | Card exists but its `status` is `draft` | `"Creator card not found"` |
| `AC03` | 403 | Card is `private` and no `access_code` query parameter was supplied | `"This card is private. An access code is required"` |
| `AC04` | 403 | Card is `private` and the supplied `access_code` does not match the stored value | `"Invalid access code"` |

> **Notes**:
> - `NF01` and `NF02` intentionally use the same human-readable message. The `code` field is what callers use to distinguish the two cases.
> - The `code` values must match exactly (case-sensitive) as specified above.
> - Error responses must use the shape `{ "status": "error", "message": "...", "code": "..." }`.

---

## Endpoint 1 — Create Creator Card

### `POST /creator-cards`

Creates a new Creator Card after validating it against all field-level and business rules.

---

### Request Body

```json
{
  "title": "George Cooks",
  "description": "George Cooks is a weekly cooking podcast by Chef George AmadiObi",
  "slug": "george-cooks",
  "creator_reference": "crt_8f2k1m9x4p7w3q5z",
  "links": [
    { "title": "YouTube Channel", "url": "https://youtube.com/@georgecooks" },
    { "title": "Instagram", "url": "https://instagram.com/georgecooks" }
  ],
  "service_rates": {
    "currency": "NGN",
    "rates": [
      { "name": "IG Story Post", "description": "One Instagram story mention", "amount": 5000000 },
      { "name": "Recipe Feature", "description": "Featured recipe segment on the podcast", "amount": 15000000 }
    ]
  },
  "status": "published",
  "access_type": "public"
}
```

---

### Field Requirements

| Field | Required | Rules |
|---|---|---|
| `title` | Yes | String, 3–100 characters |
| `description` | No | String, max 500 characters |
| `slug` | No | 5–50 characters; letters, numbers, hyphens (`-`) and underscores (`_`) only; must be unique across all cards |
| `creator_reference` | Yes | String of exactly 20 characters |
| `links` | No | Array; each entry must have `title` (1–100 chars) and `url` (max 200 chars, must start with `http://` or `https://`) |
| `service_rates` | No | If present: `currency` must be one of `NGN \| USD \| GBP \| GHS`; `rates` must be a non-empty array; each rate must have `name` (3–100 chars), `description` (max 250 chars), and `amount` (positive integer ≥ 1, no decimals) |
| `status` | Yes | Must be exactly `draft` or `published` |
| `access_type` | No | Must be `public` or `private` if present; **defaults to `public`** when omitted |
| `access_code` | Conditional | Required if `access_type` is `private`; must be exactly 6 alphanumeric characters (letters and numbers only). **Must NOT be provided** when `access_type` is `public` or omitted |

---

### Business Rules (evaluated after VSL validation)

Evaluated in this order:

1. **AC05** — If `access_code` is present and `access_type` is `public` (or absent), return HTTP 400 `AC05`.
2. **AC01** — If `access_type` is `private` and `access_code` is absent, return HTTP 400 `AC01`.
3. **SL02** — If `slug` was explicitly provided by the client and that slug is already taken, return HTTP 400 `SL02`. Do **not** silently modify a client-provided slug.
4. **Slug auto-generation** — If `slug` was omitted, auto-generate one (see [Slug Auto-Generation Algorithm](#slug-auto-generation-algorithm)).

---

### Success Response — HTTP 200

```json
{
  "status": "success",
  "message": "Creator Card Created Successfully.",
  "data": {
    "id": "01JG8XYZA2B3C4D5E6F7G8H9J0",
    "title": "George Cooks",
    "description": "George Cooks is a weekly cooking podcast by Chef George AmadiObi",
    "slug": "george-cooks",
    "creator_reference": "crt_8f2k1m9x4p7w3q5z",
    "links": [
      { "title": "YouTube Channel", "url": "https://youtube.com/@georgecooks" },
      { "title": "Instagram", "url": "https://instagram.com/georgecooks" }
    ],
    "service_rates": {
      "currency": "NGN",
      "rates": [
        { "name": "IG Story Post", "description": "One Instagram story mention", "amount": 5000000 },
        { "name": "Recipe Feature", "description": "Featured recipe segment on the podcast", "amount": 15000000 }
      ]
    },
    "status": "published",
    "access_type": "public",
    "access_code": null,
    "created": 1767052800000,
    "updated": 1767052800000,
    "deleted": null
  }
}
```

> **Note**: `access_code` is returned in the creation response (the creator needs it). For public cards it is `null`. For private cards it is the plaintext code.

---

### Error Responses — HTTP 400

**VSL / field-level validation failure** (handled by the framework):
```json
{
  "status": "error",
  "message": "...",
  "errors": [...]
}
```

**Duplicate slug (business rule SL02)**:
```json
{
  "status": "error",
  "message": "Slug is already taken",
  "code": "SL02"
}
```

**Missing access_code on private card (AC01)**:
```json
{
  "status": "error",
  "message": "access_code is required when access_type is private",
  "code": "AC01"
}
```

**access_code set on public card (AC05)**:
```json
{
  "status": "error",
  "message": "access_code can only be set on private cards",
  "code": "AC05"
}
```

---

## Endpoint 2 — Public Card Retrieval

### `GET /creator-cards/:slug`

Retrieves a single Creator Card by its slug. This is the public endpoint that powers shareable card links.

---

### Path Parameters

| Parameter | Required | Description |
|---|---|---|
| `slug` | Yes | The slug of the card to retrieve |

### Query Parameters

| Parameter | Required | Description |
|---|---|---|
| `access_code` | Conditional | Required only when the card is `private`. Passed as a query string: `?access_code=A1B2C3` |

---

### Access Rules (applied in strict order)

1. **NF01** — If no non-deleted card with that slug exists → HTTP 404, code `NF01`.
2. **NF02** — If the card exists but its `status` is `draft` → HTTP 404, code `NF02`.
3. **AC03** — If the card's `access_type` is `private` and no `access_code` query parameter was supplied → HTTP 403, code `AC03`.
4. **AC04** — If the card's `access_type` is `private` and the supplied `access_code` does not match the stored value → HTTP 403, code `AC04`.
5. **Success** — Otherwise → HTTP 200 with the card data.

> **Order is mandatory**. Do not re-arrange these checks.

---

### Private Card Access Example

```
GET /creator-cards/vip-rate-card?access_code=A1B2C3
```

---

### Success Response — HTTP 200

```json
{
  "status": "success",
  "message": "Creator Card Retrieved Successfully.",
  "data": {
    "id": "01JG8XYZA2B3C4D5E6F7G8H9J0",
    "title": "George Cooks",
    "description": "George Cooks is a weekly cooking podcast by Chef George AmadiObi",
    "slug": "george-cooks",
    "creator_reference": "crt_8f2k1m9x4p7w3q5z",
    "links": [
      { "title": "YouTube Channel", "url": "https://youtube.com/@georgecooks" }
    ],
    "service_rates": {
      "currency": "NGN",
      "rates": [
        { "name": "IG Story Post", "description": "One Instagram story mention", "amount": 5000000 }
      ]
    },
    "status": "published",
    "access_type": "public",
    "created": 1767052800000,
    "updated": 1767052800000,
    "deleted": null
  }
}
```

> **CRITICAL**: The `access_code` field is **entirely omitted** from retrieval responses, even for private cards accessed with the correct code.

---

### Error Responses

**Card not found (NF01)**:
```json
{
  "status": "error",
  "message": "Creator card not found",
  "code": "NF01"
}
```

**Card is a draft (NF02)**:
```json
{
  "status": "error",
  "message": "Creator card not found",
  "code": "NF02"
}
```

**Private card — access code required (AC03)**:
```json
{
  "status": "error",
  "message": "This card is private. An access code is required",
  "code": "AC03"
}
```

**Private card — wrong access code (AC04)**:
```json
{
  "status": "error",
  "message": "Invalid access code",
  "code": "AC04"
}
```

---

## Endpoint 3 — Delete Creator Card

### `DELETE /creator-cards/:slug`

Deletes the card tied to the given slug. The deletion is a **soft-delete**: the `deleted` field is set to the current Unix epoch milliseconds timestamp. Once deleted, the card must no longer be retrievable via the public retrieval endpoint.

---

### Path Parameters

| Parameter | Required | Description |
|---|---|---|
| `slug` | Yes | The slug of the card to delete |

### Request Body

```json
{
  "creator_reference": "crt_8f2k1m9x4p7w3q5z"
}
```

| Field | Required | Rules |
|---|---|---|
| `creator_reference` | Yes | String of exactly 20 characters |

---

### Business Rules

1. If no card with that slug exists (or it has already been deleted) → HTTP 404, code `NF01`.
2. On success → HTTP 200, returning the **deleted card** in the same format as the creation response (including `access_code` and a non-null `deleted` timestamp).

---

### Success Response — HTTP 200

```json
{
  "status": "success",
  "message": "Creator Card Deleted Successfully.",
  "data": {
    "id": "01JG8XYZA2B3C4D5E6F7G8H9J0",
    "title": "George Cooks",
    "description": "George Cooks is a weekly cooking podcast by Chef George AmadiObi",
    "slug": "george-cooks",
    "creator_reference": "crt_8f2k1m9x4p7w3q5z",
    "links": [
      { "title": "YouTube Channel", "url": "https://youtube.com/@georgecooks" },
      { "title": "Instagram", "url": "https://instagram.com/georgecooks" }
    ],
    "service_rates": {
      "currency": "NGN",
      "rates": [
        { "name": "IG Story Post", "description": "One Instagram story mention", "amount": 5000000 },
        { "name": "Recipe Feature", "description": "Featured recipe segment on the podcast", "amount": 15000000 }
      ]
    },
    "status": "published",
    "access_type": "public",
    "access_code": null,
    "created": 1767052800000,
    "updated": 1767052800000,
    "deleted": 1767139200000
  }
}
```

> **Note**: The delete response uses the **same shape as the creation response** — `access_code` is included (null for public cards). The `deleted` field is a Unix epoch milliseconds timestamp, not null.

---

### Error Response

**Card not found (NF01)**:
```json
{
  "status": "error",
  "message": "Creator card not found",
  "code": "NF01"
}
```

---

## Validation Specs (VSL)

These specs are used with `@app-core/validator`. Parse each spec once outside the service function.

### Create Card Spec — `services/creator-card/create-card.js`

```javascript
const createCardSpec = `root {
  title string<trim|lengthBetween:3,100>
  description? string<trim|maxLength:500>
  slug? string<trim|lengthBetween:5,50>
  creator_reference string<trim|length:20>
  links[]? {
    title string<trim|lengthBetween:1,100>
    url string<trim|maxLength:200>
  }
  service_rates? {
    currency string(NGN|USD|GBP|GHS)
    rates[] {
      name string<trim|lengthBetween:3,100>
      description? string<trim|maxLength:250>
      amount number<min:1>
    }
  }
  status string(draft|published)
  access_type? string(public|private)
  access_code? string<lengthBetween:1,6>
}`;
```

> **Note on `access_code` in VSL**: The exact-6-alphanumeric constraint on `access_code` and the conditional `access_type`/`access_code` relationship are **business rules** implemented as manual checks after VSL validation runs — the VSL handles basic type/presence, while `throwAppError` with `AC01`/`AC05` handles the conditional logic.

### Get Card Spec — `services/creator-card/get-card.js`

```javascript
const getCardSpec = `root {
  slug string<trim|lengthBetween:5,50>
  access_code? string
}`;
```

### Delete Card Spec — `services/creator-card/delete-card.js`

```javascript
const deleteCardSpec = `root {
  slug string<trim|lengthBetween:5,50>
  creator_reference string<trim|length:20>
}`;
```

---

## Messages File

**Location**: `messages/creator-card.js`

```javascript
const CreatorCardMessages = {
  // Creation
  SLUG_ALREADY_TAKEN: 'Slug is already taken',
  ACCESS_CODE_REQUIRED_FOR_PRIVATE: 'access_code is required when access_type is private',
  ACCESS_CODE_NOT_ALLOWED_ON_PUBLIC: 'access_code can only be set on private cards',

  // Retrieval
  CARD_NOT_FOUND: 'Creator card not found',
  CARD_IS_DRAFT: 'Creator card not found',
  PRIVATE_CARD_ACCESS_CODE_REQUIRED: 'This card is private. An access code is required',
  INVALID_ACCESS_CODE: 'Invalid access code',

  // Success messages
  CARD_CREATED: 'Creator Card Created Successfully.',
  CARD_RETRIEVED: 'Creator Card Retrieved Successfully.',
  CARD_DELETED: 'Creator Card Deleted Successfully.',
};

module.exports = CreatorCardMessages;
```

Register in `messages/index.js`:

```javascript
const AuthenticationMessages = require('./authentication');
const CreatorCardMessages = require('./creator-card');

module.exports = {
  AuthenticationMessages,
  CreatorCardMessages,
};
```

---

## Model Definition

**Location**: `models/creator-card.js`

```javascript
const { ModelSchema, SchemaTypes, DatabaseModel } = require('@app-core/mongoose');

const modelName = 'creator-cards';

const schemaConfig = {
  _id: { type: SchemaTypes.ULID, required: true },
  title: { type: SchemaTypes.String, required: true },
  description: { type: SchemaTypes.String },
  slug: { type: SchemaTypes.String, required: true, unique: true },
  creator_reference: { type: SchemaTypes.String, required: true },
  links: { type: SchemaTypes.Mixed, default: [] },
  service_rates: { type: SchemaTypes.Mixed, default: null },
  status: { type: SchemaTypes.String, required: true },
  access_type: { type: SchemaTypes.String, required: true, default: 'public' },
  access_code: { type: SchemaTypes.String, default: null },
  created: { type: SchemaTypes.Number, required: true },
  updated: { type: SchemaTypes.Number, required: true },
  deleted: { type: SchemaTypes.Number, default: null },
};

const modelSchema = new ModelSchema(schemaConfig, { collection: modelName });

module.exports = DatabaseModel.model(modelName, modelSchema);
```

Register in `models/index.js`:

```javascript
module.exports = {
  CreatorCard: require('./creator-card'),
};
```

---

## Slug Auto-Generation Algorithm

Applied only when the client **omits** the `slug` field.

```
1. Lowercase the title
2. Replace all whitespace characters with hyphens
3. Remove any characters that are not letters (a-z), numbers (0-9), hyphens (-), or underscores (_)
4. If the result is shorter than 5 characters OR the slug is already taken by another card:
     → Append a hyphen followed by a random 6-character alphanumeric suffix
     → e.g., "cook-a8x2k1"
```

Use `randomBytes` from `@app-core/randomness` or a simple `Math.random` approach to generate the 6-character suffix.

> **Important**: If the client **provides** a slug and it is already taken, return `SL02`. Auto-generation (and silent suffix appending) only applies when the client omits the slug entirely.

---

## ID Serialization Rule

MongoDB stores the document identifier in `_id`. **Every** API response must expose it as `id`.

This means the serialization layer (in the service or repository) must:

1. Extract the `_id` field from the Mongoose document.
2. Rename it to `id` in the response object.
3. **Never** return `_id` in any API response body.

Recommended pattern in the service:

```javascript
function serializeCard(doc) {
  const card = doc.toObject ? doc.toObject() : { ...doc };
  card.id = card._id;
  delete card._id;
  delete card.__v;
  return card;
}
```

The retrieval endpoint additionally **omits `access_code`** from the serialized output:

```javascript
function serializeCardForRetrieval(doc) {
  const card = serializeCard(doc);
  delete card.access_code;
  return card;
}
```

---

## Test Cases Reference

| # | Method | Path | Body / Query | Expected HTTP | Expected Code |
|---|---|---|---|---|---|
| 1 | POST | `/creator-cards` | Full valid payload | 200 | — |
| 2 | POST | `/creator-cards` | No `slug` field | 200 | — (slug auto-generated) |
| 3 | POST | `/creator-cards` | `access_type: "private"`, `access_code: "A1B2C3"` | 200 | — |
| 4 | GET | `/creator-cards/george-cooks` | — | 200 | — |
| 5 | GET | `/creator-cards/vip-rate-card` | `?access_code=A1B2C3` | 200 | — |
| 6 | DELETE | `/creator-cards/ada-designs-things` | `creator_reference` | 200 | — |
| 7 | POST | `/creator-cards` | Duplicate `slug: "george-cooks"` | 400 | `SL02` |
| 8 | POST | `/creator-cards` | `access_type: "private"`, no `access_code` | 400 | `AC01` |
| 9 | POST | `/creator-cards` | `access_type: "public"`, `access_code: "A1B2C3"` | 400 | `AC05` |
| 10 | POST | `/creator-cards` | `status: "archived"` | 400 | — (VSL error) |
| 11 | GET | `/creator-cards/does-not-exist-123` | — | 404 | `NF01` |
| 12 | GET | `/creator-cards/my-draft-card` | — | 404 | `NF02` |
| 13 | GET | `/creator-cards/vip-rate-card` | No `access_code` | 403 | `AC03` |
| 14 | GET | `/creator-cards/vip-rate-card` | `?access_code=WRONG1` | 403 | `AC04` |
| 15 | DELETE | `/creator-cards/does-not-exist-123` | `creator_reference` | 404 | `NF01` |
| 16 | GET | `/creator-cards/ada-designs-things` | — (card deleted in TC6) | 404 | `NF01` |
