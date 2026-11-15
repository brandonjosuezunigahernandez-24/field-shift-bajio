// Regresion logistica con L2 (IRLS / Newton) sobre variables estandarizadas. JS puro.
function solve(A, b) { // A n x n, b n; eliminacion gaussiana con pivoteo
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let m = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[m][i])) m = k;
    [M[i], M[m]] = [M[m], M[i]];
    for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let c = i; c <= n; c++) M[k][c] -= f * M[i][c]; }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let r = M[i][n]; for (let c = i + 1; c < n; c++) r -= M[i][c] * x[c]; x[i] = r / M[i][i]; }
  return x;
}
const sig = (z) => 1 / (1 + Math.exp(-z));

export function fitLogit(X, y, lambda = 5, iters = 25) {
  const n = X.length, p = X[0]?.length ?? 0;
  const mean = Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[j], 0) / n);
  const sd = Array.from({ length: p }, (_, j) => Math.sqrt(X.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / n) || 1);
  const Z = X.map((r) => [1, ...r.map((v, j) => (v - mean[j]) / sd[j])]);
  let w = Array(p + 1).fill(0);
  for (let it = 0; it < iters; it++) {
    const pr = Z.map((r) => sig(r.reduce((s, v, j) => s + v * w[j], 0)));
    const g = Array(p + 1).fill(0), H = Array.from({ length: p + 1 }, () => Array(p + 1).fill(0));
    Z.forEach((r, k) => { const d = pr[k] * (1 - pr[k]) + 1e-6; for (let i = 0; i <= p; i++) { g[i] += r[i] * (y[k] - pr[k]); for (let j = 0; j <= p; j++) H[i][j] += d * r[i] * r[j]; } });
    for (let i = 1; i <= p; i++) { g[i] -= lambda * w[i]; H[i][i] += lambda; }
    H[0][0] += 1e-6;
    const step = solve(H, g);
    w = w.map((v, i) => v + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-6) break;
  }
  return { mean, sd, w };
}
export const predictLogit = (m, x) => sig(m.w[0] + x.reduce((s, v, j) => s + m.w[j + 1] * ((v - m.mean[j]) / m.sd[j]), 0));

export function auc(p, y) { // Mann-Whitney
  const idx = p.map((v, i) => [v, y[i]]).sort((a, b) => a[0] - b[0]);
  let rankSum = 0, n1 = 0;
  for (let i = 0; i < idx.length;) {
    let j = i; while (j < idx.length && idx[j][0] === idx[i][0]) j++;
    const r = (i + j + 1) / 2; // rango medio
    for (let k = i; k < j; k++) if (idx[k][1]) { rankSum += r; n1++; }
    i = j;
  }
  const n0 = idx.length - n1;
  return n1 && n0 ? (rankSum - (n1 * (n1 + 1)) / 2) / (n1 * n0) : NaN;
}
