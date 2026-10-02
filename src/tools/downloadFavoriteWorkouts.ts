import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'downloadFavoriteWorkouts';
export const description = `Get the workouts the user marked as favorite in MyWhoosh. Returns {status: true, data: {listOfFavouriteWorkouts: [...]}}. If the user has no favorites it answers {status: false, message: "Player favorite file not found."}, which is a normal empty result, not an error.`;
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
      type: 'favorite',
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
