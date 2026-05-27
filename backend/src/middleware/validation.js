/**
 * Request validation middleware
 */
const validate = (schema) => {
  return (req, res, next) => {
    try {
      if (schema.body) {
        const requiredFields = schema.body;
        const missingFields = requiredFields.filter((field) => !(field in req.body));

        if (missingFields.length > 0) {
          return res.status(400).json({
            status: 'error',
            message: `Missing required fields: ${missingFields.join(', ')}`,
          });
        }
      }

      if (schema.params) {
        const requiredFields = schema.params;
        const missingFields = requiredFields.filter((field) => !(field in req.params));

        if (missingFields.length > 0) {
          return res.status(400).json({
            status: 'error',
            message: `Missing required params: ${missingFields.join(', ')}`,
          });
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { validate };
