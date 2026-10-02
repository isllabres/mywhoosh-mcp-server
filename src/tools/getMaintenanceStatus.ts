import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BASE_URLS, USER_AGENT } from '../constants.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';

export const method = 'getMaintenanceStatus';
export const description = `Whether MyWhoosh is under maintenance: ListOfNotifications (empty when everything is normal) and ServerTime in milliseconds. Needs no session, so it is the cheapest way to check that MyWhoosh is reachable.`;
export const parameters = z.object({});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    // This endpoint doesn't require auth
    const response = await fetch(`${BASE_URLS.PUBLIC}/v1/maintenance`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    
    const result = await response.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
