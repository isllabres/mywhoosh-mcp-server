import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'getEvents';
export const description = `List upcoming and current MyWhoosh events (races, time trials, group rides): ListOfEventData with, among other fields, EventId and description. Use an EventId as taskTypeId (taskType E_Event) in createTask to put an event on the calendar. sportsMode filters by sport and defaults to E_Cycling. Times are requested with a fixed +01:00 zone offset.`;
export const parameters = z.object({
  sportsMode: z.string().optional().default('E_Cycling').describe('Sport to list events for, e.g. E_Cycling (default)'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const zoneOffset = Buffer.from('+01:00:00.000').toString('base64');
    const query = new URLSearchParams({
      'zone-offset': zoneOffset,
      date: '-1',
      SportsMode: args.sportsMode || 'E_Cycling',
      platform: 'mobile',
    });

    const result = await extra.client.get(`/events?${query}`, { baseUrl: 'SERVICE26' });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
