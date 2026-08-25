/**
 * Swagger 2.0 / OpenAPI 3.0 → IR 解析器
 * 将原始规范对象转换为统一的 ApiDocument 中间模型。
 */
import * as YAML from "yaml";
import type {
  ApiDocument,
  ApiInfo,
  ApiTag,
  ApiServer,
  ApiOperation,
  ApiParameter,
  ApiRequestBody,
  ApiResponse,
  ApiSchema,
  SpecVersion,
  ParseResult,
  ParamLocation,
} from "../types/ir";
import { buildFieldTree, buildRootField } from "./schema-utils";

/** 检测规范版本 */
function detectVersion(spec: Record<string, any>): SpecVersion | null {
  if (spec.swagger === "2.0") return "swagger-2.0";
  if (spec.openapi?.startsWith("3.0")) return "openapi-3.0";
  if (spec.openapi?.startsWith("3.1")) return "openapi-3.1";
  return null;
}

/** 提取 info */
function extractInfo(spec: Record<string, any>): ApiInfo {
  const info = spec.info || {};
  return {
    title: info.title || "API 文档",
    version: info.version || "1.0.0",
    description: info.description || "",
    contact: info.contact,
    license: info.license,
  };
}

/** 提取 tags */
function extractTags(spec: Record<string, any>): ApiTag[] {
  if (!Array.isArray(spec.tags)) return [];
  return spec.tags.map((t: any) => ({
    name: t.name || "未命名",
    description: t.description || "",
  }));
}

/** 提取 servers */
function extractServers(spec: Record<string, any>, version: SpecVersion): ApiServer[] {
  if (version === "swagger-2.0") {
    // Swagger 2.0 使用 host + basePath + schemes
    const host = spec.host || "";
    const basePath = spec.basePath || "";
    const schemes: string[] = spec.schemes || ["https"];
    if (!host) return [];
    const url = `${schemes[0]}://${host}${basePath}`;
    return [{ url, description: "从 host/basePath/schemes 推导" }];
  }
  if (Array.isArray(spec.servers)) {
    return spec.servers.map((s: any) => ({
      url: s.url || "",
      description: s.description || "",
    }));
  }
  return [];
}

/** 获取参数位置 */
function getParamLocation(param: any, version: SpecVersion): ParamLocation {
  if (version === "swagger-2.0") {
    const in_ = param.in;
    if (in_ === "body") return "body";
    if (in_ === "formData") return "body";
    return (in_ as ParamLocation) || "query";
  }
  return (param.in as ParamLocation) || "query";
}

/** 获取参数类型 */
function getParamType(param: any, version: SpecVersion): { type: string; format?: string; refName?: string } {
  if (version === "swagger-2.0") {
    if (param.schema?.$ref) {
      const refName = param.schema.$ref.split("/").pop() || "";
      return { type: "object", refName };
    }
    if (param.type === "array" && param.items) {
      const itemType = param.items.type || "string";
      const itemRef = param.items.$ref ? param.items.$ref.split("/").pop() : undefined;
      return { type: `array<${itemRef || itemType}>` };
    }
    return { type: param.type || "string", format: param.format };
  }
  // OpenAPI 3.0
  const schema = param.schema;
  if (!schema) return { type: "string" };
  if (schema.$ref) {
    const refName = schema.$ref.split("/").pop() || "";
    return { type: "object", refName };
  }
  if (schema.type === "array" && schema.items) {
    const itemType = schema.items.type || "string";
    const itemRef = schema.items.$ref ? schema.items.$ref.split("/").pop() : undefined;
    return { type: `array<${itemRef || itemType}>` };
  }
  return { type: schema.type || "string", format: schema.format };
}

/** 构建参数列表 */
function buildParameters(
  pathParams: any[],
  opParams: any[],
  version: SpecVersion,
  spec: Record<string, any>
): ApiParameter[] {
  const allParams = [...pathParams, ...opParams];
  const result: ApiParameter[] = [];

  for (const param of allParams) {
    if (param.$ref) {
      // 解析 $ref 参数
      const parts = param.$ref.slice(2).split("/");
      let node: any = spec;
      for (const p of parts) {
        if (node == null) break;
        node = node[p];
      }
      if (node) {
        result.push(buildSingleParam(node, version, spec));
      }
      continue;
    }
    result.push(buildSingleParam(param, version, spec));
  }
  return result;
}

function buildSingleParam(param: any, version: SpecVersion, spec: Record<string, any>): ApiParameter {
  const location = getParamLocation(param, version);
  const typeInfo = getParamType(param, version);

  const p: ApiParameter = {
    name: param.name || "",
    location,
    type: typeInfo.type,
    format: typeInfo.format,
    required: param.required === true,
    description: param.description || "",
    defaultValue: param.default != null ? String(param.default) : undefined,
    enumValues: Array.isArray(param.enum) ? param.enum.map(String) : undefined,
    example: param.example != null ? String(param.example) : undefined,
    referenceName: typeInfo.refName,
  };

  // 如果参数有 schema 且是对象类型，展开字段
  const schema = version === "swagger-2.0" ? param.schema : param.schema;
  if (schema && (schema.properties || schema.$ref || schema.allOf)) {
    p.children = buildFieldTree(schema, location, spec);
  }

  return p;
}

/** 构建请求体（Swagger 2.0: body/formData 参数; OpenAPI 3.0: requestBody） */
function buildRequestBody(
  op: any,
  pathObj: any,
  version: SpecVersion,
  spec: Record<string, any>
): ApiRequestBody | undefined {
  if (version === "swagger-2.0") {
    // 查找 body 参数
    const allParams = [...(pathObj.parameters || []), ...(op.parameters || [])];
    const bodyParam = allParams.find((p: any) => p.in === "body" && !p.$ref);
    const bodyParamRef = allParams.find((p: any) => p.in === "body" && p.$ref);

    let schema: any = null;
    let contentType = "application/json";
    let required = false;
    let description = "";

    if (bodyParam) {
      schema = bodyParam.schema;
      required = bodyParam.required === true;
      description = bodyParam.description || "";
      // 获取 consumes
      const consumes = op.consumes || pathObj.consumes || spec.consumes;
      if (Array.isArray(consumes) && consumes.length > 0) {
        contentType = consumes[0];
      }
    } else if (bodyParamRef) {
      // 解析 $ref
      const parts = bodyParamRef.$ref.slice(2).split("/");
      let node: any = spec;
      for (const p of parts) {
        if (node == null) break;
        node = node[p];
      }
      if (node) {
        schema = node.schema;
        required = node.required === true;
        description = node.description || "";
      }
    }

    // 查找 formData 参数
    const formDataParams = allParams.filter((p: any) => p.in === "formData" && !p.$ref);
    if (formDataParams.length > 0 && !schema) {
      contentType = "multipart/form-data";
      // 将 formData 参数转为字段
      const fields = formDataParams.map((fp: any, i: number) => {
        const typeInfo = getParamType(fp, version);
        return {
          name: fp.name,
          displayIndex: String(i + 1),
          path: fp.name,
          parentPath: "",
          depth: 0,
          location: "body" as const,
          type: typeInfo.type,
          format: typeInfo.format,
          required: fp.required === true,
          description: fp.description || "",
          defaultValue: fp.default != null ? String(fp.default) : undefined,
          enumValues: Array.isArray(fp.enum) ? fp.enum.map(String) : undefined,
          example: fp.example != null ? String(fp.example) : undefined,
          children: [],
          referenceName: typeInfo.refName,
        };
      });
      return { contentType, required, description, fields, example: undefined };
    }

    if (!schema) return undefined;

    const fields = buildFieldTree(schema, "body", spec);
    return { contentType, required, description, fields };
  }

  // OpenAPI 3.0
  const rb = op.requestBody;
  if (!rb) return undefined;

  const content = rb.content || {};
  const contentTypes = Object.keys(content);
  if (contentTypes.length === 0) return undefined;

  const contentType = contentTypes[0];
  const mediaType = content[contentType];
  const schema = mediaType?.schema;

  if (!schema) {
    return {
      contentType,
      required: rb.required === true,
      description: rb.description || "",
      fields: [],
    };
  }

  const fields = buildFieldTree(schema, "body", spec);
  let example: string | undefined;
  let exampleSource: "explicit" | "default" | "derived" | undefined;

  if (mediaType.example != null) {
    example = typeof mediaType.example === "string" ? mediaType.example : JSON.stringify(mediaType.example);
    exampleSource = "explicit";
  } else if (mediaType.examples) {
    const first = Object.values(mediaType.examples)[0] as any;
    if (first?.value != null) {
      example = typeof first.value === "string" ? first.value : JSON.stringify(first.value);
      exampleSource = "explicit";
    }
  }

  return {
    contentType,
    required: rb.required === true,
    description: rb.description || "",
    fields,
    example,
    exampleSource,
  };
}

/** 构建响应列表 */
function buildResponses(
  op: any,
  version: SpecVersion,
  spec: Record<string, any>
): { responses: ApiResponse[]; responseContentType?: string } {
  const responses: ApiResponse[] = [];
  let responseContentType: string | undefined;

  const respMap = op.responses || {};
  const statusCodes = Object.keys(respMap).sort();

  for (const code of statusCodes) {
    const resp = respMap[code];
    if (resp.$ref) {
      // 解析 $ref 响应
      const parts = resp.$ref.slice(2).split("/");
      let node: any = spec;
      for (const p of parts) {
        if (node == null) break;
        node = node[p];
      }
      if (node) {
        responses.push(buildSingleResponse(code, node, version, spec, responseContentType));
      }
      continue;
    }

    const result = buildSingleResponse(code, resp, version, spec, responseContentType);
    responses.push(result);
    if (!responseContentType && result.contentType) {
      responseContentType = result.contentType;
    }
  }

  return { responses, responseContentType };
}

function buildSingleResponse(
  code: string,
  resp: any,
  version: SpecVersion,
  spec: Record<string, any>,
  _existingCt?: string
): ApiResponse {
  const description = resp.description || "";
  let contentType: string | undefined;
  let fields: any[] = [];
  let referenceName: string | undefined;
  let example: string | undefined;
  let exampleSource: "explicit" | "default" | "derived" | undefined;

  if (version === "swagger-2.0") {
    // Swagger 2.0: resp.schema
    const schema = resp.schema;
    if (schema) {
      if (schema.$ref) {
        referenceName = schema.$ref.split("/").pop();
      }
      fields = buildFieldTree(schema, "response", spec);
    }
    // produces
    const produces = resp.produces;
    if (Array.isArray(produces) && produces.length > 0) {
      contentType = produces[0];
    }
  } else {
    // OpenAPI 3.0: resp.content
    const content = resp.content || {};
    const contentTypes = Object.keys(content);
    if (contentTypes.length > 0) {
      contentType = contentTypes[0];
      const mediaType = content[contentType];
      const schema = mediaType?.schema;
      if (schema) {
        if (schema.$ref) {
          referenceName = schema.$ref.split("/").pop();
        }
        fields = buildFieldTree(schema, "response", spec);
      }
      if (mediaType?.example != null) {
        example = typeof mediaType.example === "string" ? mediaType.example : JSON.stringify(mediaType.example);
        exampleSource = "explicit";
      }
    }
  }

  return {
    statusCode: code,
    description,
    contentType,
    fields,
    referenceName,
    example,
    exampleSource,
  };
}

/** 构建数据模型列表 */
function buildSchemas(spec: Record<string, any>, version: SpecVersion): ApiSchema[] {
  const schemas: ApiSchema[] = [];

  let schemaMap: Record<string, any> = {};
  if (version === "swagger-2.0") {
    schemaMap = spec.definitions || {};
  } else {
    schemaMap = spec.components?.schemas || {};
  }

  for (const [name, schema] of Object.entries(schemaMap)) {
    if (!schema || typeof schema !== "object") continue;
    const rootField = buildRootField(schema, spec, name);
    schemas.push({
      name,
      description: schema.description || "",
      rootField,
    });
  }

  return schemas;
}

/** 主解析函数 */
export function parseToIR(rawText: string, format: "json" | "yaml"): ParseResult {
  // 1. 解析文本为对象
  let spec: Record<string, any>;
  try {
    if (format === "json") {
      spec = JSON.parse(rawText);
    } else {
      // 使用 yaml 包解析（兼容 JSON）
      spec = YAML.parse(rawText);
    }
  } catch (e: any) {
    return {
      success: false,
      error: `文档解析失败：${e.message || "无效的 JSON/YAML 格式"}`,
    };
  }

  if (!spec || typeof spec !== "object") {
    return { success: false, error: "文档内容无效，不是有效的 JSON/YAML 对象" };
  }

  // 2. 检测版本
  const version = detectVersion(spec);
  if (!version) {
    return {
      success: false,
      error: "无法识别规范版本。请确认文档包含 swagger: \"2.0\" 或 openapi: \"3.0.x\" 字段。",
    };
  }

  // 3. 检查 paths
  if (!spec.paths || typeof spec.paths !== "object") {
    return {
      success: false,
      error: "文档缺少 paths 字段，无法提取接口信息。",
    };
  }

  const warnings: string[] = [];

  // 4. 构建 IR
  const info = extractInfo(spec);
  const tags = extractTags(spec);
  const servers = extractServers(spec, version);
  const operations: ApiOperation[] = [];

  const httpMethods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

  for (const [path, pathObj] of Object.entries(spec.paths)) {
    if (!pathObj || typeof pathObj !== "object") continue;

    const pathParams: any[] = (pathObj as any).parameters || [];

    for (const method of httpMethods) {
      const op = (pathObj as any)[method];
      if (!op) continue;

      const methodUpper = method.toUpperCase();
      const operationKey = `${methodUpper} ${path}`;

      // 显示名称
      const displayName = op.summary || op.operationId || `${methodUpper} ${path}`;

      // 主 Tag
      const opTags: string[] = op.tags || [];
      const primaryTag = opTags.length > 0 ? opTags[0] : "未分组";

      // 参数
      const parameters = buildParameters(pathParams, op.parameters || [], version, spec);

      // 请求体
      const requestBody = buildRequestBody(op, pathObj, version, spec);

      // 响应
      const { responses, responseContentType } = buildResponses(op, version, spec);

      // 请求 Content-Type
      let requestContentType: string | undefined;
      if (version === "swagger-2.0") {
        const consumes = op.consumes || (pathObj as any).consumes || spec.consumes;
        if (Array.isArray(consumes) && consumes.length > 0) {
          requestContentType = consumes[0];
        }
      } else if (requestBody) {
        requestContentType = requestBody.contentType;
      }

      operations.push({
        operationKey,
        method: methodUpper,
        path,
        displayName,
        operationId: op.operationId || undefined,
        primaryTag,
        description: op.description || "",
        deprecated: op.deprecated === true,
        parameters,
        requestBody,
        responses,
        requestContentType,
        responseContentType,
      });
    }
  }

  // 5. 排序：先按 primaryTag，再按 path，最后按 method
  const methodOrder: Record<string, number> = {
    GET: 0, HEAD: 1, OPTIONS: 2, PUT: 3, POST: 4, PATCH: 5, DELETE: 6, TRACE: 7,
  };
  operations.sort((a, b) => {
    if (a.primaryTag !== b.primaryTag) return a.primaryTag.localeCompare(b.primaryTag);
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return (methodOrder[a.method] ?? 9) - (methodOrder[b.method] ?? 9);
  });

  // 6. 数据模型
  const schemas = buildSchemas(spec, version);

  // 7. 性能检查
  if (operations.length > 300) {
    warnings.push(`接口数量（${operations.length}）超过 300，导出可能需要较长时间。`);
  }

  const document: ApiDocument = {
    info,
    sourceVersion: version,
    servers,
    tags,
    operations,
    schemas,
  };

  return { success: true, document, warnings };
}
