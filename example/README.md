# 样例集说明

本目录保存 Swagger / OpenAPI 文档转换功能的输入样例、视觉参考和后续验证基线。样例源文件仅用于本地解析、IR 构建和导出验证，不应在产品运行时上传或访问网络。

## S-01：海关分析系统 Swagger 2.0 JSON 基线

| 项目 | 内容 |
| --- | --- |
| 源文件 | `swagger2.0.json` |
| 规范版本 | Swagger 2.0 |
| 文档标题 | 海关分析系统 API |
| 文档版本 | 1.0.0 |
| 接口数量 | 118 |
| 路径数量 | 118 |
| Tag 数量 | 14 |
| Schema / Definition 数量 | 215 |
| 内部 `$ref` 数量 | 229 |
| 请求方法 | GET |
| 编码与语言 | UTF-8、中文描述与示例 |

### 已覆盖能力

- Swagger 2.0 JSON 识别、文档元信息、Tag 分组和全量/按 Tag 筛选。
- 查询参数的 `string`、`integer`、`number`、`boolean`、`required`、`description`、`x-example` 与 `enum`。
- 多响应码：典型接口含 `200`、`401`、`403`、`404`。
- 单文件内部 `#/definitions/...` 引用、包装响应对象、对象、数组、嵌套对象与数组元素模型。
- 中文标题、接口说明、字段说明、示例值，以及 Word 中文显示。
- `example` 字段、数组对象字段树和分页结构。

### 验证锚点

| 接口 | 验证重点 | 关键预期 |
| --- | --- | --- |
| `GET /api/firework/category-batch-stat` | Word 单接口表、示例、数组响应 | 响应字段树显示 `code`、`data`、`data[].amount`、`data[].categoryCode`、`data[].categoryName`、`message`、`timeStamp`。 |
| `GET /api/base/customs/list` | 对象与数组嵌套 | 响应字段树显示分页对象 `data.records[]` 及其 `customsCode`、`customsName` 子字段。 |
| `GET /api/energy/lng-display/display-data` | 同一对象中的多个数组 | `detailList[]`、`trendList[]` 分别展开，字段路径不得混淆。 |
| `GET /api/energy/national-overview/monthly-stat` | 枚举与必填参数 | 查询参数 `transportCategory` 保留枚举值，`endDate` 与 `startDate` 保留必填状态。 |

### 与视觉参考的关系

`swagger接口文档.html` 是本样例的导出视觉参考。其“返回属性名”采用层级编号和缩进表现递归 Schema 树；产品实现应依据统一 IR 的 `depth`、`path` 和 `displayIndex` 渲染，而不复制 HTML 中的像素缩进。

---

## 样例索引

| 编号 | 文件 | 规范 | 验证重点 | 预期行为 |
| --- | --- | --- | --- | --- |
| S-01 | `swagger2.0.json` | Swagger 2.0 JSON | 中文、Tag 分组、内部 `$ref`、数组/对象嵌套、枚举、多响应码 | 正常解析并导出 |
| S-02 | `S-02-swagger2.0-params.yaml` | Swagger 2.0 YAML | path/header/query/body/formData 参数、枚举、嵌套对象、数组 | 正常解析并导出 |
| S-03 | `S-03-openapi3.0-requestbody.json` | OpenAPI 3.0 JSON | `requestBody`、`components.schemas`、`servers`、多 content-type、`example` | 正常解析并导出 |
| S-04 | `S-04-openapi3.0-combined-schema.json` | OpenAPI 3.0 JSON | `allOf` 合并、`oneOf` 保留候选、`anyOf` 保留候选 | `allOf` 字段合并展示；`oneOf`/`anyOf` 显示候选模型名 |
| S-05 | `S-05-circular-ref.json` | OpenAPI 3.0 JSON | 自引用（Comment→Comment）、互引用（Org↔Member） | 最大 8 层展开后显示"已截断"提示，不卡死 |
| S-06 | `S-06-external-ref.json` | OpenAPI 3.0 JSON | `http(s)://` 外部 `$ref`、文件路径 `$ref` | 提示"不支持外部引用"，不发起网络请求，不生成文档 |
| E-01 | `E-01-invalid-json.json` | 非法 JSON | 缺少逗号 | 提示 JSON 解析失败，显示行号 |
| E-02 | `E-02-missing-version.json` | 无版本字段 | 缺 `swagger`/`openapi` | 提示"无法识别规范版本" |
| E-03 | `E-03-no-paths.json` | OpenAPI 3.0 | 无 `paths` | 提示"没有可导出的接口"，不生成空文档 |
| E-04 | `E-04-invalid-yaml.yaml` | 非法 YAML | 未闭合引号、缩进错误 | 提示 YAML 解析失败 |

## 使用方式

1. **P1 开发阶段**：每个样例对应一组 IR 断言（接口数、参数数、字段树深度、错误提示文案）。
2. **P2 验收阶段**：逐条执行，记录 Word 导出结果截图或文件，对照《04-MVP验收标准与路线图》AC-01～AC-10。
3. **回归**：每次修改解析器或渲染器后，重跑全部 S 系列样例确认无回归。