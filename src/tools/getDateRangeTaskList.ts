import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'getDateRangeTaskList';
export const description = `List what is scheduled on the user's MyWhoosh calendar between two dates. Returns {status, data: {startDate, endDate, taskList: [...]}}; an empty taskList means nothing is scheduled. Dates are Unix timestamps in seconds: use the start of the first day and the end of the last day. Use it to confirm that createTask worked or to find a TaskId.`;
export const parameters = z.object({
  startDate: z.number().describe('Start of the range as a Unix timestamp in seconds, e.g. midnight of the first day'),
  endDate: z.number().describe('End of the range as a Unix timestamp in seconds, e.g. the end of the last day'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const query = new URLSearchParams({
      startDate: args.startDate.toString(),
      endDate: args.endDate.toString(),
    });

    const result = await extra.client.get(`/task/date-range-task-list?${query}`, { baseUrl: 'SERVICE14' });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
