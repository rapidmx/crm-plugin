# Release Notes

## Unreleased

## v0.2.0

### Added

- **Email marketing:** a drag-and-drop template designer, campaigns with scheduling, A/B tests, open, click, reply and bounce tracking, one-click unsubscribe, and suppression of bounced and complaining addresses.
- **Segments and lead scoring:** dynamic and static segments of contacts, and scores built from contact fields and activity.
- **Automations:** branching workflows started by subscriptions, forms, segments, email engagement, deals, events reported through the API, dates (birthdays, renewals, anniversaries) or by hand, with waits, conditions, emails, tasks, notifications and webhook steps.
- **Sales:** pipelines with stages, a deal board, deal pages, a forecast, task reminders, and optional logging of 1:1 email onto contacts' timelines.
- **Reports** of email performance, audience growth and sales; **webhooks**; **API keys** and an integration API; and a **CRM page in the admin console** that can stop a workspace's sending.
- **Workspaces:** create more from the workspace switcher; add members by searching people as compose does; choose senders from the mailboxes you can send from; pick the time zone with the system picker.

### Changed

- Requires an `events` Redis datastore and `@rapidmx/restapi` 0.27 or later for replies, bounces and complaints to be learned from the mail event stream.
