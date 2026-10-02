import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'getChallenges';
export const description = `Catalogue of achievements and challenges: TotalAchievements grouped by type (for example Elevation) with id (such as Ach_ClimbAccumulative_1), name, description and target amount. It is the catalogue, not the player's progress: use getPlayerAchievements for that.`;
export const parameters = z.object({});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const result = await extra.client.get('/game/challenges');
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
