// Ridge en JS puro: estandariza X, resuelve (XtX + lambda I) w = Xty. Sin dependencias.
export function fitRidge(X, y, lambda = 10) {
  const n = X.length, p = X[0]?.length ?? 0;
  const mean = Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[j], 0) / n);
  const sd = Array.from({ length: p }, (_, j) => Math.sqrt(X.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / n) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - mean[j]) / sd[j]));
  const ym = y.reduce((s, v) => s + v, 0) / n;
  const A = Array.from({ length: p }, (_, i) => [...Array.from({ length: p }, (_, j) => Z.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? lambda : 0)), Z.reduce((s, r, k) => s + r[i] * (y[k] - ym), 0)]);
  for (let i = 0; i < p; i++) { // eliminacion gaussiana con pivoteo
    let m = i;
    for (let k = i + 1; k < p; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k;
    [A[i], A[m]] = [A[m], A[i]];
    for (let k = i + 1; k < p; k++) { const f = A[k][i] / A[i][i]; for (let c = i; c <= p; c++) A[k][c] -= f * A[i][c]; }
  }
  const coef = Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) {
    let r = A[i][p];
    for (let c = i + 1; c < p; c++) r -= A[i][c] * coef[c];
    coef[i] = r / A[i][i];
  }
  return { mean, sd, coef, intercept: ym };
}

export const predictRidge = (m, x) => m.intercept + m.coef.reduce((s, c, j) => s + c * ((x[j] - m.mean[j]) / m.sd[j]), 0);
