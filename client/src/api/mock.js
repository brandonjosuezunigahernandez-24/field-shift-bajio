import mockRecomendar from '../mocks/recomendar.celaya.json';

// Turn on with VITE_USE_MOCK=1 in client/.env (see .env.example). Only affects /api/recomendar:
// clima and suelo always come from the server, which has its own offline fallback.
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1';

// Same shape as the real response (docs/api-contract.md). The small delay mimics the network
// so loading states can be seen. lat/lon inside the mock are always Celaya's.
export function mockPostRecomendar(payload) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ...mockRecomendar, _peticion: payload }), 400);
  });
}
