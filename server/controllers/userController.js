import mongoose from "mongoose";
import User from "../models/User.js";
import Exam from "../models/Exam.js";
import Result from "../models/Result.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

/**
 * Administration of teacher and administrator accounts.
 *
 * Every route here is admin-only, enforced by `authorize("admin")` on the
 * router. The checks in this file are the ones that role alone cannot express —
 * an admin may not lock or delete themselves, and the last admin may not be
 * removed, or nobody can administer the system afterwards.
 */

/**
 * GET /api/users
 *
 * The roster, with each teacher's workload attached. The counts come from two
 * grouped queries rather than a lookup per user, so the cost does not grow with
 * the number of accounts.
 */
export const listUsers = asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  const role = (req.query.role || "").trim();

  const filter = {};
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { email: rx }];
  }
  if (role && role !== "all") {
    if (!["admin", "teacher"].includes(role)) {
      throw ApiError.badRequest("Role must be admin or teacher.");
    }
    filter.role = role;
  }

  const users = await User.find(filter).sort({ createdAt: -1 }).lean();

  const [examCounts, resultCounts] = await Promise.all([
    Exam.aggregate([{ $group: { _id: "$teacherId", n: { $sum: 1 } } }]),
    Result.aggregate([{ $group: { _id: "$teacherId", n: { $sum: 1 } } }]),
  ]);

  const exams = new Map(examCounts.map((row) => [String(row._id), row.n]));
  const results = new Map(resultCounts.map((row) => [String(row._id), row.n]));

  res.json({
    success: true,
    data: {
      users: users.map((user) => ({
        ...user,
        examCount: exams.get(String(user._id)) || 0,
        resultCount: results.get(String(user._id)) || 0,
      })),
      totals: {
        all: await User.countDocuments(),
        admins: await User.countDocuments({ role: "admin" }),
        teachers: await User.countDocuments({ role: "teacher" }),
      },
    },
  });
});

/**
 * PATCH /api/users/:id
 * Changes a role or suspends an account. Nothing else about another person's
 * account is editable here — passwords are theirs to set.
 */
export const updateUser = asyncHandler(async (req, res) => {
  const user = await findUser(req.params.id);
  const isSelf = String(user._id) === String(req.user._id);

  if (req.body.role !== undefined) {
    if (!["admin", "teacher"].includes(req.body.role)) {
      throw ApiError.badRequest("Role must be admin or teacher.");
    }
    // Demoting the last admin would leave the system with no one able to
    // administer it, including the person making the change.
    if (user.role === "admin" && req.body.role !== "admin") {
      await assertNotLastAdmin(user._id);
    }
    user.role = req.body.role;
  }

  if (req.body.isActive !== undefined) {
    if (typeof req.body.isActive !== "boolean") {
      throw ApiError.badRequest("`isActive` must be true or false.");
    }
    if (isSelf && req.body.isActive === false) {
      throw ApiError.badRequest("You cannot deactivate your own account.");
    }
    if (user.role === "admin" && req.body.isActive === false) {
      await assertNotLastAdmin(user._id);
    }
    user.isActive = req.body.isActive;
  }

  await user.save();
  res.json({ success: true, message: "Account updated.", data: { user: user.toJSON() } });
});

/**
 * DELETE /api/users/:id
 *
 * Refuses while the account still owns exams or results: deleting it would
 * orphan a student's marks, and that is not something to do as a side effect of
 * tidying a user list.
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await findUser(req.params.id);

  if (String(user._id) === String(req.user._id)) {
    throw ApiError.badRequest("You cannot delete your own account.");
  }
  if (user.role === "admin") await assertNotLastAdmin(user._id);

  const [exams, results] = await Promise.all([
    Exam.countDocuments({ teacherId: user._id }),
    Result.countDocuments({ teacherId: user._id }),
  ]);

  if (exams > 0 || results > 0) {
    throw ApiError.badRequest(
      `${user.name} still owns ${exams} exam${exams === 1 ? "" : "s"} and ` +
        `${results} scanned paper${results === 1 ? "" : "s"}. Deactivate the account instead, ` +
        "or remove that work first."
    );
  }

  await user.deleteOne();
  res.json({ success: true, message: `${user.name}'s account was deleted.` });
});

async function findUser(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest("Invalid user id provided.");
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound("That account no longer exists.");
  return user;
}

/** Throws unless at least one other active admin would remain. */
async function assertNotLastAdmin(excludingId) {
  const others = await User.countDocuments({
    role: "admin",
    isActive: true,
    _id: { $ne: excludingId },
  });
  if (others === 0) {
    throw ApiError.badRequest(
      "This is the only active administrator. Promote someone else first."
    );
  }
}
