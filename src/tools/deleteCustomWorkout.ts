import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'deleteCustomWorkout';
export const description = `Delete one custom workout from the user's MyWhoosh library by its workout Id (the Id used in uploadCustomWorkout). Irreversible: only do it on an explicit request and only for workouts you created. Keep the Ids you create, because listing workouts may not be possible (see below).
Returns {"message": "Custom workout is being deleted."} when accepted; the deletion is asynchronous.

Known problem: workouts uploaded through this server are stored with an invalid sportsModeType and the delete fails on them with a CastError (MyWhoosh backend bug, GitHub issue #1). When that happens, ask the user to delete the workout manually in the MyWhoosh app.`;
export const parameters = z.object({
  workoutId: z.number().describe('Id of the custom workout, the same number used in uploadCustomWorkout'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const whooshId = extra.client.getWhooshId();
    if (!whooshId) throw new McpError(-32600, 'Not authenticated');

    const result = await extra.client.delete(
      `/client/custom-workout-upload/${whooshId}/${args.workoutId}`,
      { baseUrl: 'COACHING' }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
