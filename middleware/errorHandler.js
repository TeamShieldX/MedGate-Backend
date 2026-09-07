/**
 * Global Error Handling Middleware
 * 
 * Catches all unhandled errors and returns clean JSON responses
 */

function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.url} - ${err.message}`);

  const statusCode = err.statusCode || err.status || 500;
  const response = {
    success: false,
    error: err.message || 'Internal Server Error',
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
