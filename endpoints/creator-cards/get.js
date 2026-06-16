const { createHandler } = require('@app-core/server');
const { appLogger } = require('@app-core/logger');
const { CreatorCardMessages } = require('@app/messages');
const getCardService = require('@app/services/creator-card/get-card');

module.exports = createHandler({
  path: '/creator-cards/:slug',
  method: 'get',
  middlewares: [],
  async onResponseEnd(rc, rs) {
    const sanitizedContext = {
      ...rc,
      query: { ...rc.query, access_code: rc.query.access_code ? '[REDACTED]' : undefined },
      properties: {
        ...rc.properties,
        requestURL: rc.properties.requestURLWithoutQueryStrings,
      },
    };
    appLogger.info(
      { requestContext: sanitizedContext, response: rs },
      'get-creator-card-request-completed'
    );
  },
  async handler(rc, helpers) {
    const payload = {
      ...rc.query,
      ...rc.params,
    };

    const result = await getCardService(payload);

    return {
      status: helpers.http_statuses.HTTP_200_OK,
      message: CreatorCardMessages.CARD_RETRIEVED,
      data: result,
    };
  },
});
