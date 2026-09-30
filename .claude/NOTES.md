# crm-plugin — Design Decisions & Session Notes

This file exists so that Claude sessions working in this repo don't re-litigate settled
decisions or re-discover the same issues from scratch. It is local to this repo (not tied to
any one machine's global Claude memory), so it travels with the code.

**Maintenance rule:** when a standing decision changes, update the section below in place
(don't just append a contradiction lower down). When a new investigation/session produces a
decision, finding, or reverted approach worth remembering, add a dated entry under Session Log.
Keep entries terse — this is a reference, not a transcript.


## Standing design decisions & constraints

- **Vulnerability/review threat model: externally-exploitable only.** Only count issues reachable
  from a downstream, untrusted HTTP client hitting a service built on this package (anonymous or
  low-privilege caller). Do NOT flag developer-only footguns or purely theoretical races with no
  concrete external trigger path.
- **Commit discipline.** Don't `git commit` unless explicitly asked for *that specific piece of
  work*. An autonomous-execution/"commit as you go" approval given for one approved plan (e.g. via
  plan mode) is scoped to that plan only — it does not carry forward to later, separate requests in
  the same session, even ones that look similar in kind (a follow-up review-and-fix pass, a
  refactor, a new feature), and even after a full review-and-fix cycle with passing tests. Default
  to leaving changes staged/unstaged and saying so; only commit automatically within the exact
  scope of a plan that was explicitly approved as autonomous. If unsure whether new work falls
  inside that scope, treat it as outside and ask.
- **Commit message style: a flat list of one-line, verb-led items — no summary/title line, no
  `-`/`*` bullet markers.** This isn't just a style preference — it's dictated by how `release`
  (`@rapidrest/cli`) actually builds `CHANGELOG.md`. `collectChangelogBullets`/
  `classifyChangelogLine` (that repo's `src/lib/release.ts`) parse `git log --pretty=format:%B` and
  treat **every non-blank line of a commit's full message as its own changelog bullet** — there is
  no subject/body distinction. A conventional "short imperative subject + blank line + prose body"
  commit therefore leaks one changelog bullet per body sentence, and a `-`/`*`-prefixed line breaks
  `classifyChangelogLine`'s verb detection (it reads the line's first whitespace-delimited word as
  the verb; a leading `-` defeats that lookup and the dash leaks into the changelog text as
  `"- - Added foo"`). Correct format:
  - No separate summary/title line — if a commit needs an overview, that overview is itself just
    one more flat line, not a heading distinct from the rest.
  - No bullet-marker prefix of any kind — write bare lines.
  - Lead each line with an imperative verb where it fits: `Add`/`Fix`/`Remove` (and `-ing` forms)
    are recognized and become `Added`/`Fixed`/`Removed` entries; `Configuring`/`Converting`/
    `Refactoring`/`Updating`/etc. become `Changed`. Anything else still works, defaulting to
    `Changed` verbatim — see `CHANGELOG_VERB_REWRITES` in that repo's `src/lib/release.ts` for the
    full map.
  - A blank line before a trailing git trailer (`Co-Authored-By:`, `Signed-off-by:`, etc.) is fine
    — trailers matching `CHANGELOG_NOISE_PATTERNS` are dropped from the changelog — but nothing
    else should follow the item list.
  This mirrors JP's standing convention across his other repos; copy this exact rule verbatim into
  each sibling repo's own NOTES.md rather than paraphrasing it, since the paraphrase is what caused
  this to be gotten wrong in the first place (see `@rapidrest/cli`'s own NOTES.md, 2026-09-07 entry,
  for the full incident writeup and the `CHANGELOG_NOISE_PATTERNS` fix that accompanied it).

- **Release bump levels follow upstream** (an upstream minor is a minor here), releases happen only when JP asks, and only after
  the GitHub Actions Build is green. Never hand-edit `CHANGELOG.md`/`RELEASE_NOTES.md` or the `version` field.
- **The plan.** This plugin is being built in phases from an approved plan (Phase 0 core hooks in restapi/web-client; Phase 1 this
  repo's workspaces/contacts/companies/properties/notes/tasks/timeline/import-export; then lists and consent, templates, sending and
  tracking, segments, automations, pipelines, analytics/webhooks). Each phase is committed and handed back before the next starts.
- **Data compatibility is the contract.** Model class names (entity names), index names and `@Protect` uids are pinned by
  `test/plugin.test.ts`. Renaming any of them orphans a deployment's data.
- **Entry points export only what the server should load** (`./mongo`, `./sql`: models, routes, `CrmImportJob*`). Abstract routes,
  utilities and `MONGO_MODELS`/`SQL_MODELS` stay out of them.
- **Tenancy is the Workspace, not a mailbox.** `Workspace` is a record-ACL model: its ACL (uid = workspace uid, no parent) holds one
  record per member with their role's actions (`ROLE_ACTIONS`: owner `*`, admin READ/WRITE/MANAGE, editor READ/WRITE, viewer READ;
  owner-only operations check the made-up action `OWN`, which only `*` grants). `WorkspaceMember` rows mirror the records for listing;
  `BaseWorkspaceRoute` changes both together (`setAclRecord()`, retried on version conflicts). Every other model has a deny-all class
  ACL and carries `workspaceUid`; routes check `assertWorkspaceAccess()` (which strips trusted roles first - an admin gets nothing
  without membership) and then use `ignoreACL: true`. No access answers 404; read-but-not-write answers 403. The workspace uid is
  also the `/push` channel members receive changes on.
- **`CrmRepoUtils`, not `RepoUtils`.** On SQL, `RepoUtils.find()` takes its page size from the *query's* `limit` (default 100) and
  ignores the options' `limit`; on Mongo the reverse. `CrmRepos` creates `CrmRepoUtils`, which copies the options' limit into the
  query and adds `uid` as a final sort key so equal sort values page stably. Anything reading repositories here goes through
  `CrmRepos`.
- **Custom properties and tags are `PropertyValue` rows (EAV)**, one per value (multi-select and tags: one per option), indexed by
  workspace/objectType/key/value, so filters can use them on SQL where JSON columns aren't queryable. Tags also live on the record
  (`tags`, simple-json) for display; `BaseTaggedRecordRoute.afterWrite()` keeps the rows in step.
- **Filters** (`src/filters/Filter.ts`): a JSON AST validated against the field list, compiled to `RepoUtils` queries (`$and`/`$or`
  plus `ModelUtils.literal` values). Conditions on values are resolved first to `uid in (...)` (capped at `MAX_VALUE_MATCHES`);
  negations become `uid nin` the positive matches, so "no value" counts as "not equal". `evaluateFilter()` gives the same answer for one
  record in memory (for automations and segments later).
- **Imports reuse the routes.** `CrmImportJob` instantiates the backend's contact/company route and calls its public `importRow()`,
  so an imported row gets exactly an API write's validation and side effects. Claim/lease/progress follow restapi's
  version-checked pattern; progress is saved every 100 rows so a restarted import resumes.
- **UI**: one `www` app at `/crm` (`apps/crm`, with its own copied `_layout.tsx`), pages wrapped in `CrmShell` (the web client's
  `AppShell` with `active="crm"`, a workspace switcher and sections). The selected workspace travels as `?w=` and is remembered in
  `localStorage`. Pages are full page loads (plugin pages aren't in the client router).

- **Subscriptions** are one row per list and contact (unique), never deleted on unsubscribe - the row is the opt-out record. A
  contact's subscribed lists are mirrored as `PropertyValue` rows (key `lists`), kept in step by `CrmRouteBase.setSubscription()`,
  the only place subscriptions change; filters use them (`{ field: "lists", op: "eq", value: listUid }`). `subscribed` never goes
  back to `pending`. `CrmContact.emailStatus` is the "unsubscribed from all" switch (plus bounced/complained); `Suppression` rows
  are per-address and outlive the contact.
- **Public links are signed tokens** (`util/Tokens.ts`, HMAC-SHA256 over base64url JSON: purpose, workspace, contact, lists,
  expiry). The key is `mail:crm:token_secret` or else generated once and kept as `CrmSetting` `token-secret` (unique key; a losing
  concurrent create reads the winner's). Purposes: `prefs` (no expiry), `unsub` (no expiry, one list or all), `confirm` (7 days).
  Invalid anything = 404. Confirm and unsubscribe are POSTs behind a button on the landing pages, so link scanners can't act; the
  unsubscribe endpoint also serves RFC 8058 one-click POSTs from mail clients.
- **Forms**: anonymous submissions go through the contact route's `importRow()` (as imports do) but only fill fields/properties an
  existing contact doesn't have; honeypot field `website`; per-IP rate limit on every public endpoint (`RateLimiter`, key
  `crm-<kind>|<ip/64>`). Links in emails use `mail:crm:public_url` (manifest default `https://<host>`), never the request's Host.
- **Templates** (`src/templates/`) are rendered in four steps:
  1. **Design JSON** is checked by `validateDesign()`.
     - Every block's text or HTML goes through `sanitizeText()` or `sanitizeBlockHtml()`, which use sanitize-html and then restore
       the quotes inside `{{ }}`/`{% %}` so Liquid can parse them.
     - A link with an unsafe target becomes a `<span>`.
     - A link field may hold simple merge tags anywhere; in the check, each one counts as `{}`.
  2. **`designToMjml()`**, then **mjml 5** (async). The output keeps the merge tags.
  3. **Liquid**. The body engine uses `outputEscape: "escape"` and `ownPropertyOnly`, with parse, render and memory limits; the
     subject engine has no escaping.
  4. **html-to-text** produces the text part.

  On save, a template is compiled and its tags are parsed (`checkMergeTags`), so a template that can't be sent is refused at once.
- **HTML blocks** may only be added or changed by admins (`canManage`). An editor may keep an admin's block unchanged; the check
  compares it by block id with the saved design.
- **Merge context.** Keys are snake_case (`contact.first_name`, `company.properties.<key>`, `workspace.postal_address`, `links.*`).
  `CrmRouteBase.mergeContextFor()` builds it for a contact, or for a made-up reader when no contact is given.
- **Test sends.** A test goes only to the primary address of a mailbox the caller can READ (`hasMailAccess`), so it can't be used to
  mail strangers.
- **Designer UI** (`apps/shared/components/designer/`):
  - `designModel.ts` holds pure edit functions plus the undo history.
  - Edits that share a merge key (typing in one field or block) are undone together.
  - The canvas uses `@dnd-kit/sortable`, one `SortableContext` per column, with columns as droppables. Blocks can also be moved with
    their up/down buttons.
  - Text blocks are edited inline with TipTap (`LazyTextBlockEditor`, loaded client-only).
  - HTML blocks show as code on the canvas. Only the sandboxed preview iframe draws arbitrary HTML.
  - Save sends `version`, so a stale save answers 409.
- **Sending pipeline** (Phase 4). One `OutboundSend` row per recipient per campaign.
  - `dedupeKey` (`campaign:<c>:<contact>`, later `automation:<enrollment>:<node>`) is unique, so nobody is mailed twice.
  - `token` (22 base64url chars) names the message in its `Message-ID` (`<token>@<sender domain>`), in its tracking links and in
    its VERP address.
- **`CampaignJob`** moves campaigns through `scheduled -> preparing -> sending -> sent`.
  - Each step is a version-checked `save()`; a lost race answers `undefined`, which is how a member's pause or cancel stops the job.
  - Preparation reads subscriptions in uid order from `audienceCursor`, `pagesPerRun` pages per run. It releases the lease at the
    end of each run, so any replica continues.
  - The final `recipientCount` is *counted* from the sends, not added up. Adding up undercounted after a replayed page, and could
    reach 0, marking a campaign `sent` with its messages still queued (caught by a test).
  - A/B: `assignVariant()` hashes campaign+contact. Test messages are queued; the rest are `held` with variant `""` until the
    winner is picked, then released in batches.
- **`SendDispatchJob`**:
  - It leases each message (version-checked) and re-checks eligibility at send time: still subscribed to a campaign list, active,
    not suppressed.
  - It renders with `CampaignRenderer` (caches per run).
  - Throughput is capped by a shared `RateLimiter` counter `crm-send|all` (Redis when there is a cache connection). Tests mock it.
  - A temporary failure backs off 1, 2, 4... minutes. A permanent failure with `5.1.x` counts as a hard bounce.
- **Tracking.**
  - Click links carry the destination, signed with the token key (`clickPath()`/`verifyClick()`). There's no stored link table and
    no open redirect.
  - `isMachine()` flags scanners (by user agent) and anything within 2s of sending. Stats' `opened` excludes `machineOpen`.
  - Tests backdate `sentAt` before opening.
  - The framework's `HttpResponse` has no `redirect()`: set `location` and `status(302).end()`.
- **Engagement.** `EngagementRecorder` is the single place outcomes are applied: the event row, the send's counters and
  first-times (retried on version conflicts), and the contact follow-up (lastEngagedAt, suppression plus emailStatus on a hard
  bounce or complaint, timeline).
- **Mail events.** `CrmMailEventJob` reads restapi's stream (`rapidmx:mail-events`, group `crm-plugin`) **with its own minimal
  reader and mirrored types**, because the plugin still builds against restapi 0.26, which doesn't export `MailEventConsumer`.
  - **Once restapi 0.27 is the dependency, make it a `MailEventConsumer` subclass and drop the copies.**
  - Reports and replies only count when filed into the mailbox of the message's own sender (anti-forgery).
- **Unsubscribe tokens** now carry every campaign list (`l`) and the send (`s`). `POST /public/unsubscribe/:token` unsubscribes
  from each list and records the unsubscribe on the send; `GET` redirects to the landing page, for people following the
  `List-Unsubscribe` address.
- **GDPR.** Deleting a contact deletes their sends and engagement events too. Deleting a workspace deletes every workspace model:
  Phase 2/3 models had been missing from `WORKSPACE_DATA`, fixed in Phase 4.

## Session Log

### 2026-09-29 — Phase 1: the plugin created

- Scaffolded from `@rapidmx/booking-plugin` (tsconfigs, vitest, eslint, CI, validate.sh). Models generated as Mongo/SQL twins from one
  spec. 209 tests across unit, both-backend route suites (`test/routes/*Suite.ts` run by `test/routes/{mongo,sql}/crm.test.ts`) and
  jsdom UI tests; 100% statements/lines/functions, ~97% branches.
- Found while testing: the SQL paging behaviour above; the export row limit was off by one (the header row counted as a record);
  deleting a workspace row also deletes its ACL, so "workspace row missing" is only reachable through a race.
- End-to-end check against `server`'s `yarn dev` with `system__plugins__defaults` naming only this plugin and
  `system__plugins__sources` pointing at an `npm pack` tarball: installed, UI built (~2s), `/crm` served with its SSR title, and a
  workspace -> contact -> tag filter round trip through `/api/mail/crm` worked. `react-icons` is a peer dependency (the server's
  copy, like React's) since the pages import icons from it.
- Known wart: Mongo responses carry the document's `_id` next to `uid`, as restapi's own responses do.

### 2026-09-29 — Phase 2: lists, subscriptions, consent, preference center, forms

- New models `MailingList`, `Subscription`, `Suppression`, `CrmForm`, `CrmSetting`; routes `lists`, `subscriptions`,
  `suppressions`, `forms`, `public`; public UI apps `/subscriptions` and `/f`; CRM pages Lists and Forms; import can subscribe to a
  list. `nodemailer` is now a dependency (confirmation emails, `util/Mailer.ts`).
- Test harness: the Mongo harness now deletes a mailbox's ACL before re-creating it (ACLs survive the per-test clean-up, and a
  mailbox's uid is its address); routes cache the token key, so tests that clear `CrmSetting` reset `cachedTokenSecret`.
- Unverified: whether the server's headers let `/f/<form>` be framed by another site (the embed code is an iframe). If framing is
  refused, the "Open form" link still works.

### 2026-09-29 — Phase 3: templates and the designer

- **New models:** `EmailTemplate` and `SavedBlock`.
- **New routes:** `templates` (CRUD plus merge-tags, render, test and duplicate) and `saved-blocks`.
- **New pages:** `/crm/templates` and `/crm/templates/<uid>`.
- **New dependencies:**
  - runtime: `mjml`, `liquidjs`, `html-to-text`, `sanitize-html` and `@dnd-kit/sortable`;
  - peer: `@tiptap/*` and `@dnd-kit/core`, the server's copies.
- **Bug fixed while testing:** the designer's undo merging read its ref inside a state updater, so the first keystroke was never
  recorded. The merge decision is now made before `setHistory`.
- **UX fix:** number fields no longer clamp while you type, so "200" can be typed without it turning into 16.
- **Flaky test fixed:** a Phase 2 test ("Awaiting confirmation") raced the list load. It now waits for the text.

### 2026-09-30 — Phase 4: campaigns, sending, tracking, engagement

- **New models:** `Campaign`, `OutboundSend` and `EngagementEvent`.
- **New routes:** `campaigns` and `t` (tracking).
- **New jobs:** `CampaignJob`, `SendDispatchJob` and `CrmMailEventJob`, sharing `CrmJobBase`.
- **New UI pages:** `/crm/campaigns` (list) and `/crm/campaigns/<uid>` (the editor while a draft or scheduled, the report after).
- **Bugs fixed:**
  - `WORKSPACE_DATA` was missing lists, subscriptions, suppressions, forms, templates and saved blocks, so a workspace delete left
    them orphaned.
  - The campaign lease blocked the next run until it expired.
  - The recipient count after a replayed page (see above).
- **Not verified end to end:** real bounces, complaints and replies. They need restapi 0.27's stream and a server with an `events`
  datastore; the handler is tested directly and through a fake Redis.
