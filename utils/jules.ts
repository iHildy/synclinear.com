import got from "got";
import prisma from "../prisma";
import { GITHUB } from "./constants";
import { decrypt } from "./index";

/**
 * Creates an error handler for jules-queue label deletion failures
 */
const createJulesQueueLabelErrorHandler = (issueNumber: bigint) => () => {
    // Ignore errors if jules-queue label doesn't exist
    console.log(
        `jules-queue label not found on issue #${issueNumber}, continuing...`
    );
};

/**
 * Ensure a JulesTask exists for the specified issue. If one already exists it will be updated.
 * Waits 1 minute then checks for Jules bot task limit comments.
 */
export async function upsertJulesTask(params: {
    githubRepoId: bigint;
    githubIssueId: bigint;
    githubIssueNumber: bigint;
}) {
    const { githubRepoId, githubIssueId, githubIssueNumber } = params;

    await prisma.julesTask.upsert({
        where: { githubIssueId },
        update: { flaggedForRetry: false },
        create: {
            githubRepoId,
            githubIssueId,
            githubIssueNumber,
            flaggedForRetry: false
        }
    });

    // Sleep for 1 minute then check for Jules bot comments
    setTimeout(async () => {
        try {
            console.log(
                `[Jules] Checking for task limit comment on issue #${githubIssueNumber} after 1 minute`
            );

            // Get repo info to check for comments
            const repo = await prisma.gitHubRepo.findUnique({
                where: { repoId: githubRepoId }
            });
            if (!repo) return;

            const sync = await prisma.sync.findFirst({
                where: { githubRepoId }
            });
            if (!sync) return;

            const githubKey =
                process.env.GITHUB_API_KEY ||
                decrypt(sync.githubApiKey, sync.githubApiKeyIV);

            // Check for Jules bot comments
            const commentsResponse = await got.get(
                `https://api.github.com/repos/${repo.repoName}/issues/${githubIssueNumber}/comments`,
                {
                    headers: {
                        Authorization: `token ${githubKey}`,
                        "User-Agent": `${repo.repoName}, linear-github-sync`
                    }
                }
            );

            const comments = JSON.parse(commentsResponse.body);
            const julesTaskLimitComment = comments.find(
                (comment: any) =>
                    comment.user?.login?.includes("google-labs-jules") &&
                    comment.body?.startsWith(
                        "You are currently at your concurrent task limit"
                    )
            );

            if (julesTaskLimitComment) {
                console.log(
                    `[Jules] Task limit detected for issue #${githubIssueNumber}, marking for retry`
                );

                // Mark for retry
                await markJulesTaskForRetry({
                    githubRepoId,
                    githubIssueId,
                    githubIssueNumber
                });

                // Update GitHub labels
                await Promise.all([
                    got
                        .delete(
                            `https://api.github.com/repos/${repo.repoName}/issues/${githubIssueNumber}/labels/jules`,
                            {
                                headers: {
                                    Authorization: `token ${githubKey}`,
                                    "User-Agent": `${repo.repoName}, linear-github-sync`
                                }
                            }
                        )
                        .catch(() => {}), // Ignore if label doesn't exist
                    got.post(
                        `https://api.github.com/repos/${repo.repoName}/issues/${githubIssueNumber}/labels`,
                        {
                            json: { labels: ["jules-queue"] },
                            headers: {
                                Authorization: `token ${githubKey}`,
                                "User-Agent": `${repo.repoName}, linear-github-sync`
                            }
                        }
                    )
                ]);

                console.log(
                    `[Jules] Issue #${githubIssueNumber} marked for retry and moved to queue`
                );
            }
        } catch (error) {
            console.error(
                `[Jules] Error checking comments for issue #${githubIssueNumber}:`,
                error
            );
        }
    }, 60000); // 1 minute delay
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

    const existing = await prisma.julesTask.findUnique({
        where: { githubIssueId }
    });

    if (existing) {
        await prisma.julesTask.update({
            where: { githubIssueId },
            data: { flaggedForRetry: true }
        });
    } else {
        await prisma.julesTask.create({
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
    const flaggedTasks = await prisma.julesTask.findMany({
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

            // Re-apply `jules` label and remove `jules-queue` label
            await Promise.all([
                got.post(
                    `${GITHUB.REPO_ENDPOINT}/${repo.repoName}/issues/${task.githubIssueNumber}/labels`,
                    {
                        json: { labels: ["jules"] },
                        headers: {
                            Authorization: `token ${githubKey}`,
                            "User-Agent": `${repo.repoName}, linear-github-sync`
                        },
                        throwHttpErrors: false
                    }
                ),
                got
                    .delete(
                        `${GITHUB.REPO_ENDPOINT}/${repo.repoName}/issues/${task.githubIssueNumber}/labels/jules-queue`,
                        {
                            headers: {
                                Authorization: `token ${githubKey}`,
                                "User-Agent": `${repo.repoName}, linear-github-sync`
                            },
                            throwHttpErrors: false
                        }
                    )
                    .catch(
                        createJulesQueueLabelErrorHandler(
                            task.githubIssueNumber
                        )
                    )
            ]);

            // Update task state
            await prisma.julesTask.update({
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

