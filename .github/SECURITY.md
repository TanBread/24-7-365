# Security Policy

## Supported Versions

Only the latest released version of 7/24 IDE receives security updates. Please
update to the most recent release before reporting an issue.

| Version | Supported |
| ------- | --------- |
| 1.5.x   | ✅        |
| < 1.5   | ❌        |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately through GitHub's
[**Private vulnerability reporting**](https://github.com/strmax195-hue/7-24-IDE/security/advisories/new)
(Security tab → Report a vulnerability). If that is unavailable, contact the
maintainer directly via their GitHub profile
([@strmax195-hue](https://github.com/strmax195-hue)).

When reporting, please include:

- A clear description of the issue and its potential impact
- Steps to reproduce (a proof of concept if possible)
- The affected version and your operating system
- Any suggested mitigation, if you have one

We will acknowledge your report as soon as possible, investigate, and keep you
informed about the fix and disclosure timeline.

## Scope & notes

7/24 IDE is a **local** desktop application: it reads and writes files, runs
terminal commands, and talks to AI providers you configure. By design the agent
can act on your machine within the permissions you grant it. Relevant safeguards
include a folder-scoped sandbox, per-operation permission rules (read / write /
execute), diff review before writes, and OS-keychain encryption of your API key.

Please report anything that could let untrusted content (file contents, model
output, MCP servers, repository names) escape these safeguards — for example
arbitrary code execution, sandbox escape, or exposure of stored credentials.
