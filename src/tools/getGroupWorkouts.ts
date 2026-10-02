import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'getGroupWorkouts';
export const description = `List the group workouts MyWhoosh currently offers (structured sessions that riders join together on a route). Returns ListOfWorkoutData; each entry has WorkoutEventId, WorkoutName, RouteId and RouteName, among other fields. Times are requested with a fixed +01:00 zone offset.`;
export const parameters = z.object({});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const zoneOffset = Buffer.from('+01:00:00.000').toString('base64');
    const query = new URLSearchParams({
      'zone-offset': zoneOffset,
      platform: 'mobile',
    });

    const result = await extra.client.get(`/group-workout?${query}`, { baseUrl: 'SERVICE26' });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
