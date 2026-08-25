# Swagger / OpenAPI 文档转换工具

纯前端实现的 Swagger 2.0 / OpenAPI 3.0 文档转换工具，支持将 API 规范文档导出为 **Word (.docx)** 和 **Excel (.xlsx)** 格式。

> 所有处理均在浏览器本地完成，文档不会上传到任何服务器。

## 功能特性

- **多格式输入**：支持 Swagger 2.0 和 OpenAPI 3.0/3.1 规范，JSON 和 YAML 格式
- **文件导入**：拖拽或点击选择文件（.json / .yaml / .yml / .txt）
- **文本粘贴**：直接粘贴 JSON/YAML 内容
- **Tag 筛选**：按模块（Tag）筛选接口，支持"全部"和单个 Tag 切换
- **接口预览**：展开查看请求参数、请求体、响应码、响应字段等详情
- **按 Tag 导出**：选中某个 Tag 时仅导出该模块接口，选中"全部"时导出所有接口
- **Word 导出**：封面、文档概述、自动目录（TOC 域）、接口详情表格、数据模型附录
- **Excel 导出**：7 个 Sheet（文档信息、接口清单、请求参数、请求体字段、响应码、响应字段、数据模型）

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Vue 3.5 + TypeScript 5.7 |
| 构建 | Vite 6.3 |
| 解析 | `yaml`（YAML/JSON 解析） |
| Word 导出 | `docx` 9.x |
| Excel 导出 | `xlsx` (SheetJS) |

## 快速开始

### 环境要求

- Node.js ≥ 18
- npm ≥ 9

### 安装与运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 访问 http://localhost:5173

# 生产构建
npm run build
# 输出到 dist/ 目录

# 预览生产构建
npm run preview
```

## 使用流程

1. **导入文档**：拖拽 Swagger/OpenAPI 文件到页面，或粘贴 JSON/YAML 文本
2. **预览接口**：解析成功后自动展示接口列表，可按 Tag 筛选
3. **查看详情**：点击接口条目展开参数、请求体、响应等详细信息
4. **导出文档**：
   - 填写项目名称（可选）
   - 选择导出范围（全部 / 当前 Tag）
   - 点击"导出 Word"或"导出 Excel"

## 项目结构

```
showAPI/
├── index.html                  # 入口 HTML
├── vite.config.ts              # Vite 配置
├── tsconfig.json               # TypeScript 配置
├── package.json
├── example/
│   ├── swagger2.0.json         # Swagger 2.0 示例文档
│   └── README.md
├── docs/
│   └── 任务清单.md
└── src/
    ├── main.ts                 # 应用入口
    ├── App.vue                 # 主界面（输入、预览、导出）
    ├── style.css               # 全局样式
    ├── types/
    │   └── ir.ts               # 中间表示（IR）类型定义
    ├── parsers/
    │   ├── openapi-parser.ts   # Swagger/OpenAPI → IR 解析器
    │   └── schema-utils.ts     # Schema 字段树构建工具
    ├── composables/
    │   ├── useApiInput.ts      # 文件/粘贴输入处理
    │   └── useApiParser.ts     # 解析编排 + Tag 筛选
    └── exporters/
        ├── word-exporter.ts    # Word (.docx) 导出
        └── excel-exporter.ts   # Excel (.xlsx) 导出
```

## 架构说明

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  用户输入    │────▶│  解析器       │────▶│  IR 中间模型  │
│ (JSON/YAML) │     │ openapi-     │     │ ApiDocument  │
└─────────────┘     │ parser.ts    │     └──────┬──────┘
                    └──────────────┘            │
                    ┌──────────────┐            │
                    │  渲染器       │◀───────────┘
                    │ word-exporter│──▶ .docx
                    │ excel-exporter│──▶ .xlsx
                    └──────────────┘
```

- **IR（中间表示）**：`src/types/ir.ts` 定义了 `ApiDocument`、`ApiOperation`、`ApiField` 等类型，将 OpenAPI 规范与渲染器解耦
- **解析层**：`openapi-parser.ts` 负责将原始规范转换为 IR，`schema-utils.ts` 处理 `$ref` 解析和字段树构建
- **导出层**：Word 和 Excel 导出器只依赖 IR 类型，不直接读取 OpenAPI 原始结构

## Word 导出内容

| 章节 | 说明 |
|------|------|
| 封面 | 项目名称、版本、生成时间、规范版本 |
| 文档概述 | API 描述、服务地址 |
| 接口目录 | Word 原生 TOC 域（打开后更新域即可生成） |
| 接口详情 | 按 Tag 分组，每个接口包含基本信息、请求参数、请求体、响应码、响应字段 |
| 数据模型附录 | 所有 Schema 的字段定义 |

## Excel 导出内容

| Sheet | 说明 |
|-------|------|
| 文档信息 | 项目名称、版本、接口数量等 |
| 接口清单 | 所有接口的方法、路径、描述、Tag |
| 请求参数 | 各接口的 Query/Path/Header 参数 |
| 请求体字段 | 请求体 Schema 的字段树（含层级序号） |
| 响应码 | 各接口的响应状态码及描述 |
| 响应字段 | 响应 Schema 的字段树 |
| 数据模型 | 所有定义的 Schema 字段 |

## 注意事项

- 文件大小限制：10 MB
- Word 目录为 TOC 域，首次打开需"更新域"才能显示条目
- 按 Tag 导出时，数据模型附录/Sheet 仍包含全部 Schema（作为参考）
- 纯前端运行，无需后端服务，适合内网/离线环境使用

## License

MIT
