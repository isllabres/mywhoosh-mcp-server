import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'getCalculations';
export const description = `XP and coin reward tables: XpLevelUpData rows with UserLevel, TotalXPRequired, XPRequiredPerLevel and LevelUpCoinsReward. currentLevel (default 1) is sent as the CurrentLevel parameter.`;
export const parameters = z.object({
  currentLevel: z.number().optional().default(1).describe('Player level sent as CurrentLevel (default 1). The response is the whole level-up table either way.'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const result = await extra.client.get(`/economy/calculations?CurrentLevel=${args.currentLevel}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
