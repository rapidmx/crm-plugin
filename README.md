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

Campaigns, templates, engagement tracking, automations and sales pipelines follow in later releases.

## Installing

Install it from the admin console's **Plugins** page, or preinstall it by adding `@rapidmx/crm-plugin` to `system:plugins:defaults`.
The CRM then appears on the web client's app rail, at `/crm`. It requires `@rapidmx/restapi` 0.26 or later.

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
| `public` (anonymous) | `GET/POST /forms/:formUid`, `POST /confirm/:token`, `GET/POST /preferences/:token`, `POST /unsubscribe/:token` |

A search takes `{ filter, q, sort: { field, direction }, limit, page }` and answers `{ items, total }`. A filter is a condition
`{ field, op, value }` or a group `{ and: [...] }` / `{ or: [...] }`. Fields are a record's own fields, `tags`, or
`properties.<key>`. The comparisons are `eq`, `ne`, `contains`, `notContains`, `startsWith`, `gt`, `gte`, `lt`, `lte`, `between`,
`in`, `notIn`, `isSet` and `isNotSet`, each allowed on the types it makes sense for.

## Development

```sh
yarn install
yarn build        # lint, then compile the server code and the pages
yarn test:prod    # every test on MongoDB and SQL, with the coverage gates
```

To try it on a local server, `npm pack` this package and point the server's `system:plugins:sources` at the tarball.
