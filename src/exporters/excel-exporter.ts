/**
 * Excel (.xlsx) 导出渲染器
 * 将 IR (ApiDocument) 转换为 Excel 工作簿（7 个 Sheet）。
 */
import * as XLSX from "xlsx";
import type { ApiDocument, ApiField } from "../types/ir";

/** 生成默认文件名 */
function getFileName(doc: ApiDocument, projectName: string): string {
  const title = projectName || doc.info.title || "api-document";
  const version = doc.info.version;
  const date = new Date().toISOString().slice(0, 10);
  return `${title}_${version}_${date}.xlsx`;
}

/** 展平字段树为行 */
function flattenFields(fields: ApiField[], location: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  function walk(f: ApiField, indent: number) {
    rows.push({
      "层级序号": "  ".repeat(indent) + f.displayIndex,
      "字段名": f.name,
      "字段路径": f.path,
      "父路径": f.parentPath,
      "位置": location,
      "类型": f.type,
      "格式": f.format || "",
      "必填": f.required ? "是" : "否",
      "描述": f.description || "",
      "默认值": f.defaultValue || "",
      "枚举值": (f.enumValues || []).join(", "),
      "示例": f.example || "",
      "示例来源": f.exampleSource || "",
      "模型引用": f.referenceName || "",
      "已截断": f.truncated ? "是" : "",
    });
    for (const c of f.children) {
      walk(c, indent + 1);
    }
  }

  for (const f of fields) {
    walk(f, 0);
  }
  return rows;
}

/** Sheet 1: 接口清单 */
function buildApiListSheet(doc: ApiDocument): Record<string, string>[] {
  return doc.operations.map((op, i) => ({
    "序号": String(i + 1),
    "模块": op.primaryTag,
    "接口名称": op.displayName,
    "接口标识": op.operationId || "",
    "请求方法": op.method,
    "请求路径": op.path,
    "描述": op.description || "",
    "请求格式": op.requestContentType || "",
    "响应格式": op.responseContentType || "",
    "已废弃": op.deprecated ? "是" : "",
  }));
}

/** Sheet 2: 请求参数 */
function buildRequestParamSheet(doc: ApiDocument): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  for (const op of doc.operations) {
    for (const p of op.parameters) {
      rows.push({
        "接口": op.operationKey,
        "参数名": p.name,
        "位置": p.location,
        "类型": p.type,
        "格式": p.format || "",
        "必填": p.required ? "是" : "否",
        "描述": p.description || "",
        "默认值": p.defaultValue || "",
        "枚举值": (p.enumValues || []).join(", "),
        "示例": p.example || "",
        "模型引用": p.referenceName || "",
      });
    }
  }
  return rows;
}

/** Sheet 3: 请求体字段 */
function buildRequestBodySheet(doc: ApiDocument): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  for (const op of doc.operations) {
    if (!op.requestBody) continue;
    const fields = flattenFields(op.requestBody.fields, "body");
    for (const f of fields) {
      rows.push({ "接口": op.operationKey, "Content-Type": op.requestBody.contentType, ...f });
    }
  }
  return rows;
}

/** Sheet 4: 响应码 */
function buildResponseCodeSheet(doc: ApiDocument): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  for (const op of doc.operations) {
    for (const r of op.responses) {
      rows.push({
        "接口": op.operationKey,
        "状态码": r.statusCode,
        "描述": r.description || "",
        "Content-Type": r.contentType || "",
        "模型引用": r.referenceName || "",
      });
    }
  }
  return rows;
}

/** Sheet 5: 响应字段 */
function buildResponseFieldSheet(doc: ApiDocument): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  for (const op of doc.operations) {
    for (const r of op.responses) {
      if (r.fields.length === 0) continue;
      const fields = flattenFields(r.fields, "response");
      for (const f of fields) {
        rows.push({ "接口": op.operationKey, "状态码": r.statusCode, ...f });
      }
    }
  }
  return rows;
}

/** Sheet 6: 数据模型 */
function buildSchemaSheet(doc: ApiDocument): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  for (const schema of doc.schemas) {
    const fields = flattenFields([schema.rootField], "model");
    for (const f of fields) {
      rows.push({ "模型名": schema.name, "模型描述": schema.description || "", ...f });
    }
  }
  return rows;
}

/** Sheet 7: 文档信息 */
function buildInfoSheet(doc: ApiDocument): Record<string, string>[] {
  return [
    { "属性": "标题", "值": doc.info.title },
    { "属性": "版本", "值": doc.info.version },
    { "属性": "描述", "值": doc.info.description || "" },
    { "属性": "规范版本", "值": doc.sourceVersion },
    { "属性": "接口数量", "值": String(doc.operations.length) },
    { "属性": "Tag 数量", "值": String(doc.tags.length) },
    { "属性": "数据模型数量", "值": String(doc.schemas.length) },
    { "属性": "服务地址", "值": doc.servers.map((s) => s.url).join(", ") },
    { "属性": "生成时间", "值": new Date().toLocaleString("zh-CN") },
    { "属性": "工具版本", "值": "Swagger/OpenAPI 文档转换工具 v1.0" },
  ];
}

/** 主导出函数 */
export async function exportToExcel(doc: ApiDocument, projectName: string, selectedTag?: string | null): Promise<void> {
  const wb = XLSX.utils.book_new();
  const filteredDoc: ApiDocument = selectedTag
    ? { ...doc, operations: doc.operations.filter((op) => op.primaryTag === selectedTag) }
    : doc;

  const sheets: [string, Record<string, string>[]][] = [
    ["文档信息", buildInfoSheet(filteredDoc)],
    ["接口清单", buildApiListSheet(filteredDoc)],
    ["请求参数", buildRequestParamSheet(filteredDoc)],
    ["请求体字段", buildRequestBodySheet(filteredDoc)],
    ["响应码", buildResponseCodeSheet(filteredDoc)],
    ["响应字段", buildResponseFieldSheet(filteredDoc)],
    ["数据模型", buildSchemaSheet(filteredDoc)],
  ];

  for (const [name, data] of sheets) {
    const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ "提示": "无数据" }]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  downloadBlob(blob, getFileName(doc, projectName));
}

/** 触发浏览器下载 */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
