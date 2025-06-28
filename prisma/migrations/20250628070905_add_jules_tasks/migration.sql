-- CreateTable
CREATE TABLE "jules_tasks" (
    "id" TEXT NOT NULL,
    "githubIssueId" BIGINT NOT NULL,
    "githubIssueNumber" BIGINT NOT NULL,
    "githubRepoId" BIGINT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "flaggedForRetry" BOOLEAN NOT NULL DEFAULT false,
    "lastRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jules_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jules_tasks_githubIssueId_key" ON "jules_tasks"("githubIssueId");

-- AddForeignKey
ALTER TABLE "jules_tasks" ADD CONSTRAINT "jules_tasks_githubRepoId_fkey" FOREIGN KEY ("githubRepoId") REFERENCES "github_repos"("repoId") ON DELETE RESTRICT ON UPDATE CASCADE;
