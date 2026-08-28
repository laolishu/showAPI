/**
 * P2-03 样例集转换验证脚本
 * 用法: node scripts/verify-samples.mjs
 * 逐条执行 S-01~S-06 和 E-01~E-04 样例，记录解析结果。
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_DIR = join(__dirname, "..", "example");

// 动态导入 TS 模块（通过 vite-node 或 tsx）
// 这里使用简单的 JSON/YAML 解析 + 手动调用逻辑
import * as YAML from "yaml";

function loadSpec(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const ext = filePath.split(".").pop().toLowerCase();
  if (ext === "json") {
    return JSON.parse(content);
  }
  return YAML.parse(content);
}

function detectVersion(spec) {
  if (spec.swagger === "2.0") return "swagger-2.0";
  if (spec.openapi?.startsWith("3.0")) return "openapi-3.0";
  if (spec.openapi?.startsWith("3.1")) return "openapi-3.1";
  return null;
}

function countOperations(spec) {
  if (!spec.paths) return 0;
  let count = 0;
  for (const path of Object.keys(spec.paths)) {
    const methods = ["get", "post", "put", "delete", "patch", "head", "options"];
    for (const m of methods) {
      if (spec.paths[path][m]) count++;
    }
  }
  return count;
}

function countTags(spec) {
  const tags = new Set();
  if (spec.tags) {
    for (const t of spec.tags) tags.add(t.name);
  }
  if (spec.paths) {
    for (const path of Object.keys(spec.paths)) {
      const item = spec.paths[path];
      for (const m of Object.keys(item)) {
        if (item[m].tags) {
          for (const t of item[m].tags) tags.add(t);
        }
      }
    }
  }
  return tags.size;
}

function countSchemas(spec) {
  if (spec.components?.schemas) return Object.keys(spec.components.schemas).length;
  if (spec.definitions) return Object.keys(spec.definitions).length;
  return 0;
}

function hasExternalRef(spec, str = JSON.stringify(spec)) {
  // 检测 http(s):// 或文件路径 $ref
  const refPattern = /"\$ref"\s*:\s*"(https?:\/\/|\.\/|\.\.\/|\/)/;
  return refPattern.test(str);
}

function hasCircularRef(spec) {
  // 简单检测：schema 中引用自身名称
  const schemas = spec.components?.schemas || spec.definitions || {};
  for (const [name, schema] of Object.entries(schemas)) {
    const str = JSON.stringify(schema);
    if (str.includes(`#/components/schemas/${name}`) || str.includes(`#/definitions/${name}`)) {
      return true;
    }
  }
  return false;
}

// 样例定义
const samples = [
  {
    id: "S-01",
    file: "swagger2.0.json",
    type: "standard",
    expect: { success: true, version: "swagger-2.0", minOps: 1 },
    note: "Swagger 2.0 JSON 基线",
  },
  {
    id: "S-02",
    file: "S-02-swagger2.0-params.yaml",
    type: "standard",
    expect: { success: true, version: "swagger-2.0", minOps: 1 },
    note: "Swagger 2.0 YAML 参数",
  },
  {
    id: "S-03",
    file: "S-03-openapi3.0-requestbody.json",
    type: "standard",
    expect: { success: true, version: "openapi-3.0", minOps: 1 },
    note: "OpenAPI 3.0 requestBody",
  },
  {
    id: "S-04",
    file: "S-04-openapi3.0-combined-schema.json",
    type: "standard",
    expect: { success: true, version: "openapi-3.0", minOps: 1 },
    note: "OpenAPI 3.0 allOf/oneOf/anyOf",
  },
  {
    id: "S-05",
    file: "S-05-circular-ref.json",
    type: "standard",
    expect: { success: true, version: "openapi-3.0", minOps: 1, circular: true },
    note: "循环引用保护",
  },
  {
    id: "S-06",
    file: "S-06-external-ref.json",
    type: "standard",
    expect: { success: true, version: "openapi-3.0", externalRef: true },
    note: "外部 $ref 拒绝",
  },
  {
    id: "E-01",
    file: "E-01-invalid-json.json",
    type: "error",
    expect: { success: false },
    note: "非法 JSON",
  },
  {
    id: "E-02",
    file: "E-02-missing-version.json",
    type: "error",
    expect: { success: false, reason: "version" },
    note: "缺失版本字段",
  },
  {
    id: "E-03",
    file: "E-03-no-paths.json",
    type: "error",
    expect: { success: false, reason: "paths" },
    note: "无 paths",
  },
  {
    id: "E-04",
    file: "E-04-invalid-yaml.yaml",
    type: "error",
    expect: { success: false },
    note: "非法 YAML",
  },
];

// 执行验证
console.log("=".repeat(70));
console.log("P2-03 样例集转换验证报告");
console.log(`执行时间: ${new Date().toISOString()}`);
console.log("=".repeat(70));
console.log("");

let pass = 0;
let fail = 0;
const results = [];

for (const sample of samples) {
  const filePath = join(EXAMPLE_DIR, sample.file);
  const line = { id: sample.id, file: sample.file, note: sample.note, status: "PASS", detail: "" };

  if (!existsSync(filePath)) {
    line.status = "SKIP";
    line.detail = "文件不存在";
    results.push(line);
    console.log(`⏭️  ${sample.id} [SKIP] ${sample.file} - 文件不存在`);
    continue;
  }

  try {
    const spec = loadSpec(filePath);
    const version = detectVersion(spec);
    const ops = countOperations(spec);
    const tags = countTags(spec);
    const schemas = countSchemas(spec);
    const external = hasExternalRef(spec);
    const circular = hasCircularRef(spec);

    if (sample.type === "standard") {
      // 标准样例：应成功解析
      if (!version) {
        line.status = "FAIL";
        line.detail = "无法识别规范版本";
      } else if (sample.expect.minOps && ops < sample.expect.minOps) {
        line.status = "FAIL";
        line.detail = `接口数 ${ops} < 预期 ${sample.expect.minOps}`;
      } else {
        line.detail = `版本=${version}, 接口=${ops}, Tag=${tags}, Schema=${schemas}`;
        if (circular) line.detail += ", 循环引用=是";
        if (external) line.detail += ", 外部引用=是";
      }
    } else {
      // 异常样例：应失败
      if (version && ops > 0) {
        line.status = "FAIL";
        line.detail = `预期解析失败，但成功解析（版本=${version}, 接口=${ops}）`;
      } else {
        line.detail = `正确拒绝（版本=${version || "无"}, 接口=${ops}）`;
      }
    }
  } catch (e) {
    if (sample.type === "error") {
      line.detail = `正确抛出异常: ${e.message.slice(0, 60)}`;
    } else {
      line.status = "FAIL";
      line.detail = `意外异常: ${e.message.slice(0, 60)}`;
    }
  }

  if (line.status === "PASS") pass++;
  else if (line.status === "FAIL") fail++;

  results.push(line);
  const icon = line.status === "PASS" ? "✅" : line.status === "FAIL" ? "❌" : "⏭️";
  console.log(`${icon} ${sample.id} [${line.status}] ${sample.file} - ${line.detail}`);
}

console.log("");
console.log("-".repeat(70));
console.log(`总计: ${pass} 通过, ${fail} 失败, ${results.length - pass - fail} 跳过`);
console.log("-".repeat(70));

// 输出 JSON 报告
const report = {
  timestamp: new Date().toISOString(),
  total: results.length,
  pass,
  fail,
  skip: results.length - pass - fail,
  results,
};

console.log("");
console.log("JSON 报告:");
console.log(JSON.stringify(report, null, 2));

process.exit(fail > 0 ? 1 : 0);
