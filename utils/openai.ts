import OpenAI from "openai";

export const AI_PROCESSED_MARKER = "\n\n---\n*Reworded by AI for clarity.*";
const AI_PROMPT_PREFIX =
    "Rephrase the following issue description to be more AI prompt friendly. Make it clear, concise, and actionable for an AI agent. Return only the rephrased description, without any of your own conversational text or preamble:";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
    if (!openaiClient) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error(
                "OPENAI_API_KEY is not set in environment variables."
            );
        }
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return openaiClient;
}

/**
 * Rewords an issue description using the OpenAI API to make it more AI prompt friendly.
 * Adds a marker to the description after processing to prevent reprocessing.
 * If the description already contains the marker, it returns null.
 * @param originalDescription The original issue description.
 * @returns The reworded description with the AI_PROCESSED_MARKER, or null if already processed or an error occurs.
 */
export async function rewordIssueDescriptionForAI(
    originalDescription: string | null | undefined
): Promise<string | null> {
    if (
        !originalDescription ||
        originalDescription.includes(AI_PROCESSED_MARKER)
    ) {
        console.log(
            "[OpenAI] Description is empty or already processed. Skipping."
        );
        return null; // Already processed or empty, no change needed
    }

    try {
        const client = getOpenAIClient();
        const fullPrompt = `${AI_PROMPT_PREFIX}\n\n${originalDescription}`;

        console.log("[OpenAI] Sending description to OpenAI for rewording...");
        const response = await client.chat.completions.create({
            model: "gpt-4.1",
            messages: [{ role: "user", content: fullPrompt }],
            temperature: 0.5 // Adjust for creativity vs. determinism
        });

        const rewordedText = response.choices[0]?.message?.content?.trim();

        if (rewordedText) {
            console.log("[OpenAI] Successfully reworded description.");
            return `${rewordedText}\n\n${AI_PROCESSED_MARKER}`;
        }
        console.log("[OpenAI] No reworded text received from API.");
        return null;
    } catch (error) {
        console.error("[OpenAI] Error rewording issue description:", error);
        return null; // Return null on error to avoid breaking the sync flow
    }
}

/**
 * Checks if a description has been processed by AI.
 * @param description The issue description.
 * @returns True if the AI_PROCESSED_MARKER is present, false otherwise.
 */
export function isAiProcessed(description: string | null | undefined): boolean {
    return !!description && description.includes(AI_PROCESSED_MARKER);
}

/**
 * Removes the AI processed marker from a description string.
 * @param description The description string, possibly containing the AI marker.
 * @returns The description string without the AI marker.
 */
export function stripAiMarker(
    description: string | null | undefined
): string | null | undefined {
    if (!description) return description;
    // Replace the marker with an empty string. Ensure to handle potential multiple newlines if the marker was at the very end.
    const stripped = description.replace(AI_PROCESSED_MARKER, "");
    // Trim whitespace and then specifically trim trailing newlines that might be left from the marker removal
    return stripped.trim().replace(/\n+$/, "");
}

