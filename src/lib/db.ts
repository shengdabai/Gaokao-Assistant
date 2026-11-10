import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "gaokao.db");

export const REGION_ALIASES: Record<string, string[]> = {
  "江浙沪": ["上海", "江苏", "浙江"],
  "长三角": ["上海", "江苏", "浙江", "安徽"],
  "珠三角": ["广东"],
  "京津冀": ["北京", "天津", "河北"],
  "东北": ["辽宁", "吉林", "黑龙江"],
  "西北": ["陕西", "甘肃", "青海", "宁夏", "新疆"],
  "西南": ["四川", "重庆", "云南", "贵州", "西藏"],
  "华中": ["湖北", "湖南", "河南"],
  "华东": ["上海", "江苏", "浙江", "安徽", "福建", "江西", "山东"],
  "华南": ["广东", "广西", "海南"],
  "华北": ["北京", "天津", "河北", "山西", "内蒙古"],
};

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const exists = fs.existsSync(DB_PATH);
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  if (!exists) {
    initDb(_db);
    seedDb(_db);
  }

  // These fields are required by queries, even if external imports never ran.
  const columns = new Set((_db.pragma("table_info(schools)") as { name: string }[]).map(c => c.name));
  for (const column of ["dorm_info", "food_info", "campus_info", "additional_comments"]) {
    if (!columns.has(column)) _db.exec(`ALTER TABLE schools ADD COLUMN ${column} TEXT DEFAULT ''`);
  }

  return _db;
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT DEFAULT '',
      province TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      is_985 INTEGER DEFAULT 0,
      is_211 INTEGER DEFAULT 0,
      is_double_first INTEGER DEFAULT 0,
      reputation_score REAL DEFAULT 0,
      reputation_summary TEXT DEFAULT '',
      response_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      school_code TEXT NOT NULL,
      school_name TEXT NOT NULL,
      major TEXT NOT NULL,
      major_code TEXT NOT NULL,
      major_category TEXT DEFAULT '',
      major_note TEXT DEFAULT '',
      subject TEXT NOT NULL,
      subject_requirement TEXT DEFAULT '',
      type TEXT DEFAULT '',
      batch TEXT NOT NULL,
      plan_count INTEGER DEFAULT 0,
      duration INTEGER DEFAULT 4,
      tuition INTEGER DEFAULT 0,
      language_requirement TEXT DEFAULT '',
      FOREIGN KEY (school_code) REFERENCES schools(code)
    );

    CREATE INDEX idx_admissions_school ON admissions(school_code);
    CREATE INDEX idx_admissions_subject ON admissions(subject);
    CREATE INDEX idx_admissions_batch ON admissions(batch);
    CREATE INDEX idx_admissions_major_category ON admissions(major_category);
    CREATE INDEX idx_admissions_school_name ON admissions(school_name);
    CREATE INDEX idx_admissions_tuition ON admissions(tuition);
    CREATE INDEX idx_admissions_type ON admissions(type);
    CREATE INDEX idx_schools_city ON schools(city);
  `);
}

function seedDb(db: Database.Database) {
  const dataPath = path.join(process.cwd(), "data", "data_raw.json");
  const schoolsPath = path.join(process.cwd(), "data", "schools_raw.json");

  if (!fs.existsSync(dataPath) || !fs.existsSync(schoolsPath)) {
    console.error("Data files not found. Please run data export first.");
    return;
  }

  const schools = JSON.parse(fs.readFileSync(schoolsPath, "utf-8"));
  const data = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  // Insert schools
  const insertSchool = db.prepare(
    `INSERT OR IGNORE INTO schools (code, name, city) VALUES (?, ?, ?)`
  );
  const schoolTx = db.transaction(() => {
    for (const s of schools) {
      insertSchool.run(s.code, s.name, s.city || "");
    }
  });
  schoolTx();

  // Insert admissions
  const insertAdmission = db.prepare(`
    INSERT INTO admissions (year, school_code, school_name, major, major_code, major_category, major_note, subject, subject_requirement, type, batch, plan_count, duration, tuition, language_requirement)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const admTx = db.transaction(() => {
    for (const d of data) {
      insertAdmission.run(
        d.year || 2025,
        String(d.school_code),
        d.school,
        d.major,
        String(d.major_code),
        d.major_category || "",
        d.major_note || "",
        d.subject || "",
        d.subject_requirement || "",
        d.type || "",
        d.batch || "",
        d.plan_count || 0,
        d.duration || 4,
        d.tuition || 0,
        d.language_requirement || ""
      );
    }
  });
  admTx();

  console.log(`Seeded ${schools.length} schools and ${data.length} admissions.`);
}

// --- Reputation data parser ---
function parseReputationJson(jsonStr: string | null): Record<string, string[]> | null {
  if (!jsonStr || jsonStr === "{}" || jsonStr === "") return null;
  try {
    const data = JSON.parse(jsonStr);
    if (typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function summarizeReputation(school: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};

  const dormData = parseReputationJson(school.dorm_info as string);
  if (dormData) {
    const parts: string[] = [];
    if (dormData.dorm_upper_bed_lower_desk) parts.push(`上床下桌: ${dormData.dorm_upper_bed_lower_desk[0]}`);
    if (dormData.ac_in_dorm_and_classroom) parts.push(`空调: ${dormData.ac_in_dorm_and_classroom[0]}`);
    if (dormData.private_bathroom) parts.push(`独卫: ${dormData.private_bathroom[0]}`);
    if (dormData.hot_water_in_dorm) parts.push(`热水: ${dormData.hot_water_in_dorm[0]}`);
    if (dormData.washing_machine) parts.push(`洗衣机: ${dormData.washing_machine[0]}`);
    if (dormData.power_limit_wattage) parts.push(`限电: ${dormData.power_limit_wattage[0]}`);
    result.dorm = parts.join("；");
  }

  const foodData = parseReputationJson(school.food_info as string);
  if (foodData) {
    const parts: string[] = [];
    if (foodData.canteen_price_quality) parts.push(`食堂: ${foodData.canteen_price_quality[0]}`);
    if (foodData.food_delivery_allowed) parts.push(`外卖: ${foodData.food_delivery_allowed[0]}`);
    if (foodData.supermarket) parts.push(`超市: ${foodData.supermarket[0]}`);
    result.food = parts.join("；");
  }

  const campusData = parseReputationJson(school.campus_info as string);
  if (campusData) {
    const parts: string[] = [];
    if (campusData.campus_transportation) parts.push(`交通: ${campusData.campus_transportation[0]}`);
    if (campusData.campus_network) parts.push(`校园网: ${campusData.campus_network[0]}`);
    if (campusData.curfew) parts.push(`门禁: ${campusData.curfew[0]}`);
    if (campusData.running_requirement) parts.push(`跑操: ${campusData.running_requirement[0]}`);
    result.campus = parts.join("；");
  }

  const comments = school.additional_comments as string;
  if (comments && comments !== "[]") {
    try {
      const arr = JSON.parse(comments);
      if (Array.isArray(arr) && arr.length > 0) {
        result.student_reviews = arr.slice(0, 3).map((c: string) => c.slice(0, 150)).join(" | ");
      }
    } catch {
      if (comments.length > 10) result.student_reviews = comments.slice(0, 300);
    }
  }

  return result;
}

// Query helpers
export interface SearchFilters {
  city?: string;
  subject?: string;
  batch?: string;
  major_category?: string;
  major_keyword?: string;
  school_keyword?: string;
  tuition_max?: number;
  tuition_min?: number;
  type?: string;
  school_type?: string;
  limit?: number;
}

export function searchPrograms(filters: SearchFilters) {
  const db = getDb();
  const conditions: string[] = ["1=1"];
  const params: (string | number)[] = [];

  if (filters.city) {
    const alias = Object.hasOwn(REGION_ALIASES, filters.city) ? REGION_ALIASES[filters.city] : undefined;
    if (alias) {
      const cityConditions = alias.map(() => "s.city LIKE ?").join(" OR ");
      conditions.push(`(${cityConditions})`);
      alias.forEach(c => params.push(`%${c}%`));
    } else {
      conditions.push("s.city LIKE ?");
      params.push(`%${filters.city}%`);
    }
  }
  if (filters.subject) {
    conditions.push("a.subject = ?");
    params.push(filters.subject);
  }
  if (filters.batch) {
    conditions.push("a.batch LIKE ?");
    params.push(`%${filters.batch}%`);
  }
  if (filters.major_category) {
    conditions.push("a.major_category LIKE ?");
    params.push(`%${filters.major_category}%`);
  }
  if (filters.major_keyword) {
    conditions.push("(a.major LIKE ? OR a.major_category LIKE ?)");
    params.push(`%${filters.major_keyword}%`, `%${filters.major_keyword}%`);
  }
  if (filters.school_keyword) {
    conditions.push("a.school_name LIKE ?");
    params.push(`%${filters.school_keyword}%`);
  }
  if (filters.tuition_max) {
    conditions.push("a.tuition <= ? AND a.tuition > 0");
    params.push(filters.tuition_max);
  }
  if (filters.tuition_min) {
    conditions.push("a.tuition >= ?");
    params.push(filters.tuition_min);
  }
  if (filters.type) {
    conditions.push("a.type LIKE ?");
    params.push(`%${filters.type}%`);
  }
  if (filters.school_type) {
    conditions.push("s.tags LIKE ?");
    params.push(`%${filters.school_type}%`);
  }

  const limit = Math.min(filters.limit || 100, 200);

  const sql = `
    SELECT a.school_name, a.school_code, a.major, a.major_category, a.major_note, a.batch,
           a.plan_count, a.tuition, a.duration, a.subject, a.subject_requirement, a.type,
           s.city, s.is_985, s.is_211, s.is_double_first, s.tags, s.response_count
    FROM admissions a
    LEFT JOIN schools s ON a.school_code = s.code
    WHERE ${conditions.join(" AND ")}
    ORDER BY s.is_985 DESC, s.is_211 DESC, a.school_name, a.batch, a.major
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(...params, limit) as Record<string, unknown>[];

  // Group by school for cleaner output
  const grouped: Record<string, {
    school_name: string;
    city: string;
    tags: string;
    is_985: number;
    is_211: number;
    majors: { major: string; category: string; batch: string; plan_count: number; tuition: number; duration: number; subject: string; subject_requirement: string; type: string; note: string }[];
  }> = {};

  for (const r of rows) {
    const code = r.school_code as string;
    if (!grouped[code]) {
      grouped[code] = {
        school_name: r.school_name as string,
        city: r.city as string || "",
        tags: r.tags as string || "",
        is_985: r.is_985 as number,
        is_211: r.is_211 as number,
        majors: [],
      };
    }
    grouped[code].majors.push({
      major: r.major as string,
      category: r.major_category as string,
      batch: r.batch as string,
      plan_count: r.plan_count as number,
      tuition: r.tuition as number,
      duration: r.duration as number,
      subject: r.subject as string,
      subject_requirement: r.subject_requirement as string,
      type: r.type as string,
      note: r.major_note as string,
    });
  }

  return {
    total_results: rows.length,
    schools_count: Object.keys(grouped).length,
    schools: Object.values(grouped),
  };
}

export function getSchoolInfo(schoolName: string) {
  const db = getDb();
  const school = db
    .prepare(`SELECT * FROM schools WHERE name LIKE ? LIMIT 1`)
    .get(`%${schoolName}%`) as Record<string, unknown> | undefined;

  if (!school) return { error: `未找到名为"${schoolName}"的学校` };

  // Parse reputation data into readable format
  const reputation = summarizeReputation(school);

  const majors = db
    .prepare(
      `SELECT major, major_category, batch, plan_count, tuition, duration, subject, subject_requirement, type, major_note
       FROM admissions WHERE school_code = ? ORDER BY batch, major`
    )
    .all(school.code as string) as Record<string, unknown>[];

  // Group majors by batch
  const majorsByBatch: Record<string, unknown[]> = {};
  for (const m of majors) {
    const batch = m.batch as string;
    if (!majorsByBatch[batch]) majorsByBatch[batch] = [];
    majorsByBatch[batch].push({
      major: m.major,
      category: m.major_category,
      plan_count: m.plan_count,
      tuition: m.tuition,
      duration: m.duration,
      subject: m.subject,
      subject_requirement: m.subject_requirement,
      type: m.type,
    });
  }

  return {
    name: school.name,
    city: school.city,
    tags: school.tags || "无标签",
    is_985: school.is_985,
    is_211: school.is_211,
    total_majors: majors.length,
    total_plans: majors.reduce((sum, m) => sum + (m.plan_count as number), 0),
    reputation: Object.keys(reputation).length > 0 ? reputation : "暂无口碑数据",
    majors_by_batch: majorsByBatch,
  };
}

export function compareSchools(schoolNames: string[]) {
  const db = getDb();
  const results = [];

  for (const name of schoolNames) {
    const school = db
      .prepare(`SELECT * FROM schools WHERE name LIKE ? LIMIT 1`)
      .get(`%${name}%`) as Record<string, unknown> | undefined;

    if (!school) {
      results.push({ name, error: `未找到"${name}"` });
      continue;
    }

    const reputation = summarizeReputation(school);

    const stats = db
      .prepare(
        `SELECT
          COUNT(*) as total_majors,
          SUM(plan_count) as total_plans,
          MIN(CASE WHEN tuition > 0 THEN tuition END) as min_tuition,
          MAX(tuition) as max_tuition,
          ROUND(AVG(CASE WHEN tuition > 0 THEN tuition END)) as avg_tuition,
          GROUP_CONCAT(DISTINCT batch) as batches,
          GROUP_CONCAT(DISTINCT subject) as subjects
        FROM admissions WHERE school_code = ?`
      )
      .get(school.code as string);

    const topMajors = db
      .prepare(
        `SELECT major, major_category, plan_count, tuition, batch, subject
         FROM admissions WHERE school_code = ? ORDER BY plan_count DESC LIMIT 10`
      )
      .all(school.code as string);

    results.push({
      name: school.name,
      city: school.city,
      tags: school.tags || "无标签",
      is_985: school.is_985,
      is_211: school.is_211,
      stats,
      reputation: Object.keys(reputation).length > 0 ? reputation : "暂无口碑数据",
      top_majors: topMajors,
    });
  }

  return results;
}

export function getStatistics(dimension: string) {
  const db = getDb();

  switch (dimension) {
    case "city":
      return db
        .prepare(
          `SELECT s.city, COUNT(DISTINCT a.school_code) as school_count, COUNT(*) as major_count, SUM(a.plan_count) as total_plans
           FROM admissions a LEFT JOIN schools s ON a.school_code = s.code
           WHERE s.city != ''
           GROUP BY s.city ORDER BY school_count DESC LIMIT 30`
        )
        .all();
    case "major_category":
      return db
        .prepare(
          `SELECT major_category, COUNT(*) as count, SUM(plan_count) as total_plans, ROUND(AVG(tuition)) as avg_tuition
           FROM admissions WHERE major_category != ''
           GROUP BY major_category ORDER BY count DESC LIMIT 30`
        )
        .all();
    case "batch":
      return db
        .prepare(
          `SELECT batch, COUNT(DISTINCT school_code) as school_count, COUNT(*) as major_count, SUM(plan_count) as total_plans
           FROM admissions GROUP BY batch ORDER BY total_plans DESC`
        )
        .all();
    case "tuition":
      return db
        .prepare(
          `SELECT
            CASE
              WHEN tuition <= 5000 THEN '5000以下'
              WHEN tuition <= 8000 THEN '5001-8000'
              WHEN tuition <= 15000 THEN '8001-15000'
              WHEN tuition <= 30000 THEN '15001-30000'
              ELSE '30000以上'
            END as range,
            COUNT(*) as count
           FROM admissions WHERE tuition > 0 GROUP BY range ORDER BY MIN(tuition)`
        )
        .all();
    default:
      return db
        .prepare(
          `SELECT COUNT(DISTINCT school_code) as schools, COUNT(DISTINCT major) as majors, COUNT(*) as records, SUM(plan_count) as total_plans
           FROM admissions`
        )
        .all();
  }
}

// --- Dorm quality helpers ---
function parseDormJson(str: string | null): Record<string, string[]> | null {
  if (!str || str === '{}') return null;
  try { return JSON.parse(str); } catch { return null; }
}

function hasPositive(arr: string[] | undefined): boolean {
  if (!arr || arr.length === 0) return false;
  const first = arr[0].toLowerCase();
  return first.includes('是') || first.includes('有') || first.includes('yes') || first.includes('可以');
}

export function rankByDormQuality(filters: { city?: string; limit?: number }) {
  const db = getDb();
  const conditions: string[] = ["s.dorm_info IS NOT NULL AND s.dorm_info != '' AND s.dorm_info != '{}'"];
  const params: (string | number)[] = [];

  if (filters.city) {
    const alias = Object.hasOwn(REGION_ALIASES, filters.city) ? REGION_ALIASES[filters.city] : undefined;
    if (alias) {
      const cityConditions = alias.map(() => "s.city LIKE ?").join(" OR ");
      conditions.push(`(${cityConditions})`);
      alias.forEach(c => params.push(`%${c}%`));
    } else {
      conditions.push("s.city LIKE ?");
      params.push(`%${filters.city}%`);
    }
  }

  const limit = filters.limit || 10;

  // Get schools with dorm data
  const schools = db.prepare(`
    SELECT s.name, s.code, s.city, s.tags, s.is_985, s.is_211, s.dorm_info, s.food_info, s.campus_info, s.additional_comments, s.response_count,
           COUNT(a.id) as major_count, SUM(a.plan_count) as total_plans
    FROM schools s
    LEFT JOIN admissions a ON s.code = a.school_code
    WHERE ${conditions.join(" AND ")}
    GROUP BY s.code
    HAVING s.response_count > 0
    ORDER BY s.response_count DESC
    LIMIT ?
  `).all(...params, limit * 3) as Record<string, unknown>[];

  // Score each school's dorm quality
  const scored = schools.map(s => {
    let score = 0;
    const dormData = parseDormJson(s.dorm_info as string);
    if (dormData) {
      // Score based on key amenities
      if (hasPositive(dormData.dorm_upper_bed_lower_desk)) score += 2;
      if (hasPositive(dormData.ac_in_dorm_and_classroom)) score += 3; // AC is highly valued
      if (hasPositive(dormData.private_bathroom)) score += 3;
      if (hasPositive(dormData.hot_water_in_dorm)) score += 2;
      if (hasPositive(dormData.washing_machine)) score += 1;
    }
    const reputation = summarizeReputation(s);
    return { ...s, dorm_score: score, reputation, dorm_info: undefined, food_info: undefined, campus_info: undefined, additional_comments: undefined };
  });

  scored.sort((a, b) => b.dorm_score - a.dorm_score);
  return scored.slice(0, limit);
}
