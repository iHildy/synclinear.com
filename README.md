![image](https://user-images.githubusercontent.com/36117635/228115207-e9392f16-5a5b-4a27-9219-9cb91e3adf7e.png)

Initially created by [Haris Mehrzad](https://github.com/xPolar) and [Spacedrive](https://github.com/spacedriveapp/linear-github-sync), now extended and maintained by [Ted Spare](https://github.com/tedspare) and [Cal.com](https://cal.com/).

# SyncLinear.com

This is a system to synchronize Linear tickets and GitHub issues when a specific label is added.

This allows contributors to work with open source projects without having to give them access to your internal Linear team.

:wave: **Visit [SyncLinear.com](https://synclinear.com) to try it!**

---

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are greatly appreciated.

To get started, see the [contributor docs](CONTRIBUTING.md)!

## Self-hosting

If you prefer to host your own database and webhook consumer, we offer one-click deployment on Railway and DigitalOcean:

[![Deploy to DO](https://www.deploytodo.com/do-btn-blue-ghost.svg)](https://cloud.digitalocean.com/apps/new?repo=https://github.com/calcom/synclinear.com/tree/main)

> **Note**
> To deploy to Railway, delete the Dockerfile in your fork. Working on a permanent solution.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/L__0PR?referralCode=ted)

For finer-grained control, please see the [self-hosting instructions](Setup.md).

If you need any help, please check for related [issues](https://github.com/calcom/synclinear.com/issues) or open a new one.

## Troubleshooting

Some common error scenarios and how to work through them can be found here in the [troubleshooting guide](TROUBLESHOOTING.md).

## Proto Automated Workflow

The end-to-end flow of a Linear issue through Proto ↔ Jules automation is captured below:

```mermaid
%% Process map generated 2025-06-28
graph TD;
    A["Issue Created in Linear"] --> B["Auto-sync to GitHub"];
    B --> C["Proto adds 'jules' label"];
    C --> D{Jules capacity check};
    D -->|At limit| E["Queue: wait 30 min & retry"];
    D -->|Available| F["Jules starts task"];
    F --> G["Jules completes work → PR created"];
    G --> H["Request GitHub Copilot review"];
    H --> I["Developer opens branch in Cursor"];
    I --> J["Developer provides PR feedback"];
    J --> K["Cursor applies fixes"];
    K --> L["Developer resolves merge conflicts"];
    L --> M["Developer manual tests"];
    M --> N{Tests pass?};
    N -->|Yes| O["Merge PR to staging"];
    O --> P["Task Complete"];
    N -->|No| J;
```

Key implementation points:

1. Label-driven automation (see `utils/webhook/github.handler.ts`).
2. Resilient retry queue stored in `prisma` model `JulesTask`.
3. Scheduled retries via `/api/jules/retry` (hook up to cron every 30 min).
4. Build pipeline assumes `prisma generate` runs post-install; castings (`as any`) keep compilation green even before migration.

# Hello from Jules!
