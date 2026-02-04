
import { format, addDays, isWeekend, startOfDay, isBefore, parseISO, isValid, differenceInDays, isAfter, getDay } from 'date-fns';
import { DayMap, DayStatus, PlanningMode } from './types';

export const getDateKey = (date: Date): string => format(date, 'yyyy-MM-dd');

// Philippine 2026 Holidays
export const PH_HOLIDAYS_2026: { date: string; name: string; type: 'regular' | 'special' }[] = [
  // Regular Holidays
  { date: '2026-01-01', name: "New Year's Day", type: 'regular' },
  { date: '2026-04-02', name: 'Maundy Thursday', type: 'regular' },
  { date: '2026-04-03', name: 'Good Friday', type: 'regular' },
  { date: '2026-04-09', name: 'Day of Valor (Araw ng Kagitingan)', type: 'regular' },
  { date: '2026-05-01', name: 'Labor Day', type: 'regular' },
  { date: '2026-06-12', name: 'Independence Day', type: 'regular' },
  { date: '2026-08-31', name: 'National Heroes Day', type: 'regular' },
  { date: '2026-11-30', name: 'Bonifacio Day', type: 'regular' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'regular' },
  { date: '2026-12-30', name: 'Rizal Day', type: 'regular' },
  // Special Non-Working Holidays
  { date: '2026-02-17', name: 'Chinese New Year', type: 'special' },
  { date: '2026-04-04', name: 'Black Saturday', type: 'special' },
  { date: '2026-08-21', name: 'Ninoy Aquino Day', type: 'special' },
  { date: '2026-11-01', name: "All Saints' Day", type: 'special' },
  { date: '2026-11-02', name: "All Souls' Day", type: 'special' },
  { date: '2026-12-08', name: 'Feast of the Immaculate Conception of Mary', type: 'special' },
  { date: '2026-12-24', name: 'Christmas Eve', type: 'special' },
  { date: '2026-12-31', name: 'Last Day of the Year', type: 'special' },
];

export const isHoliday = (date: Date): { isHoliday: boolean; name?: string; type?: 'regular' | 'special' } => {
  const key = getDateKey(date);
  const holiday = PH_HOLIDAYS_2026.find(h => h.date === key);
  if (holiday) {
    return { isHoliday: true, name: holiday.name, type: holiday.type };
  }
  return { isHoliday: false };
};

/**
 * Calculates hours for a specific day.
 * Respects manual adjustments first, then checks if the day is excluded in the weekly schedule.
 */
export const calculateDayHours = (
  date: Date, 
  adjustments: DayMap, 
  mode: PlanningMode,
  excludedDays: number[], // Array of days (0-6) that are marked as OFF
  excludeHolidays: boolean = false
): number => {
  const key = getDateKey(date);
  const adj = adjustments[key];

  // Manual adjustments always take priority
  if (adj) {
    if (adj.status === 'off') return 0;
    return 8 + adj.overtime;
  }

  // Check if it's a holiday and holidays are excluded
  if (excludeHolidays && isHoliday(date).isHoliday) {
    return 0;
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
  excludedDays: number[],
  excludeHolidays: boolean = false
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
    const hours = calculateDayHours(checkDate, adjustments, mode, excludedDays, excludeHolidays);

    if (hours > 0) {
      // In manual mode, always accumulate hours; in auto mode, only until goal
      if (mode === 'manual') {
        accumulated += hours;
        workDays.push({ date: new Date(checkDate), hours });
        if (accumulated <= goal) {
          workDaysToGoal++;
        }
        if (accumulated >= goal && !estimatedEndDate) {
          estimatedEndDate = new Date(checkDate);
        }
      } else {
        // Auto mode - stop accumulating after goal
        if (accumulated < goal) {
          accumulated += hours;
          workDaysToGoal++;
          if (accumulated >= goal && !estimatedEndDate) {
            estimatedEndDate = new Date(checkDate);
          }
        }
        
        if (accumulated <= goal) {
          workDays.push({ date: new Date(checkDate), hours });
        }
      }
    }

    // In manual mode, only stop if no more manual entries; in auto mode, stop after goal + buffer
    if (mode === 'automatic' && accumulated >= goal && daysProcessed > 730) {
        break;
    }
    
    // In manual mode, stop if we've gone 365 days without any manual entries after hitting goal
    if (mode === 'manual' && accumulated >= goal && !hasManual && daysProcessed > 365) {
        break;
    }

    checkDate = addDays(checkDate, 1);
    daysProcessed++;
  }

  const progress = goal > 0 ? Math.min(100, (accumulated / goal) * 100) : 0;
  const calDays = estimatedEndDate ? differenceInDays(estimatedEndDate, start) + 1 : 0;
  const exceeded = accumulated > goal;

  return {
    totalGoal: goal,
    accumulatedTowardsGoal: accumulated,
    remaining: Math.max(0, goal - accumulated),
    progressPercentage: progress,
    exceeded,
    excessHours: exceeded ? accumulated - goal : 0,
    estimatedEndDate,
    estimatedEndDateStr: estimatedEndDate ? format(estimatedEndDate, 'MMMM do, yyyy') : (goal > 0 ? 'Goal not reached' : 'Set goal'),
    workDaysCount: workDaysToGoal,
    totalCalendarDays: calDays,
    workDays
  };
};

export const generateCSV = (workDays: { date: Date; hours: number }[], adjustments: DayMap = {}): string => {
  const header = 'Date,Day,Hours,Status,Daily Log\n';
  const rows = workDays.map(wd => {
    const dateStr = format(wd.date, 'yyyy-MM-dd');
    const dayName = format(wd.date, 'EEEE');
    const key = getDateKey(wd.date);
    const log = adjustments[key]?.log || '';
    // Escape quotes and wrap in quotes if contains comma or newline
    const escapedLog = log.includes(',') || log.includes('\n') || log.includes('"') 
      ? `"${log.replace(/"/g, '""')}"`
      : log;
    return `${dateStr},${dayName},${wd.hours},Work,${escapedLog}`;
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
