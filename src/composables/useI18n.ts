import { ref, computed } from "vue";

type Lang = "zh" | "en";

const zh = {
  title: "Swagger / OpenAPI 文档转换工具",
  subtitle: "纯前端 · 本地处理 · 不上传文档",
  step1: "① 导入 API 文档",
  dragHint: "拖拽文件到此处，或点击选择文件",
  dragSub: "支持 Swagger 2.0 / OpenAPI 3.0 · JSON / YAML · 最大 10 MB",
  pasteLabel: "或粘贴 JSON / YAML 内容：",
  clear: "清除",
  parsing: "⏳ 正在解析文档...",
  specVersion: "规范版本",
  opCount: "接口数量",
  tagCount: "Tag 数量",
  schemaCount: "数据模型",
  step2: "② 接口预览",
  deprecated: "已废弃",
  desc: "描述",
  reqFormat: "请求格式",
  none: "无",
  reqParams: "请求参数",
  name: "名称",
  location: "位置",
  type: "类型",
  required: "必填",
  yes: "是",
  no: "否",
  noFields: "无字段",
  index: "序号",
  field: "字段",
  responses: "响应",
  statusCode: "状态码",
  model: "模型",
  step3: "③ 导出配置",
  projectName: "项目名称：",
  projectNamePh: "输入项目名称（可选）",
  exportScope: "导出范围：",
  exportFormat: "导出格式：",
  exporting: "导出中...",
  exportWord: "导出 Word (.docx)",
  placeholder: "导入文档后，此处显示解析结果预览与 Tag 筛选。",
  contact: "联系方式：",
  footer: "纯前端实现 · 文档不离开浏览器",
  version: "版本：",
  fileInfo: (name: string, size: number) => `📄 ${name}（${size} 字节）`,
  pastedInfo: (len: number) => `📋 已粘贴文本（${len} 字符）`,
  all: (n: number) => `全部（${n}）`,
  tagCountSuffix: (n: number) => `（${n}）`,
  reqBody: (ct: string) => `请求体（${ct}）`,
  scopeTag: (tag: string, n: number) => `仅导出 Tag「${tag}」的接口（${n} 个）`,
  scopeAll: (n: number) => `导出全部接口（${n} 个）`,
  exportFail: (msg: string) => `Word 导出失败：${msg}`,
  exportSuccess: "导出成功，文件已开始下载。",
};

const en = {
  title: "Swagger / OpenAPI Document Converter",
  subtitle: "Pure Frontend · Local Processing · No Upload",
  step1: "① Import API Document",
  dragHint: "Drag file here, or click to select",
  dragSub: "Supports Swagger 2.0 / OpenAPI 3.0 · JSON / YAML · Max 10 MB",
  pasteLabel: "Or paste JSON / YAML content:",
  clear: "Clear",
  parsing: "⏳ Parsing document...",
  specVersion: "Spec Version",
  opCount: "Operations",
  tagCount: "Tags",
  schemaCount: "Schemas",
  step2: "② API Preview",
  deprecated: "Deprecated",
  desc: "Description",
  reqFormat: "Request Format",
  none: "None",
  reqParams: "Request Parameters",
  name: "Name",
  location: "Location",
  type: "Type",
  required: "Required",
  yes: "Yes",
  no: "No",
  noFields: "No fields",
  index: "No.",
  field: "Field",
  responses: "Responses",
  statusCode: "Status",
  model: "Model",
  step3: "③ Export Settings",
  projectName: "Project Name:",
  projectNamePh: "Enter project name (optional)",
  exportScope: "Export Scope:",
  exportFormat: "Format:",
  exporting: "Exporting...",
  exportWord: "Export Word (.docx)",
  placeholder: "After importing a document, parsed results and Tag filter will appear here.",
  contact: "Contact:",
  footer: "Pure frontend · Documents stay in browser",
  version: "Version:",
  fileInfo: (name: string, size: number) => `📄 ${name} (${size} bytes)`,
  pastedInfo: (len: number) => `📋 Pasted text (${len} chars)`,
  all: (n: number) => `All (${n})`,
  tagCountSuffix: (n: number) => `(${n})`,
  reqBody: (ct: string) => `Request Body (${ct})`,
  scopeTag: (tag: string, n: number) => `Export Tag "${tag}" only (${n} ops)`,
  scopeAll: (n: number) => `Export all operations (${n})`,
  exportFail: (msg: string) => `Word export failed: ${msg}`,
  exportSuccess: "Export successful, download has started.",
};

const translations: Record<Lang, typeof zh> = { zh, en };

const STORAGE_KEY = "showapi-lang";

function getInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  // 首次访问：根据浏览器语言自动判断
  const browserLang = (navigator.language || "zh").toLowerCase();
  return browserLang.startsWith("zh") ? "zh" : "en";
}

export function useI18n() {
  const lang = ref<Lang>(getInitialLang());

  function setLang(l: Lang) {
    lang.value = l;
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }

  const t = computed(() => translations[lang.value]);

  return { lang, setLang, t };
}
