/**
 * Throw an app error
 * @param {String} errorMessage
 * @param {String} [errorCode]
 * @param {{context:any, details:any, code:string}} [options]
 */
function appError(errorMessage, errorCode = 'ERR', options = {}) {
  const error = new Error(errorMessage);
  error.isApplicationError = true;
  error.errorCode = errorCode;

  if (options.context) {
    error.context = options.context;
  }

  if (options.details) {
    error.details = options.details;
  }

  if (options.code) {
    error.applicationCode = options.code;
  }

  throw error;
}

module.exports = appError;
