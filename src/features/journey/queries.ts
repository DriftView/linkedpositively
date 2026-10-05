import "server-only";
import { and, asc, count, countDistinct, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { journeyCategories, journeyGoals, journeyMethods, journeyUserGoals } from "@/server/db/schema";

export type Accent = "plum" | "magenta" | "sky" | "apricot" | "pink";

export type CategoryDTO = {
  id: string;
  slug: string;
  name: string;
  description: string;
  accent: Accent;
  published: boolean;
  methodCount: number;
  goalCount: number;
};

export type MethodDTO = { id: string; name: string; order: number; goals: { id: string; name: string; order: number }[] };

export type UserGoalDTO = {
  id: string;
  title: string;
  categoryName: string;
  categorySlug: string | null;
  methodName: string;
  own: boolean;
  step: number;
  currentStepNote: string;
  nextStepNote: string;
  targetDate: string | null;
  goalIn: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listCategories({ includeHidden = false } = {}): Promise<CategoryDTO[]> {
  const methodCounts = db
    .select({ categoryId: journeyMethods.categoryId, methods: count().as("methods") })
    .from(journeyMethods)
    .groupBy(journeyMethods.categoryId)
    .as("method_counts");
  const goalCounts = db
    .select({ categoryId: journeyMethods.categoryId, goals: count().as("goals") })
    .from(journeyGoals)
    .innerJoin(journeyMethods, eq(journeyMethods.id, journeyGoals.methodId))
    .groupBy(journeyMethods.categoryId)
    .as("goal_counts");
  const rows = await db
    .select({
      id: journeyCategories.id,
      slug: journeyCategories.slug,
      name: journeyCategories.name,
      description: journeyCategories.description,
      accent: journeyCategories.accent,
      published: journeyCategories.published,
      methodCount: sql<number>`coalesce(${methodCounts.methods}, 0)::int`,
      goalCount: sql<number>`coalesce(${goalCounts.goals}, 0)::int`,
    })
    .from(journeyCategories)
    .leftJoin(methodCounts, eq(methodCounts.categoryId, journeyCategories.id))
    .leftJoin(goalCounts, eq(goalCounts.categoryId, journeyCategories.id))
    .where(includeHidden ? undefined : eq(journeyCategories.published, true))
    .orderBy(asc(journeyCategories.order), asc(journeyCategories.name), asc(journeyCategories.id));
  return rows.map((row) => ({ ...row, description: row.description ?? "" }));
}

export async function getCategoryWithGoals(slug: string, { includeHidden = false } = {}) {
  const [category] = await db
    .select()
    .from(journeyCategories)
    .where(
      and(
        eq(journeyCategories.slug, slug.slice(0, 80)),
        includeHidden ? undefined : eq(journeyCategories.published, true),
      ),
    )
    .limit(1);
  if (!category) return null;
  const methods = await db
    .select({ id: journeyMethods.id, name: journeyMethods.name, order: journeyMethods.order })
    .from(journeyMethods)
    .where(eq(journeyMethods.categoryId, category.id))
    .orderBy(asc(journeyMethods.order), asc(journeyMethods.name), asc(journeyMethods.id));
  const goals = methods.length
    ? await db
        .select({ id: journeyGoals.id, methodId: journeyGoals.methodId, name: journeyGoals.name, order: journeyGoals.order })
        .from(journeyGoals)
        .where(
          inArray(
            journeyGoals.methodId,
            methods.map((method) => method.id),
          ),
        )
        .orderBy(asc(journeyGoals.order), asc(journeyGoals.name), asc(journeyGoals.id))
    : [];
  return {
    category: {
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description ?? "",
      accent: category.accent,
      published: category.published,
    },
    methods: methods.map(
      (method): MethodDTO => ({
        id: method.id,
        name: method.name,
        order: method.order,
        goals: goals
          .filter((goal) => goal.methodId === method.id)
          .map((goal) => ({ id: goal.id, name: goal.name, order: goal.order })),
      }),
    ),
  };
}

/** The viewer's own goals (never anyone else's). */
export async function listMyGoals(userId: string): Promise<UserGoalDTO[]> {
  const docs = await db
    .select({
      goal: journeyUserGoals,
      categorySlug: journeyCategories.slug,
    })
    .from(journeyUserGoals)
    .leftJoin(journeyCategories, eq(journeyCategories.id, journeyUserGoals.categoryId))
    .where(and(eq(journeyUserGoals.userId, userId), eq(journeyUserGoals.dismissed, false)))
    // Open goals first (Mongo sorted a missing completedAt first), then most recently updated.
    .orderBy(sql`${journeyUserGoals.completedAt} asc nulls first`, desc(journeyUserGoals.updatedAt), desc(journeyUserGoals.id))
    .limit(100);
  return docs.map(({ goal: doc, categorySlug }) => ({
    id: doc.id,
    title: doc.goalName || doc.ownGoal || "My goal",
    categoryName: doc.categoryName || doc.ownCategory || "My own goal",
    categorySlug: doc.categoryId ? (categorySlug ?? null) : null,
    methodName: doc.methodName ?? "",
    own: !doc.goalId,
    step: doc.step ?? 1,
    currentStepNote: doc.currentStepNote ?? "",
    nextStepNote: doc.nextStepNote ?? "",
    targetDate: doc.targetDate?.toISOString() ?? null,
    goalIn: doc.goalIn ?? "",
    completedAt: doc.completedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }));
}

/** Goal ids the viewer is already working on (to mark them on the browse page). */
export async function myActiveGoalIds(userId: string) {
  const docs = await db
    .select({ goalId: journeyUserGoals.goalId })
    .from(journeyUserGoals)
    .where(
      and(eq(journeyUserGoals.userId, userId), eq(journeyUserGoals.dismissed, false), isNotNull(journeyUserGoals.goalId)),
    );
  return docs.map((doc) => doc.goalId!);
}

/** Staff overview: how many members use the journey. No individual goals are shown. */
export async function journeyUsageStats() {
  const [row] = await db
    .select({
      goals: count(sql`case when not ${journeyUserGoals.dismissed} then 1 end`),
      members: countDistinct(journeyUserGoals.userId),
      completed: count(journeyUserGoals.completedAt),
    })
    .from(journeyUserGoals);
  return { goals: row?.goals ?? 0, members: row?.members ?? 0, completed: row?.completed ?? 0 };
}
