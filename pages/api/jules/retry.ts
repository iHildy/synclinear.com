import type { NextApiRequest, NextApiResponse } from "next";
import { retryFlaggedJulesTasks } from "../../../utils/jules";

// GET /api/jules/retry
// This endpoint is intended to be triggered by an external cron every 30 minutes.
export default async function handle(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res
            .setHeader("Allow", "GET")
            .status(405)
            .send({ error: "Only GET requests are accepted." });
    }

    try {
        const result = await retryFlaggedJulesTasks();
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error(error);
        return res
            .status(500)
            .json({ success: false, error: "Failed to retry Jules tasks." });
    }
}

