import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'deleteTask';
export const description = `Remove a task from the user's MyWhoosh calendar. taskId is the TaskId returned by createTask or listed by getDateRangeTaskList, NOT the workout Id. It removes the calendar entry, not the workout (use deleteCustomWorkout for that). Returns {status, data: {id}}.`;
export const parameters = z.object({
  taskId: z.string().describe('TaskId returned by createTask or listed by getDateRangeTaskList (not the workout Id)'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const result = await extra.client.delete(`/task/${args.taskId}`, { baseUrl: 'SERVICE14' });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
