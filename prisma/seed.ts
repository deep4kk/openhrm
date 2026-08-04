import "dotenv/config";
import bcrypt from "bcryptjs";

import { rawDb as db } from "../src/lib/db";
import { SYSTEM_ROLES } from "../src/lib/permissions";
import { encryptField } from "../src/lib/crypto";
import {
  addDays,
  isoWeekday,
  leaveYearOf,
  toDateOnly,
  today,
} from "../src/lib/dates";

/**
 * Demo data.
 *
 * A believable organisation rather than "Test User 1..30": real reporting
 * lines, a mix of tenures, people currently on leave, requests waiting for
 * approval, and two months of attendance with the ordinary mess of late
 * arrivals and missed punches. An empty app tells you nothing about whether the
 * product works.
 *
 * Safe to re-run: it deletes the demo organisation first and rebuilds it.
 */

const ORG_SLUG = "meridian-labs";
const PASSWORD = "openhrm-demo-2026";

const DEPARTMENTS = [
  { name: "Engineering", code: "ENG" },
  { name: "Design", code: "DES" },
  { name: "Sales", code: "SAL" },
  { name: "Marketing", code: "MKT" },
  { name: "People Ops", code: "POP" },
  { name: "Finance", code: "FIN" },
];

const DESIGNATIONS = [
  { title: "Founder & CEO", level: 100 },
  { title: "VP Engineering", level: 90 },
  { title: "Head of Design", level: 85 },
  { title: "Head of Sales", level: 85 },
  { title: "HR Manager", level: 80 },
  { title: "Finance Manager", level: 80 },
  { title: "Engineering Manager", level: 70 },
  { title: "Senior Engineer", level: 60 },
  { title: "Engineer", level: 50 },
  { title: "Product Designer", level: 50 },
  { title: "Account Executive", level: 50 },
  { title: "Marketing Associate", level: 40 },
  { title: "HR Executive", level: 40 },
  { title: "Intern", level: 10 },
];

const LEAVE_TYPES = [
  { name: "Casual Leave", code: "CL", colorToken: "chart-1", accrualFrequency: "MONTHLY", accrualAmount: 1, carryForward: false, minNoticeDays: 1, sortdex: 1 },
  { name: "Sick Leave", code: "SL", colorToken: "chart-3", accrualFrequency: "MONTHLY", accrualAmount: 0.5, carryForward: false, minNoticeDays: 0, sortdex: 2 },
  { name: "Earned Leave", code: "EL", colorToken: "chart-2", accrualFrequency: "MONTHLY", accrualAmount: 1.25, carryForward: true, carryForwardCap: 30, minNoticeDays: 7, sortdex: 3 },
  { name: "Unpaid Leave", code: "LWP", colorToken: "chart-5", isPaid: false, accrualFrequency: "NONE", accrualAmount: 0, carryForward: false, minNoticeDays: 0, sortdex: 4 },
  { name: "Maternity Leave", code: "ML", colorToken: "chart-4", accrualFrequency: "NONE", accrualAmount: 0, openingBalance: 182, carryForward: false, applicableGender: "FEMALE", minNoticeDays: 30, sortdex: 5 },
  { name: "Paternity Leave", code: "PL", colorToken: "chart-4", accrualFrequency: "NONE", accrualAmount: 0, openingBalance: 10, carryForward: false, applicableGender: "MALE", minNoticeDays: 15, sortdex: 6 },
] as const;

/** name, dept, designation, gender, months of tenure, city */
const PEOPLE: [string, string, string, "MALE" | "FEMALE" | "OTHER", number, string][] = [
  ["Deepak Sharma", "POP", "Founder & CEO", "MALE", 62, "Bengaluru"],
  ["Ananya Iyer", "POP", "HR Manager", "FEMALE", 40, "Bengaluru"],
  ["Rohan Mehta", "ENG", "VP Engineering", "MALE", 55, "Bengaluru"],
  ["Priya Nair", "DES", "Head of Design", "FEMALE", 44, "Bengaluru"],
  ["Vikram Desai", "SAL", "Head of Sales", "MALE", 38, "Pune"],
  ["Sneha Kulkarni", "FIN", "Finance Manager", "FEMALE", 33, "Pune"],

  ["Arjun Reddy", "ENG", "Engineering Manager", "MALE", 30, "Bengaluru"],
  ["Kavya Menon", "ENG", "Engineering Manager", "FEMALE", 28, "Bengaluru"],
  ["Siddharth Rao", "ENG", "Senior Engineer", "MALE", 26, "Bengaluru"],
  ["Meera Joshi", "ENG", "Senior Engineer", "FEMALE", 24, "Bengaluru"],
  ["Aditya Verma", "ENG", "Engineer", "MALE", 18, "Bengaluru"],
  ["Ishita Banerjee", "ENG", "Engineer", "FEMALE", 16, "Bengaluru"],
  ["Karthik Subramanian", "ENG", "Engineer", "MALE", 14, "Bengaluru"],
  ["Nandini Gupta", "ENG", "Engineer", "FEMALE", 11, "Pune"],
  ["Rahul Malhotra", "ENG", "Engineer", "MALE", 9, "Bengaluru"],
  ["Tanvi Shah", "ENG", "Engineer", "FEMALE", 6, "Bengaluru"],
  ["Yash Agarwal", "ENG", "Intern", "MALE", 3, "Bengaluru"],

  ["Divya Pillai", "DES", "Product Designer", "FEMALE", 22, "Bengaluru"],
  ["Nikhil Chauhan", "DES", "Product Designer", "MALE", 15, "Bengaluru"],
  ["Riya Kapoor", "DES", "Product Designer", "FEMALE", 8, "Pune"],

  ["Manish Tiwari", "SAL", "Account Executive", "MALE", 27, "Pune"],
  ["Pooja Bhatt", "SAL", "Account Executive", "FEMALE", 20, "Pune"],
  ["Rajesh Kumar", "SAL", "Account Executive", "MALE", 13, "Bengaluru"],
  ["Shreya Ghosh", "SAL", "Account Executive", "FEMALE", 7, "Pune"],

  ["Aisha Khan", "MKT", "Marketing Associate", "FEMALE", 19, "Bengaluru"],
  ["Varun Saxena", "MKT", "Marketing Associate", "MALE", 12, "Bengaluru"],
  ["Neha Chopra", "MKT", "Marketing Associate", "FEMALE", 5, "Pune"],

  ["Sanjay Patel", "FIN", "Finance Manager", "MALE", 21, "Pune"],
  ["Lakshmi Raman", "FIN", "Finance Manager", "FEMALE", 10, "Bengaluru"],

  ["Farhan Ahmed", "POP", "HR Executive", "MALE", 17, "Bengaluru"],
  ["Sonia D'Souza", "POP", "HR Executive", "FEMALE", 4, "Bengaluru"],
];

const HOLIDAYS_2026: [string, string, boolean][] = [
  ["New Year's Day", "2026-01-01", false],
  ["Republic Day", "2026-01-26", false],
  ["Holi", "2026-03-04", false],
  ["Good Friday", "2026-04-03", true],
  ["Eid al-Fitr", "2026-03-20", true],
  ["Independence Day", "2026-08-15", false],
  ["Gandhi Jayanti", "2026-10-02", false],
  ["Dussehra", "2026-10-20", false],
  ["Diwali", "2026-11-08", false],
  ["Christmas Day", "2026-12-25", false],
];

async function main() {
  console.log("Seeding demo data…\n");

  const existing = await db.organization.findUnique({
    where: { slug: ORG_SLUG },
    select: { id: true },
  });

  if (existing) {
    console.log("  removing previous demo organisation");
    // Cascades clear every tenant table for this org.
    await db.organization.delete({ where: { id: existing.id } });
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const org = await db.organization.create({
    data: {
      name: "Meridian Labs",
      slug: ORG_SLUG,
      industry: "Software",
      website: "https://meridianlabs.example",
      country: "IN",
      currency: "INR",
      timezone: "Asia/Kolkata",
      fiscalYearStartMonth: 4,
      workingDays: [1, 2, 3, 4, 5],
    },
  });
  console.log(`  organisation: ${org.name}`);

  // --- roles -------------------------------------------------------------
  await db.role.createMany({
    data: SYSTEM_ROLES.map((role) => ({
      orgId: org.id,
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
      isSystem: true,
    })),
  });
  const roles = await db.role.findMany({ where: { orgId: org.id } });
  const roleByKey = Object.fromEntries(roles.map((r) => [r.key, r]));
  console.log(`  roles: ${roles.length}`);

  // --- structure ---------------------------------------------------------
  const [bengaluru, pune] = await Promise.all([
    db.location.create({
      data: {
        orgId: org.id,
        name: "Bengaluru HQ",
        city: "Bengaluru",
        state: "Karnataka",
        country: "IN",
        isHeadquarters: true,
        timezone: "Asia/Kolkata",
      },
    }),
    db.location.create({
      data: {
        orgId: org.id,
        name: "Pune Office",
        city: "Pune",
        state: "Maharashtra",
        country: "IN",
        timezone: "Asia/Kolkata",
      },
    }),
  ]);

  await db.department.createMany({
    data: DEPARTMENTS.map((d) => ({ orgId: org.id, ...d })),
  });
  const departments = await db.department.findMany({ where: { orgId: org.id } });
  const deptByCode = Object.fromEntries(departments.map((d) => [d.code, d]));

  await db.designation.createMany({
    data: DESIGNATIONS.map((d) => ({ orgId: org.id, ...d })),
  });
  const designations = await db.designation.findMany({ where: { orgId: org.id } });
  const desigByTitle = Object.fromEntries(designations.map((d) => [d.title, d]));

  const shift = await db.shift.create({
    data: {
      orgId: org.id,
      name: "General Shift",
      startTime: "09:30",
      endTime: "18:30",
      breakMinutes: 60,
      graceMinutes: 15,
      isDefault: true,
    },
  });
  console.log(`  departments: ${departments.length}, designations: ${designations.length}`);

  // --- holidays ----------------------------------------------------------
  await db.holiday.createMany({
    data: HOLIDAYS_2026.map(([name, date, isOptional]) => ({
      orgId: org.id,
      name,
      date: new Date(`${date}T00:00:00Z`),
      isOptional,
    })),
  });

  // --- leave types -------------------------------------------------------
  await db.leaveType.createMany({
    data: LEAVE_TYPES.map((t) => ({
      orgId: org.id,
      name: t.name,
      code: t.code,
      colorToken: t.colorToken,
      isPaid: "isPaid" in t ? t.isPaid : true,
      accrualFrequency: t.accrualFrequency,
      accrualAmount: t.accrualAmount,
      openingBalance: "openingBalance" in t ? t.openingBalance : 0,
      carryForward: t.carryForward,
      carryForwardCap: "carryForwardCap" in t ? t.carryForwardCap : null,
      applicableGender: "applicableGender" in t ? t.applicableGender : null,
      minNoticeDays: t.minNoticeDays,
      sortdex: t.sortdex,
    })),
  });
  const leaveTypes = await db.leaveType.findMany({ where: { orgId: org.id } });
  const ltByCode = Object.fromEntries(leaveTypes.map((t) => [t.code, t]));

  // --- employees ---------------------------------------------------------
  const now = today();
  const employees: { id: string; name: string; deptCode: string; gender: string }[] = [];

  for (const [index, person] of PEOPLE.entries()) {
    const [fullName, deptCode, title, gender, tenureMonths, city] = person;
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ");
    const joining = new Date(now);
    joining.setUTCMonth(joining.getUTCMonth() - tenureMonths);

    const employee = await db.employee.create({
      data: {
        orgId: org.id,
        employeeCode: `MRD-${String(index + 1).padStart(3, "0")}`,
        firstName: firstName!,
        lastName,
        workEmail: `${slugify(fullName)}@meridianlabs.example`,
        personalEmail: `${slugify(fullName)}@example.com`,
        phone: `+91 9${String(800000000 + index * 137911).slice(0, 9)}`,
        gender,
        dateOfBirth: new Date(
          Date.UTC(1988 + (index % 14), index % 12, ((index * 7) % 27) + 1),
        ),
        dateOfJoining: toDateOnly(joining),
        departmentId: deptByCode[deptCode]!.id,
        designationId: desigByTitle[title]!.id,
        locationId: city === "Pune" ? pune.id : bengaluru.id,
        shiftId: shift.id,
        city,
        state: city === "Pune" ? "Maharashtra" : "Karnataka",
        country: "IN",
        employmentType: title === "Intern" ? "INTERN" : "FULL_TIME",
        status: "ACTIVE",
        ctcAnnual: ctcFor(title),
        emergencyContactName: "Family contact",
        emergencyContactPhone: `+91 9${String(700000000 + index * 91237).slice(0, 9)}`,
        emergencyContactRelation: index % 2 === 0 ? "Spouse" : "Parent",
        bankName: "HDFC Bank",
        bankIfsc: "HDFC0001234",
        // Encrypted at rest, exactly as the app writes them.
        bankAccountNumberEnc: encryptField(
          `50100${String(100000000 + index * 7331).slice(0, 9)}`,
        ),
        panNumberEnc: encryptField(
          `ABCDE${String(1000 + index)}${String.fromCharCode(65 + (index % 26))}`,
        ),
      },
    });

    employees.push({ id: employee.id, name: fullName, deptCode, gender });
  }
  console.log(`  employees: ${employees.length}`);

  // --- reporting lines ---------------------------------------------------
  const byName = Object.fromEntries(employees.map((e) => [e.name, e]));
  const ceo = byName["Deepak Sharma"]!;

  const reportsTo: Record<string, string> = {
    "Ananya Iyer": "Deepak Sharma",
    "Rohan Mehta": "Deepak Sharma",
    "Priya Nair": "Deepak Sharma",
    "Vikram Desai": "Deepak Sharma",
    "Sneha Kulkarni": "Deepak Sharma",
    "Arjun Reddy": "Rohan Mehta",
    "Kavya Menon": "Rohan Mehta",
    "Siddharth Rao": "Arjun Reddy",
    "Meera Joshi": "Kavya Menon",
    "Aditya Verma": "Arjun Reddy",
    "Ishita Banerjee": "Arjun Reddy",
    "Karthik Subramanian": "Kavya Menon",
    "Nandini Gupta": "Kavya Menon",
    "Rahul Malhotra": "Arjun Reddy",
    "Tanvi Shah": "Kavya Menon",
    "Yash Agarwal": "Siddharth Rao",
    "Divya Pillai": "Priya Nair",
    "Nikhil Chauhan": "Priya Nair",
    "Riya Kapoor": "Priya Nair",
    "Manish Tiwari": "Vikram Desai",
    "Pooja Bhatt": "Vikram Desai",
    "Rajesh Kumar": "Vikram Desai",
    "Shreya Ghosh": "Vikram Desai",
    "Aisha Khan": "Vikram Desai",
    "Varun Saxena": "Aisha Khan",
    "Neha Chopra": "Aisha Khan",
    "Sanjay Patel": "Sneha Kulkarni",
    "Lakshmi Raman": "Sneha Kulkarni",
    "Farhan Ahmed": "Ananya Iyer",
    "Sonia D'Souza": "Ananya Iyer",
  };

  for (const [name, managerName] of Object.entries(reportsTo)) {
    const emp = byName[name];
    const mgr = byName[managerName];
    if (emp && mgr) {
      await db.employee.update({
        where: { id: emp.id },
        data: { managerId: mgr.id },
      });
    }
  }

  await db.department.update({
    where: { id: deptByCode["ENG"]!.id },
    data: { headId: byName["Rohan Mehta"]!.id },
  });
  await db.department.update({
    where: { id: deptByCode["POP"]!.id },
    data: { headId: byName["Ananya Iyer"]!.id },
  });

  // --- user accounts, one per role so every view is demoable -------------
  const accounts: [string, string, string][] = [
    ["Deepak Sharma", "admin@meridianlabs.example", "org_admin"],
    ["Ananya Iyer", "hr@meridianlabs.example", "hr_manager"],
    ["Arjun Reddy", "manager@meridianlabs.example", "manager"],
    ["Aditya Verma", "employee@meridianlabs.example", "employee"],
  ];

  for (const [name, email, roleKey] of accounts) {
    const employee = byName[name]!;
    const user = await db.user.create({
      data: {
        orgId: org.id,
        email,
        name,
        passwordHash,
        roleId: roleByKey[roleKey]!.id,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });
    await db.employee.update({
      where: { id: employee.id },
      data: { userId: user.id },
    });
  }
  console.log(`  user accounts: ${accounts.length}`);

  // --- leave balances ----------------------------------------------------
  const year = leaveYearOf(now, org.fiscalYearStartMonth);
  const monthsIntoYear = Math.max(
    1,
    ((now.getUTCMonth() + 1 - org.fiscalYearStartMonth + 12) % 12) + 1,
  );

  const balanceRows = [];
  const ledgerRows = [];

  for (const employee of employees) {
    for (const type of leaveTypes) {
      if (type.applicableGender && type.applicableGender !== employee.gender) {
        continue;
      }

      const accrued =
        type.accrualFrequency === "MONTHLY"
          ? Number(type.accrualAmount) * monthsIntoYear
          : 0;
      const opening = Number(type.openingBalance);
      // A spread of usage so balances aren't uniformly pristine.
      const used = type.code === "LWP" ? 0 : Math.min(
        Math.round(Math.random() * accrued * 0.55 * 2) / 2,
        accrued,
      );

      balanceRows.push({
        orgId: org.id,
        employeeId: employee.id,
        leaveTypeId: type.id,
        year,
        openingBalance: opening,
        accrued,
        used,
      });

      if (opening > 0) {
        ledgerRows.push({
          orgId: org.id,
          employeeId: employee.id,
          leaveTypeId: type.id,
          year,
          delta: opening,
          reason: "OPENING_BALANCE" as const,
          note: `Opening balance for ${year}`,
        });
      }
      if (accrued > 0) {
        ledgerRows.push({
          orgId: org.id,
          employeeId: employee.id,
          leaveTypeId: type.id,
          year,
          delta: accrued,
          reason: "ACCRUAL" as const,
          note: `${monthsIntoYear} months accrual`,
        });
      }
    }
  }

  await db.leaveBalance.createMany({ data: balanceRows });
  await db.leaveLedgerEntry.createMany({ data: ledgerRows });
  console.log(`  leave balances: ${balanceRows.length}`);

  // --- leave requests ----------------------------------------------------
  const requests = [
    { name: "Meera Joshi", code: "EL", from: 3, days: 3, status: "PENDING" as const, reason: "Family wedding in Kochi." },
    { name: "Rahul Malhotra", code: "CL", from: 1, days: 1, status: "PENDING" as const, reason: "Apartment registration appointment." },
    { name: "Nandini Gupta", code: "SL", from: -1, days: 2, status: "PENDING" as const, reason: "Fever, seeing a doctor tomorrow." },
    { name: "Tanvi Shah", code: "EL", from: 10, days: 5, status: "PENDING" as const, reason: "Planned trip, tickets booked." },
    { name: "Aditya Verma", code: "SL", from: -6, days: 1, status: "APPROVED" as const, reason: "Migraine." },
    { name: "Ishita Banerjee", code: "EL", from: -14, days: 4, status: "APPROVED" as const, reason: "Diwali travel." },
    { name: "Divya Pillai", code: "CL", from: -3, days: 1, status: "APPROVED" as const, reason: "Personal work." },
    { name: "Rajesh Kumar", code: "CL", from: -9, days: 2, status: "REJECTED" as const, reason: "Short break." },
    { name: "Karthik Subramanian", code: "EL", from: 0, days: 2, status: "APPROVED" as const, reason: "Cousin's engagement." },
    { name: "Pooja Bhatt", code: "SL", from: 0, days: 1, status: "APPROVED" as const, reason: "Not well." },
  ];

  for (const req of requests) {
    const employee = byName[req.name];
    const type = ltByCode[req.code];
    if (!employee || !type) continue;

    const start = addDays(now, req.from);
    const end = addDays(start, req.days - 1);
    const manager = reportsTo[req.name] ? byName[reportsTo[req.name]!] : null;

    await db.leaveRequest.create({
      data: {
        orgId: org.id,
        employeeId: employee.id,
        leaveTypeId: type.id,
        startDate: start,
        endDate: end,
        days: req.days,
        reason: req.reason,
        status: req.status,
        approverId: req.status === "PENDING" ? null : (manager?.id ?? ceo.id),
        decidedAt: req.status === "PENDING" ? null : addDays(start, -1),
        decisionNote:
          req.status === "REJECTED" ? "Quarter close — please reschedule." : null,
        createdAt: addDays(start, -2),
      },
    });
  }
  console.log(`  leave requests: ${requests.length}`);

  // Employees currently away get the matching status.
  const onLeaveNow = ["Karthik Subramanian", "Pooja Bhatt"];
  for (const name of onLeaveNow) {
    const emp = byName[name];
    if (emp) {
      await db.employee.update({
        where: { id: emp.id },
        data: { status: "ON_LEAVE" },
      });
    }
  }

  // --- attendance, last 60 days -----------------------------------------
  const holidays = new Set(
    HOLIDAYS_2026.map(([, date]) => new Date(`${date}T00:00:00Z`).getTime()),
  );
  const attendanceRows = [];

  for (let offset = 60; offset >= 0; offset--) {
    const date = addDays(now, -offset);
    const weekday = isoWeekday(date);

    for (const employee of employees) {
      if (weekday === 6 || weekday === 7) {
        attendanceRows.push({
          orgId: org.id,
          employeeId: employee.id,
          date,
          status: "WEEKLY_OFF" as const,
          workedMinutes: 0,
          source: "SYSTEM" as const,
        });
        continue;
      }

      if (holidays.has(date.getTime())) {
        attendanceRows.push({
          orgId: org.id,
          employeeId: employee.id,
          date,
          status: "HOLIDAY" as const,
          workedMinutes: 0,
          source: "SYSTEM" as const,
        });
        continue;
      }

      const roll = Math.random();

      // ~4% absent, ~3% half day, rest present — with a realistic spread of
      // arrival times so "late" actually means something in the UI.
      if (roll < 0.04) {
        attendanceRows.push({
          orgId: org.id,
          employeeId: employee.id,
          date,
          status: "ABSENT" as const,
          workedMinutes: 0,
          source: "SYSTEM" as const,
        });
        continue;
      }

      const halfDay = roll < 0.07;
      const startMinutes = 9 * 60 + 30 + Math.round((Math.random() - 0.35) * 70);
      const checkIn = new Date(date);
      checkIn.setUTCHours(0, startMinutes, 0, 0);

      const workMinutes = halfDay
        ? 210 + Math.round(Math.random() * 40)
        : 480 + Math.round((Math.random() - 0.4) * 90);

      const checkOut = new Date(checkIn.getTime() + (workMinutes + 60) * 60_000);

      attendanceRows.push({
        orgId: org.id,
        employeeId: employee.id,
        date,
        checkInAt: checkIn,
        // Today's records for a few people stay open — someone is always still
        // at their desk when you look at the screen.
        checkOutAt: offset === 0 && Math.random() < 0.4 ? null : checkOut,
        workedMinutes: offset === 0 && Math.random() < 0.4 ? 0 : workMinutes,
        status: halfDay ? ("HALF_DAY" as const) : ("PRESENT" as const),
        shiftId: shift.id,
        isLate: startMinutes > 9 * 60 + 45,
        source: "WEB" as const,
      });
    }
  }

  // Chunked: 30 employees x 61 days is ~1,800 rows.
  for (let i = 0; i < attendanceRows.length; i += 500) {
    await db.attendanceRecord.createMany({
      data: attendanceRows.slice(i, i + 500),
      skipDuplicates: true,
    });
  }
  console.log(`  attendance records: ${attendanceRows.length}`);

  // --- announcements -----------------------------------------------------
  const adminUser = await db.user.findFirstOrThrow({
    where: { orgId: org.id, email: "admin@meridianlabs.example" },
  });

  await db.announcement.createMany({
    data: [
      {
        orgId: org.id,
        title: "Diwali holiday schedule",
        body: "The office will be closed 8–10 November. Support rota is posted in #ops — thanks to everyone covering.",
        authorId: adminUser.id,
        isPinned: true,
        publishedAt: addDays(now, -4),
      },
      {
        orgId: org.id,
        title: "New leave policy from this quarter",
        body: "Earned leave now carries forward up to 30 days. Balances have been updated automatically — check My Space → Leave.",
        authorId: adminUser.id,
        publishedAt: addDays(now, -11),
      },
      {
        orgId: org.id,
        title: "Welcome to the team, Yash",
        body: "Yash Agarwal joins Engineering as an intern this week, working with Siddharth on the billing service.",
        authorId: adminUser.id,
        publishedAt: addDays(now, -18),
      },
    ],
  });

  // --- notifications for the demo admin ---------------------------------
  const pending = await db.leaveRequest.findMany({
    where: { orgId: org.id, status: "PENDING" },
    include: { employee: true, leaveType: true },
    take: 4,
  });

  await db.notification.createMany({
    data: pending.map((req) => ({
      orgId: org.id,
      userId: adminUser.id,
      type: "LEAVE_REQUESTED" as const,
      title: `${req.employee.firstName} ${req.employee.lastName} requested ${req.leaveType.name}`,
      body: req.reason,
      linkUrl: "/leave/approvals",
      createdAt: req.createdAt,
    })),
  });

  console.log("\nDone.\n");
  console.log("  Sign in at http://localhost:3000/login");
  console.log(`  Password for every demo account: ${PASSWORD}\n`);
  for (const [name, email, roleKey] of accounts) {
    console.log(`    ${email.padEnd(34)} ${roleKey.padEnd(11)} ${name}`);
  }
  console.log("");
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function ctcFor(title: string): number {
  const bands: Record<string, number> = {
    "Founder & CEO": 6_000_000,
    "VP Engineering": 5_200_000,
    "Head of Design": 4_400_000,
    "Head of Sales": 4_400_000,
    "HR Manager": 2_600_000,
    "Finance Manager": 2_800_000,
    "Engineering Manager": 3_600_000,
    "Senior Engineer": 2_800_000,
    Engineer: 1_800_000,
    "Product Designer": 1_900_000,
    "Account Executive": 1_500_000,
    "Marketing Associate": 1_100_000,
    "HR Executive": 900_000,
    Intern: 360_000,
  };
  return bands[title] ?? 1_200_000;
}

main()
  .catch((error) => {
    console.error("\nSeed failed:\n", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
