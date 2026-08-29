import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import Result from "../models/Result.js";
import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";

const DISTRIBUTION_BUCKETS = [
  { label: "0-59%", min: 0, max: 59.999 },
  { label: "60-69%", min: 60, max: 69.999 },
  { label: "70-79%", min: 70, max: 79.999 },
  { label: "80-89%", min: 80, max: 89.999 },
  { label: "90-100%", min: 90, max: 100 },
];

/**
 * GET /api/dashboard/stats
 *
 * Admins see the whole system; teachers see only their own data. Every number
 * is aggregated live from MongoDB - there is no cached or seeded value here, so
 * a brand-new account correctly reads zero across the board.
 */
export const getStats = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const scope = isAdmin ? {} : { teacherId: new mongoose.Types.ObjectId(req.user._id) };

  const [totalExams, totalChecked, studentAgg, averageAgg, recentExams, recentResults] =
    await Promise.all([
      Exam.countDocuments(scope),
      Result.countDocuments(scope),
      // A "student" is a distinct identity within the visible result set.
      Result.aggregate([
        { $match: scope },
        {
          $group: {
            _id: {
              $cond: [
                { $gt: [{ $strLenCP: { $ifNull: ["$studentId", ""] } }, 0] },
                { $toLower: "$studentId" },
                { $toLower: "$studentName" },
              ],
            },
          },
        },
        { $count: "total" },
      ]),
      Result.aggregate([
        { $match: scope },
        {
          $group: {
            _id: null,
            averagePercentage: { $avg: "$percentage" },
            passed: { $sum: { $cond: ["$passed", 1, 0] } },
          },
        },
      ]),
      Exam.find(scope)
        .sort({ createdAt: -1 })
        .limit(5)
        .select("title subject totalQuestions status examCode createdAt")
        .lean(),
      Result.find(scope)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("examId", "title subject")
        .select("studentName studentId score totalQuestions percentage passed createdAt examId")
        .lean(),
    ]);

  const averages = averageAgg[0] || { averagePercentage: 0, passed: 0 };
  const passRate = totalChecked ? Math.round((averages.passed / totalChecked) * 100) : 0;

  const [distribution, examPerformance, checkedOverTime] = await Promise.all([
    buildScoreDistribution(scope),
    buildExamPerformance(scope),
    buildCheckedOverTime(scope),
  ]);

  const payload = {
    summary: {
      totalExams,
      totalChecked,
      totalStudents: studentAgg[0]?.total || 0,
      averageScore: Math.round((averages.averagePercentage || 0) * 10) / 10,
      passRate,
    },
    charts: { distribution, examPerformance, checkedOverTime },
    recentExams,
    recentResults,
  };

  if (isAdmin) {
    const [totalUsers, totalTeachers, totalAdmins] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "teacher" }),
      User.countDocuments({ role: "admin" }),
    ]);
    payload.system = { totalUsers, totalTeachers, totalAdmins };
  }

  res.json({ success: true, data: payload });
});

async function buildScoreDistribution(scope) {
  const rows = await Result.aggregate([
    { $match: scope },
    {
      $bucket: {
        groupBy: "$percentage",
        boundaries: [0, 60, 70, 80, 90, 101],
        default: "other",
        output: { count: { $sum: 1 } },
      },
    },
  ]);

  const byBoundary = new Map(rows.map((r) => [r._id, r.count]));
  const boundaries = [0, 60, 70, 80, 90];

  return DISTRIBUTION_BUCKETS.map((bucket, index) => ({
    range: bucket.label,
    count: byBoundary.get(boundaries[index]) || 0,
  }));
}

async function buildExamPerformance(scope) {
  const rows = await Result.aggregate([
    { $match: scope },
    {
      $group: {
        _id: "$examId",
        averagePercentage: { $avg: "$percentage" },
        checked: { $sum: 1 },
      },
    },
    { $sort: { checked: -1 } },
    { $limit: 6 },
    { $lookup: { from: "exams", localField: "_id", foreignField: "_id", as: "exam" } },
    { $unwind: "$exam" },
    {
      $project: {
        _id: 0,
        exam: "$exam.title",
        averagePercentage: { $round: ["$averagePercentage", 1] },
        checked: 1,
      },
    },
  ]);

  return rows;
}

/** Server UTC offset as "+08:00", so Mongo buckets days the same way we label them. */
function localOffset(date = new Date()) {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Local calendar date as YYYY-MM-DD (toISOString would shift across midnight). */
function localDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

async function buildCheckedOverTime(scope) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 6);

  const timezone = localOffset(since);

  const rows = await Result.aggregate([
    { $match: { ...scope, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone } },
        count: { $sum: 1 },
      },
    },
  ]);

  const counts = new Map(rows.map((r) => [r._id, r.count]));

  // Always return all 7 days so the chart keeps a stable x-axis.
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(since);
    day.setDate(since.getDate() + i);
    const key = localDateKey(day);
    return {
      date: key,
      label: day.toLocaleDateString("en-US", { weekday: "short" }),
      count: counts.get(key) || 0,
    };
  });
}
