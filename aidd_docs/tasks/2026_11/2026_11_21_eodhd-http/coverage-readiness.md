# EODHD coverage qualification — preparation, 24 November 2026

Status: **one authorized capture completed; production admission remains closed**.

Latest outcome: 16/16 remaining confirmed codes returned, actual group cost 16 API
units, reference+group 17/20 daily units, no bonus consumption or retry. Combined
with the three acquired samples, 19/20 instrument identities have response evidence;
one conflicting identity stays excluded. All 16 were compared with stored Yahoo
quotes through read-only MCP. Raw/derived price data stays private; semantic
equivalence and live fallback are not admitted. See
[completed real checkpoint](finalization.md#authorized-real-capture-and-stored-yahoo-comparison--completed-checkpoint).
Earlier preparation and blocking checkpoints below are historical.

Subsequent offline archive review completes the missing MIC links: **16 identity
mappings qualified, one ISIN conflict excluded**. It reuses independently qualified
broker-source metadata and the EODHD directory, retaining the ALXP exchange evidence.
Identity is not quote-quality/semantics qualification. The 16:30 dashboard still
reports prior-day activity; a prepared same-key `/user` check costs zero units and
can gate the one 16-unit snapshot plus post-read actual metering. No agent token is
available; only plan mode has run. See the
[latest evidence and execution gate](finalization.md#archived-mic-evidence-recovered-and-same-key-metering-gate).
Earlier checkpoints below retain the evidence that was available at their dates.

Latest offline checkpoint: the private reference has been received and inspected;
1 exact identity/venue confirmation, 15 pending venue proofs and 1 ISIN conflict
excluded. See [current qualification and conditional authorization](finalization.md#conditional-collection-instruction--subsequent-offline-checkpoint).
The owner's most recent counter fields were placeholders, not usable usage evidence.
A future complete nonconflicting group would contain 16 symbols, cost 16 API units
in one HTTP attempt, and total 17 with the reference. This is a forecast, not a
measured charge or authorization to execute. Earlier 17-symbol planning below is
preserved as the pre-reference checkpoint.

Branch: `feat/v2.0d-multi-provider`. Reuse the 80 acquired tests and
[D6 shadow planner](shadow-selection.md); none rerun. No authenticated supplier
request, active collector edit, financial write, merge or deployment.

## Coverage evidence

Read only the active instrument catalogue through `list_instruments`: 20 entries,
all with ISIN, source ticker, market, currency and unit metadata. No holdings,
cash or valuation queried. The three acquired EODHD samples are excluded from
new calls. A private ignored owner-only manifest records the remaining 17 rows;
its location and instrument list must not enter public documentation.

Public EODHD financial-summary pages match ticker/name for **16 of 17 candidates**.
These are evidence of candidate presence, not exact identity: public stock pages
mask their ISIN and ETF pages do not establish the full identifier/listing link.
The ALXP candidate page could not be fetched; this is inconclusive, not proof of
unsupported coverage. A `.PA` suffix alone does not establish XPAR versus ALXP.
No candidate is marked `provider_identity_verified` on this evidence alone.

To complete identity qualification, obtain an existing EODHD reference/export
matching full ISIN, provider code, listing/venue and currency/unit, with its source
date. Resolve ambiguity rather than guessing. Prefer one exchange symbol-list
export to 17 individual searches; its all-plan availability and one-unit charge
are documented in the follow-up below. The reference call is additional to the
17-unit quote budget. Public name matches do not establish actual quote availability
on Free; the eventual capture must report each absent/rejected row independently.

The owner can supply an existing provider reference without a new quote call.
Without it, complete coverage remains unverified; do not turn the private manifest's
flags on merely to unblock execution. Archive the reviewed manifest digest with
the capture, keeping source evidence private.

## Cost and rights

### Account evidence and reference acquisition — follow-up

Owner supplied a dashboard capture dated 24 November: 9/20 daily units, last use
23 November, 500 extra units, data available. The prior nine units correspond to
three three-symbol passes. This is consistent with published per-symbol metering,
not an isolated before/after measurement of the future request.

[Official counter semantics](https://eodhd.com/financial-apis/api-limits) and the
[monitoring explanation](https://eodhd.com/financial-apis-blog/user-api-and-monitoring-daily-api-limits)
state midnight UTC reset, but the prior-day count/date remains until a new request.
Thus do not subtract the displayed nine from today's twenty, or fabricate a
current zero counter. A separately authorized reference request can establish the
current-day display; then inspect the refreshed dashboard before any quote call.
If it shows one unit today and there are no concurrent consumers, one reference
plus 17 quote units totals **18/20**, leaving two; no bonus needed. An additional
exchange-list lookup would make 19, and would require revising the two-unit reserve
or moving a step to a different day. Do not silently spend that extra lookup.

The official [Free introduction](https://eodhd.com/financial-apis/live-ohlcv-stocks-api)
includes 500 welcome units; the [supplier Academy](https://course.eodhd.com/lessons/pair-mcp-and-budget)
describes a one-time bonus used after the recurring daily twenty. Existing extra
units are automatically consumed after the daily allowance; purchasing further
units is a separate dashboard action, not authorized. The limits page says bought
extra units do not expire, but no separate explicit expiry term for welcome units
was established here. Treat the displayed bonus as finite, not recurring, and
keep the qualification within the base twenty rather than depending on it.

Get the missing reference via `GET /api/exchange-symbol-list/PA?fmt=json` with the
owner's key. The [Exchange API](https://eodhd.com/financial-apis/exchanges-api-list-of-tickers-and-trading-hours)
lists all-plan availability, one unit per request, and fields Code, Name, Exchange,
Currency, Type, Isin (nullable). Do not filter by asset type: both stocks and ETFs
are needed. This is a symbol directory, not the 100-unit bulk price endpoint.
It does not guarantee a row-level MIC or unit factor: resolve any remaining venue/
unit ambiguity independently, especially ALXP. A missing ISIN or similar name is
not enough. If the required identity remains absent, keep that instrument blocked
and report incomplete coverage rather than make an approximate match.

The owner already has the correct Daily usage & limits panel. Refresh it after
the reference request and retain date, used/limit and extras; inspect request
history at [account API history](https://eodhd.com/cp/api) if necessary. That chart
counts HTTP requests rather than weighted daily units. Never send the API key or
an unredacted account export to chat.

#### Historical Mac reference recipe — subsequently executed by the owner

The owner completed this reference lookup once. This retained recipe is evidence,
not an instruction or standing permission to repeat a supplier call after closure.

This performs one reference request only, without retry, redirect or proxy. It asks
for the key without shell-history/argument exposure and saves a private file in
Downloads. Prerequisite: Python 3 already installed; no dependency installation.
On any failure stop and inspect usage: an empty local file is not proof the API
request was free. Do not run this command a second time automatically.

```sh
python3 - <<'PY'
from datetime import datetime, timezone
from getpass import getpass
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import build_opener, HTTPSHandler, ProxyHandler, HTTPRedirectHandler, Request
from urllib.error import HTTPError, URLError
import certifi
import json
import os
import ssl

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

try:
    context = ssl.create_default_context(cafile=certifi.where())
    directory = Path.home() / "Downloads" / "pea-api-results"
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    destination = directory / f"{day}_EODHD_REFERENCE_TLS.json"

    if destination.exists():
        raise SystemExit(f"Fichier déjà présent : {destination}\nAucun nouvel appel effectué.")

    token = os.environ.get("EODHD_API_TOKEN") or getpass("Clé EODHD — saisie masquée : ")
    if not 1 <= len(token) <= 512 or not all(33 <= ord(c) <= 126 for c in token):
        raise SystemExit("Format de clé invalide. Aucun appel effectué.")

    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as output:
        url = "https://eodhd.com/api/exchange-symbol-list/PA?" + urlencode(
            {"api_token": token, "fmt": "json"})
        opener = build_opener(ProxyHandler({}), HTTPSHandler(context=context), NoRedirect())
        with opener.open(Request(url, headers={"Accept": "application/json"}), timeout=30) as response:
            body = response.read(4194305)
        received = datetime.now(timezone.utc).isoformat()
        if len(body) > 4194304:
            raise SystemExit("Réponse trop volumineuse. Ne pas relancer.")
        data = json.loads(body)
        if not isinstance(data, list):
            raise SystemExit("Réponse inattendue, contenu non affiché. Ne pas relancer.")
        output.write(body)
        output.flush()
        os.fsync(output.fileno())

    print("Référentiel enregistré :", destination)
    print("Nombre de lignes :", len(data))
    print("Fin de réception UTC :", received)
except HTTPError as error:
    raise SystemExit(f"Réponse EODHD HTTP {error.code}. Ne pas relancer ; vérifier le compteur.")
except URLError as error:
    category = "certificats TLS" if isinstance(error.reason, ssl.SSLError) else "connexion réseau"
    raise SystemExit(f"Échec : {category}. Aucun nouvel essai automatique.")
except json.JSONDecodeError:
    raise SystemExit("Réponse JSON invalide, contenu non affiché. Vérifier le compteur.")
except Exception:
    raise SystemExit("Échec local ou transport interrompu. Vérifier le fichier et le compteur avant toute relance.")
PY
```

This reference acquisition is separate from the quote-capture recipe below. No
authenticated request was executed while preparing these instructions, and none
of the 80 acquired tests was rerun.

- The official delayed endpoint documents **one API unit per ticker**, including
  grouped requests. The path symbol is included; `s` contains the other 16 for a
  17-symbol group. Forecast: **one HTTP attempt, 17 units maximum under the published
  tariff, zero automatic retries**. This is documented cost, not measured billing.
  Sources: [endpoint](https://eodhd.com/financial-apis/live-ohlcv-stocks-api),
  [Free pricing](https://eodhd.com/pricing).
- Free recurring ceiling: 20 units per UTC day, 20 HTTP requests/minute; reset at
  midnight GMT. Do not budget the finite welcome bonus. No separate monthly
  allowance was established. For this qualification choose two units of headroom:
  require confirmed prior usage **at most one** that UTC day. With no headroom the
  arithmetic would allow three already spent, but that is not this run's policy.
- Record the private dashboard counter immediately before and after the attempt,
  with other clients using that account stopped. Difference confirms the actual
  charge; neither HTTP 200 nor response bodies establish it. Dashboard latency or
  competing consumption makes the measurement inconclusive. Do not spend another
  API call just to poll a counter unless its cost is separately established.
- [Personal AI/cloud FAQ](https://eodhd.com/help/ai-tools) explicitly permits sole-user
  private AI/MCP, own authenticated cloud software and automated pipelines within
  the plan. [Storage FAQ](https://eodhd.com/help/storage) permits private raw and
  normalized databases, backups and provenance, including retained downloads after
  cancellation. [Terms](https://eodhd.com/financial-apis/terms-conditions) govern:
  private non-professional use, no onward redistribution. This covers this owner-only
  scenario, not a public/multi-user MCP or publication of captured data. Actual Free
  product access remains separate from these permitted uses.

## Minimal persistent reservation — decision, not an active quota service

Implemented locally for a single supervised Mac capture: reuse `runner.journal`'s private-directory,
`flock`, and atomic/fsync `write_journal` primitives. Use **one fixed claim for this
qualification in the same private account directory**, not a fresh ID per attempt.
Persist 17 reserved units and `attempt_started` before network I/O. A second process
hits the same lock/claim and stops. An existing claim stops a restart even on a new
day; human reconciliation is deliberate for this one-off operation.

Validate token configuration, manifest, usage/day/minute and local output safety
before the claim. After the durable claim, every timeout, HTTP error, partial body,
invalid data, crash or uncertain completion retains all 17 reserved units. No
refund or retry is inferred from an exception. Reparse saved bytes offline. If no
usable capture exists, reconcile the dashboard and seek a separately budgeted
attempt; a complete retry costs another 17 units and cannot fit the daily base
allowance after the first 17. Partial retries are not automatically safe or free.

Local locking protects only cooperating processes on the same filesystem/account
directory. Stop other API consumers; include their prior consumption in the counter.
This is not a distributed monthly ledger. If future automated/cloud clients require
shared enforcement, review a single atomic account/period reservation authority
then, rather than building it now.

Existing SchedulerLedger demonstrates claim-before-dispatch, but its objects are
partitioned by job/day and delete all storage after two days. Reusing its current
storage directly would lose monthly quota history and couple this work to active
dispatch. No new DO, D1 table, endpoint, migration or deployment is justified here.

## Historical prepared collection command — not the executed operator recipe

The actual authorized 16-symbol capture and measured debit are recorded in
`finalization.md`. This earlier composition example is retained for design context;
it was not the private raw-qualification operator recipe used in that capture.
It does not establish semantic admission or authorize another collection.

Run only after identities are independently reviewed, current Free usage is
confirmed, other account consumers are paused and execution is authorized. The
current private manifest intentionally fails its identity gate. Variables below
are private local paths/counter evidence; never paste a token into this command,
chat, shell history or a URL. `EODHD_API_TOKEN` must already be supplied securely.
`EODHD_CAPTURE_DIRECTORY` must be the single owner-private directory agreed for
this account/qualification, reused across every invocation.

`EODHD_USAGE_OBSERVED_AT` is a timezone-aware UTC dashboard-observation time,
`EODHD_USED_TODAY` and `EODHD_HTTP_LAST_MINUTE` are confirmed nonnegative counts.
Use a conservative sliding-minute HTTP count. Usage evidence expires after five
minutes; no day reset is inferred. The snippet is a supervised capture recipe,
not an installed production CLI or a scheduler integration.

```sh
PYTHONPATH=collector collector/.venv/bin/python - <<'PY'
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from pea_collector.eodhd_http import EodhdHttpClient
from pea_collector.provider_mapping import ProviderMapping
from pea_collector.provider_shadow import FeedPolicy
from pea_collector.provider_quota import PrivateQuotaLedger, UsageSnapshot
from pea_collector.provider_observation import capture_shadow
from pea_collector.runner import write_journal

try:
    directory = Path(os.environ['EODHD_CAPTURE_DIRECTORY'])
    declarations = json.loads(Path(os.environ['EODHD_POLICIES']).read_bytes())
    policies = []
    for declaration in declarations:
        declaration = dict(declaration)
        mapping = ProviderMapping.parse(declaration.pop('mapping'))
        policies.append(FeedPolicy(mapping=mapping, **declaration))
    observed = datetime.fromisoformat(os.environ['EODHD_USAGE_OBSERVED_AT'])
    usage = UsageSnapshot(observed.astimezone(timezone.utc).date().isoformat(),
                          int(os.environ['EODHD_USED_TODAY']),
                          int(os.environ['EODHD_HTTP_LAST_MINUTE']), observed)
    def save_response(response, clocks):
        target = directory / 'eodhd-response.private.json'
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as output:
            output.write(response.body)
            output.flush()
            os.fsync(output.fileno())
        write_journal(directory / 'eodhd-receipt.private.json', dict(clocks,
            state='response_saved', http_status=response.status, content_type=response.content_type,
            body_sha256=hashlib.sha256(response.body).hexdigest()))
    result = capture_shadow(policies, EodhdHttpClient(timeout=10), PrivateQuotaLedger(directory),
        usage, 'v2d-coverage-quotes', execute=True, existing=[], save_response=save_response)
    print(json.dumps(result['summary'], sort_keys=True))
except Exception:
    raise SystemExit('Qualification stopped. Inspect private quota/capture evidence; do not retry automatically.')
PY
```

Transport D4 already bounds body size, validates symbols, disables proxy/redirects
and makes one attempt. No call to `runner.collect`: it retries provider failures
and is unsuitable for this experiment. The recipe reuses only the lock/write
primitives; the quota adapter stores its own checksummed journal envelope and never calls financial ingestion. The receipt is a separate private capture record. Socket timeout is not a hard wall-clock deadline.

`body_received_at` records the local completion of the body read, not exact server
send time, first-byte arrival or individual quote reception. Preserve every row's
source timestamp separately; no replacement by the batch maximum. Parse captured
bytes with D5 offline, retaining exact decimals. Report missing/rejected rows,
source/fetch age and provenance. A recent capture cannot freshen an old quote or
replace a newer Yahoo observation. No D1 ingestion or MCP restitution is performed
by this command.

## Completion criteria and remaining inputs

1. Complete the private provider identity matrix, especially the unresolved venue.
2. Confirm Free entitlement and counters from the dashboard, including shared use.
3. Review the 17-unit/one-attempt command above before any execution.
4. After a separately authorized capture, compare counter delta, qualify each row
   offline and retain precise unknown/unsupported statuses. A single snapshot proves
   neither continuous freshness nor future availability. Keep prior three samples.

Preparation checks: command Python syntax and local documentation links checked
without executing the command. Acquired tests were not rerun. The private matrix
remains ignored; no raw market dataset or real instrument list is added to Git.
