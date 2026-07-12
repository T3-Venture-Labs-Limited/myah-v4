#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const REMOTE_NAME = process.env.TWENTY_REMOTE ?? 'shopify-isolated-2032';
const CONFIG_PATH = process.env.TWENTY_CONFIG_PATH ?? join(homedir(), '.twenty', 'config.json');
const WARN_MS = Number.parseInt(process.env.SHOPIFY_TOOL_WARN_MS ?? '10000', 10);
const FAIL_MS = Number.parseInt(process.env.SHOPIFY_TOOL_FAIL_MS ?? '30000', 10);

const EXPECTED_TOOLS = [
	'app_get_shopify_store_context',
	'app_search_shopify_products',
	'app_get_shopify_product_detail',
	'app_get_shopify_brand_content',
	'app_get_shopify_custom_data',
	'app_get_shopify_commerce_summary',
	'app_get_shopify_customer_summary',
	'app_get_shopify_promotions_summary',
	'app_get_shopify_channel_context'
];

const TOOL_CASES = [
	{
		name: 'app_get_shopify_store_context',
		args: { productsFirst: 1 },
		expectKeys: ['shop', 'products']
	},
	{
		name: 'app_search_shopify_products',
		args: { query: 'snowboard', productsFirst: 1 },
		expectKeys: ['products']
	},
	{
		name: 'app_get_shopify_product_detail',
		args: { handle: 'the-collection-snowboard-liquid' },
		expectKeys: ['data.product']
	},
	{
		name: 'app_get_shopify_brand_content',
		args: { first: 1 },
		expectKeys: ['data.shop', 'data.pages', 'data.blogs', 'data.shopLocales']
	},
	{
		name: 'app_get_shopify_custom_data',
		args: { first: 1 },
		expectKeys: ['data.metaobjectDefinitions']
	},
	{
		name: 'app_get_shopify_commerce_summary',
		args: { first: 1 },
		expectKeys: ['data.orders']
	},
	{
		name: 'app_get_shopify_customer_summary',
		args: { first: 1 },
		expectKeys: ['data.customers'],
		allowUnavailableKey: 'customers'
	},
	{
		name: 'app_get_shopify_promotions_summary',
		args: { first: 1 },
		expectKeys: ['data.discountNodes']
	},
	{
		name: 'app_get_shopify_channel_context',
		args: { first: 1 },
		expectKeys: ['data.channels']
	}
];

const readRemote = () => {
	const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
	const remote = config.remotes?.[REMOTE_NAME];

	if (!remote) {
		throw new Error(`Twenty remote ${REMOTE_NAME} not found in ${CONFIG_PATH}`);
	}

	if (!remote.apiUrl || !remote.apiKey) {
		throw new Error(`Twenty remote ${REMOTE_NAME} must include apiUrl and apiKey.`);
	}

	return {
		apiKey: remote.apiKey,
		mcpUrl: `${remote.apiUrl.replace(/\/$/, '')}/mcp`
	};
};

const callMcpTool = async ({ apiKey, mcpUrl, name, args, id }) => {
	const startedAt = performance.now();
	const response = await fetch(mcpUrl, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id,
			method: 'tools/call',
			params: {
				name,
				arguments: args
			}
		})
	});
	const durationMs = Math.round(performance.now() - startedAt);
	const text = await response.text();

	if (!response.ok) {
		throw new Error(`${name} HTTP ${response.status}: ${text.slice(0, 500)}`);
	}

	const envelope = JSON.parse(text);

	if (envelope.error) {
		throw new Error(`${name} JSON-RPC error: ${JSON.stringify(envelope.error)}`);
	}

	return { durationMs, envelope };
};

const extractText = (value) => {
	const content = value?.result?.content;

	if (Array.isArray(content)) {
		return content
			.map((part) => (typeof part?.text === 'string' ? part.text : ''))
			.filter(Boolean)
			.join('\n');
	}

	if (typeof value?.result?.content === 'string') {
		return value.result.content;
	}

	return JSON.stringify(value.result ?? value);
};

const parseToolData = (envelope) => {
	const text = extractText(envelope);
	const candidates = [text];

	const fencedJson = text.match(/```json\s*([\s\S]*?)```/i);
	if (fencedJson?.[1]) {
		candidates.push(fencedJson[1]);
	}

	const firstBrace = text.indexOf('{');
	const lastBrace = text.lastIndexOf('}');
	if (firstBrace >= 0 && lastBrace > firstBrace) {
		candidates.push(text.slice(firstBrace, lastBrace + 1));
	}

	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate);

			return parsed?.result && typeof parsed.result === 'object'
				? parsed.result
				: parsed;
		} catch {
			// Try the next candidate.
		}
	}

	throw new Error(`Could not parse tool JSON output: ${text.slice(0, 500)}`);
};

const getPath = (object, path) =>
	path.split('.').reduce((current, segment) => current?.[segment], object);

const hasExpectedKey = ({ allowUnavailableKey, data, key }) => {
	if (getPath(data, key) !== undefined) {
		return true;
	}

	if (allowUnavailableKey && getPath(data, `data.unavailable.${allowUnavailableKey}`)) {
		return true;
	}

	return false;
};

const run = async () => {
	const { apiKey, mcpUrl } = readRemote();
	const failures = [];
	const warnings = [];

	console.log(`Remote: ${REMOTE_NAME}`);
	console.log(`MCP: ${mcpUrl}`);

	const catalog = await callMcpTool({
		apiKey,
		mcpUrl,
		name: 'get_tool_catalog',
		args: { categories: ['LOGIC_FUNCTION'] },
		id: 'catalog'
	});
	const catalogText = JSON.stringify(catalog.envelope);
	const missing = EXPECTED_TOOLS.filter((tool) => !catalogText.includes(tool));

	if (missing.length > 0) {
		failures.push(`MCP catalog missing tools: ${missing.join(', ')}`);
	}

	console.log(`Catalog: ${missing.length === 0 ? 'PASS' : 'FAIL'}`);

	for (const testCase of TOOL_CASES) {
		try {
			const result = await callMcpTool({
				apiKey,
				mcpUrl,
				name: 'execute_tool',
				args: {
					arguments: testCase.args,
					toolName: testCase.name
				},
				id: testCase.name
			});
			const data = parseToolData(result.envelope);
			const unavailable = data?.data?.unavailable;
			const missingKeys = testCase.expectKeys.filter(
				(key) =>
					!hasExpectedKey({
						allowUnavailableKey: testCase.allowUnavailableKey,
						data,
						key
					})
			);

			if (data.success !== true || data.connected !== true) {
				failures.push(
					`${testCase.name} expected success=true connected=true, got ${JSON.stringify({
						connected: data.connected,
						error: data.error,
						success: data.success
					})}`
				);
			}

			if (missingKeys.length > 0) {
				failures.push(
					`${testCase.name} missing expected keys: ${missingKeys.join(', ')}`
				);
			}

			if (result.durationMs > FAIL_MS) {
				failures.push(`${testCase.name} too slow: ${result.durationMs}ms > ${FAIL_MS}ms`);
			} else if (result.durationMs > WARN_MS) {
				warnings.push(`${testCase.name} slow: ${result.durationMs}ms > ${WARN_MS}ms`);
			}

			console.log(
				`${testCase.name}: PASS ${result.durationMs}ms${
					unavailable ? ` unavailable=${Object.keys(unavailable).join(',')}` : ''
				}`
			);
		} catch (error) {
			failures.push(
				`${testCase.name} failed: ${error instanceof Error ? error.message : String(error)}`
			);
			console.log(`${testCase.name}: FAIL`);
		}
	}

	for (const warning of warnings) {
		console.log(`WARN: ${warning}`);
	}

	if (failures.length > 0) {
		console.error('\nSmoke test failed:');
		for (const failure of failures) {
			console.error(`- ${failure}`);
		}
		process.exit(1);
	}

	console.log('\nSmoke test passed.');
};

run().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
