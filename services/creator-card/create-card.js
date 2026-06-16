const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const { randomBytes } = require('@app-core/randomness');
const { CreatorCardMessages } = require('@app/messages');
const CreatorCardRepository = require('@app/repository/creator-card');

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
  access_code? string<length:6>
}`;

const parsedCreateCardSpec = validator.parse(createCardSpec);

function serializeCard(doc) {
  const card = { ...doc };
  card.id = card._id;
  delete card._id;
  delete card.__v;
  return card;
}

function generateSlugSuffix() {
  return randomBytes(6);
}

function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '');
}

async function createCard(serviceData, options = {}) {
  let response;

  const data = validator.validate(serviceData, parsedCreateCardSpec);

  try {
    const accessType = data.access_type || 'public';
    const accessCode = data.access_code || null;

    if (accessCode && accessType !== 'private') {
      throwAppError(CreatorCardMessages.ACCESS_CODE_NOT_ALLOWED_ON_PUBLIC, ERROR_CODE.INVLDDATA, {
        code: 'AC05',
      });
    }

    if (accessType === 'private' && !accessCode) {
      throwAppError(CreatorCardMessages.ACCESS_CODE_REQUIRED_FOR_PRIVATE, ERROR_CODE.INVLDDATA, {
        code: 'AC01',
      });
    }

    if (accessCode && !/^[a-zA-Z0-9]{6}$/.test(accessCode)) {
      throwAppError('access_code must be exactly 6 alphanumeric characters', ERROR_CODE.INVLDDATA);
    }

    if (data.links && data.links.length > 0) {
      data.links.forEach((link) => {
        if (!/^https?:\/\//i.test(link.url)) {
          throwAppError('Each link url must start with http:// or https://', ERROR_CODE.INVLDDATA);
        }
      });
    }

    if (data.service_rates && data.service_rates.rates) {
      data.service_rates.rates.forEach((rate) => {
        if (!Number.isInteger(rate.amount) || rate.amount < 1) {
          throwAppError(
            'service_rates.rates[].amount must be a positive integer',
            ERROR_CODE.INVLDDATA
          );
        }
      });
    }

    let { slug } = data;
    const clientProvidedSlug = !!slug;

    if (clientProvidedSlug) {
      if (!/^[a-zA-Z0-9\-_]+$/.test(slug)) {
        throwAppError(
          'Slug may only contain letters, numbers, hyphens, and underscores',
          ERROR_CODE.INVLDDATA
        );
      }

      const existing = await CreatorCardRepository.findOne({ query: { slug, deleted: null } });
      if (existing) {
        throwAppError(CreatorCardMessages.SLUG_ALREADY_TAKEN, ERROR_CODE.INVLDDATA, {
          code: 'SL02',
        });
      }
    } else {
      slug = slugifyTitle(data.title);

      if (slug.length < 5) {
        slug = `${slug}-${generateSlugSuffix()}`;
      } else {
        const existing = await CreatorCardRepository.findOne({ query: { slug, deleted: null } });
        if (existing) {
          slug = `${slug}-${generateSlugSuffix()}`;
        }
      }
    }

    const cardData = {
      title: data.title,
      description: data.description || null,
      slug,
      creator_reference: data.creator_reference,
      links: data.links || [],
      service_rates: data.service_rates || null,
      status: data.status,
      access_type: accessType,
      access_code: accessCode,
      deleted: null,
    };

    const created = await CreatorCardRepository.create(cardData);

    response = serializeCard(created);
  } catch (error) {
    appLogger.errorX(error, 'create-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = createCard;
