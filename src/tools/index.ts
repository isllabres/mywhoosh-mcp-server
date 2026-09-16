import type { ToolModule } from './types.js';

import * as createTask from './createTask.js';
import * as deleteCustomWorkout from './deleteCustomWorkout.js';
import * as deleteTask from './deleteTask.js';
import * as downloadCalendarWorkouts from './downloadCalendarWorkouts.js';
import * as downloadCustomWorkoutsFromS3 from './downloadCustomWorkoutsFromS3.js';
import * as downloadFavoriteWorkouts from './downloadFavoriteWorkouts.js';
import * as getAgeConfig from './getAgeConfig.js';
import * as getAllPlayerLeaderboards from './getAllPlayerLeaderboards.js';
import * as getArcadeLeaderboard from './getArcadeLeaderboard.js';
import * as getBundleInfo from './getBundleInfo.js';
import * as getCalculations from './getCalculations.js';
import * as getChallenges from './getChallenges.js';
import * as getCoaches from './getCoaches.js';
import * as getConnectappHost from './getConnectappHost.js';
import * as getControllableBots from './getControllableBots.js';
import * as getCustomWorkoutUpload from './getCustomWorkoutUpload.js';
import * as getDateRangeTaskList from './getDateRangeTaskList.js';
import * as getDraftingPeloton from './getDraftingPeloton.js';
import * as getEnvironmentByAppVersion from './getEnvironmentByAppVersion.js';
import * as getEvents from './getEvents.js';
import * as getFitnessNetwork from './getFitnessNetwork.js';
import * as getGameTitleData from './getGameTitleData.js';
import * as getGarageItems from './getGarageItems.js';
import * as getGroupWorkouts from './getGroupWorkouts.js';
import * as getJunctionInfo from './getJunctionInfo.js';
import * as getMaintenanceStatus from './getMaintenanceStatus.js';
import * as getMissionProgress from './getMissionProgress.js';
import * as getMissions from './getMissions.js';
import * as getMyFriends from './getMyFriends.js';
import * as getPacerBot from './getPacerBot.js';
import * as getPendingRide from './getPendingRide.js';
import * as getPlayerAchievements from './getPlayerAchievements.js';
import * as getPlayerData from './getPlayerData.js';
import * as getPlayerDistance from './getPlayerDistance.js';
import * as getPlayerGhostRideData from './getPlayerGhostRideData.js';
import * as getPlayerTrophiesJerseys from './getPlayerTrophiesJerseys.js';
import * as getRoutes from './getRoutes.js';
import * as getSeasonPassProgress from './getSeasonPassProgress.js';
import * as getServerTime from './getServerTime.js';
import * as getTreasureHunt from './getTreasureHunt.js';
import * as getVOD from './getVOD.js';
import * as getWorldRoutePlayerCount from './getWorldRoutePlayerCount.js';
import * as login from './login.js';
import * as redeemCoupon from './redeemCoupon.js';
import * as registerUser from './registerUser.js';
import * as updatePlayerData from './updatePlayerData.js';
import * as uploadCustomWorkout from './uploadCustomWorkout.js';

export const tools: ToolModule[] = [
  createTask,
  deleteCustomWorkout,
  deleteTask,
  downloadCalendarWorkouts,
  downloadCustomWorkoutsFromS3,
  downloadFavoriteWorkouts,
  getAgeConfig,
  getAllPlayerLeaderboards,
  getArcadeLeaderboard,
  getBundleInfo,
  getCalculations,
  getChallenges,
  getCoaches,
  getConnectappHost,
  getControllableBots,
  getCustomWorkoutUpload,
  getDateRangeTaskList,
  getDraftingPeloton,
  getEnvironmentByAppVersion,
  getEvents,
  getFitnessNetwork,
  getGameTitleData,
  getGarageItems,
  getGroupWorkouts,
  getJunctionInfo,
  getMaintenanceStatus,
  getMissionProgress,
  getMissions,
  getMyFriends,
  getPacerBot,
  getPendingRide,
  getPlayerAchievements,
  getPlayerData,
  getPlayerDistance,
  getPlayerGhostRideData,
  getPlayerTrophiesJerseys,
  getRoutes,
  getSeasonPassProgress,
  getServerTime,
  getTreasureHunt,
  getVOD,
  getWorldRoutePlayerCount,
  login,
  redeemCoupon,
  registerUser,
  updatePlayerData,
  uploadCustomWorkout,
];
