// Error with an HTTP status and a message in plain Spanish that is safe to show to the farmer.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}
