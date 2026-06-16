const { createHandler } = require('@app-core/server');
const { appLogger } = require('@app-core/logger');
const { CreatorCardMessages } = require('@app/messages');
const deleteCardService = require('@app/services/creator-card/delete-card');

module.exports = createHandler({
  path: '/creator-cards/:slug',
  method: 'delete',
  middlewares: [],
  async onResponseEnd(rc, rs) {
    appLogger.info({ requestContext: rc, response: rs }, 'delete-creator-card-request-completed');
  },
  async handler(rc, helpers) {
    const payload = {
      ...rc.params,
      ...rc.body,
    };

    const result = await deleteCardService(payload);

    return {
      status: helpers.http_statuses.HTTP_200_OK,
      message: CreatorCardMessages.CARD_DELETED,
      data: result,
    };
  },
});
