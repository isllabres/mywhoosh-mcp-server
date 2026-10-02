import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'getPlayerData';
export const description = `Get the logged-in player's full profile: PlayerDataStruct (name, birth date, height, weight, level, XP, coins, FTP in PlayerPersonalStruct.FtpPlayer, best power values, total distance and ride time, avatar and equipment) and PlayerGameData (units, volume and other settings). Call it first when you need the user's FTP, to turn watts into the FTP fractions workouts use, or as the starting point for updatePlayerData. It includes personal data (name, email, birth date): do not repeat it unnecessarily.`;
export const parameters = z.object({});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const whooshId = extra.client.getWhooshId();
    if (!whooshId) throw new McpError(-32600, 'Not authenticated');

    const result = await extra.client.post('/player/player-data', {
      body: JSON.stringify({
        WhooshId: whooshId,
        Action: 1052,
        CorrelationId: crypto.randomUUID(),
        DeviceId: 'mcp-server',
        Authorization: '',
      }),
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
