# Creator Card Service

## Table of Contents

1. [Overview](#overview)
2. [Pre-requisites](#pre-requisites)
3. [Running the API](#running-the-api)
4. [API Docs](#api-docs)

---

## Overview

Creator Card Service is a REST API that allows creators to publish shareable profile cards showcasing their links and service rates. Each card can be public or private (access-code protected), and supports optional structured service rate listings in multiple currencies.

The service exposes three endpoints — create a card, retrieve a card by its slug, and soft-delete a card — with no authentication required.

---

## Pre-requisites

Ensure the following are installed and available before running the service locally:

- **Node.js** v18 or higher
- **npm** v9 or higher
- **MongoDB** — a running instance (local or remote); the connection URI is configured via `MONGODB_URI` in the `.env` file

---

## Running the API

**Dev base URL:** `https://creator-card-service-h2iz.onrender.com`

### Run locally

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file and fill in the required values:

   ```bash
   cp .env.example .env
   ```

   Required variables:

   | Variable | Description |
   |---|---|
   | `PORT` | Port the server will listen on (e.g. `3000`) |
   | `MONGODB_URI` | MongoDB connection string |
   | `APP_NAME` | Application name used in logs |

3. Start the server:

   ```bash
   node app.js
   ```

   The API will be available at `http://localhost:<PORT>`.

---

## API Docs

All endpoints are mounted at the root — there is no `/v1/` or `/api/` prefix.

---

### POST `/creator-cards`

Creates a new Creator Card.

**Request body**

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

**Fields**

| Field | Required | Description |
|---|---|---|
| `title` | Yes | 3–100 characters |
| `description` | No | Max 500 characters |
| `slug` | No | 5–50 characters; letters, numbers, hyphens and underscores only. Auto-generated from the title if omitted |
| `creator_reference` | Yes | Exactly 20 characters; identifies the creator on the consuming service |
| `links` | No | Array of `{ title, url }` objects. `url` must start with `http://` or `https://` |
| `service_rates` | No | Object with `currency` (`NGN \| USD \| GBP \| GHS`) and a non-empty `rates` array |
| `status` | Yes | `draft` or `published` |
| `access_type` | No | `public` (default) or `private` |
| `access_code` | Conditional | Exactly 6 alphanumeric characters. Required when `access_type` is `private`; must not be set when `access_type` is `public` |

**Success — HTTP 200**

```json
{
  "status": "success",
  "message": "Creator Card Created Successfully.",
  "data": { ...card }
}
```

The `access_code` field is included in the creation response (`null` for public cards, plaintext for private cards).

**Errors**

| HTTP | Code | Reason |
|---|---|---|
| 400 | `SL02` | The provided slug is already taken |
| 400 | `AC01` | `access_type` is `private` but `access_code` was not provided |
| 400 | `AC05` | `access_code` is set but `access_type` is `public` |
| 400 | — | Field-level validation failure |

---

### GET `/creator-cards/:slug`

Retrieves a single Creator Card by its slug.

**Path parameters**

| Parameter | Description |
|---|---|
| `slug` | The slug of the card to retrieve |

**Query parameters**

| Parameter | Required | Description |
|---|---|---|
| `access_code` | Conditional | Required when the card is `private`. Example: `?access_code=A1B2C3` |

**Success — HTTP 200**

```json
{
  "status": "success",
  "message": "Creator Card Retrieved Successfully.",
  "data": { ...card }
}
```

The `access_code` field is **omitted** from retrieval responses, even for private cards accessed with the correct code.

**Errors**

| HTTP | Code | Reason |
|---|---|---|
| 404 | `NF01` | No non-deleted card exists with the given slug |
| 404 | `NF02` | Card exists but is a `draft` |
| 403 | `AC03` | Card is `private` and no `access_code` query param was provided |
| 403 | `AC04` | Card is `private` and the supplied `access_code` is incorrect |

---

### DELETE `/creator-cards/:slug`

Soft-deletes a Creator Card. The card's `deleted` field is set to the current Unix timestamp in milliseconds; it will no longer be retrievable via the public retrieval endpoint.

**Path parameters**

| Parameter | Description |
|---|---|
| `slug` | The slug of the card to delete |

**Request body**

```json
{
  "creator_reference": "crt_8f2k1m9x4p7w3q5z"
}
```

| Field | Required | Description |
|---|---|---|
| `creator_reference` | Yes | Exactly 20 characters |

**Success — HTTP 200**

```json
{
  "status": "success",
  "message": "Creator Card Deleted Successfully.",
  "data": { ...card }
}
```

The response returns the deleted card in full (same shape as the creation response), with `access_code` included and `deleted` set to a non-null timestamp.

**Errors**

| HTTP | Code | Reason |
|---|---|---|
| 404 | `NF01` | No non-deleted card exists with the given slug |

