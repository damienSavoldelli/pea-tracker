import type { FinancialMcpService } from '../../application/financial-mcp';
import { divide, fractionValue, parseFraction } from '../../domain/fractions';

export const escapeConfirmation = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const escape = escapeConfirmation;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const field = (value: unknown) => typeof value === 'string' ? value : 'Indisponible';
const decimal = (value: unknown) => escape(field(value).replace('.', ','));
const money = (value: unknown) => typeof value === 'string' ? `${decimal(value)} €` : 'Indisponible';
const paris = (value: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value));
const item = (label: string, value: string) => `<div><dt>${escape(label)}</dt><dd>${value}</dd></div>`;

/** Static script: absolute proposal timestamps are read from escaped HTML attributes. */
const countdownScript = `(() => {
  const panel = document.getElementById('expiry');
  const remaining = document.getElementById('remaining');
  const progress = document.getElementById('expiry-progress');
  const button = document.getElementById('approve');
  if (!panel || !remaining || !progress || !button) return;
  const expires = Date.parse(panel.dataset.expires);
  const prepared = Date.parse(panel.dataset.prepared);
  let timer;
  function update() {
    const seconds = Math.max(0, Math.ceil((expires - Date.now()) / 1000));
    const valid = Number.isFinite(seconds) && Number.isFinite(prepared) && expires > prepared;
    const left = valid ? seconds : 0;
    remaining.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
    progress.value = valid ? Math.max(0, Math.min(100, (expires - Date.now()) / (expires - prepared) * 100)) : 0;
    panel.dataset.level = left <= 30 ? 'danger' : left <= 60 ? 'warning' : 'normal';
    if (!valid || left === 0) {
      button.disabled = true;
      document.getElementById('expiry-message').textContent = 'Proposition expirée. Préparez une nouvelle proposition depuis ChatGPT.';
      clearInterval(timer);
    }
  }
  timer = setInterval(update, 1000);
  update();
})();`;

export function confirmationDocument(title: string, body: string, nonce: string, countdown = false) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} — PEA Tracker</title><style nonce="${nonce}">
    :root{font-family:system-ui,sans-serif;color:#0F172A;background:#F1F5F9;line-height:1.5;font-synthesis:none}
    *{box-sizing:border-box}body{margin:0;padding:24px 16px}main{max-width:760px;margin:auto}
    header{display:flex;align-items:center;gap:10px;margin-bottom:20px;font-weight:750;font-size:1.1rem}.brand-icon{color:#2563EB;width:30px;height:30px}
    article{background:#FFFFFF;border:1px solid #e2e8f0;border-radius:16px;padding:28px}h1{font-size:1.6rem;line-height:1.25;margin:0 0 12px}h2{font-size:1.05rem;margin:0 0 12px}
    p{margin:0 0 16px}.secondary,dt{color:#64748B}.notice{background:#eff6ff;border-left:3px solid #2563EB;padding:12px;border-radius:6px}
    section{margin:24px 0}dl{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:16px}dt{font-size:.875rem}dd{margin:3px 0 0;overflow-wrap:anywhere}
    .key dd{font-size:1.4rem;font-weight:700}.total{border-top:1px solid #e2e8f0;padding-top:12px;font-weight:700}.wide{grid-column:1/-1}
    details{border-top:1px solid #e2e8f0;padding-top:16px;margin:24px 0;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:600}details dl{margin-top:16px;font-size:.875rem}
    #expiry{padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;--timer:#2563EB}#expiry[data-level=warning]{--timer:#b45309}#expiry[data-level=danger]{--timer:#b91c1c}
    #remaining{color:var(--timer);font-variant-numeric:tabular-nums;font-weight:700}progress{display:block;width:100%;height:6px;margin-top:12px;accent-color:var(--timer)}progress::-webkit-progress-value{background:var(--timer)}progress::-webkit-progress-bar{background:#e2e8f0;border-radius:4px}
    button,.button{display:block;width:100%;min-height:44px;padding:10px 16px;border:0;border-radius:8px;background:#2563EB;color:#fff;font:inherit;font-weight:600;cursor:pointer;text-align:center;text-decoration:none}button:hover:not(:disabled),.button:hover{background:#1E40AF}button:disabled{background:#cbd5e1;color:#475569;cursor:not-allowed}
    button:focus-visible,.button:focus-visible,summary:focus-visible{outline:3px solid #2563EB;outline-offset:4px}.error-code{font-size:.85rem;color:#64748B;overflow-wrap:anywhere}
    @media(max-width:520px){body{padding:16px 12px}article{padding:20px 16px}dl{grid-template-columns:1fr}.key{grid-template-columns:1fr 1fr}h1{font-size:1.4rem}}
  </style></head><body><main><header><svg class="brand-icon" aria-hidden="true" viewBox="0 0 32 32" fill="none"><rect x="2" y="2" width="28" height="28" rx="7" stroke="currentColor" stroke-width="2"/><path d="M8 22V17M16 22V12M24 22V8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>PEA Tracker</header><article>${body}</article></main>${countdown ? `<script nonce="${nonce}">${countdownScript}</script>` : ''}</body></html>`;
}

type Confirmation = Awaited<ReturnType<FinancialMcpService['confirmationPage']>>;
export function confirmationBody(result: Confirmation, id: string, csrf: string) {
  const { proposal, summary } = result;
  const operation = proposal.input;
  const title = { buy: 'Achat exécuté', sell: 'Vente exécutée', deposit: 'Versement', withdrawal: 'Retrait', dividend: 'Dividende encaissé', reversal: 'Contrepassation' }[operation.type];
  const instrument = object(summary.instrument);
  let body = `<h1>${title}</h1><p class="notice">Il s'agit uniquement de journaliser une opération déjà exécutée. Aucun ordre de bourse ne sera envoyé.</p>`;
  if (summary.instrument) body += `<section><h2>Instrument</h2><dl>${item('Instrument', escape(field(instrument.name)))}${item('Ticker fournisseur', escape(field(instrument.provider_symbol)))}${item('ISIN', escape(field(instrument.isin)))}</dl></section>`;
  body += `<section><dl>${item('Exécution — heure de Paris', escape(paris(operation.effective_at)))}</dl></section>`;
  if (operation.type === 'buy' || operation.type === 'sell') {
    const unit = fractionValue(divide(parseFraction(operation.amount), parseFraction(operation.quantity)));
    body += `<section><dl class="key">${item('Quantité', decimal(operation.quantity))}${item(unit.rounded ? 'Prix unitaire calculé ≈' : 'Prix unitaire calculé', money(unit.value))}</dl></section>`;
    const total = typeof summary.cash_delta === 'string' ? summary.cash_delta.replace(/^-/, '') : undefined;
    body += `<section><h2>Montants</h2><dl>${item('Montant brut', money(operation.amount))}${item('Frais déclarés', operation.fees === undefined ? 'Non renseignés' : money(operation.fees))}<div class="wide total"><dt>${operation.type === 'buy' ? 'Montant total débité' : 'Montant net crédité'}</dt><dd>${money(total)}</dd></div></dl></section>`;
  } else if (operation.type !== 'reversal') body += `<section><dl class="key">${item(operation.type === 'dividend' ? 'Montant effectivement reçu' : 'Montant', money(operation.amount))}</dl></section>`;
  else body += `<section><dl>${item('Opération corrigée', escape(operation.reversal_of))}${item('Motif', escape(operation.reason))}</dl></section>`;
  body += `<section><h2>Impact sur les liquidités</h2><dl>${item('Avant', money(object(summary.cash_before).amount))}${item('Après', money(object(summary.cash_after).amount))}${item('Variation', money(summary.cash_delta))}</dl></section>`;
  const position = (value: unknown) => Array.isArray(value) ? value.map(object).find(row => row.instrument_id === summary.instrument_id)?.quantity : undefined;
  const before = position(summary.positions_before); const after = position(summary.positions_after);
  if (typeof before === 'string' || typeof after === 'string') body += `<section><h2>Impact sur les positions</h2><dl>${item('Avant', decimal(before))}${item('Après', decimal(after))}${item('Variation des titres', decimal(summary.quantity_delta))}</dl></section>`;
  body += `<section id="expiry" data-prepared="${escape(proposal.prepared_at)}" data-expires="${escape(proposal.expires_at)}"><p>Expiration : <strong>${escape(paris(proposal.expires_at))}</strong> (Paris)</p><p id="expiry-message">Temps restant : <span id="remaining" role="timer">voir l'échéance ci-dessus</span></p><progress id="expiry-progress" max="100" value="0" aria-label="Durée de validité restante"></progress><noscript><p>JavaScript est désactivé. Vérifiez l'heure d'expiration ; le serveur refuse toute approbation expirée.</p></noscript></section>`;
  body += `<details><summary>Informations techniques et références</summary><dl>${item('Proposition', escape(id))}${item('Empreinte', escape(proposal.digest))}${item('Portefeuille', escape(proposal.portfolio_id))}${item('Version attendue du journal', String(proposal.expected_version))}${item('Ouverture', escape(proposal.opening_id))}${item('Révision', String(proposal.opening_revision))}${item('Source', escape(operation.provenance.source))}${item('Référence source', escape(operation.provenance.reference ?? 'Non renseignée'))}${item('Exécution UTC', escape(operation.effective_at))}${item('Expiration UTC', escape(proposal.expires_at))}</dl></details>`;
  return body + `<form method="post" action="/financial-confirmation/${escape(id)}"><input type="hidden" name="csrf" value="${csrf}"><button id="approve" type="submit">Approuver l'enregistrement</button></form><p class="secondary">L'expiration et l'autorisation sont contrôlées par le serveur.</p>`;
}

export function confirmationError(code: string, reconnectUrl?: string) {
  const messages: Record<string, [string, string]> = {
    financial_proposal_expired: ['Proposition expirée', 'Préparez une nouvelle proposition depuis ChatGPT. Aucune nouvelle approbation ne peut être donnée pour cette proposition.'],
    financial_confirmation_already_used: ['Proposition déjà approuvée ou utilisée', "Ne l'approuvez pas de nouveau. Vérifiez son état et son éventuel reçu depuis ChatGPT avant de préparer une autre proposition."],
    invalid_token: ['Authentification requise', 'La session Cloudflare Access est absente ou invalide. Reconnectez-vous avec le compte propriétaire dans votre navigateur.'],
    csrf_rejected: ['Confirmation refusée', 'Rouvrez le lien pour obtenir un formulaire valide, puis vérifiez son récapitulatif.'],
    financial_confirmation_rejected: ['Approbation refusée', 'La proposition ou le formulaire ne permet plus cette approbation. Vérifiez son état depuis ChatGPT.'],
  };
  const [title, message] = messages[code] ?? ['Confirmation indisponible', 'La demande ne peut pas être traitée. Vérifiez votre accès et la proposition depuis ChatGPT.'];
  const reconnect = code === 'invalid_token' && reconnectUrl
    ? `<section><p>Ce bouton réinitialise votre session Cloudflare Access, puis revient à cette proposition pour vous reconnecter avec le compte propriétaire.</p><p class="notice">Attention : cette déconnexion concerne aussi vos autres applications Access. Une reconnexion du connecteur MCP peut être nécessaire. Aucune opération financière ne sera approuvée.</p><a class="button" href="${escape(reconnectUrl)}">Réinitialiser ma connexion Access</a><p class="secondary">Si l'erreur persiste après reconnexion, le parcours d'authentification doit être vérifié. Une proposition expirée devra être préparée de nouveau.</p></section>` : '';
  return { title, body: `<h1>${title}</h1><p>${message}</p>${reconnect}<p class="secondary">Cette page ne confirme aucun enregistrement financier.</p><p class="error-code">Code : ${escape(code)}</p>` };
}
