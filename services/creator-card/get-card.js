const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const { CreatorCardMessages } = require('@app/messages');
const CreatorCardRepository = require('@app/repository/creator-card');

const getCardSpec = `root {
  slug string<trim|lengthBetween:5,50>
  access_code? string
}`;

const parsedGetCardSpec = validator.parse(getCardSpec);

function serializeCard(doc) {
  const card = { ...doc };
  card.id = card._id;
  delete card._id;
  delete card.__v;
  return card;
}

function serializeCardForRetrieval(doc) {
  const card = serializeCard(doc);
  delete card.access_code;
  return card;
}

async function getCard(serviceData, options = {}) {
  let response;

  const data = validator.validate(serviceData, parsedGetCardSpec);

  try {
    const { slug, access_code: accessCode } = data;

    const card = await CreatorCardRepository.findOne({ query: { slug, deleted: null } });

    if (!card) {
      throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NOTFOUND, { code: 'NF01' });
    }

    if (card.status === 'draft') {
      throwAppError(CreatorCardMessages.CARD_IS_DRAFT, ERROR_CODE.NOTFOUND, { code: 'NF02' });
    }

    if (card.access_type === 'private' && !accessCode) {
      throwAppError(CreatorCardMessages.PRIVATE_CARD_ACCESS_CODE_REQUIRED, ERROR_CODE.INVLDREQ, {
        code: 'AC03',
      });
    }

    if (card.access_type === 'private' && accessCode !== card.access_code) {
      throwAppError(CreatorCardMessages.INVALID_ACCESS_CODE, ERROR_CODE.INVLDREQ, { code: 'AC04' });
    }

    response = serializeCardForRetrieval(card.toObject ? card.toObject() : card);
  } catch (error) {
    appLogger.errorX(error, 'get-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = getCard;
