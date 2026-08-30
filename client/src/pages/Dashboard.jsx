import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ClipboardList,
  FileCheck2,
  GraduationCap,
  TrendingUp,
  ScanLine,
  Users,
} from "lucide-react";
import StatCard from "../components/StatCard.jsx";
import {
  AXIS_PROPS,
  CategoryTick,
  ChartCard,
  ChartTooltip,
  NO_ANIMATION,
  VIZ,
} from "../components/ChartCard.jsx";
import { EmptyState, ErrorState, Spinner } from "../components/States.jsx";
import { dashboardService } from "../services/dashboardService.js";
import { useAuth } from "../hooks/useAuth.js";
import { formatDate, formatDateTime } from "../utils/format.js";

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await dashboardService.getStats());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !stats) return <Spinner label="Loading your dashboard" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const { summary, charts, recentExams, recentResults, system } = stats;
  const hasResults = summary.totalChecked > 0;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-bold tracking-tight text-ink-900">
          Welcome back, {user.name.split(" ")[0]}
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          {isAdmin
            ? "System-wide activity across every CheckWise teacher."
            : "Here is what is happening across your exams."}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={ClipboardList} label="Total Exams" value={summary.totalExams} tone="brand" />
        <StatCard
          icon={FileCheck2}
          label="Answer Sheets Checked"
          value={summary.totalChecked}
          tone="sky"
        />
        <StatCard icon={GraduationCap} label="Students" value={summary.totalStudents} tone="amber" />
        <StatCard
          icon={TrendingUp}
          label="Average Score"
          value={`${summary.averageScore}%`}
          sublabel={hasResults ? `${summary.passRate}% passing` : undefined}
          tone="emerald"
        />
      </div>

      {isAdmin && system && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatCard icon={Users} label="Total Users" value={system.totalUsers} tone="brand" />
          <StatCard icon={Users} label="Teachers" value={system.totalTeachers} tone="sky" />
          <StatCard icon={Users} label="Administrators" value={system.totalAdmins} tone="amber" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Answer sheets checked"
          description="Papers processed over the last 7 days"
        >
          <div className="h-52 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={charts.checkedOverTime}
                margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="checkedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={VIZ.series} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={VIZ.series} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={VIZ.grid} vertical={false} />
                <XAxis dataKey="label" {...AXIS_PROPS} />
                <YAxis allowDecimals={false} width={40} {...AXIS_PROPS} />
                <Tooltip
                  cursor={{ stroke: VIZ.grid }}
                  content={<ChartTooltip valueLabel="Checked" />}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={VIZ.series}
                  strokeWidth={2}
                  fill="url(#checkedFill)"
                  dot={{ r: 4, fill: VIZ.series, stroke: VIZ.surface, strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: VIZ.series, stroke: VIZ.surface, strokeWidth: 2 }}
                  {...NO_ANIMATION}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Score distribution" description="How results are spread across bands">
          {hasResults ? (
            <div className="h-52 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={charts.distribution}
                  margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                >
                  <CartesianGrid stroke={VIZ.grid} vertical={false} />
                  <XAxis dataKey="range" {...AXIS_PROPS} />
                  <YAxis allowDecimals={false} width={40} {...AXIS_PROPS} />
                  <Tooltip
                    cursor={{ fill: VIZ.grid, fillOpacity: 0.35 }}
                    content={<ChartTooltip valueLabel="Students" />}
                  />
                  <Bar
                    dataKey="count"
                    fill={VIZ.series}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                    {...NO_ANIMATION}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={ScanLine}
              title="No results yet"
              description="Scan your first answer sheet and the score distribution will appear here."
            />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Average score by exam" description="Your most-checked exams">
        {charts.examPerformance.length ? (
          <div style={{ height: Math.max(180, charts.examPerformance.length * 46 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={charts.examPerformance}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid stroke={VIZ.grid} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" {...AXIS_PROPS} />
                <YAxis
                  type="category"
                  dataKey="exam"
                  width={130}
                  {...AXIS_PROPS}
                  tick={<CategoryTick max={18} />}
                />
                <Tooltip
                  cursor={{ fill: VIZ.grid, fillOpacity: 0.35 }}
                  content={<ChartTooltip unit="%" valueLabel="Average" />}
                />
                <Bar
                  dataKey="averagePercentage"
                  fill={VIZ.series}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                  {...NO_ANIMATION}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No exam performance yet"
            description="Once answer sheets are checked, each exam's average appears here."
          />
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Recent exams">
          {recentExams.length ? (
            <ul className="divide-y divide-ink-100">
              {recentExams.map((exam) => (
                <li key={exam._id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-800">{exam.title}</p>
                    <p className="truncate text-xs text-ink-500">
                      {exam.subject} &middot; {exam.totalQuestions} questions
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-xs text-brand-700">{exam.examCode}</p>
                    <p className="text-xs text-ink-400">{formatDate(exam.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="No exams yet"
              description="Create your first exam to get started."
              action={
                <Link
                  to="/exams/new"
                  className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                >
                  Create an exam
                </Link>
              }
            />
          )}
        </ChartCard>

        <ChartCard title="Recent results">
          {recentResults.length ? (
            <ul className="divide-y divide-ink-100">
              {recentResults.map((result) => (
                <li key={result._id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-800">
                      {result.studentName}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {result.examId?.title || "Exam"} &middot; {formatDateTime(result.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-ink-800">
                      {result.score}/{result.totalQuestions}
                    </span>
                    <span
                      className={
                        result.passed
                          ? "rounded-sm bg-pass-50 px-2 py-0.5 text-xs font-semibold text-pass-700"
                          : "rounded-sm bg-fail-50 px-2 py-0.5 text-xs font-semibold text-fail-700"
                      }
                    >
                      {result.passed ? "Passed" : "Failed"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={FileCheck2}
              title="No results yet"
              description="Checked answer sheets will be listed here."
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
