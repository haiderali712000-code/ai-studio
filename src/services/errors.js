// Errors whose message is safe to show to the user.
class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'UserError';
    this.status = status;
  }
}
module.exports = { UserError };
