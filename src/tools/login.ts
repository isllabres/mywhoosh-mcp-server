import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'login';
export const description = `Authenticate against MyWhoosh with an email and password and keep the session for the other tools.

Normally you do NOT need this: when the server has MYWHOOSH_USERNAME and MYWHOOSH_PASSWORD configured it logs in by itself and every authenticated tool works right away. Call it only if tools answer "Not authenticated" and the user gives you credentials, or to switch account. Never invent credentials. The session is shared by everyone using this server.

Returns the account whooshId (the player id MyWhoosh uses). The access token stays on the server and is not returned.

MyWhoosh allows one active session per account: if it answers "You are already logged in from another device", an earlier session is still open and logins keep failing until it expires or is closed from the app.`;
export const parameters = z.object({
  username: z.string().describe('MyWhoosh account email'),
  password: z.string().describe('MyWhoosh account password'),
  deviceId: z.string().optional().describe('Device identifier (optional, a random UUID is generated when omitted)'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const deviceId = args.deviceId || crypto.randomUUID();
    const tokens = await extra.client.login(args.username, args.password, deviceId);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          whooshId: tokens.whooshId,
          message: 'Successfully authenticated with MyWhoosh',
        }, null, 2),
      }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
