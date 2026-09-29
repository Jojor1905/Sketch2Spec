"use client"

import type { Detection } from "@/lib/floor-plan"
import { labelKind } from "@/lib/floor-plan"

type BudgetLine = {
  materialId: string
  name: string
  target: string
  category: string
  quantity: number
  unit: "m²" | "ชิ้น"
  unitPrice: number
  total: number
}

type Budget = {
  lines: BudgetLine[]
  subtotal: number
  hasScale: boolean
  floorAreaM2: number
}

type ExportSketch2SpecPdfOptions = {
  imageUrl: string | null
  threeDImageUrl: string | null
  detections: Detection[]
  imageSize: {
    width: number
    height: number
  }
  metersPerPixel: number | null
  budget: Budget
}

function escapeHtml(value: unknown) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value)
}

function targetLabel(target: string) {
  switch (target) {
    case "wall":
      return "ผนัง"
    case "door":
      return "ประตู"
    case "window":
      return "หน้าต่าง"
    case "floor":
      return "พื้น"
    case "ceiling":
      return "ฝ้าเพดาน"
    case "furniture":
      return "เฟอร์นิเจอร์"
    default:
      return target
  }
}

function countKind(detections: Detection[], kind: string) {
  return detections.filter(
    (detection) => labelKind(detection.label) === kind,
  ).length
}

function waitForImages(doc: Document) {
  const images = Array.from(doc.images)

  return Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve()
            return
          }

          image.onload = () => resolve()
          image.onerror = () => resolve()
        }),
    ),
  )
}

export async function exportSketch2SpecPdf({
  imageUrl,
  threeDImageUrl,
  detections,
  imageSize,
  metersPerPixel,
  budget,
}: ExportSketch2SpecPdfOptions) {
  const printWindow = window.open("", "_blank", "width=1000,height=800")

  if (!printWindow) {
    throw new Error(
      "ไม่สามารถเปิดหน้าสำหรับ Export PDF ได้ กรุณาอนุญาต Popup ของเว็บไซต์นี้ก่อน",
    )
  }

  const floorArea =
    budget.hasScale && budget.floorAreaM2 > 0
      ? budget.floorAreaM2
      : 0

  const wallCount = countKind(detections, "wall")
  const doorCount = countKind(detections, "door")
  const windowCount = countKind(detections, "window")
  const furnitureCount = countKind(detections, "furniture")

  const scaleText = metersPerPixel
    ? `1 px = ${metersPerPixel.toFixed(4)} m`
    : "ยังไม่ได้กำหนดมาตราส่วน"

  const budgetRows =
    budget.lines.length > 0
      ? budget.lines
          .map(
            (line) => `
              <tr>
                <td>${escapeHtml(line.name)}</td>
                <td>${escapeHtml(targetLabel(line.target))}</td>
                <td class="number">
                  ${formatNumber(
                    line.quantity,
                    line.unit === "ชิ้น" ? 0 : 2,
                  )}
                </td>
                <td>${escapeHtml(line.unit)}</td>
                <td class="money">${formatMoney(line.unitPrice)}</td>
                <td class="money">${formatMoney(line.total)}</td>
              </tr>
            `,
          )
          .join("")
      : `
          <tr>
            <td colspan="6" class="empty">
              ยังไม่มีรายการวัสดุที่เลือกใช้
            </td>
          </tr>
        `

  const generatedAt = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date())

  const planImage = imageUrl
    ? `
      <div class="image-frame plan-frame">
        <img src="${escapeHtml(imageUrl)}" alt="2D Floor Plan" />
      </div>
    `
    : `
      <div class="empty large-empty">
        ไม่มีภาพแปลน
      </div>
    `

  const threeDImage = threeDImageUrl
    ? `
      <div class="image-frame three-d-frame">
        <img src="${escapeHtml(threeDImageUrl)}" alt="3D Preview" />
      </div>
    `
    : `
      <div class="empty large-empty">
        ไม่สามารถจับภาพ 3D ได้
      </div>
    `

  printWindow.document.open()

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="th">
      <head>
        <meta charset="UTF-8" />
        <title>Sketch2Spec - House Planning Report</title>

        <style>
          @page {
            size: A4;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            background: #e5e7eb;
            color: #111827;
            font-family:
              "Noto Sans Thai",
              "Leelawadee UI",
              "Tahoma",
              Arial,
              sans-serif;
          }

          body {
            font-size: 12px;
          }

          .page {
            width: 210mm;
            min-height: 297mm;
            padding: 16mm;
            margin: 0 auto 10mm;
            background: white;
            position: relative;
            overflow: hidden;
          }

          .page-break {
            page-break-after: always;
          }

          .header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 20px;
            margin-bottom: 18px;
          }

          .brand {
            font-size: 25px;
            font-weight: 800;
            letter-spacing: -0.5px;
          }

          .subtitle {
            margin-top: 3px;
            color: #64748b;
            font-size: 11px;
          }

          .date {
            text-align: right;
            color: #64748b;
            font-size: 10px;
          }

          .section-title {
            margin: 18px 0 10px;
            font-size: 16px;
            font-weight: 800;
          }

          .section-description {
            margin: -5px 0 12px;
            color: #64748b;
            font-size: 10px;
          }

          .image-frame {
            width: 100%;
            border: 1px solid #dbe3ef;
            border-radius: 14px;
            background: #f8fafc;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .image-frame img {
            display: block;
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }

          .plan-frame {
            height: 165mm;
          }

          .plan-frame img {
            width: 100%;
            height: 100%;
          }

          .three-d-frame {
            height: 210mm;
          }

          .three-d-frame img {
            width: 100%;
            height: 100%;
          }

          .info-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-top: 12px;
          }

          .info-card {
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 10px;
            background: #f8fafc;
          }

          .info-label {
            color: #64748b;
            font-size: 9px;
          }

          .info-value {
            margin-top: 4px;
            font-size: 15px;
            font-weight: 800;
          }

          .spec-table,
          .budget-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }

          th {
            background: #f1f5f9;
            color: #475569;
            font-weight: 700;
            text-align: left;
          }

          th,
          td {
            padding: 8px 9px;
            border-bottom: 1px solid #e2e8f0;
          }

          .number,
          .money {
            text-align: right;
            white-space: nowrap;
          }

          .total-box {
            margin-top: 14px;
            padding: 16px;
            border-radius: 14px;
            background: #0f172a;
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .total-label {
            font-size: 11px;
            color: #cbd5e1;
          }

          .total-value {
            font-size: 23px;
            font-weight: 800;
          }

          .note {
            margin-top: 12px;
            padding: 10px 12px;
            border: 1px solid #fde68a;
            background: #fffbeb;
            color: #92400e;
            border-radius: 10px;
            font-size: 9px;
            line-height: 1.6;
          }

          .empty {
            color: #64748b;
            text-align: center;
          }

          .large-empty {
            height: 120mm;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px dashed #cbd5e1;
            border-radius: 14px;
          }

          .footer {
            position: absolute;
            bottom: 9mm;
            left: 16mm;
            right: 16mm;
            padding-top: 5px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            color: #94a3b8;
            font-size: 8px;
          }

          @media print {
            html,
            body {
              background: white;
            }

            .page {
              margin: 0;
              page-break-after: always;
            }

            .page:last-child {
              page-break-after: auto;
            }
          }
        </style>
      </head>

      <body>

        <!-- PAGE 1 -->
        <section class="page page-break">
          <div class="header">
            <div>
              <div class="brand">Sketch2Spec</div>
              <div class="subtitle">
                House Planning & Specification Report
              </div>
            </div>

            <div class="date">
              ${escapeHtml(generatedAt)}
            </div>
          </div>

          <div class="section-title">
            1. 2D Floor Plan
          </div>

          <div class="section-description">
            ภาพแปลนที่ใช้เป็นข้อมูลสำหรับการวิเคราะห์และสร้างโมเดล
          </div>

          ${planImage}

          <div class="info-grid">
            <div class="info-card">
              <div class="info-label">พื้นที่รวม</div>
              <div class="info-value">
                ${
                  floorArea > 0
                    ? `${formatNumber(floorArea)} m²`
                    : "-"
                }
              </div>
            </div>

            <div class="info-card">
              <div class="info-label">ผนัง</div>
              <div class="info-value">${wallCount}</div>
            </div>

            <div class="info-card">
              <div class="info-label">ประตู / หน้าต่าง</div>
              <div class="info-value">
                ${doorCount} / ${windowCount}
              </div>
            </div>

            <div class="info-card">
              <div class="info-label">Scale</div>
              <div class="info-value" style="font-size:11px">
                ${escapeHtml(scaleText)}
              </div>
            </div>
          </div>

          <div class="footer">
            <span>Sketch2Spec</span>
            <span>2D Floor Plan</span>
          </div>
        </section>

        <!-- PAGE 2 -->
        <section class="page page-break">
          <div class="header">
            <div>
              <div class="brand">Sketch2Spec</div>
              <div class="subtitle">
                3D Visualization
              </div>
            </div>
          </div>

          <div class="section-title">
            2. 3D Preview
          </div>

          <div class="section-description">
            ภาพโมเดล 3 มิติจากมุมมองปัจจุบันของ Editor
          </div>

          ${threeDImage}

          <div class="info-grid">
            <div class="info-card">
              <div class="info-label">ผนัง</div>
              <div class="info-value">${wallCount}</div>
            </div>

            <div class="info-card">
              <div class="info-label">ประตู</div>
              <div class="info-value">${doorCount}</div>
            </div>

            <div class="info-card">
              <div class="info-label">หน้าต่าง</div>
              <div class="info-value">${windowCount}</div>
            </div>

            <div class="info-card">
              <div class="info-label">เฟอร์นิเจอร์</div>
              <div class="info-value">${furnitureCount}</div>
            </div>
          </div>

          <div class="footer">
            <span>Sketch2Spec</span>
            <span>3D Preview</span>
          </div>
        </section>

        <!-- PAGE 3 -->
        <section class="page">
          <div class="header">
            <div>
              <div class="brand">Sketch2Spec</div>
              <div class="subtitle">
                Specification & Cost Estimate
              </div>
            </div>
          </div>

          <div class="section-title">
            3. House Specifications
          </div>

          <table class="spec-table">
            <tbody>
              <tr>
                <td>ขนาดภาพต้นฉบับ</td>
                <td class="number">
                  ${imageSize.width} × ${imageSize.height} px
                </td>
              </tr>

              <tr>
                <td>พื้นที่รวม</td>
                <td class="number">
                  ${
                    floorArea > 0
                      ? `${formatNumber(floorArea)} m²`
                      : "-"
                  }
                </td>
              </tr>

              <tr>
                <td>จำนวนผนัง</td>
                <td class="number">${wallCount}</td>
              </tr>

              <tr>
                <td>จำนวนประตู</td>
                <td class="number">${doorCount}</td>
              </tr>

              <tr>
                <td>จำนวนหน้าต่าง</td>
                <td class="number">${windowCount}</td>
              </tr>

              <tr>
                <td>จำนวนเฟอร์นิเจอร์</td>
                <td class="number">${furnitureCount}</td>
              </tr>

              <tr>
                <td>มาตราส่วน</td>
                <td class="number">
                  ${escapeHtml(scaleText)}
                </td>
              </tr>
            </tbody>
          </table>

          <div class="section-title">
            4. Material & Cost Estimate
          </div>

          <table class="budget-table">
            <thead>
              <tr>
                <th>วัสดุ</th>
                <th>ประเภท</th>
                <th class="number">ปริมาณ</th>
                <th>หน่วย</th>
                <th class="money">ราคาต่อหน่วย</th>
                <th class="money">รวม</th>
              </tr>
            </thead>

            <tbody>
              ${budgetRows}
            </tbody>
          </table>

          <div class="total-box">
            <div>
              <div class="total-label">
                Estimated Material Cost
              </div>
              <div style="margin-top:4px">
                รวมประมาณการวัสดุ
              </div>
            </div>

            <div class="total-value">
              ${formatMoney(budget.subtotal)}
            </div>
          </div>

          <div class="note">
            หมายเหตุ: ค่าใช้จ่ายในรายงานนี้เป็นการประมาณการเบื้องต้น
            จากวัสดุที่ผู้ใช้เลือกและข้อมูลขนาดที่กำหนดในระบบ
            ไม่ใช่ราคาก่อสร้างจริงหรือใบเสนอราคาจากผู้รับเหมา
          </div>

          <div class="footer">
            <span>Sketch2Spec</span>
            <span>Specification & Cost Estimate</span>
          </div>
        </section>

      </body>
    </html>
  `)

  printWindow.document.close()

  await waitForImages(printWindow.document)

  printWindow.focus()

  // ให้ browser render หน้าให้เสร็จก่อนเปิด Print Preview
  await new Promise((resolve) => setTimeout(resolve, 500))

  printWindow.print()

  printWindow.onafterprint = () => {
    printWindow.close()
  }
}