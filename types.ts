
export type DayStatus = 'work' | 'off';
export type PlanningMode = 'manual' | 'automatic';

export interface DayAdjustment {
  status: DayStatus;
  overtime: number;
  log?: string; // Optional daily log/diary entry
  entered?: boolean; // Marks the day as officially logged/entered (locks it)
}

export interface DayMap {
  [dateKey: string]: DayAdjustment;
}

export interface InternshipStats {
  totalGoal: number;
  totalAccumulated: number;
  remaining: number;
  progressPercentage: number;
  estimatedEndDate: string | null;
  workDays: { date: Date; hours: number }[];
}
