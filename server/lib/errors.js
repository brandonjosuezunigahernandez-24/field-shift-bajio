// Error with an HTTP status and a message in plain Spanish that is safe to show to the farmer.
export class HttpError extends Error {
  // `details`: extra fields for the JSON body, e.g. { fuera_de_region: true }.
  constructor(status, message, details = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}
