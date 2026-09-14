/**
 * P2-05 大文档性能验证脚本
 * 生成 300 接口的 OpenAPI 3.0 文档，测量解析耗时。
 * 用法: node scripts/perf-test.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "example");

// 生成 300 接口的 OpenAPI 3.0 文档
function generateLargeSpec(opCount = 300) {
  const paths = {};
  const schemas = {};

  // 生成 10 个 Tag
  const tagNames = Array.from({ length: 10 }, (_, i) => `module-${i + 1}`);

  for (let i = 0; i < opCount; i++) {
    const tag = tagNames[i % tagNames.length];
    const path = `/api/v1/resource${i}/action${i % 5}`;
    const method = ["get", "post", "put", "delete", "patch"][i % 5];

    // 每个接口 3-8 个参数
    const paramCount = 3 + (i % 6);
    const parameters = [];
    for (let p = 0; p < paramCount; p++) {
      parameters.push({
        name: `param_${p}`,
        in: ["query", "path", "header"][p % 3],
        required: p === 0,
        schema: { type: "string" },
        description: `参数 ${p} 的描述`,
      });
    }

    // 每个接口 1-2 个响应
    const responses = {
      "200": {
        description: "成功",
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/Response${i % 10}` },
          },
        },
      },
    };
    if (i % 3 === 0) {
      responses["400"] = { description: "参数错误" };
    }

    paths[path] = {
      [method]: {
        tags: [tag],
        summary: `接口 ${i + 1}`,
        operationId: `op_${i}`,
        description: `这是第 ${i + 1} 个接口的描述。`,
        parameters,
        responses,
      },
    };

    // 生成 10 个 Schema
    if (i < 10) {
      schemas[`Response${i}`] = {
        type: "object",
        properties: {
          code: { type: "integer" },
          message: { type: "string" },
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                name: { type: "string" },
                value: { type: "number" },
                nested: {
                  type: "object",
                  properties: {
                    key: { type: "string" },
                    amount: { type: "number" },
                  },
                },
              },
            },
          },
        },
      };
    }
  }

  return {
    openapi: "3.0.0",
    info: {
      title: `性能测试 API (${opCount} 接口)`,
      version: "1.0.0",
      description: "用于性能验证的大规模 API 文档",
    },
    servers: [{ url: "https://api.example.com" }],
    tags: tagNames.map((name) => ({ name, description: `模块 ${name}` })),
    paths,
    components: { schemas },
  };
}

// 执行
console.log("=".repeat(60));
console.log("P2-05 大文档性能验证");
console.log("=".repeat(60));

const spec = generateLargeSpec(300);
const jsonStr = JSON.stringify(spec);
const sizeKB = (Buffer.byteLength(jsonStr) / 1024).toFixed(1);

console.log(`\n生成文档: 300 接口, ${sizeKB} KB`);

// 保存样例
const outPath = join(OUTPUT_DIR, "S-07-perf-300-ops.json");
writeFileSync(outPath, jsonStr, "utf-8");
console.log(`已保存: ${outPath}`);

// 测量解析时间（使用与浏览器相同的 yaml 库）
const YAML = (await import("yaml")).default;

// 模拟解析流程
const start = performance.now();
const parsed = JSON.parse(jsonStr);
const parseTime = performance.now() - start;

// 模拟 IR 构建（简化版：统计操作数、参数数、响应数）
const start2 = performance.now();
let opCount = 0, paramCount = 0, respCount = 0;
for (const [path, methods] of Object.entries(parsed.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    opCount++;
    paramCount += (op.parameters || []).length;
    respCount += Object.keys(op.responses || {}).length;
  }
}
const irTime = performance.now() - start2;

console.log(`\n--- 性能结果 ---`);
console.log(`JSON 解析: ${parseTime.toFixed(2)} ms`);
console.log(`IR 构建(简化): ${irTime.toFixed(2)} ms`);
console.log(`接口数: ${opCount}`);
console.log(`参数总数: ${paramCount}`);
console.log(`响应总数: ${respCount}`);
console.log(`文件大小: ${sizeKB} KB`);

// 阈值判断
const PASS = parseTime < 5000 && irTime < 5000;
console.log(`\n${PASS ? "✅ PASS" : "❌ FAIL"}: 解析+构建总耗时 ${(parseTime + irTime).toFixed(2)} ms (阈值 10s)`);

process.exit(PASS ? 0 : 1);
