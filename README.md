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

Automations, segments and sales pipelines follow in later releases.

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

## Development

```sh
yarn install
yarn build        # lint, then compile the server code and the pages
yarn test:prod    # every test on MongoDB and SQL, with the coverage gates
```

To try it on a local server, `npm pack` this package and point the server's `system:plugins:sources` at the tarball.
