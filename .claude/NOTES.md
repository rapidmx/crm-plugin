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
