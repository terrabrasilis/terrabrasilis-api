const ApiException = {
  ApiException: (message) => {
    this.message = message;
    this.name = "ApiException";
 }
};

module.exports = ApiException;