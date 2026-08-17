import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { today } from "../dates";

/**
 * Asset register reads (PRD §8.15).
 *
 * The register is the source of truth for "who has what", so the list query
 * always carries the *open* assignment rather than the latest one — a laptop
 * returned last March and reissued in June must show June's holder, and an
 * asset sitting on a shelf must show nobody at all.
 */

export interface AssetFilters {
  q?: string;
  status?: string;
  categoryId?: string;
}

export async function listAssets(session: AuthContext, filters: AssetFilters = {}) {
  const db = orgDb(session.org.id);

  return db.asset.findMany({
    where: {
      ...(filters.status && filters.status !== "all"
        ? { status: filters.status as "AVAILABLE" }
        : {}),
      ...(filters.categoryId && filters.categoryId !== "all"
        ? { categoryId: filters.categoryId }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" as const } },
              { assetTag: { contains: filters.q, mode: "insensitive" as const } },
              {
                serialNumber: {
                  contains: filters.q,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { assetTag: "asc" }],
    include: {
      category: { select: { id: true, name: true } },
      location: { select: { name: true } },
      assignments: {
        where: { returnedOn: null },
        take: 1,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              employeeCode: true,
            },
          },
        },
      },
    },
  });
}

export async function getAsset(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);

  return db.asset.findFirst({
    where: { id },
    include: {
      category: true,
      location: { select: { id: true, name: true } },
      assignments: {
        orderBy: { issuedOn: "desc" },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              employeeCode: true,
              designation: { select: { title: true } },
            },
          },
          issuedBy: { select: { name: true } },
        },
      },
    },
  });
}

export async function listAssetCategories(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.assetCategory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { assets: true } } },
  });
}

/** What the signed-in employee is currently holding — their "My space" panel. */
export async function getMyAssets(session: AuthContext) {
  if (!session.employee) return [];
  const db = orgDb(session.org.id);

  return db.assetAssignment.findMany({
    where: { employeeId: session.employee.id, returnedOn: null },
    orderBy: { issuedOn: "desc" },
    include: {
      asset: {
        include: { category: { select: { name: true } } },
      },
    },
  });
}

export async function getEmployeeAssets(session: AuthContext, employeeId: string) {
  const db = orgDb(session.org.id);
  return db.assetAssignment.findMany({
    where: { employeeId, returnedOn: null },
    orderBy: { issuedOn: "desc" },
    include: { asset: { include: { category: { select: { name: true } } } } },
  });
}

/**
 * Register headlines.
 *
 * Book value uses straight-line depreciation over the category's stated life
 * and never goes below zero. It is "depreciation-lite" exactly as the PRD puts
 * it — enough for an admin to answer "what is our kit worth?", not a fixed-asset
 * ledger, and the UI says so.
 */
export async function assetSummary(session: AuthContext) {
  const db = orgDb(session.org.id);

  const assets = await db.asset.findMany({
    select: {
      status: true,
      purchaseCost: true,
      purchaseDate: true,
      warrantyEndsOn: true,
      category: { select: { depreciationYears: true } },
    },
  });

  const now = today();
  let purchaseTotal = 0;
  let bookValue = 0;
  let warrantyExpiring = 0;

  for (const asset of assets) {
    const cost = Number(asset.purchaseCost ?? 0);
    purchaseTotal += cost;

    const life = asset.category?.depreciationYears ?? null;
    if (cost > 0 && life && asset.purchaseDate) {
      const years =
        (now.getTime() - asset.purchaseDate.getTime()) / (365.25 * 86_400_000);
      bookValue += Math.max(0, cost * (1 - years / life));
    } else {
      bookValue += cost;
    }

    if (
      asset.warrantyEndsOn &&
      asset.warrantyEndsOn >= now &&
      asset.warrantyEndsOn.getTime() - now.getTime() < 90 * 86_400_000
    ) {
      warrantyExpiring += 1;
    }
  }

  return {
    total: assets.length,
    assigned: assets.filter((a) => a.status === "ASSIGNED").length,
    available: assets.filter((a) => a.status === "AVAILABLE").length,
    attention: assets.filter(
      (a) => a.status === "IN_REPAIR" || a.status === "LOST",
    ).length,
    purchaseTotal,
    bookValue: Math.round(bookValue),
    warrantyExpiring,
  };
}
