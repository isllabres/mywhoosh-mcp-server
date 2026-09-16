import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { MyWhooshClient } from '../clients/mywhoosh.js';

export interface ToolModule {
  method: string;
  description: string;
  parameters: z.ZodObject<any>;
  handler: (args: any, extra: { client: MyWhooshClient }) => Promise<CallToolResult>;
}
