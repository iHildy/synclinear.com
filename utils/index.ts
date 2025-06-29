import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { GitHubContext, LinearContext } from "../typings";
import { GENERAL, GITHUB } from "./constants";

export const isDev = (): boolean => {
    return process.env.NODE_ENV === "development";
};

export const getWebhookURL = (): string => {
    if (typeof window == "undefined") {
        // TODO: Support ngrok URLs for local development
        return "https://synclinear.com/api";
    }

    if (window.location.hostname === "localhost") return "https://example.com";
    return `${window.location.origin}/api`;
};

export const copyToClipboard = (text: string) => {
    if (!window?.navigator) alert("Cannot copy to clipboard");

    navigator?.clipboard?.writeText(text);
};

export const formatJSON = (body: object): string => {
    return JSON.stringify(body, null, 4);
};

export const clearURLParams = () => {
    window.history.replaceState(null, null, window.location.pathname);
};

export const encrypt = (text: string): { hash: string; initVector: string } => {
    const algorithm = "aes-256-ctr";
    const secret = process.env.ENCRYPTION_KEY;

    if (!secret) {
        throw new Error("ENCRYPTION_KEY environment variable is required");
    }

    const initVector = randomBytes(16);
    // Type assertion needed due to Node.js Buffer/TypeScript compatibility
    const cipher = createCipheriv(algorithm, secret as any, initVector as any);
    const encrypted = Buffer.concat([
        cipher.update(text, "utf8") as any,
        cipher.final() as any
    ]);

    return {
        hash: encrypted.toString("hex"),
        initVector: initVector.toString("hex")
    };
};

export const decrypt = (content: string, initVector: string): string => {
    const algorithm = "aes-256-ctr";
    const secret = process.env.ENCRYPTION_KEY;

    if (!secret) {
        throw new Error("ENCRYPTION_KEY environment variable is required");
    }

    // Type assertion needed due to Node.js Buffer/TypeScript compatibility
    const decipher = createDecipheriv(
        algorithm,
        secret as any,
        Buffer.from(initVector, "hex") as any
    );
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(content, "hex") as any) as any,
        decipher.final() as any
    ]);

    return decrypted.toString();
};

export const replaceImgTags = (text: string): string => {
    try {
        const withInlineImages =
            text?.replace(
                GENERAL.IMG_TAG_REGEX,
                (_, args) => `![image](https://${args})`
            ) || "";

        return withInlineImages;
    } catch (error) {
        console.error(error);
        return text;
    }
};

export const replaceStrikethroughTags = (text: string): string => {
    // To avoid unforeseen infinite loops, only replace the first 10 occurrences
    const tildes = text?.match(/~+/g);
    if (tildes?.length > 10) return text;

    return text?.replace(/(?<!\\)~(?!~)/g, "~~") || text;
};

export const replaceGithubComment = (text: string): string => {
    const regex = /<!--(.*?)-->/g;
    const stringWithoutComments = text.replace(regex, "");
    return stringWithoutComments;
};

export const getSyncFooter = (): string => {
    return `Synced`;
};

export const legacySyncFooter = `Synced`;

export const saveSync = async (
    linearContext: LinearContext,
    githubContext: GitHubContext
) => {
    const data = {
        github: { ...githubContext },
        linear: { ...linearContext }
    };

    const response = await fetch("/api/save", {
        method: "POST",
        body: JSON.stringify(data)
    });

    return await response.json();
};

export const getAttachmentQuery = (
    issueId: string,
    issueNumber: number,
    repoFullName: string
): string => {
    return `mutation {
        attachmentCreate(input: {
            issueId: "${issueId}"
            title: "GitHub Issue #${issueNumber} - ${repoFullName}"
            subtitle: "Synchronized"
            url: "https://github.com/${repoFullName}/issues/${issueNumber}"
            iconUrl: "${GITHUB.ICON_URL}"
        }) {
            success
        }
    }`;
};

export const skipReason = (
    event:
        | "issue"
        | "edit"
        | "milestone"
        | "project"
        | "comment"
        | "state change"
        | "label"
        | "assignee",
    issueNumber: number | string,
    causedBySync = false
): string => {
    return `Skipping over ${event} for issue #${issueNumber} as it is ${
        causedBySync ? "caused by sync" : "not synced"
    }.`;
};

export const isNumber = (value: string | number): boolean => {
    return !isNaN(Number(value));
};

