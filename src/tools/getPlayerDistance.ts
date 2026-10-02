import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'getPlayerDistance';
export const description = `Distance statistics for the last N days (days, default 7). Returns DayBasedStats with the per-day data. Only covers rides done in MyWhoosh.`;
export const parameters = z.object({
  days: z.number().default(7).describe('How many past days to include (default 7)'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const result = await extra.client.get(`/player/player-distance?days=${args.days}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
