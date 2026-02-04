
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  Clock, 
  Target, 
  Plus, 
  Minus,
  ChevronLeft,
  ChevronRight,
  Heart,
  FileText,
  Trash2,
  X,
  Download,
  CalendarCheck,
  MousePointer2,
  Layers,
  CalendarDays,
  FileJson,
  Table,
  Calendar,
  Settings2,
  FileDown,
  Upload,
  AlertTriangle,
  Sparkles,
  CalendarOff,
  PenLine,
  Save,
  BookOpen
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  parseISO,
  startOfDay,
  isWeekend,
  isBefore,
  isValid,
  isAfter,
  getDay
} from 'date-fns';
import { jsPDF } from 'jspdf';
import { DayMap, DayStatus, PlanningMode } from './types';
import { getDateKey, calculateDayHours, getInternshipStats, generateCSV, downloadFile, isHoliday } from './utils';

const STORAGE_KEY = 'internship_buddy_data_v5';

const App: React.FC = () => {
  const [goal, setGoal] = useState<number | ''>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).goal : '';
  });
  const [startDateStr, setStartDateStr] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).startDateStr : '';
  });
  const [adjustments, setAdjustments] = useState<DayMap>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).adjustments : {};
  });
  const [mode, setMode] = useState<PlanningMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).mode : 'automatic';
  });
  const [excludedDays, setExcludedDays] = useState<number[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).excludedDays : [0, 6];
  });
  const [excludeHolidays, setExcludeHolidays] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved).excludeHolidays ?? true : true;
  });

  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [logInput, setLogInput] = useState<string>('');
  const [isEditingLog, setIsEditingLog] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragSelection, setDragSelection] = useState<Set<string>>(new Set());
  const [dragMode, setDragMode] = useState<DayStatus>('work');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const startDate = useMemo(() => {
    if (!startDateStr) return null;
    const parsed = parseISO(startDateStr);
    return isValid(parsed) ? parsed : null;
  }, [startDateStr]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ goal, startDateStr, adjustments, mode, excludedDays, excludeHolidays }));
  }, [goal, startDateStr, adjustments, mode, excludedDays, excludeHolidays]);

  const numericGoal = typeof goal === 'number' ? goal : 0;
  const stats = useMemo(() => getInternshipStats(numericGoal, startDate, adjustments, mode, excludedDays, excludeHolidays), [numericGoal, startDate, adjustments, mode, excludedDays, excludeHolidays]);

  const groupedWorkDays = useMemo(() => {
    const groups: { [month: string]: { date: Date; hours: number }[] } = {};
    stats.workDays.forEach(wd => {
      const monthKey = format(wd.date, 'MMMM yyyy');
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(wd);
    });
    return groups;
  }, [stats.workDays]);

  const monthDays = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    return eachDayOfInterval({ start, end });
  }, [viewDate]);

  const getDayDisplayHours = (date: Date) => {
    return calculateDayHours(date, adjustments, mode, excludedDays, excludeHolidays);
  };

  const getDayLog = (date: Date): string => {
    const key = getDateKey(date);
    return adjustments[key]?.log || '';
  };

  // Load log when selecting a date
  useEffect(() => {
    if (selectedDate) {
      const existingLog = getDayLog(selectedDate);
      setLogInput(existingLog);
      setIsEditingLog(existingLog.length === 0);
    }
  }, [selectedDate]);

  const saveLog = (date: Date) => {
    const key = getDateKey(date);
    setAdjustments(prev => {
      const current = prev[key] || { 
        status: getDayDisplayHours(date) > 0 ? 'work' : 'off', 
        overtime: 0 
      };
      return { ...prev, [key]: { ...current, log: logInput.trim() || undefined } };
    });
    setIsEditingLog(false);
  };

  const deleteLog = (date: Date) => {
    const key = getDateKey(date);
    setAdjustments(prev => {
      const current = prev[key];
      if (current) {
        const { log, ...rest } = current;
        return { ...prev, [key]: rest };
      }
      return prev;
    });
    setLogInput('');
    setIsEditingLog(true);
  };

  const toggleExcludedDay = (day: number) => {
    setExcludedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleMouseDown = (date: Date) => {
    if (startDate && isBefore(startOfDay(date), startOfDay(startDate))) return;
    if (!startDate) return;
    // In manual mode, allow selecting any date after start; in auto mode, restrict to estimated end date
    if (mode === 'automatic' && stats.estimatedEndDate && isAfter(startOfDay(date), startOfDay(stats.estimatedEndDate))) return;
    
    setIsDragging(true);
    setDragStart(date);
    const key = getDateKey(date);
    
    const currentHours = getDayDisplayHours(date);
    const nextStatus: DayStatus = currentHours > 0 ? 'off' : 'work';
    
    setDragMode(nextStatus);
    setDragSelection(new Set([key]));
  };

  const handleMouseEnter = (date: Date) => {
    if (!isDragging || !dragStart || !startDate) return;
    if (isBefore(startOfDay(date), startOfDay(startDate))) return;
    // In manual mode, allow selecting any date after start; in auto mode, restrict to estimated end date
    if (mode === 'automatic' && stats.estimatedEndDate && isAfter(startOfDay(date), startOfDay(stats.estimatedEndDate))) return;

    const start = dragStart < date ? dragStart : date;
    const end = dragStart > date ? dragStart : date;
    
    const range = eachDayOfInterval({ start, end });
    const newSelection = new Set<string>();
    range.forEach(d => {
      newSelection.add(getDateKey(d));
    });
    setDragSelection(newSelection);
  };

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setAdjustments(prev => {
      const next = { ...prev };
      dragSelection.forEach(key => {
        next[key] = {
          status: dragMode,
          overtime: prev[key]?.overtime || 0
        };
      });
      return next;
    });
    setIsDragging(false);
    setDragStart(null);
    setDragSelection(new Set());
  }, [isDragging, dragSelection, dragMode]);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  const updateOvertime = (date: Date, delta: number) => {
    const key = getDateKey(date);
    setAdjustments(prev => {
      const current = prev[key] || { 
        status: getDayDisplayHours(date) > 0 ? 'work' : 'off', 
        overtime: 0 
      };
      const newStatus: DayStatus = current.status === 'off' && delta > 0 ? 'work' : current.status;
      const newOvertime = Math.max(0, current.overtime + delta);
      return { ...prev, [key]: { ...current, status: newStatus, overtime: newOvertime } };
    });
  };

  const clearAll = () => {
    setShowResetModal(true);
  };

  const confirmReset = () => {
    setAdjustments({});
    setGoal('');
    setStartDateStr('');
    setExcludedDays([0, 6]);
    setExcludeHolidays(true);
    setShowResetModal(false);
  };

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // Validate the data structure
        if (typeof data.goal !== 'number' && data.goal !== '') {
          throw new Error('Invalid goal format');
        }
        if (typeof data.startDateStr !== 'string') {
          throw new Error('Invalid start date format');
        }
        if (typeof data.adjustments !== 'object') {
          throw new Error('Invalid adjustments format');
        }
        if (data.mode !== 'manual' && data.mode !== 'automatic') {
          throw new Error('Invalid mode format');
        }
        if (!Array.isArray(data.excludedDays)) {
          throw new Error('Invalid excluded days format');
        }

        // Apply the imported data
        setGoal(data.goal);
        setStartDateStr(data.startDateStr);
        setAdjustments(data.adjustments);
        setMode(data.mode);
        setExcludedDays(data.excludedDays);
        setExcludeHolidays(data.excludeHolidays ?? true);

        alert('✅ Backup restored successfully!');
      } catch (error) {
        alert('❌ Invalid backup file. Please select a valid JSON backup.');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
    
    // Reset the input so the same file can be selected again
    event.target.value = '';
  };

  const generatePDFReport = () => {
    const doc = new jsPDF();
    const title = "Internship Tracker - Progress Report";
    const dateGenerated = `Generated on: ${format(new Date(), 'PPpp')}`;

    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text(title, 20, 25);
    
    doc.setFontSize(10);
    doc.setTextColor(156, 163, 175); // Gray-400
    doc.text(dateGenerated, 20, 32);

    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55); // Gray-800
    doc.text("Summary", 20, 45);
    
    doc.setFontSize(12);
    doc.text(`Target Hours: ${numericGoal}h`, 25, 55);
    doc.text(`Accumulated: ${stats.accumulatedTowardsGoal}h`, 25, 62);
    doc.text(`Remaining: ${stats.remaining}h`, 25, 69);
    doc.text(`Progress: ${Math.round(stats.progressPercentage)}%`, 25, 76);
    doc.text(`Work Days: ${stats.workDaysCount}`, 25, 83);
    doc.text(`Projected End Date: ${stats.estimatedEndDateStr}`, 25, 90);

    doc.text("Schedule Details", 20, 105);
    
    let y = 115;
    stats.workDays.slice(0, 40).forEach((wd) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFontSize(10);
      doc.text(`${format(wd.date, 'yyyy-MM-dd')} (${format(wd.date, 'EEE')})`, 25, y);
      doc.text(`${wd.hours} hours`, 100, y);
      y += 7;
    });

    if (stats.workDays.length > 40) {
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text(`... and ${stats.workDays.length - 40} more days. See CSV for full list.`, 25, y);
    }

    doc.save(`internship-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="min-h-screen pb-24 px-4 md:px-8 max-w-6xl mx-auto select-none">
      <header className="py-8 flex flex-col items-center text-center space-y-2">
        <div className="bg-rose-100 p-3 rounded-2xl mb-2">
          <Heart className="w-8 h-8 text-rose-500 fill-rose-500" />
        </div>
        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Internship Tracker</h1>
        <p className="text-gray-500 max-w-md">Track your hours, exclude off-days, and hit your goal! 🎓</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 order-1 lg:order-1">
          <section className="cute-card bg-white p-6 space-y-6 border border-rose-50 shadow-sm">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                <Target className="w-5 h-5 text-rose-400" /> Setup
              </h2>
              <button onClick={clearAll} className="text-xs flex items-center gap-1 text-gray-400 hover:text-rose-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Reset
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Target Hours</label>
                <div className="relative group">
                  <input 
                    type="number" 
                    placeholder="Enter total hours..." 
                    value={goal} 
                    onChange={(e) => setGoal(e.target.value === '' ? '' : Number(e.target.value))} 
                    className="w-full bg-rose-50/50 border border-rose-100 rounded-2xl pl-5 pr-12 py-4 focus:ring-2 focus:ring-rose-200 focus:outline-none text-xl font-bold text-gray-700 transition-all" 
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-rose-200 group-focus-within:text-rose-400 transition-colors">
                    <Clock className="w-6 h-6" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Start Date</label>
                <input 
                  type="date" 
                  value={startDateStr} 
                  onChange={(e) => setStartDateStr(e.target.value)} 
                  className="w-full bg-rose-50/50 border border-rose-100 rounded-2xl px-4 sm:px-5 py-3 sm:py-4 focus:ring-2 focus:ring-rose-200 focus:outline-none font-bold text-gray-700 text-sm sm:text-base [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Exclude PH Holidays (2026)?</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-50 rounded-2xl">
                  <button 
                    onClick={() => setExcludeHolidays(true)} 
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${excludeHolidays ? 'bg-white shadow-sm text-purple-600 border border-purple-200' : 'text-gray-400'}`}
                  >
                    <CalendarOff className="w-4 h-4" /> Yes
                  </button>
                  <button 
                    onClick={() => setExcludeHolidays(false)} 
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl text-xs sm:text-sm font-bold transition-all ${!excludeHolidays ? 'bg-white shadow-sm text-purple-600 border border-purple-200' : 'text-gray-400'}`}
                  >
                    <CalendarDays className="w-4 h-4" /> No
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-2 italic">
                  {excludeHolidays ? '⭐ 18 PH holidays will not count as work days' : 'Holidays will be counted as work days'}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Weekly Work Days</label>
                <div className="flex justify-between bg-gray-50 p-2 rounded-2xl">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayName, idx) => {
                    const isExcluded = excludedDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        onClick={() => toggleExcludedDay(idx)}
                        className={`w-9 h-9 rounded-xl text-[10px] font-black transition-all border ${!isExcluded ? 'bg-indigo-500 text-white border-indigo-600 shadow-sm' : 'bg-white text-gray-300 border-gray-100 hover:bg-rose-50'}`}
                      >
                        {dayName}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-2 italic flex items-center gap-1">
                   <Settings2 className="w-3 h-3" /> Uncheck days you won't attend.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">Auto-Projection</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-gray-50 rounded-2xl">
                  <button onClick={() => setMode('manual')} className={`flex flex-col items-center gap-1 p-2 rounded-xl text-[10px] font-bold transition-all ${mode === 'manual' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}>
                    <MousePointer2 className="w-4 h-4" /> Manual
                  </button>
                  <button onClick={() => setMode('automatic')} className={`flex flex-col items-center gap-1 p-2 rounded-xl text-[10px] font-bold transition-all ${mode === 'automatic' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}>
                    <Layers className="w-4 h-4" /> Auto
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
        
        <div className="lg:col-span-4 order-3 lg:order-3">
          <section className={`cute-card p-7 text-white space-y-5 shadow-xl relative overflow-hidden group ${stats.exceeded ? 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 shadow-emerald-200' : 'bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 shadow-indigo-200'}`}>
            <div className="absolute -right-8 -top-8 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-700"></div>
            <div className="flex justify-between items-start relative z-10">
              <h2 className="text-xl font-black tracking-tight">Your Progress</h2>
              <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest backdrop-blur-sm ${stats.exceeded ? 'bg-yellow-400/30 text-yellow-100' : 'bg-white/20'}`}>{stats.exceeded ? '🎉 Goal Exceeded!' : 'Live'}</div>
            </div>
            
            <div className="space-y-2 relative z-10">
              <div className="flex justify-between text-sm font-bold opacity-90">
                <span>{stats.accumulatedTowardsGoal} / {numericGoal} hrs {stats.exceeded && <span className="text-yellow-200">(+{stats.excessHours}h extra)</span>}</span>
                <span>{Math.round(stats.progressPercentage)}%</span>
              </div>
              <div className="h-4 bg-black/10 rounded-full overflow-hidden border border-white/10 p-0.5">
                <div className={`h-full rounded-full transition-all duration-1000 ease-out ${stats.exceeded ? 'bg-yellow-300 shadow-[0_0_10px_rgba(253,224,71,0.5)]' : 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]'}`} style={{ width: `${stats.progressPercentage}%` }} />
              </div>
              <p className="text-[11px] font-bold text-white/70 text-right">
                {stats.workDaysCount} / {stats.totalCalendarDays} days required
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 relative z-10">
              <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/5">
                <p className="text-[10px] opacity-70 uppercase font-black tracking-widest mb-1">{stats.exceeded ? 'Extra Hours' : 'Remaining'}</p>
                <p className="text-2xl font-black">{stats.exceeded ? `+${stats.excessHours}h` : `${stats.remaining}h`}</p>
              </div>
              <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/5">
                <p className="text-[10px] opacity-70 uppercase font-black tracking-widest mb-1">Projected End</p>
                <p className="text-xs font-black leading-tight h-8 flex items-center">{stats.estimatedEndDateStr}</p>
              </div>
            </div>

            <button onClick={() => setShowSummary(true)} className="w-full py-4 bg-white text-indigo-600 rounded-2xl font-black text-sm flex items-center justify-center gap-3 hover:bg-rose-50 transition-all shadow-lg group">
              <FileDown className="w-5 h-5 group-hover:rotate-6" /> View Report & Download
            </button>
          </section>
        </div>

        <div className="lg:col-span-8 lg:row-span-2 order-2">
          <section className="cute-card bg-white p-7 border border-rose-50 shadow-sm relative overflow-hidden">
            {!startDate && (
              <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-[2px] rounded-[24px] flex items-center justify-center p-8 text-center animate-in fade-in duration-500">
                 <div className="bg-white p-8 rounded-3xl shadow-2xl border border-rose-50 max-sm space-y-4">
                    <CalendarDays className="w-12 h-12 text-rose-300 mx-auto" />
                    <h3 className="text-xl font-black text-gray-800">Start Planning</h3>
                    <p className="text-sm text-gray-500">Set your start date and work days above to activate the calendar.</p>
                 </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-gray-800 tracking-tight">{format(viewDate, 'MMMM yyyy')}</h2>
              <div className="flex gap-3">
                <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-3 bg-gray-50 hover:bg-rose-50 rounded-2xl transition-all text-rose-400 hover:scale-110"><ChevronLeft className="w-6 h-6" /></button>
                <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-3 bg-gray-50 hover:bg-rose-50 rounded-2xl transition-all text-rose-400 hover:scale-110"><ChevronRight className="w-6 h-6" /></button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 md:gap-3 mb-6 text-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (<div key={day} className="text-xs font-black text-gray-300 py-2 uppercase tracking-tighter">{day}</div>))}
              {Array.from({ length: startOfMonth(viewDate).getDay() }).map((_, i) => (<div key={`empty-${i}`} className="aspect-square" />))}
              {monthDays.map(date => {
                const key = getDateKey(date);
                const hours = getDayDisplayHours(date);
                const isSelected = selectedDate && isSameDay(date, selectedDate);
                const isWorkDay = hours > 0;
                const isToday = isSameDay(date, new Date());
                const isBeforeStart = startDate && isBefore(startOfDay(date), startOfDay(startDate));
                // In manual mode, allow any date after start; in auto mode, restrict to estimated end date
                const isAfterEnd = mode === 'automatic' && stats.estimatedEndDate && isAfter(startOfDay(date), startOfDay(stats.estimatedEndDate));
                const isDisabled = isBeforeStart || isAfterEnd;
                const inDragSelection = dragSelection.has(key);
                const holidayInfo = isHoliday(date);
                const isHolidayDate = holidayInfo.isHoliday && excludeHolidays;
                const hasLog = !!adjustments[key]?.log;

                return (
                  <button key={date.toString()} onMouseDown={() => handleMouseDown(date)} onMouseEnter={() => handleMouseEnter(date)} onClick={() => !isDisabled && setSelectedDate(date)}
                    title={holidayInfo.isHoliday ? holidayInfo.name : undefined}
                    className={`relative aspect-square flex flex-col items-center justify-center rounded-2xl transition-all duration-100 ${isSelected ? 'ring-[3px] ring-indigo-400 z-10 scale-105' : ''} ${inDragSelection ? (dragMode === 'work' ? 'bg-indigo-400 text-white scale-95 shadow-inner' : 'bg-gray-200 scale-95 shadow-inner') : isHolidayDate ? 'bg-purple-50 text-purple-400 border border-purple-100' : isWorkDay ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100/50' : 'bg-gray-50/50 text-gray-300'} ${isDisabled ? 'opacity-10 pointer-events-none' : 'hover:bg-rose-50 cursor-pointer'} ${isToday ? 'outline outline-2 outline-rose-200' : ''}`}>
                    {holidayInfo.isHoliday && <span className="absolute top-0.5 right-0.5 text-[8px]">⭐</span>}
                    {hasLog && !holidayInfo.isHoliday && <span className="absolute top-0.5 right-0.5 text-[8px]">📝</span>}
                    <span className="text-base font-black">{format(date, 'd')}</span>
                    {isWorkDay && !inDragSelection && (<span className="text-[10px] font-black opacity-60 leading-none mt-0.5">{hours}h</span>)}
                  </button>
                );
              })}
            </div>

            {selectedDate && startDate && !isBefore(selectedDate, startDate) && !(mode === 'automatic' && stats.estimatedEndDate && isAfter(selectedDate, stats.estimatedEndDate)) && (
              <div className="mt-8 p-6 bg-indigo-50/40 rounded-3xl border border-indigo-100 animate-in fade-in zoom-in-95">
                {/* Holiday Banner */}
                {isHoliday(selectedDate).isHoliday && (
                  <div className="mb-4 -mt-2 -mx-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-violet-500 rounded-2xl text-white flex items-center gap-3">
                    <span className="text-xl">🇵🇭</span>
                    <div>
                      <p className="text-[10px] font-bold uppercase opacity-80">Philippine Holiday</p>
                      <p className="font-black">{isHoliday(selectedDate).name}</p>
                    </div>
                  </div>
                )}
                
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="text-center md:text-left">
                    <p className="text-[10px] font-black text-indigo-400 uppercase mb-1">Customizing</p>
                    <h3 className="text-xl font-black text-gray-800">{format(selectedDate, 'EEEE, MMM do')}</h3>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center bg-white rounded-2xl p-1.5 shadow-md border border-indigo-100">
                      <button onClick={() => updateOvertime(selectedDate, -1)} className="p-3 text-indigo-400 bg-gray-50 rounded-xl hover:bg-rose-50"><Minus className="w-5 h-5" /></button>
                      <div className="px-6 text-center min-w-[120px]">
                        <span className="block text-[10px] font-black text-gray-400 uppercase mb-0.5">Hours</span>
                        <span className="text-2xl font-black text-indigo-700">{getDayDisplayHours(selectedDate)}h</span>
                      </div>
                      <button onClick={() => updateOvertime(selectedDate, 1)} className="p-3 text-indigo-400 bg-gray-50 rounded-xl hover:bg-rose-50"><Plus className="w-5 h-5" /></button>
                    </div>
                  </div>
                </div>

                {/* Daily Log Section */}
                <div className="mt-6 pt-6 border-t border-indigo-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-indigo-400" />
                      <span className="text-[10px] font-black text-indigo-400 uppercase">Daily Log</span>
                    </div>
                    {getDayLog(selectedDate) && !isEditingLog && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setIsEditingLog(true)}
                          className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
                        >
                          <PenLine className="w-3 h-3" /> Edit
                        </button>
                        <button 
                          onClick={() => deleteLog(selectedDate)}
                          className="text-[10px] font-bold text-rose-400 hover:text-rose-600 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditingLog ? (
                    <div className="space-y-3">
                      <textarea
                        value={logInput}
                        onChange={(e) => setLogInput(e.target.value)}
                        placeholder="What did you work on today? (optional)"
                        className="w-full bg-white border border-indigo-100 rounded-2xl px-4 py-3 text-sm text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-indigo-200 focus:outline-none resize-none"
                        rows={3}
                      />
                      <div className="flex gap-2 justify-end">
                        {getDayLog(selectedDate) && (
                          <button
                            onClick={() => {
                              setLogInput(getDayLog(selectedDate));
                              setIsEditingLog(false);
                            }}
                            className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 rounded-xl transition-all"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => saveLog(selectedDate)}
                          disabled={!logInput.trim()}
                          className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all"
                        >
                          <Save className="w-3 h-3" /> Save Log
                        </button>
                      </div>
                    </div>
                  ) : getDayLog(selectedDate) ? (
                    <div className="bg-white rounded-2xl p-4 border border-indigo-100">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{getDayLog(selectedDate)}</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsEditingLog(true)}
                      className="w-full py-3 border-2 border-dashed border-indigo-200 rounded-2xl text-sm text-indigo-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-white/50 transition-all flex items-center justify-center gap-2"
                    >
                      <PenLine className="w-4 h-4" /> Add a note about today...
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="mt-2 flex flex-wrap justify-center items-center gap-4 sm:gap-6 text-[10px] sm:text-[11px] font-black text-gray-400">
              <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 bg-indigo-100 rounded-md"></div> Scheduled</div>
              <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 bg-white border-2 border-rose-200 rounded-md"></div> Today</div>
              <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 bg-purple-50 border border-purple-100 rounded-md flex items-center justify-center text-[6px]">⭐</div> Holiday</div>
              <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 bg-indigo-50 border border-indigo-100 rounded-md flex items-center justify-center text-[6px]">📝</div> Has Log</div>
              <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 bg-gray-50 rounded-md"></div> Off</div>
            </div>
          </section>
        </div>
      </div>

      {showSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[40px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl scale-in-center">
            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-4"><div className="p-3 bg-indigo-100 rounded-2xl"><CalendarCheck className="w-7 h-7 text-indigo-600" /></div><div><h2 className="text-2xl font-black text-gray-800">Internship Report</h2><p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Plan Projection</p></div></div>
              <button onClick={() => setShowSummary(false)} className="p-3 hover:bg-gray-100 rounded-2xl transition-all text-gray-400 hover:rotate-90"><X className="w-7 h-7" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-10 bg-gray-50/30 scrollbar-hide">
              <div className="bg-indigo-600 p-6 rounded-[32px] text-white flex flex-col items-center gap-6 shadow-xl shadow-indigo-100">
                <div className="text-center w-full">
                  <p className="text-lg font-black mb-1">Download Your Schedule</p>
                  <p className="text-xs opacity-80 font-medium">Export in the format that works best for you.</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full">
                  <button onClick={generatePDFReport} className="flex flex-col items-center justify-center gap-2 p-4 bg-white/10 hover:bg-white/30 border border-white/20 rounded-2xl transition-all active:scale-95 group">
                    <FileText className="w-6 h-6" />
                    <span className="text-[10px] font-black uppercase">PDF Version</span>
                  </button>
                  <button onClick={() => downloadFile(generateCSV(stats.workDays), `internship-report.csv`, 'text/csv')} className="flex flex-col items-center justify-center gap-2 p-4 bg-white/10 hover:bg-white/30 border border-white/20 rounded-2xl transition-all active:scale-95 group">
                    <Table className="w-6 h-6" />
                    <span className="text-[10px] font-black uppercase">CSV Table</span>
                  </button>
                  <button onClick={() => downloadFile(JSON.stringify({ goal, startDateStr, adjustments, mode, excludedDays, excludeHolidays }, null, 2), `internship-backup-${format(new Date(), 'yyyy-MM-dd')}.json`, 'application/json')} className="flex flex-col items-center justify-center gap-2 p-4 bg-white/10 hover:bg-white/30 border border-white/20 rounded-2xl transition-all active:scale-95 group">
                    <FileJson className="w-6 h-6" />
                    <span className="text-[10px] font-black uppercase">Data Backup</span>
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-2 p-4 bg-white/10 hover:bg-white/30 border border-white/20 rounded-2xl transition-all active:scale-95 group">
                    <Upload className="w-6 h-6" />
                    <span className="text-[10px] font-black uppercase">Restore Backup</span>
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Hours Hit', val: `${stats.accumulatedTowardsGoal}h`, color: 'text-indigo-600' },
                  { label: 'Target', val: `${numericGoal}h`, color: 'text-gray-700' },
                  { label: 'Work Days', val: `${stats.workDaysCount}`, color: 'text-rose-500' },
                  { label: 'Calendar Days', val: `${stats.totalCalendarDays}`, color: 'text-gray-700' }
                ].map((s, i) => (
                  <div key={i} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm text-center">
                    <p className="text-[9px] text-gray-400 font-black uppercase mb-1.5">{s.label}</p>
                    <p className={`text-base font-black ${s.color} truncate`}>{s.val}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-8">
                {Object.keys(groupedWorkDays).length === 0 ? (
                  <div className="text-center py-20 text-gray-300 italic bg-white rounded-[40px] border-4 border-dashed border-gray-50 flex flex-col items-center gap-4"><CalendarDays className="w-12 h-12 opacity-20" /><p className="font-bold">No days planned yet.</p></div>
                ) : (
                  (Object.entries(groupedWorkDays) as [string, { date: Date; hours: number }[]][]).map(([month, days]) => {
                    const monthTotal = days.reduce((acc, d) => acc + d.hours, 0);
                    return (
                      <div key={month} className="space-y-4">
                        <div className="flex items-center justify-between px-4"><h3 className="text-base font-black text-gray-800 uppercase tracking-widest flex items-center gap-2"><div className="w-2 h-6 bg-indigo-500 rounded-full"></div>{month}</h3><span className="text-xs font-black bg-indigo-50 text-indigo-600 px-4 py-2 rounded-2xl">{monthTotal} hours</span></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {days.map((wd, i) => (
                            <div key={i} className="bg-white px-5 py-4 rounded-[24px] border border-gray-100 flex items-center justify-between shadow-sm group">
                              <div className="flex items-center gap-4"><div className="w-10 h-10 rounded-2xl bg-gray-50 flex flex-col items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all"><span className="text-[10px] font-black uppercase">{format(wd.date, 'MMM')}</span><span className="text-sm font-black">{format(wd.date, 'dd')}</span></div><div><p className="text-sm font-black text-gray-700">{format(wd.date, 'EEEE')}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Work Session</p></div></div>
                              <p className="text-sm font-black text-indigo-600 bg-indigo-50/50 px-3 py-2 rounded-xl">{wd.hours}h</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-6">
              <div className="mx-auto w-20 h-20 bg-gradient-to-br from-purple-100 to-violet-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-purple-500" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-gray-800">Start Fresh?</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  This will clear all your logged hours, settings, and progress. 
                  <span className="block mt-1 text-purple-500 font-semibold">This action cannot be undone!</span>
                </p>
              </div>

              <div className="bg-purple-50/50 rounded-2xl p-4 border border-purple-100">
                <p className="text-xs text-purple-500 font-bold flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Tip: Download a backup first!
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setShowResetModal(false)} 
                  className="flex-1 py-4 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black text-sm transition-all"
                >
                  Keep Data
                </button>
                <button 
                  onClick={confirmReset} 
                  className="flex-1 py-4 px-6 bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white rounded-2xl font-black text-sm transition-all shadow-lg shadow-purple-200"
                >
                  <span className="flex items-center justify-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    Reset All
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-12 text-center">
        <p className="text-xs text-gray-300 font-medium">Data stays on your device. Projections update instantly as you change your schedule.</p>
      </div>
    </div>
  );
};

export default App;
