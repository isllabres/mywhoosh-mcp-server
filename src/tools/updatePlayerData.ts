import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'updatePlayerData';
export const description = `Overwrite the logged-in player's profile and game settings (avatar equipment, units, volume, ...). This is a write that replaces the stored profile, so only use it when the user asks for a profile change.

Workflow: call getPlayerData first, change only the fields the user asked for in the structure it returns (PlayerDataStruct and PlayerGameData) and send the WHOLE structure back as a JSON string in playerData. MyWhoosh expects the complete structure, not a partial patch.
Returns MyWhoosh's response.`;
export const parameters = z.object({
  playerData: z.string().describe('The COMPLETE player data structure from getPlayerData as a JSON string, with only the requested fields changed'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const whooshId = extra.client.getWhooshId();
    if (!whooshId) throw new McpError(-32600, 'Not authenticated');

    const result = await extra.client.put('/player/player-data', {
      body: JSON.stringify({
        PlayerData: args.playerData,
        WhooshId: whooshId,
        Action: 1051,
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
