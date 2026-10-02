import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'getSeasonPassProgress';
export const description = `Progress of the logged-in player in one season pass. It needs the season UUID (seasonId) and this server has no dedicated tool to list season ids, so call it only when you already have one.`;
export const parameters = z.object({
  seasonId: z.string().describe('UUID of the season pass to query; you must already know it'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const whooshId = extra.client.getWhooshId();
    if (!whooshId) throw new McpError(-32600, 'Not authenticated');

    const query = new URLSearchParams({
      userId: whooshId,
      seasonId: args.seasonId,
    });

    const result = await extra.client.get(`/season-pass/progress?${query}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
