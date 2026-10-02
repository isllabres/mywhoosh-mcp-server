import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

const workoutStepSchema = z.object({
  Id: z.number().describe('Step ID (sequential number starting from 1)'),
  Pace: z.number().default(1).describe('Pace multiplier (usually 1)'),
  IntervalId: z.number().default(0).describe('Interval group ID (0 for non-interval steps, same number for steps in same interval)'),
  WorkoutMessage: z.array(z.object({
    Id: z.number().describe('Message ID'),
    Time: z.number().describe('Time offset in seconds when message appears'),
    Message: z.string().describe('Message text to display'),
  })).default([]).describe('Optional messages to display during this step'),
  Rpm: z.number().default(0).describe('Target cadence in RPM (0 for no target)'),
  StepType: z.enum(['E_Normal', 'E_WarmUp', 'E_CoolDown', 'E_FreeRide']).describe('Step type: E_Normal (steady power), E_WarmUp (ramp up), E_CoolDown (ramp down), E_FreeRide (free ride)'),
  Power: z.number().describe('Target power as FTP multiplier (e.g., 0.55 = 55% FTP, 1.2 = 120% FTP). Use 0 for ramp steps (WarmUp/CoolDown)'),
  StartPower: z.number().default(0).describe('Starting power for ramp steps (WarmUp/CoolDown) as FTP multiplier'),
  EndPower: z.number().default(0).describe('Ending power for ramp steps (WarmUp/CoolDown) as FTP multiplier'),
  Time: z.number().describe('Duration of this step in seconds'),
  IsManualGrade: z.boolean().default(false),
  ManualGradeValue: z.number().default(0),
  ShowAveragePower: z.boolean().default(false),
  FlatRoad: z.number().default(0),
});

const workoutSchema = z.object({
  Id: z.number().describe('Unique workout ID. For NEW workouts: use timestamp or random large number (e.g., 176540733485). For UPDATING existing workouts: use the same ID as the original workout.'),
  Name: z.string().describe('Workout name'),
  Description: z.string().default('').describe('Workout description'),
  Mode: z.string().default('E_Ride').describe('Workout mode (use E_Ride for cycling)'),
  SportsModeType: z.number().min(0).max(3).default(0).describe('MyWhoosh sport mode: 0 = cycling, 1-3 = other sports (rowing/running/etc, per account)'),
  ERGMode: z.string().default('E_OFF').describe('E_ON = ERG on (the trainer holds the target watts), E_OFF = ERG off (default)'),
  IsRecovery: z.boolean().default(false).describe('Is this a recovery workout?'),
  IsIntervals: z.boolean().default(false).describe('true when steps share an IntervalId to form repeated blocks'),
  FTPMode: z.string().default('E_NoFTP').describe('FTP mode'),
  IsTT: z.boolean().default(false),
  IsTSS: z.boolean().default(false),
  IsIF: z.boolean().default(false),
  FTPMultiplier: z.number().default(0),
  StressPoint: z.number().default(0),
  Time: z.number().describe('Total workout duration in seconds (sum of all step times)'),
  CustomTagDescription: z.string().default(''),
  CategoryId: z.number().default(1).describe('Workout category (1 = custom)'),
  SubcategoryId: z.number().default(0),
  Type: z.string().default('E_Custom').describe('Workout type (use E_Custom)'),
  DisplayType: z.string().default('E_byWatts').describe('Display type (E_byWatts for power-based)'),
  StepCount: z.number().describe('Total number of steps in WorkoutStepsArray'),
  IsFavorite: z.boolean().default(false),
  CompletedCount: z.number().default(0),
  WorkoutStepsArray: z.array(workoutStepSchema).describe('Array of workout steps defining the workout structure'),
  AuthorName: z.string().default('').describe('Author name (optional)'),
  TSS: z.number().default(0).describe('Training Stress Score (optional, can be 0)'),
  IF: z.number().default(0).describe('Intensity Factor (optional, can be 0)'),
  KJ: z.number().default(0).describe('Kilojoules (optional, can be 0)'),
  IsVODAvailable: z.boolean().default(false),
});

export const method = 'uploadCustomWorkout';
export const description = `Create a custom cycling workout in the user's MyWhoosh "My Workouts", or update one by sending its Id again. Returns {"status": true, "message": "Custom workout is being uploaded."}: the upload is asynchronous and this only means MyWhoosh accepted it.

HOW TO BUILD A WORKOUT
- Power is a FRACTION OF THE USER'S FTP, not watts: 0.55 = 55% FTP, 1.0 = FTP, 1.2 = 120% FTP. To target X watts use X / FTP, with the FTP from getPlayerData (PlayerPersonalStruct.FtpPlayer). Example with FTP 270 W: 200 W = 0.7407 and 400 W = 1.4815.
- Time is in seconds, per step and for the whole workout. The workout Time must equal the sum of the step Times and StepCount the number of steps. Steps run in order, with Id 1, 2, 3...
- StepType: E_Normal = constant power (use Power); E_WarmUp and E_CoolDown = ramp from StartPower to EndPower (set Power to 0); E_FreeRide = no power target, with optional on-screen messages.
- IntervalId groups the steps of one repeated block (same number); 0 means the step is not part of an interval. Set IsIntervals to true when the workout has intervals.
- ERGMode: E_ON makes the trainer hold the target watts (ERG); E_OFF (default) leaves the resistance free. Use E_OFF for tests and free-ride blocks.
- TSS, IF, KJ, Description and AuthorName are optional and can stay at 0 or empty.

CREATE VS UPDATE
- New workout: a new unique numeric Id (a millisecond timestamp works).
- Update: the same Id and the complete workout, changed and unchanged fields.
- To put it on the calendar afterwards call createTask with taskType E_Simple_Workout and taskTypeId = this Id.

LIMITS AND KNOWN PROBLEMS
- If MyWhoosh answers "You don't have enough credit!" the workout was NOT uploaded: ask the user to delete workouts manually in the MyWhoosh app, then retry.
- MyWhoosh stores every workout uploaded this way with an invalid sportsModeType, so downloadCustomWorkoutsFromS3 and deleteCustomWorkout cannot read or delete it afterwards (known MyWhoosh backend bug, GitHub issue #1). The workout still appears and works in the app and can be deleted there. Do not upload it again to "fix" it: you would create a duplicate.
- SportsModeType is mandatory for MyWhoosh and is sent for you as 0 (cycling).`;
export const parameters = z.object({
  workouts: z.array(workoutSchema).describe('Array of workout definitions to upload'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const whooshId = extra.client.getWhooshId();
    if (!whooshId) throw new McpError(-32600, 'Not authenticated');

    const workoutsData = args.workouts.map(workout => {
      const workoutSteps: Record<string, any> = {};
      workout.WorkoutStepsArray.forEach(step => {
        workoutSteps[step.Id.toString()] = step;
      });

      return {
        ...workout,
        WorkoutSteps: workoutSteps,
        WorkoutstepsTMap: [],
        WokoutAssociationId: 0,
      };
    });

    const result = await extra.client.post('/client/custom-workout-upload', {
      baseUrl: 'COACHING',
      body: JSON.stringify({
        UserId: whooshId,
        SportsModeType: args.workouts[0]?.SportsModeType ?? 0,
        WorkoutsData: workoutsData,
      }),
    });

    if (result && typeof result === 'object' && result.status === false && NO_CREDIT_PATTERN.test(String(result.message))) {
      return noCreditResult();
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof Error && NO_CREDIT_PATTERN.test(e.message)) return noCreditResult();
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}

// MyWhoosh answers {"message":"You don't have enough credit!","status":false} when the account
// can't take more custom workouts. We can't free the space ourselves: the API can't delete the
// workouts it stored with sportsModeType NaN (see issue #1), so the user has to do it in the app.
const NO_CREDIT_PATTERN = /enough credit/i;

function noCreditResult(): CallToolResult {
  return {
    isError: true,
    content: [{
      type: 'text',
      text: 'The workout was NOT uploaded: MyWhoosh refused it with "You don\'t have enough credit!". Ask the user to delete some custom workouts manually in the MyWhoosh app (the API cannot delete the ones previously uploaded through it, see https://github.com/mywhoosh-community/mywhoosh-mcp-server/issues/1), then retry the upload.',
    }],
  };
}
