/**
 * Schema 字段树构建工具
 * 负责将 Swagger/OpenAPI Schema 展开为 ApiField 树，
 * 包含 $ref 解析、循环引用保护、allOf/oneOf/anyOf 处理。
 */
import type { ApiField, ParamLocation, ExampleSource } from "../types/ir";

/** 最大展开深度 */
const MAX_DEPTH = 8;

/** 构建上下文 */
interface BuildContext {
  /** 完整的规范对象（未解引用） */
  spec: Record<string, any>;
  /** 当前访问栈（用于循环引用检测） */
  accessStack: Set<string>;
}

/** 解析 $ref 路径，返回 schema 和名称 */
function resolveRef(ref: string, spec: Record<string, any>): { schema: any; name: string } | null {
  if (!ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  let node: any = spec;
  for (const part of parts) {
    if (node == null || typeof node !== "object") return null;
    node = node[part];
  }
  if (node == null) return null;
  const name = parts[parts.length - 1];
  return { schema: node, name };
}

/** 判断是否为外部 $ref */
function isExternalRef(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("file:");
}

/** 将值转为字符串表示 */
function valueToString(val: any): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

/** 提取示例值 */
function extractExample(schema: any): { example?: string; source?: ExampleSource } {
  if (schema.example != null) {
    return { example: valueToString(schema.example), source: "explicit" };
  }
  if (schema.examples && typeof schema.examples === "object") {
    const first = Object.values(schema.examples)[0] as any;
    if (first?.value != null) {
      return { example: valueToString(first.value), source: "explicit" };
    }
  }
  if (schema.default != null) {
    return { example: valueToString(schema.default), source: "default" };
  }
  return {};
}

/** 标准化类型文本 */
function normalizeType(type: string, format?: string, refName?: string): string {
  if (refName) {
    if (type === "array") return `array<${refName}>`;
    return `object<${refName}>`;
  }
  switch (type) {
    case "integer":
      return format ? `integer<${format}>` : "integer";
    case "number":
      return format ? `number<${format}>` : "number";
    case "boolean":
      return "boolean";
    case "string":
      return format ? `string<${format}>` : "string";
    case "array":
      return "array";
    case "object":
      return "object";
    default:
      return type || "unknown";
  }
}

/**
 * 构建单个字段节点
 */
function buildField(
  schema: any,
  name: string,
  location: ParamLocation,
  depth: number,
  parentPath: string,
  displayIndex: string,
  required: boolean,
  ctx: BuildContext,
  refName?: string
): ApiField {
  const field: ApiField = {
    name,
    displayIndex,
    path: parentPath ? `${parentPath}.${name}` : name,
    parentPath,
    depth,
    location,
    type: "unknown",
    required,
    description: schema.description || "",
    defaultValue: schema.default != null ? valueToString(schema.default) : undefined,
    enumValues: Array.isArray(schema.enum) ? schema.enum.map(valueToString) : undefined,
    children: [],
    referenceName: refName,
  };

  // 提取示例
  const ex = extractExample(schema);
  if (ex.example) {
    field.example = ex.example;
    field.exampleSource = ex.source;
  }

  // 处理 $ref
  if (schema.$ref) {
    if (isExternalRef(schema.$ref)) {
      field.type = "external-ref";
      field.description = (field.description ? field.description + " " : "") + `外部引用: ${schema.$ref}`;
      field.truncated = true;
      return field;
    }
    const resolved = resolveRef(schema.$ref, ctx.spec);
    if (!resolved) {
      field.type = "unknown";
      field.referenceName = schema.$ref.split("/").pop() || schema.$ref;
      return field;
    }
    const { schema: refSchema, name: resolvedName } = resolved;

    // 循环引用检测
    if (ctx.accessStack.has(resolvedName)) {
      field.type = normalizeType(refSchema.type || "object", refSchema.format, resolvedName);
      field.referenceName = resolvedName;
      field.truncated = true;
      field.description = (field.description ? field.description + " " : "") + `（循环引用，已停止展开）`;
      return field;
    }

    // 深度限制
    if (depth >= MAX_DEPTH) {
      field.type = normalizeType(refSchema.type || "object", refSchema.format, resolvedName);
      field.referenceName = resolvedName;
      field.truncated = true;
      field.description = (field.description ? field.description + " " : "") + `（超过最大展开深度，已停止）`;
      return field;
    }

    // 将 ref 名称加入访问栈
    ctx.accessStack.add(resolvedName);
    const child = buildField(
      refSchema,
      name,
      location,
      depth + 1,
      field.path,
      displayIndex,
      required,
      ctx,
      resolvedName
    );
    ctx.accessStack.delete(resolvedName);

    // 合并子字段（ref 展开后的 children）
    field.children = child.children;
    field.type = child.type;
    field.format = child.format;
    field.referenceName = resolvedName;
    // 保留 ref schema 的描述（如果当前没有）
    if (!field.description && child.description) {
      field.description = child.description;
    }
    return field;
  }

  const type = schema.type || (schema.properties ? "object" : schema.items ? "array" : "object");

  // 处理 allOf
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    field.type = "object";
    let childIdx = 0;
    for (const sub of schema.allOf) {
      if (sub.$ref && isExternalRef(sub.$ref)) {
        childIdx++;
        const extField = buildField(sub, `allOf[${childIdx}]`, location, depth + 1, field.path, `${displayIndex ? displayIndex + "." : ""}${childIdx}`, required, ctx);
        field.children.push(extField);
        continue;
      }
      const subResolved = sub.$ref ? resolveRef(sub.$ref, ctx.spec) : null;
      const subSchema = subResolved ? subResolved.schema : sub;
      const subName = subResolved ? subResolved.name : `allOf[${childIdx}]`;

      if (subResolved && ctx.accessStack.has(subName)) {
        childIdx++;
        const truncField: ApiField = {
          name: subName,
          displayIndex: `${displayIndex ? displayIndex + "." : ""}${childIdx}`,
          path: `${field.path}.${subName}`,
          parentPath: field.path,
          depth: depth + 1,
          location,
          type: "object",
          required,
          description: "（循环引用，已停止展开）",
          children: [],
          referenceName: subName,
          truncated: true,
        };
        field.children.push(truncField);
        continue;
      }

      if (subResolved) ctx.accessStack.add(subName);
      const subField = buildField(
        subSchema,
        subName,
        location,
        depth + 1,
        field.path,
        `${displayIndex ? displayIndex + "." : ""}${childIdx}`,
        required,
        ctx,
        subResolved ? subName : undefined
      );
      if (subResolved) ctx.accessStack.delete(subName);

      // allOf 合并：将子字段提升到当前层级
      if (subField.children.length > 0) {
        for (const c of subField.children) {
          field.children.push(c);
        }
      } else {
        field.children.push(subField);
      }
      childIdx++;
    }
    // 合并 schema 自身的 properties
    if (schema.properties) {
      const propNames = Object.keys(schema.properties);
      const reqList: string[] = schema.required || [];
      for (const pn of propNames) {
        const pf = buildField(
          schema.properties[pn],
          pn,
          location,
          depth + 1,
          field.path,
          `${displayIndex}.${childIdx + 1}`,
          reqList.includes(pn),
          ctx
        );
        field.children.push(pf);
        childIdx++;
      }
    }
    return field;
  }

  // 处理 oneOf / anyOf
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    field.type = "object";
    field.comboType = "oneOf";
    const candidates = schema.oneOf.map((s: any) => {
      if (s.$ref) return s.$ref.split("/").pop() || s.$ref;
      return "inline";
    });
    field.comboCandidates = candidates;
    field.description = (field.description ? field.description + " " : "") +
      `（oneOf: ${candidates.join(" | ")}）`;
    return field;
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    field.type = "object";
    field.comboType = "anyOf";
    const candidates = schema.anyOf.map((s: any) => {
      if (s.$ref) return s.$ref.split("/").pop() || s.$ref;
      return "inline";
    });
    field.comboCandidates = candidates;
    field.description = (field.description ? field.description + " " : "") +
      `（anyOf: ${candidates.join(" | ")}）`;
    return field;
  }

  // 处理 array
  if (type === "array") {
    const itemType = schema.items?.type || (schema.items?.$ref ? "object" : "string");
    const itemRefName = schema.items?.$ref ? schema.items.$ref.split("/").pop() : undefined;
    field.type = `array<${normalizeType(itemType, schema.items?.format, itemRefName)}>`;

    if (schema.items && depth < MAX_DEPTH) {
      // 数组元素不占独立编号层：复用数组本身的编号，
      // 使元素对象属性直接编为 2.1、2.2、2.3（而非 2.1.1）
      const itemField = buildField(
        schema.items,
        "[]",
        location,
        depth + 1,
        field.path,
        displayIndex,
        required,
        ctx,
        itemRefName
      );
      if (itemField.children.length > 0) {
        field.children = itemField.children;
      }
    }
    return field;
  }

  // 处理 object（有 properties）
  if (type === "object" || schema.properties) {
    field.type = refName ? `object<${refName}>` : "object";
    const propNames = Object.keys(schema.properties || {});
    const reqList: string[] = schema.required || [];

    for (let i = 0; i < propNames.length; i++) {
      const pn = propNames[i];
      const propSchema = schema.properties[pn];
      const propRefName = propSchema?.$ref ? propSchema.$ref.split("/").pop() : undefined;
      const childField = buildField(
        propSchema,
        pn,
        location,
        depth + 1,
        field.path,
        `${displayIndex ? displayIndex + "." : ""}${i + 1}`,
        reqList.includes(pn),
        ctx,
        propRefName
      );
      field.children.push(childField);
    }
    return field;
  }

  // 基础类型
  field.type = normalizeType(type, schema.format, refName);
  return field;
}

/**
 * 从 Schema 构建完整的字段树
 */
export function buildFieldTree(
  schema: any,
  location: ParamLocation,
  spec: Record<string, any>,
  rootName?: string
): ApiField[] {
  if (!schema) return [];

  const ctx: BuildContext = { spec, accessStack: new Set() };

  // 如果 schema 本身是 $ref
  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, spec);
    if (resolved) {
      ctx.accessStack.add(resolved.name);
      const root = buildField(
        resolved.schema,
        rootName || resolved.name,
        location,
        0,
        "",
        "",
        true,
        ctx,
        resolved.name
      );
      ctx.accessStack.delete(resolved.name);
      return root.children.length > 0 ? root.children : [root];
    }
  }

  // 如果 schema 有 properties（对象）
  if (schema.properties || schema.allOf || schema.oneOf || schema.anyOf) {
    const root = buildField(
      schema,
      rootName || "root",
      location,
      0,
      "",
      "",
      true,
      ctx
    );
    return root.children.length > 0 ? root.children : [root];
  }

  // 基础类型
  const root = buildField(schema, rootName || "value", location, 0, "", "", true, ctx);
  return [root];
}

/**
 * 从 Schema 构建单个根字段（用于数据模型附录）
 */
export function buildRootField(
  schema: any,
  spec: Record<string, any>,
  name: string
): ApiField {
  const ctx: BuildContext = { spec, accessStack: new Set() };
  return buildField(schema, name, "body", 0, "", "1", false, ctx, name);
}
