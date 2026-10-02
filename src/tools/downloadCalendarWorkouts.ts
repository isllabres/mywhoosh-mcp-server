import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'downloadCalendarWorkouts';
export const description = `Get the workout definitions saved for the user's MyWhoosh calendar. If nothing is saved it answers {status: false, message: "Player calendar file not found."}, which is a normal empty result, not an error. To see what is scheduled on which day use getDateRangeTaskList; to schedule something use createTask.`;
export const parameters = z.object({});

export async function handler(
  _args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const whooshId = extra.client.getWhooshId();
    if (!whooshId) throw new McpError(-32600, 'Not authenticated');

    const query = new URLSearchParams({
      player_id: whooshId,
      type: 'calendar',
    });

    const result = await extra.client.post(`/mobile/workout/download?${query}`, { baseUrl: 'SERVICE20' });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
