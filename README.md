# @rapidmx/crm-plugin

A customer relationship management platform for [RapidMX](https://github.com/rapidmx/server), installed as a server plugin.

This first release covers the CRM core:

- **Workspaces** shared by a team, each member an owner, admin, editor or viewer. Members are added by the address of a mailbox
  they own.
- **Contacts and companies** with their own fields, tags and **custom properties** (text, number, date, yes/no, dropdown and
  multiple choice). A new contact is linked to the company whose web domain matches its email address.
- **Filtered search** across fields, tags and custom properties, with all/any conditions, a quick text search, sorting and paging.
- **Bulk actions** (tag, untag, set owner, delete) and **CSV export** of anything a search matches.
- **Notes, tasks and an activity timeline** on every contact and company.
- **CSV import** of contacts and companies, with a suggested column mapping, imported in the background.
- **Send-as addresses**: the mailboxes a workspace will send marketing mail from and receive replies in.
- **Mailing lists and subscriptions**, with the consent behind each (when, how, from what address), and list membership as a
  filter.
- **Signup forms** at `/f/<form>`, linkable or embeddable in another site, with optional **double opt-in** by email.
- **A preference center** at `/subscriptions/<token>` where a subscriber chooses their lists or unsubscribes from all email, and
  **one-click unsubscribe** links (RFC 8058) - no account needed, the links carry signed tokens.
- **A suppression list** of addresses never to email.
- **Email templates** built in a **drag-and-drop designer**. It offers:
  - sections of up to four columns;
  - heading, text, image, button, divider, spacer, social, footer and hand-written HTML blocks;
  - inline text editing and a theme;
  - merge tags such as `{{ contact.first_name }}` and custom properties;
  - undo and redo, and reusable saved blocks;
  - a preview for a sample reader or any contact, at desktop or phone width or as plain text;
  - test sends.

  Templates are laid out with MJML and filled in with Liquid; merged values are HTML-escaped.

- **Campaigns** to the subscribers of chosen lists, less those of excluded lists. They skip addresses that are suppressed,
  unsubscribed, bounced or complained. A campaign can be sent now or scheduled, paused, resumed and cancelled. Before sending, a
  checklist says what's missing: a sender, a list, an email with an unsubscribe link, or your postal address.
- **A/B tests**: up to four variants, each with its own subject line or template. They are tried on part of the audience, and the
  variant with the best open, click or reply rate after a set number of hours goes to everyone else.
- **Deliverability headers** on every campaign message:
  - `List-Unsubscribe` with RFC 8058 one-click, which Gmail and Yahoo require of bulk senders;
  - `List-Id`, `Precedence: bulk` and a `Feedback-ID`;
  - a per-message bounce address (VERP).

  Sending is throttled deployment-wide.
- **Engagement tracking**:
  - Opens are tracked with an invisible image, and clicks through signed redirects that can only go where the email's link went.
  - Replies, bounces and spam complaints are learned from the sender's mailbox.
  - Opens and clicks by mail scanners are told apart from people's.
  - A hard bounce or a complaint suppresses the address.
  - Everything lands on the contact's timeline and in the campaign's report: rates, links by clicks, variants, and a filterable
    recipients list.

- **Segments**: named groups of contacts defined by a filter.
  - A dynamic segment keeps up with its filter by itself; a static one is a snapshot, refreshed by hand.
  - Segments are a contact filter field of their own.
  - A campaign can go only to the subscribers in some segments, or leave the members of others out.
- **Lead scoring**: a contact's score is the sum of its workspace's rules.
  - A property rule gives points to the contacts matching its filter.
  - An activity rule gives points for each time a contact opened, clicked, replied, bounced, submitted a form, subscribed or
    unsubscribed, optionally within the last N days and up to a limit.
  - Scores update in the background, or on demand.

- **Automations**: workflows that react to what contacts do.
  - **Triggers:** subscribing or unsubscribing, submitting a form, entering or leaving a segment, being created or changed,
    opening, clicking, replying to or bouncing an email, a deal being created, moved, won or lost, an event your own systems
    report through the integration API (optionally by name), or being put in by hand. A trigger can also take a contact filter.
  - **Date triggers:** a contact's date property (a birthday, a renewal) or when they were added or last engaged - on the day or
    a number of days before or after it, every year or once, from a chosen hour in the workspace's time zone. A "Birthday
    greeting" starting point sets one up.
  - **Steps:** waiting a while; waiting for an earlier email to be opened, clicked or replied to (with a timeout, and a branch
    for each outcome); if/else on a contact filter; random splits; sending an email; setting a field; adding or removing a tag;
    subscribing or unsubscribing; creating a task; notifying a member; putting the contact into another automation; posting to
    a webhook; ending.
  - **Editing:** a branching editor with ready-made starting points ("welcome, then follow up if there's no reply", welcome
    series, form follow-up, win back). A publish checks the whole flow first.
  - **Running:** contacts go through the version they entered. A goal takes them out early, and a re-entry rule decides whether
    they can go through again. Each step shows live numbers, and every contact's run can be looked at or stopped.

- **Sales pipelines and deals**:
  - Pipelines are made of stages, each with a win probability, a kind (open, won or lost) and optional "rotting" days. A workspace
    gets a default "Sales" pipeline.
  - Deals carry an amount, an owner, the contacts and company involved and an expected close date. They move across a kanban board
    by drag and drop or menu; moving one to a lost stage asks why.
  - A forecast gives open value and weighted value per stage, win rate and time to win.
  - Each deal keeps its stage history, notes, tasks and activity. Moves show on the deal's and its contacts' timelines, and deals
    won, lost or moved can start automations.
- **Task reminders** notify the assignee when a task comes due.
- **1:1 email logging** (per sender, opt-in): mail the sender's mailbox exchanges with contacts goes on their timelines.
- **Reports** over the last 7, 30, 90 or 365 days:
  - email sent, opened, clicked, replied to, bounced and unsubscribed from, per day and as rates, with the top recipient domains;
  - new contacts, subscribes and unsubscribes per day, and each list's subscribers;
  - deals won (and their value), lost and open, and the win rate, for all pipelines or one.

  Charts have a hover card, arrow-key navigation and a table view.
- **Webhooks**: what happens in a workspace (contacts created or changed, subscriptions, forms, segments, email engagement, deals,
  custom events, automation steps) posted as signed JSON to `https://` addresses on the public internet. Failed posts are retried
  with backoff; an endpoint that keeps failing is switched off. Each endpoint shows its recent deliveries and can be pinged.
- **An integration API** for a workspace's own systems, with **API keys** scoped to adding contacts, changing subscriptions or
  reporting events.
- **A CRM page in the admin console** (`/admin/crm`): every workspace with its size, the deployment's sending numbers, and a switch
  that stops a workspace's campaign and automation email (for abuse) without touching its data.

## Installing

Install it from the admin console's **Plugins** page, or preinstall it by adding `@rapidmx/crm-plugin` to `system:plugins:defaults`.
The CRM then appears on the web client's app rail, at `/crm`. It requires `@rapidmx/restapi` 0.26 or later.
Replies, bounces and complaints are learned from restapi's mail event stream, so they need a restapi release that publishes it
(0.27) and an `events` Redis datastore.

### Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `mail:crm:public_url` | `https://<host>` | The site the public pages are served from; links in CRM emails point here. |
| `mail:crm:token_secret` | (generated) | The key public links are signed with. Left empty, one is generated and kept in the database. |
| `mail:crm:workspace_creator_roles` | (empty) | Comma-separated roles allowed to create workspaces. Empty lets every signed-in user. |
| `mail:crm:max_workspaces_per_user` | `10` | How many workspaces one user may create. |
| `mail:crm:max_members` | `500` | How many members one workspace may have. |
| `mail:crm:max_senders` | `50` | How many send-as addresses one workspace may have. |
| `mail:crm:export:max_rows` | `50000` | How many records one CSV export may hold. |
| `mail:crm:import:max_bytes` | `20971520` | The largest CSV file an import accepts. |
| `mail:crm:jobs:import:schedule` | `*/5 * * * * *` | How often queued imports are picked up. |
| `mail:crm:jobs:import:lease_seconds` | `300` | How long a server may work on an import before another may take it over. |
| `mail:crm:jobs:import:max_attempts` | `3` | How many times an import is started before it is failed. |
| `mail:crm:send_rate_per_minute` | `600` | The most campaign messages the whole deployment sends per minute. |
| `mail:crm:verp` | `true` | Give each campaign message its own bounce address (`<sender>+b-<token>@<domain>`). Needs plus-addressing. |
| `mail:crm:jobs:send:schedule`, `...:batch`, `...:lease_seconds`, `...:max_attempts` | `*/2 * * * * *`, `200`, `300`, `5` | How the dispatcher runs and retries. |
| `mail:crm:jobs:campaign:schedule`, `...:lease_seconds`, `...:pages_per_run`, `...:page_size`, `...:stats_seconds` | `*/5 * * * * *`, `120`, `20`, `500`, `60` | How campaigns are prepared and their stats counted. |
| `mail:crm:jobs:events:schedule` | `*/2 * * * * *` | How often the mail event stream is read. |
| `mail:crm:jobs:segments:schedule`, `...:refresh_seconds`, `...:batch` | `0 * * * * *`, `300`, `20` | How dynamic segments are kept current. |
| `mail:crm:jobs:scoring:schedule`, `...:interval_seconds`, `...:batch` | `30 * * * * *`, `3600`, `5` | How lead scores are kept current. |
| `mail:crm:jobs:triggers:schedule`, `...:batch`, `...:retention_days` | `*/5 * * * * *`, `200`, `30` | How contact events are handed to automations, and how long they are kept. |
| `mail:crm:jobs:reminders:schedule`, `...:lead_minutes` | `15 * * * * *`, `15` | How task reminders are sent, and how long before a task is due. |
| `mail:crm:jobs:automations:schedule`, `...:batch`, `...:lease_seconds`, `...:paused_retry_seconds` | `*/5 * * * * *`, `100`, `120`, `60` | How contacts are moved through automations. |
| `mail:crm:jobs:webhooks:schedule`, `...:max_attempts`, `...:retention_days` | `*/5 * * * * *`, `8`, `14` | How webhooks are posted and retried, and how long deliveries are kept. |
| `mail:crm:jobs:dates:schedule` | `20 * * * * *` | How often date-triggered automations are checked (each puts contacts in once a day). |

## API

Every route is under `/api/mail/crm` and takes the workspace uid as its first path segment. Reading takes membership of the
workspace; changing records takes the editor role, and changing settings, members, senders and custom properties the admin role.
A deployment administrator has no access to a workspace they aren't a member of.

| Resource | Endpoints |
| --- | --- |
| `workspaces` | `GET /`, `POST /`, `GET/PUT/DELETE /:workspaceUid`, `GET/POST /:workspaceUid/members`, `PUT/DELETE /:workspaceUid/members/:userUid`, `GET/POST /:workspaceUid/senders`, `PUT/DELETE /:workspaceUid/senders/:senderUid` |
| `contacts`, `companies` | `GET /:workspaceUid`, `POST /:workspaceUid/search`, `POST /:workspaceUid/bulk`, `POST /:workspaceUid/export`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid` |
| `properties`, `notes`, `tasks` | `GET /:workspaceUid`, `POST /:workspaceUid/search`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid` |
| `timeline` | `GET /:workspaceUid/:subjectType/:subjectUid` |
| `imports` | `GET /:workspaceUid`, `POST /:workspaceUid?objectType=&fileName=` (raw CSV body), `POST /:workspaceUid/:uid/start`, `GET/DELETE /:workspaceUid/:uid` |
| `lists`, `suppressions`, `forms` | `GET /:workspaceUid`, `POST /:workspaceUid/search`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid` |
| `subscriptions` | `GET /:workspaceUid?listUid=&contactUid=&status=`, `POST /:workspaceUid` (`{ listUid, contactUids, status }`) |
| `templates` | `GET /:workspaceUid`, `POST /:workspaceUid/search`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid`, `GET /:workspaceUid/merge-tags`, `POST /:workspaceUid/render`, `POST /:workspaceUid/:uid/test`, `POST /:workspaceUid/:uid/duplicate` |
| `saved-blocks` | `GET /:workspaceUid`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid` |
| `campaigns` | `GET /:workspaceUid`, `POST /:workspaceUid/search`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid`, `POST /:workspaceUid/audience`, `GET /:workspaceUid/:uid/checklist`, `POST /:workspaceUid/:uid/schedule` (`{ sendAt? }`), `POST /:workspaceUid/:uid/unschedule\|pause\|resume\|cancel\|duplicate`, `GET /:workspaceUid/:uid/report`, `POST /:workspaceUid/:uid/recipients` |
| `segments` | `GET /:workspaceUid`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid`, `POST /:workspaceUid/preview` (`{ filter }`), `POST /:workspaceUid/:uid/refresh` |
| `scoring-rules` | `GET /:workspaceUid`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid` (admins), `POST /:workspaceUid/recalculate` |
| `automations` | `GET /:workspaceUid`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid`, `POST /:workspaceUid/:uid/publish\|pause\|resume`, `POST /:workspaceUid/:uid/enroll` (`{ contactUids }`), `GET /:workspaceUid/:uid/report`, `POST /:workspaceUid/:uid/enrollments`, `POST /:workspaceUid/:uid/enrollments/:enrollmentUid/exit` |
| `pipelines` | `GET /:workspaceUid` (makes a default pipeline if there is none), `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid` (admins) |
| `deals` | `GET /:workspaceUid?pipelineUid=&stageId=&status=&ownerUserUid=&companyUid=&contactUid=`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid`, `GET /:workspaceUid/forecast?pipelineUid=&days=` |
| `analytics` | `GET /:workspaceUid/email?days=`, `GET /:workspaceUid/growth?days=`, `GET /:workspaceUid/sales?days=&pipelineUid=` (`days` 1-365, 30 by default; UTC days) |
| `webhooks` | `GET /:workspaceUid`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid` (admins; answers the `secret` once), `POST /:workspaceUid/:uid/secret` (a new secret), `POST /:workspaceUid/:uid/test` (a `ping`), `GET /:workspaceUid/:uid/deliveries` |
| `api-keys` | `GET /:workspaceUid`, `GET/PUT/DELETE /:workspaceUid/:uid`, `POST /:workspaceUid` (admins; answers the `key` once) |
| `integrations` (API key) | `POST /:workspaceUid/contacts`, `POST /:workspaceUid/subscribe`, `POST /:workspaceUid/unsubscribe`, `POST /:workspaceUid/events`, `GET /:workspaceUid/lists` |
| `admin` (deployment administrators) | `GET /stats`, `GET /workspaces?limit=&page=`, `PUT /workspaces/:workspaceUid` (`{ sendingDisabled }`) |
| `public` (anonymous) | `GET/POST /forms/:formUid`, `POST /confirm/:token`, `GET/POST /preferences/:token`, `GET/POST /unsubscribe/:token` |
| `t` (anonymous) | `GET /o/:token` (open image), `GET /c/:token/:index?u=&s=` (tracked link) |

A search takes `{ filter, q, sort: { field, direction }, limit, page }` and answers `{ items, total }`. A filter is a condition
`{ field, op, value }` or a group `{ and: [...] }` / `{ or: [...] }`. Fields are a record's own fields, `tags`, or
`properties.<key>`. The comparisons are `eq`, `ne`, `contains`, `notContains`, `startsWith`, `gt`, `gte`, `lt`, `lte`, `between`,
`in`, `notIn`, `isSet` and `isNotSet`, each allowed on the types it makes sense for.

A template's `design` is `{ theme, sections: [{ columns: [{ blocks: [...] }] }] }`. It is checked and sanitized on every save:
- Text is limited to what the editor produces.
- Links must be web, mail, phone or merge-tag links, and images must use `https://`.
- HTML blocks may only be added or changed by workspace admins. Scripts, frames and forms are removed from them.
- A design that can't be laid out, or that has a broken merge tag, is refused.

`POST /render` returns `{ subject, html, text }`. A test is sent only to the address of a mailbox the caller can read.

### Webhooks

Each delivery is a `POST` of JSON: `{ id, type, occurredAt, workspaceUid, contact?: { uid, email, firstName, lastName }, data }`.
`type` is the event (`contact.created`, `deal.won`, `custom`, `automation.webhook`, `ping`...). The `X-RapidMX-Signature` header is
`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>" keyed with the endpoint's secret>`; check it, and refuse old timestamps.
A 2xx answer counts as delivered. Anything else is retried 1, 2, 4... minutes later, up to 8 times; after 20 failures in a row the
endpoint is switched off. Redirects aren't followed, and the address is resolved and checked for a public IP at every post.

### Integration API

Call `/api/mail/crm/integrations/<workspaceUid>/...` with `Authorization: Bearer crm_...`. A missing, unknown or revoked key is a
401; a key without the endpoint's scope a 403. Each key may make 600 calls a minute.

| Endpoint | Scope | Body | Answer |
| --- | --- | --- | --- |
| `POST /contacts` | `contacts` | `{ email, firstName?, lastName?, phone?, tags?, properties?, ... }` | `{ outcome: "created" \| "updated", uid }` |
| `POST /subscribe` | `subscriptions` | `{ email, listUid, ...contact fields }` | `{ contactUid, status }` |
| `POST /unsubscribe` | `subscriptions` | `{ email, listUid? }` - without a list, from every list and all email | `{ contactUid? }` |
| `POST /events` | `events` | `{ email, name, data? }` - starts automations whose trigger is a custom event (of that name) | `{ contactUid }` |
| `GET /lists` | any | | `[{ uid, name, publicName }]` |

## Development

```sh
yarn install
yarn build        # lint, then compile the server code and the pages
yarn test:prod    # every test on MongoDB and SQL, with the coverage gates
```

To try it on a local server, `npm pack` this package and point the server's `system:plugins:sources` at the tarball.
