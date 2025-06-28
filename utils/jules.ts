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

    console.log(
        `[Jules] markJulesTaskForRetry called with: repoId=${githubRepoId}, issueId=${githubIssueId}, issueNumber=${githubIssueNumber}`
    );

    try {
        const existing = await (prisma as any).julesTask.findUnique({
            where: { githubIssueId }
        });

        if (existing) {
            console.log(
                `[Jules] Found existing task with id=${existing.id}, updating flaggedForRetry to true`
            );
            const updated = await (prisma as any).julesTask.update({
                where: { githubIssueId },
                data: { flaggedForRetry: true }
            });
            console.log(
                `[Jules] Successfully updated task: flaggedForRetry=${updated.flaggedForRetry}`
            );
        } else {
            console.log(
                `[Jules] No existing task found, creating new one with flaggedForRetry=true`
            );
            const created = await (prisma as any).julesTask.create({
                data: {
                    githubRepoId,
                    githubIssueId,
                    githubIssueNumber,
                    flaggedForRetry: true
                }
            });
            console.log(
                `[Jules] Successfully created new task with id=${created.id}, flaggedForRetry=${created.flaggedForRetry}`
            );
        }
    } catch (error) {
        console.error(`[Jules] Error in markJulesTaskForRetry:`, error);
        throw error;
    }
}

/**
 * Retry all tasks that are currently flagged. Intended to be called by a cron job every 30 minutes.
 * This will re-apply the `jules` label on GitHub and increment the retry counter.
 */
export async function retryFlaggedJulesTasks() {
    console.log(`[Jules Retry] Starting retry process...`);

    const flaggedTasks = await (prisma as any).julesTask.findMany({
        where: { flaggedForRetry: true }
    });

    console.log(
        `[Jules Retry] Found ${flaggedTasks.length} tasks flagged for retry`
    );
    if (!flaggedTasks.length) return { retried: 0 };

    let retried = 0;

    for (const task of flaggedTasks) {
        console.log(
            `[Jules Retry] Processing task ${task.id} for issue #${task.githubIssueNumber}`
        );
        try {
            // Get repo information
            const repo = await prisma.gitHubRepo.findUnique({
                where: { repoId: task.githubRepoId }
            });
            if (!repo) {
                console.log(
                    `[Jules Retry] No repo found for task ${task.id}, skipping`
                );
                continue;
            }
            console.log(`[Jules Retry] Found repo: ${repo.repoName}`);

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

            // Remove `jules-queue` label if present
            try {
                await got.delete(
                    `${GITHUB.REPO_ENDPOINT}/${repo.repoName}/issues/${task.githubIssueNumber}/labels/jules-queue`,
                    {
                        headers: {
                            Authorization: `token ${githubKey}`,
                            "User-Agent": `${repo.repoName}, linear-github-sync`
                        },
                        throwHttpErrors: false
                    }
                );
                console.log(
                    `[Jules Retry] Removed jules-queue label from #${task.githubIssueNumber}`
                );
            } catch (e) {
                console.log(
                    `[Jules Retry] No jules-queue label to remove from #${task.githubIssueNumber}`
                );
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
            console.log(
                `[Jules Retry] Re-applied jules label to #${task.githubIssueNumber}`
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
            console.log(`[Jules Retry] Successfully retried task ${task.id}`);
        } catch (e) {
            console.error(
                `[Jules Retry] Failed retrying Jules task ${task.id}:`,
                e
            );
        }
    }

    console.log(
        `[Jules Retry] Completed retry process. Successfully retried ${retried} out of ${flaggedTasks.length} tasks`
    );
    return { retried };
}

