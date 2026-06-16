const validator = require('@app-core/validator');
const { throwAppError, ERROR_CODE } = require('@app-core/errors');
const { appLogger } = require('@app-core/logger');
const { CreatorCardMessages } = require('@app/messages');
const CreatorCardRepository = require('@app/repository/creator-card');

const deleteCardSpec = `root {
  slug string<trim|lengthBetween:5,50>
  creator_reference string<trim|length:20>
}`;

const parsedDeleteCardSpec = validator.parse(deleteCardSpec);

function serializeCard(doc) {
  const card = { ...doc };
  card.id = card._id;
  delete card._id;
  delete card.__v;
  return card;
}

async function deleteCard(serviceData, options = {}) {
  let response;

  const data = validator.validate(serviceData, parsedDeleteCardSpec);

  try {
    const { slug, creator_reference: creatorReference } = data;

    const card = await CreatorCardRepository.findOne({
      query: { slug, creator_reference: creatorReference, deleted: null },
    });

    if (!card) {
      throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NOTFOUND, { code: 'NF01' });
    }

    const deletedAt = Date.now();

    const updateResult = await CreatorCardRepository.updateOne({
      query: { slug, creator_reference: creatorReference, deleted: null },
      updateValues: { deleted: deletedAt },
    });

    if (!updateResult.modifiedCount) {
      throwAppError(CreatorCardMessages.CARD_NOT_FOUND, ERROR_CODE.NOTFOUND, { code: 'NF01' });
    }

    const plain = card.toObject ? card.toObject() : { ...card };
    plain.deleted = deletedAt;

    response = serializeCard(plain);
  } catch (error) {
    appLogger.errorX(error, 'delete-creator-card-error');
    throw error;
  }

  return response;
}

module.exports = deleteCard;
