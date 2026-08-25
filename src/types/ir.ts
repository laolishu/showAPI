/**
 * 统一 API 中间模型（IR）类型定义
 * 这是解析层与渲染层之间的唯一契约。
 */

/** 规范版本标识 */
export type SpecVersion = "swagger-2.0" | "openapi-3.0" | "openapi-3.1";

/** 参数位置 */
export type ParamLocation = "path" | "query" | "header" | "cookie" | "body" | "response";

/** 示例来源 */
export type ExampleSource = "explicit" | "default" | "derived" | "none";

/** API 文档信息 */
export interface ApiInfo {
  title: string;
  version: string;
  description?: string;
  contact?: { name?: string; url?: string; email?: string };
  license?: { name?: string; url?: string };
}

/** API Tag */
export interface ApiTag {
  name: string;
  description?: string;
}

/** 服务地址 */
export interface ApiServer {
  url: string;
  description?: string;
}

/** 参数（非请求体） */
export interface ApiParameter {
  name: string;
  location: ParamLocation;
  type: string;
  format?: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
  enumValues?: string[];
  example?: string;
  exampleSource?: ExampleSource;
  /** 如果参数引用了 Schema */
  referenceName?: string;
  /** 展开后的字段树（如果参数有 schema） */
  children?: ApiField[];
}

/** 请求体 */
export interface ApiRequestBody {
  contentType: string;
  required?: boolean;
  description?: string;
  /** 展开后的字段树 */
  fields: ApiField[];
  /** 示例 */
  example?: string;
  exampleSource?: ExampleSource;
}

/** 响应 */
export interface ApiResponse {
  statusCode: string;
  description?: string;
  contentType?: string;
  /** 展开后的字段树 */
  fields: ApiField[];
  /** 引用的模型名 */
  referenceName?: string;
  /** 示例 */
  example?: string;
  exampleSource?: ExampleSource;
}

/** 字段节点（用于请求体、响应体和数据模型） */
export interface ApiField {
  /** 当前层字段名 */
  name: string;
  /** 用于 Word 的层级编号，例如 2.3.1 */
  displayIndex: string;
  /** 语义字段路径，例如 data.records[].customsCode */
  path: string;
  /** 父级语义路径；根字段为空 */
  parentPath: string;
  /** 从根开始的层级深度 */
  depth: number;
  /** 位置 */
  location: ParamLocation;
  /** 标准化类型 */
  type: string;
  /** 可选格式 */
  format?: string;
  /** 是否必填 */
  required: boolean;
  /** 描述 */
  description?: string;
  /** 默认值 */
  defaultValue?: string;
  /** 枚举选项 */
  enumValues?: string[];
  /** 示例值 */
  example?: string;
  /** 示例来源 */
  exampleSource?: ExampleSource;
  /** $ref 或模型引用名称 */
  referenceName?: string;
  /** 嵌套子字段 */
  children: ApiField[];
  /** 是否因循环引用或深度限制而停止展开 */
  truncated?: boolean;
  /** 组合 Schema 信息（oneOf/anyOf） */
  comboType?: "oneOf" | "anyOf";
  comboCandidates?: string[];
}

/** 可复用数据模型 */
export interface ApiSchema {
  name: string;
  description?: string;
  /** 根字段树 */
  rootField: ApiField;
}

/** 接口操作 */
export interface ApiOperation {
  /** 唯一键：METHOD + " " + PATH */
  operationKey: string;
  method: string;
  path: string;
  /** 显示名称：summary → operationId → METHOD+PATH */
  displayName: string;
  /** 原始 operationId */
  operationId?: string;
  /** 主分组 Tag */
  primaryTag: string;
  /** 描述 */
  description?: string;
  /** 是否弃用 */
  deprecated: boolean;
  /** 非请求体参数 */
  parameters: ApiParameter[];
  /** 请求体（可能为空） */
  requestBody?: ApiRequestBody;
  /** 响应列表 */
  responses: ApiResponse[];
  /** 请求 Content-Type */
  requestContentType?: string;
  /** 响应 Content-Type */
  responseContentType?: string;
}

/** IR 根对象 */
export interface ApiDocument {
  info: ApiInfo;
  sourceVersion: SpecVersion;
  servers: ApiServer[];
  tags: ApiTag[];
  operations: ApiOperation[];
  schemas: ApiSchema[];
}

/** 解析结果 */
export interface ParseResult {
  success: boolean;
  document?: ApiDocument;
  error?: string;
  /** 警告信息（非致命） */
  warnings?: string[];
}
