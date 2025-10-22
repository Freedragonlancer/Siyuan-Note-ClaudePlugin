/**
 * Test script to verify Claude API connection with custom baseURL
 */

import Anthropic from "@anthropic-ai/sdk";

const baseURL = "http://cc.leve.pub/api";
const apiKey = "cr_ec573582eb5f5242919a181390c09a3a3cb28fba0890bce5bc44d1a12a0d3ba6";

console.log("Testing API connection...");
console.log("Base URL:", baseURL);
console.log("API Key:", apiKey.substring(0, 10) + "..." + apiKey.substring(apiKey.length - 10));
console.log("---");

const client = new Anthropic({
    apiKey: apiKey,
    baseURL: baseURL,
});

async function testModelsList() {
    try {
        console.log("Fetching available models...");

        const models = await client.models.list();

        console.log("\n✓ Success! Models list retrieved.\n");
        console.log("Available models:");
        for (const model of models.data) {
            console.log(`  - ${model.id} (${model.display_name})`);
            console.log(`    Created: ${model.created_at}`);
        }
        console.log("\nTotal models:", models.data.length);

        return true;
    } catch (error) {
        console.error("\n✗ Error: Failed to fetch models list.\n");
        console.error("Error details:");
        console.error("Message:", error.message);
        console.error("Status:", error.status);
        if (error.error) {
            console.error("Error object:", JSON.stringify(error.error, null, 2));
        }
        return false;
    }
}

async function testConnection() {
    try {
        console.log("Sending test message...");

        const response = await client.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 100,
            messages: [
                {
                    role: "user",
                    content: "Say 'Hello! Connection successful!' in Chinese and English."
                }
            ],
        });

        console.log("\n✓ Success! API connection is working.\n");
        console.log("Response:");
        console.log("Model:", response.model);
        console.log("Role:", response.role);
        console.log("Content:", response.content[0].type === "text" ? response.content[0].text : "");
        console.log("\nUsage:", response.usage);

        return true;
    } catch (error) {
        console.error("\n✗ Error: API connection failed.\n");
        console.error("Error details:");
        console.error("Message:", error.message);
        console.error("Status:", error.status);
        if (error.error) {
            console.error("Error object:", JSON.stringify(error.error, null, 2));
        }
        return false;
    }
}

async function runTests() {
    console.log("=".repeat(60));
    console.log("Test 1: Fetching Models List");
    console.log("=".repeat(60));
    const modelsSuccess = await testModelsList();

    console.log("\n" + "=".repeat(60));
    console.log("Test 2: Testing Message API");
    console.log("=".repeat(60));
    const messageSuccess = await testConnection();

    process.exit(modelsSuccess && messageSuccess ? 0 : 1);
}

runTests();
