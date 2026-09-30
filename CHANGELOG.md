# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/rapidmx/crm-plugin/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/rapidmx/crm-plugin/compare/v0.1.0...v0.2.0
