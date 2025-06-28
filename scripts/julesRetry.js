const { retryFlaggedJulesTasks } = require("../utils/jules");

(async () => {
    try {
        const result = await retryFlaggedJulesTasks();
        console.log("[Jules Retry]", result);
        process.exit(0);
    } catch (error) {
        console.error("[Jules Retry] failed", error);
        process.exit(1);
    }
})();

