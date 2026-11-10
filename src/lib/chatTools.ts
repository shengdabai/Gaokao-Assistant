import { searchPrograms, getSchoolInfo, compareSchools, getStatistics, rankByDormQuality } from "./db";

const invalid = { error: "Invalid tool arguments" };
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 200;
const stringFilters = ["city", "subject", "batch", "major_category", "major_keyword", "school_keyword", "type", "school_type"];

// Model-generated JSON is untrusted input, even when a tool schema was supplied.
export function executeToolCall(name: string, input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid;
  const args = input as Record<string, unknown>;
  switch (name) {
    case "search_programs":
    case "rank_by_dorm_quality": {
      const valid = Object.entries(args).every(([key, value]) => {
        if (key === "limit") return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 200;
        if (name === "search_programs" && ["tuition_min", "tuition_max"].includes(key)) {
          return typeof value === "number" && Number.isFinite(value) && value >= 0;
        }
        return (name === "search_programs" ? stringFilters.includes(key) : key === "city") && text(value);
      });
      if (!valid) return invalid;
      return name === "search_programs" ? searchPrograms(args) : rankByDormQuality(args);
    }
    case "get_school_info":
      return text(args.school_name) ? getSchoolInfo(args.school_name) : invalid;
    case "compare_schools":
      return Array.isArray(args.school_names) && args.school_names.length >= 2 &&
        args.school_names.length <= 5 && args.school_names.every(text) ? compareSchools(args.school_names) : invalid;
    case "get_statistics":
      return typeof args.dimension === "string" && ["city", "major_category", "batch", "tuition", "overview"].includes(args.dimension)
        ? getStatistics(args.dimension) : invalid;
    default:
      return { error: "Unknown tool" };
  }
}
