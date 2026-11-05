# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-11-05

### Added
- Added the rule that the more specific agent model assignment wins where categories overlap
- Added the RapidREST Claude Code plugin to the project settings

### Changed
- Publish only from a release tag's own Build, and only once every Build of that commit has finished green
- Record the standing agent model assignments in the project notes
- Move the agent model assignments to the top of the project notes, keeping session history at the bottom
- Update the agent model assignments to JP's revised criteria: Sonnet for general code and review, Opus for architecture, planning, investigation, security and performance, Haiku for simple operations
- Upgrade @rapidrest/core to 6.1.0, @rapidrest/service-core to 2.5.1 and @rapidrest/react to 2.3.0
- Upgrade @rapidmx/restapi to ^0.36.0 and @rapidmx/web-client to ^0.38.1, with the resolutions to match
- Upgrade every other dependency to its latest release, keeping typescript on 6.x
- Install corepack globally before enabling it in CI, since the node:lts images no longer bundle it
- Upgrade @rapidmx/restapi to ^0.37.0 and @rapidmx/web-client to ^0.39.0, with the resolutions to match

## [0.3.0] - 2026-10-24

### Changed
- Publish a prerelease version to npm under the next tag, which npm requires, and a release under latest
- Build the repositories and the collaborating routes of the CRM jobs and routes in @Init hooks
- Build against @rapidmx/restapi ^0.34.0 and @rapidmx/web-client ^0.36.0

## [0.2.0] - 2026-09-30

### Added
- Added a New workspace choice to the CRM's workspace switcher, opening a dialog that creates the workspace and switches to it
- Added members by searching people by name or address, as compose addresses mail, and add several at once
- Added an endpoint that says which of the caller's mailboxes they can send from
- Added release notes for the upcoming release

### Changed
- Show members by name and address, filled in from their own mailbox, rather than by user id
- Choose Send as senders from the mailboxes the caller can send from, with the mailbox's display name prefilled and editable
- Pick the workspace's time zone with the system's time zone picker

[Unreleased]: https://github.com/rapidmx/crm-plugin/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/rapidmx/crm-plugin/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/rapidmx/crm-plugin/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/rapidmx/crm-plugin/compare/v0.1.0...v0.2.0
