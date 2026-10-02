import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'getCustomWorkoutUpload';
export const description = `Low-level: returns the metadata of the user's custom workout ZIP, {data: {userId, workoutZipUrl, workoutCount}}. workoutZipUrl is a pre-signed storage link that expires after about 10 minutes. You usually want downloadCustomWorkoutsFromS3, which downloads and parses it. It fails with the same sportsModeType error described there (GitHub issue #1).`;
export const parameters = z.object({});

export async function handler(
  _args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const whooshId = extra.client.getWhooshId();
    if (!whooshId) throw new McpError(-32600, 'Not authenticated');

    const result = await extra.client.get(`/client/custom-workout-upload/${whooshId}`, { baseUrl: 'COACHING' });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
