
import { format, addDays, isWeekend, startOfDay, isBefore, parseISO, isValid, differenceInDays, isAfter, getDay } from 'date-fns';
import { DayMap, DayStatus, PlanningMode } from './types';

export const getDateKey = (date: Date): string => format(date, 'yyyy-MM-dd');

/**
 * Calculates hours for a specific day.
 * Respects manual adjustments first, then checks if the day is excluded in the weekly schedule.
 */
export const calculateDayHours = (
  date: Date, 
  adjustments: DayMap, 
  mode: PlanningMode,
  excludedDays: number[] // Array of days (0-6) that are marked as OFF
): number => {
  const key = getDateKey(date);
  const adj = adjustments[key];

  // Manual adjustments always take priority
  if (adj) {
    if (adj.status === 'off') return 0;
    return 8 + adj.overtime;
  }

  if (mode === 'automatic') {
    const dayOfWeek = getDay(date);
    // If the specific day of week is excluded, return 0
    if (excludedDays.includes(dayOfWeek)) {
      return 0;
    }
    return isWeekend(date) ? 0 : 8;
  }

  return 0;
};

export const getInternshipStats = (
  goal: number,
  startDate: Date | null,
  adjustments: DayMap,
  mode: PlanningMode,
  excludedDays: number[]
) => {
  if (!startDate || !isValid(startDate)) {
    return {
      totalGoal: goal,
      accumulatedTowardsGoal: 0,
      remaining: goal,
      progressPercentage: 0,
      estimatedEndDate: null,
      estimatedEndDateStr: 'Set start date',
      workDaysCount: 0,
      totalCalendarDays: 0,
      workDays: []
    };
  }

  let accumulated = 0;
  const start = startOfDay(startDate);
  const workDays: { date: Date; hours: number }[] = [];
  
  let checkDate = new Date(start);
  const safetyLimit = 3000; 
  let daysProcessed = 0;
  let estimatedEndDate: Date | null = null;
  let workDaysToGoal = 0;

  while (daysProcessed < safetyLimit) {
    const key = getDateKey(checkDate);
    const hasManual = !!adjustments[key];
    const hours = calculateDayHours(checkDate, adjustments, mode, excludedDays);

    if (hours > 0) {
      if (accumulated < goal) {
        accumulated += hours;
        workDaysToGoal++;
        if (accumulated >= goal && !estimatedEndDate) {
          estimatedEndDate = new Date(checkDate);
        }
      }
      
      if (accumulated <= goal || hasManual || mode === 'manual') {
          workDays.push({ date: new Date(checkDate), hours });
      }
    }

    if (accumulated >= goal && daysProcessed > 730) {
        break;
    }

    checkDate = addDays(checkDate, 1);
    daysProcessed++;
    
    if (accumulated >= goal && daysProcessed > 730) break;
  }

  const progress = goal > 0 ? Math.min(100, (accumulated / goal) * 100) : 0;
  const calDays = estimatedEndDate ? differenceInDays(estimatedEndDate, start) + 1 : 0;

  return {
    totalGoal: goal,
    accumulatedTowardsGoal: Math.min(accumulated, goal),
    remaining: Math.max(0, goal - accumulated),
    progressPercentage: progress,
    estimatedEndDate,
    estimatedEndDateStr: estimatedEndDate ? format(estimatedEndDate, 'MMMM do, yyyy') : (goal > 0 ? 'Goal not reached' : 'Set goal'),
    workDaysCount: workDaysToGoal,
    totalCalendarDays: calDays,
    workDays
  };
};

export const generateCSV = (workDays: { date: Date; hours: number }[]): string => {
  const header = 'Date,Day,Hours,Status\n';
  const rows = workDays.map(wd => {
    const dateStr = format(wd.date, 'yyyy-MM-dd');
    const dayName = format(wd.date, 'EEEE');
    return `${dateStr},${dayName},${wd.hours},Work`;
  }).join('\n');
  return header + rows;
};

export const downloadFile = (content: string, fileName: string, contentType: string) => {
  const a = document.createElement('a');
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
};
