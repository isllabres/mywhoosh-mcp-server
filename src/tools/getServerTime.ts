import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'getServerTime';
export const description = `Current MyWhoosh server time as a Unix timestamp in MILLISECONDS (a bare number such as 1789547264728). Divide by 1000 for seconds, the unit createTask and getDateRangeTaskList use.`;
export const parameters = z.object({});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const result = await extra.client.get('/server-time');
    return {
      content: [{ type: 'text', text: JSON.stringify({ serverTime: result }, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
