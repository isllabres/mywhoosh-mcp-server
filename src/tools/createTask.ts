import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'createTask';
export const description = `Schedule something on the user's MyWhoosh calendar; it then shows in the app for that day. Returns {status, data: {TaskId, ...}}: keep the TaskId, deleteTask needs it.

taskType:
- E_Simple_Workout: a workout, custom or built-in. taskTypeId = the workout Id (for a custom workout, the Id used in uploadCustomWorkout, as a string).
- E_Event: a group event. taskTypeId = the EventId from getEvents.
- E_FreeRide: a free ride session.

Times are Unix timestamps in SECONDS: taskStartedTimeEpoc is the start and taskEndEpochTime is start + workout duration (it defaults to the start). Convert the user's local time to epoch yourself.
Optional: taskName, taskDescription, tss (planned Training Stress Score, 0 if unknown), sportMode (E_Cycling by default), totalKilometers and totalElevation (0 for workouts), mapId (0 for workouts), curDayId and dayNo (multi-day events only).
Check getDateRangeTaskList first when the day may already have a task, to avoid duplicates.

Example: {"taskType": "E_Simple_Workout", "taskStartedTimeEpoc": 1735200000, "taskEndEpochTime": 1735202700, "taskTypeId": "176540733485", "taskName": "Interval Power Builder", "taskDescription": "Intensive interval training", "tss": 65}`;
export const parameters = z.object({
  taskType: z.enum(['E_Event', 'E_Simple_Workout', 'E_FreeRide']).describe('Type of task: E_Event (group event), E_Simple_Workout (any workout - custom or standard), E_FreeRide (free ride)'),
  taskStartedTimeEpoc: z.number().describe('Start time as Unix timestamp (seconds since 1970-01-01)'),
  taskTypeId: z.string().describe('ID of the event/workout. For workouts: use the workout Id. For events: use event UUID.'),
  taskEndEpochTime: z.number().optional().describe('End time as Unix timestamp. If not provided, defaults to start time. For workouts: start time + workout duration.'),
  curDayId: z.string().optional().describe('Day ID for multi-day events (leave empty for single tasks)'),
  taskName: z.string().describe('Name of the task/workout'),
  taskDescription: z.string().default('').describe('Description of the task'),
  totalKilometers: z.number().default(0).describe('Total distance in km (0 for workouts)'),
  totalElevation: z.number().default(0).describe('Total elevation in meters (0 for workouts)'),
  tss: z.number().default(0).describe('Training Stress Score'),
  sportMode: z.string().default('E_Cycling').describe('Sport mode (E_Cycling for cycling)'),
  mapId: z.number().default(0).describe('Map/World ID (0 for workouts)'),
  dayNo: z.number().default(0).describe('Day number for multi-day events (0 for single tasks)'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const endTime = args.taskEndEpochTime || args.taskStartedTimeEpoc;
    
    const result = await extra.client.post('/task/create', {
      baseUrl: 'SERVICE14',
      body: JSON.stringify({
        TaskId: '',
        TaskType: args.taskType,
        TaskStartedTimeEpoc: args.taskStartedTimeEpoc,
        TaskTypeId: args.taskTypeId,
        CurDayId: args.curDayId || '',
        TaskState: 'E_NotStarted',
        DayNo: args.dayNo,
        TaskEndEpochTime: endTime,
        MapId: args.mapId,
        TaskName: args.taskName,
        TaskDescription: args.taskDescription,
        TotalKilometers: args.totalKilometers,
        TotalElevation: args.totalElevation,
        TSS: args.tss,
        SportMode: args.sportMode,
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
