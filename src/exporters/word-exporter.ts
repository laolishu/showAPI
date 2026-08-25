/**
 * Word (.docx) 导出渲染器
 * 将 IR (ApiDocument) 转换为 Word 文档。
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  PageBreak,
  TableLayoutType,
  TableOfContents,
} from "docx";
import type { ApiDocument, ApiOperation, ApiField } from "../types/ir";

/** 生成默认文件名 */
function getFileName(doc: ApiDocument, projectName: string): string {
  const title = projectName || doc.info.title || "api-document";
  const version = doc.info.version;
  const date = new Date().toISOString().slice(0, 10);
  return `${title}_${version}_${date}.docx`;
}

/** 表格列数（统一为 7 列） */
const COLS = 7;

/** 配色方案 */
const COLOR = {
  border: "000000",      // 表格线：黑色
  headerFill: "E8F0FE",  // 表头背景：淡蓝
  labelFill: "F5F8FC",   // 标签背景：极浅蓝灰
  sectionFill: "DCE7FB", // 分区标题背景：淡蓝
  sectionText: "1A56DB", // 分区标题文字：深蓝
  labelText: "334155",   // 标签文字：深灰
  valueText: "1F2937",   // 值文字：近黑
};

/** 通用边框（细线，浅蓝灰） */
const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
  left: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
  right: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
};

/**
 * 接口详情表固定列宽（DXA，1 英寸 = 1440 DXA）。
 * 顺序：序号/字段、位置、类型、必填、描述、默认值、示例。
 * 总宽 9000 DXA（6.25 英寸），为“描述”保留约 44% 的空间。
 */
const COL_WIDTHS = [1080, 630, 900, 450, 3960, 900, 1080];
const TABLE_WIDTH = COL_WIDTHS.reduce((total, width) => total + width, 0);

/** 创建普通单元格 */
function cell(text: string, opts?: { bold?: boolean; fill?: string; colSpan?: number; width?: number; color?: string }): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || "", size: 18, bold: opts?.bold, color: opts?.color })],
        alignment: AlignmentType.LEFT,
      }),
    ],
    shading: opts?.fill ? { type: "clear", fill: opts.fill } : undefined,
    borders,
    columnSpan: opts?.colSpan,
    width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
  });
}

/** 创建表头单元格 */
function headerCell(text: string): TableCell {
  return cell(text, { bold: true, fill: COLOR.headerFill, color: COLOR.labelText });
}

/** 创建分区标题行（跨 7 列） */
function sectionRow(text: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text, bold: true, size: 20, color: COLOR.sectionText })],
          }),
        ],
        shading: { type: "clear", fill: COLOR.sectionFill },
        borders,
        columnSpan: COLS,
      }),
    ],
  });
}

/** 创建基本信息行（标签 1 列带背景色，值跨 6 列） */
function infoRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      cell(label, { bold: true, fill: COLOR.labelFill, color: COLOR.labelText, width: COL_WIDTHS[0] }),
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: value || "—", size: 18, color: COLOR.valueText })],
          }),
        ],
        borders,
        columnSpan: COLS - 1,
        width: { size: TABLE_WIDTH - COL_WIDTHS[0], type: WidthType.DXA },
      }),
    ],
  });
}

/** 展平字段为行数据 */
function flattenFieldRows(fields: ApiField[], indent: number): string[][] {
  const rows: string[][] = [];
  for (const f of fields) {
    const prefix = "  ".repeat(indent);
    rows.push([
      `${prefix}${f.displayIndex}`,
      `${prefix}${f.name}`,
      f.type,
      f.required ? "是" : "否",
      f.description || "",
      f.defaultValue || "",
      f.example || "",
    ]);
    if (f.children.length > 0) {
      rows.push(...flattenFieldRows(f.children, indent + 1));
    }
  }
  return rows;
}

/** 创建带列宽的数据行 */
function dataRow(values: string[]): TableRow {
  return new TableRow({
    children: values.map((v, i) => cell(v, { width: COL_WIDTHS[i], color: COLOR.valueText })),
  });
}

/** 创建带列宽的表头行 */
function headerRow(labels: string[]): TableRow {
  return new TableRow({
    children: labels.map((l, i) => cell(l, { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, width: COL_WIDTHS[i] })),
  });
}

/** 构建单个接口的统一表格（基本信息 + 请求参数 + 响应码 + 响应字段） */
function buildOperationTable(op: ApiOperation): Table {
  const rows: TableRow[] = [];

  // === 基本信息区 ===
  rows.push(infoRow("接口标识", op.operationId || "—"));
  rows.push(infoRow("请求方法", op.method));
  rows.push(infoRow("请求路径", op.path));
  rows.push(infoRow("所属模块", op.primaryTag));
  if (op.description) {
    rows.push(infoRow("接口说明", op.description));
  }
  rows.push(infoRow("请求格式", op.requestContentType || "无"));
  if (op.deprecated) {
    rows.push(infoRow("状态", "⚠️ 已废弃"));
  }

  // === 请求参数区 ===
  const hasParams = op.parameters.length > 0 || (op.requestBody && op.requestBody.fields.length > 0);
  if (hasParams) {
    rows.push(sectionRow("请求参数"));
    rows.push(headerRow(["序号/字段", "位置", "类型", "必填", "描述", "默认值", "示例"]));

    // 非请求体参数
    for (const p of op.parameters) {
      rows.push(dataRow([
        p.name,
        p.location,
        p.type,
        p.required ? "是" : "否",
        p.description || "",
        p.defaultValue || "",
        p.example || "",
      ]));
    }

    // 请求体字段
    if (op.requestBody && op.requestBody.fields.length > 0) {
      const bodyRows = flattenFieldRows(op.requestBody.fields, 0);
      for (const r of bodyRows) {
        rows.push(dataRow([r[0], "body", r[2], r[3], r[4], r[5], r[6]]));
      }
    }
  }

  // === 响应码区 ===
  // 描述列跨 3 列（合并原 Content-Type），模型列跨 3 列
  const respDescWidth = COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3];
  const respModelWidth = COL_WIDTHS[4] + COL_WIDTHS[5] + COL_WIDTHS[6];
  rows.push(sectionRow("响应码"));
  rows.push(new TableRow({
    children: [
      cell("状态码", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, width: COL_WIDTHS[0] }),
      cell("描述", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, colSpan: 3, width: respDescWidth }),
      cell("模型", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, colSpan: 3, width: respModelWidth }),
    ],
  }));

  for (const r of op.responses) {
    const descText = r.contentType
      ? `${r.description || ""}（${r.contentType}）`
      : r.description || "";
    rows.push(new TableRow({
      children: [
        cell(r.statusCode, { width: COL_WIDTHS[0], color: COLOR.valueText }),
        cell(descText, { colSpan: 3, width: respDescWidth, color: COLOR.valueText }),
        cell(r.referenceName || "", { colSpan: 3, width: respModelWidth, color: COLOR.valueText }),
      ],
    }));
  }

  // === 响应字段区 ===
  const successResp =
    op.responses.find((r) => r.statusCode.startsWith("2")) ||
    op.responses[0];

  if (successResp && successResp.fields.length > 0) {
    rows.push(sectionRow("响应字段"));
    // 响应字段列：层级序号(1) | 字段名(2) | 类型(2) | 描述(1) | 示例(1)
    const respNameWidth = COL_WIDTHS[1] + COL_WIDTHS[2];
    const respTypeWidth = COL_WIDTHS[3] + COL_WIDTHS[4];
    rows.push(new TableRow({
      children: [
        cell("层级序号", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, width: COL_WIDTHS[0] }),
        cell("字段名", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, colSpan: 2, width: respNameWidth }),
        cell("类型", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, colSpan: 2, width: respTypeWidth }),
        cell("描述", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, width: COL_WIDTHS[5] }),
        cell("示例", { bold: true, fill: COLOR.headerFill, color: COLOR.labelText, width: COL_WIDTHS[6] }),
      ],
    }));

    const fieldRows = flattenFieldRows(successResp.fields, 0);
    for (const r of fieldRows) {
      // r: [层级序号, 字段名, 类型, 必填, 描述, 默认值, 示例]
      rows.push(new TableRow({
        children: [
          cell(r[0], { width: COL_WIDTHS[0], color: COLOR.valueText }),
          cell(r[1], { colSpan: 2, width: respNameWidth, color: COLOR.valueText }),
          cell(r[2], { colSpan: 2, width: respTypeWidth, color: COLOR.valueText }),
          cell(r[4], { width: COL_WIDTHS[5], color: COLOR.valueText }),
          cell(r[6], { width: COL_WIDTHS[6], color: COLOR.valueText }),
        ],
      }));
    }
  }

  return new Table({
    rows,
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: COL_WIDTHS,
    layout: TableLayoutType.FIXED,
  });
}

/** 主导出函数 */
export async function exportToWord(doc: ApiDocument, projectName: string, selectedTag?: string | null): Promise<void> {
  const children: (Paragraph | Table)[] = [];
  const operations = selectedTag ? doc.operations.filter((op) => op.primaryTag === selectedTag) : doc.operations;

  // 封面
  children.push(new Paragraph({ children: [] }));
  children.push(new Paragraph({ children: [] }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: projectName || doc.info.title || "API 文档",
          bold: true,
          size: 48,
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `版本：${doc.info.version}`, size: 24 }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `生成时间：${new Date().toLocaleString("zh-CN")}`,
          size: 20,
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `规范版本：${doc.sourceVersion}`, size: 20 }),
      ],
    })
  );
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 文档概述
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "文档概述", bold: true, size: 32 })],
    })
  );
  if (doc.info.description) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.info.description, size: 20 })],
      })
    );
  }
  if (doc.servers.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "服务地址：", bold: true, size: 20 }),
          new TextRun({ text: doc.servers.map((s) => s.url).join(", "), size: 20 }),
        ],
      })
    );
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 接口目录（Word 自动目录）
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "接口目录", bold: true, size: 32 })],
    })
  );

  children.push(
    new TableOfContents("接口目录", {
      hyperlink: true,
      headingStyleRange: "1-3",
    })
  );
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 接口详情
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "接口详情", bold: true, size: 32 })],
    })
  );

  let opIndex = 0;
  let currentTag = "";
  for (const op of operations) {
    if (op.primaryTag !== currentTag) {
      currentTag = op.primaryTag;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: currentTag, bold: true, size: 28 })],
        })
      );
    }

    // 接口标题
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [
          new TextRun({
            text: `${opIndex + 1}. ${op.displayName}`,
            bold: true,
            size: 24,
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    // 统一表格（基本信息 + 请求参数 + 响应码 + 响应字段）
    children.push(buildOperationTable(op));
    children.push(new Paragraph({ children: [], spacing: { after: 200 } }));

    opIndex++;
  }

  // 数据模型附录
  if (doc.schemas.length > 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "数据模型附录", bold: true, size: 32 })],
      })
    );

    for (const schema of doc.schemas) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: schema.name, bold: true, size: 24 })],
        })
      );
      if (schema.description) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: schema.description, size: 20 })],
          })
        );
      }

      // 字段表
      const rows: TableRow[] = [
        new TableRow({
          children: [
            headerCell("序号"),
            headerCell("字段名"),
            headerCell("类型"),
            headerCell("必填"),
            headerCell("描述"),
          ],
        }),
      ];

      function addSchemaFields(fields: ApiField[], indent: number) {
        for (const f of fields) {
          const prefix = "  ".repeat(indent);
          rows.push(
            new TableRow({
              children: [
                cell(`${prefix}${f.displayIndex}`),
                cell(`${prefix}${f.name}`),
                cell(f.type),
                cell(f.required ? "是" : "否"),
                cell(f.description || ""),
              ],
            })
          );
          if (f.children.length > 0) {
            addSchemaFields(f.children, indent + 1);
          }
        }
      }

      addSchemaFields([schema.rootField], 0);

      children.push(
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }) as unknown as Paragraph
      );
      children.push(new Paragraph({ children: [] }));
    }
  }

  // 生成文档
  const wordDoc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(wordDoc);
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
