import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

// TEMPORARY: sends the body as-is to POST /client/custom-workout-upload, bypassing
// the typed schema of uploadCustomWorkout, to find which request shape stops
// MyWhoosh persisting sportsModeType as NaN (see issue #1). Remove when done.
export const method = 'debugUploadRaw';
export const description =
  'TEMPORARY debug tool. Sends an arbitrary JSON body unchanged to POST /client/custom-workout-upload (Coaching API). UserId is filled in automatically if omitted.';
export const parameters = z.object({
  body: z.record(z.string(), z.any()).describe('Raw request body to POST as-is'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const whooshId = extra.client.getWhooshId();
    if (!whooshId) throw new McpError(-32600, 'Not authenticated');

    const body = { UserId: whooshId, ...args.body };
    const result = await extra.client.post('/client/custom-workout-upload', {
      baseUrl: 'COACHING',
      body: JSON.stringify(body),
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
