import got from "got";
import prisma from "../prisma";
import { GITHUB } from "./constants";
import { decrypt } from "./index";

/**
 * Ensure a JulesTask exists for the specified issue. If one already exists it will be updated.
 */
export async function upsertJulesTask(params: {
    githubRepoId: bigint;
    githubIssueId: bigint;
    githubIssueNumber: bigint;
}) {
    const { githubRepoId, githubIssueId, githubIssueNumber } = params;

    await (prisma as any).julesTask.upsert({
        where: { githubIssueId },
        update: { flaggedForRetry: false },
        create: {
            githubRepoId,
            githubIssueId,
            githubIssueNumber,
            flaggedForRetry: false
        }
    });
}

/**
 * Mark the provided GitHub issue for retry.
 */
export async function markJulesTaskForRetry(params: {
    githubRepoId: bigint;
    githubIssueId: bigint;
    githubIssueNumber: bigint;
}) {
    const { githubRepoId, githubIssueId, githubIssueNumber } = params;

    const existing = await (prisma as any).julesTask.findUnique({
        where: { githubIssueId }
    });

    if (existing) {
        await (prisma as any).julesTask.update({
            where: { githubIssueId },
            data: { flaggedForRetry: true }
        });
    } else {
        await (prisma as any).julesTask.create({
            data: {
                githubRepoId,
                githubIssueId,
                githubIssueNumber,
                flaggedForRetry: true
            }
        });
    }
}

/**
 * Retry all tasks that are currently flagged. Intended to be called by a cron job every 30 minutes.
 * This will re-apply the `jules` label on GitHub and increment the retry counter.
 */
export async function retryFlaggedJulesTasks() {
    const flaggedTasks = await (prisma as any).julesTask.findMany({
        where: { flaggedForRetry: true }
    });

    if (!flaggedTasks.length) return { retried: 0 };

    let retried = 0;

    for (const task of flaggedTasks) {
        try {
            // Get repo information
            const repo = await prisma.gitHubRepo.findUnique({
                where: { repoId: task.githubRepoId }
            });
            if (!repo) continue;

            // Find a sync row (any will do) to retrieve a GitHub token
            const sync = await prisma.sync.findFirst({
                where: { githubRepoId: task.githubRepoId }
            });
            if (!sync) continue;

            const githubKey = process.env.GITHUB_API_KEY
                ? process.env.GITHUB_API_KEY
                : decrypt(sync.githubApiKey, sync.githubApiKeyIV);

            // Fetch issue details to check for `Human` label before re-applying `jules`
            const issueResponse = await got.get(
                `${GITHUB.REPO_ENDPOINT}/${repo.repoName}/issues/${task.githubIssueNumber}`,
                {
                    headers: {
                        Authorization: `token ${githubKey}`,
                        "User-Agent": `${repo.repoName}, linear-github-sync`
                    },
                    throwHttpErrors: false
                }
            );

            if (issueResponse.statusCode > 201) continue;

            const issueData: { labels?: Array<{ name: string }> } = JSON.parse(
                issueResponse.body
            );
            const hasHuman = issueData.labels?.some(l => l.name === "Human");
            if (hasHuman) {
                // Skip processing entirely if `Human` label is present
                continue;
            }

            // Re-apply `jules` label
            await got.post(
                `${GITHUB.REPO_ENDPOINT}/${repo.repoName}/issues/${task.githubIssueNumber}/labels`,
                {
                    json: { labels: ["jules"] },
                    headers: {
                        Authorization: `token ${githubKey}`,
                        "User-Agent": `${repo.repoName}, linear-github-sync`
                    },
                    throwHttpErrors: false
                }
            );

            // Update task state
            await (prisma as any).julesTask.update({
                where: { id: task.id },
                data: {
                    flaggedForRetry: false,
                    retryCount: { increment: 1 },
                    lastRetryAt: new Date()
                }
            });

            retried += 1;
        } catch (e) {
            console.error("Failed retrying Jules task", task.id, e);
        }
    }

    return { retried };
}

