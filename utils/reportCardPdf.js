const PDFDocument = require('pdfkit');
const path        = require('path');
const fs          = require('fs');

const { AFFECTIVE_TRAITS, PSYCHOMOTOR_SKILLS } = require('../model/reportCard.model');

const PAGE_WIDTH  = 595.28;   // A4
const PAGE_HEIGHT = 841.89;   // A4
const MARGIN      = 18;
const CONTENT_W   = PAGE_WIDTH - MARGIN * 2;

// ─── Colour helpers ───────────────────────────────────────────────────────────

const HEADER_BG  = '#444444';
const ROW_ALT_BG = '#eeeeee';
const WHITE      = '#ffffff';
const BLACK      = '#000000';
const GRID_LINE  = '#cccccc';

// ─── Drawing helpers ──────────────────────────────────────────────────────────

/**
 * Draw a filled rectangle.
 */
function fillRect(doc, x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

/**
 * Draw a stroked (outline) rectangle.
 */
function strokeRect(doc, x, y, w, h, color = BLACK) {
  doc.save().rect(x, y, w, h).stroke(color).restore();
}

/**
 * Draw text inside a cell with optional bold and colour.
 */
function cellText(doc, text, x, y, w, h, opts = {}) {
  const {
    fontSize = 6.5,
    bold     = false,
    color    = BLACK,
    align    = 'left',
    valign   = 'center',
    padding  = 2,
  } = opts;

  const textY = valign === 'center' ? y + (h - fontSize) / 2 : y + padding;

  doc.save()
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(fontSize)
    .fillColor(color)
    .text(String(text ?? '-'), x + padding, textY, {
      width:       w - padding * 2,
      height:      h,
      align,
      lineBreak:   false,
      ellipsis:    true,
    })
    .restore();
}

/**
 * Draw a horizontal table row. Returns new Y.
 */
function drawRow(doc, x, y, cells, colWidths, rowHeight, bgColor = WHITE) {
  cells.forEach((cell, i) => {
    const cx = x + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    fillRect(doc, cx, y, colWidths[i], rowHeight, bgColor);
    strokeRect(doc, cx, y, colWidths[i], rowHeight, GRID_LINE);
    cellText(
      doc,
      cell.text,
      cx,
      y,
      colWidths[i],
      rowHeight,
      {
        ...cell,
        padding: cell.padding ?? 2,
      }
    );
  });
  return y + rowHeight;
}

/**
 * Draw a table with a header row then data rows. Returns new Y.
 */
function drawTable(doc, x, y, headers, rows, colWidths, rowHeight = 14, headerHeight = 14) {
  // Header row
  const headerCells = headers.map((h) => ({
    text:     typeof h === 'string' ? h : h.text,
    fontSize: 6,
    bold:     true,
    color:    WHITE,
    align:    typeof h === 'object' ? h.align ?? 'center' : 'center',
  }));
  headers.forEach((h, i) => {
    const cx = x + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    fillRect(doc, cx, y, colWidths[i], headerHeight, HEADER_BG);
    strokeRect(doc, cx, y, colWidths[i], headerHeight, GRID_LINE);
    cellText(doc, typeof h === 'string' ? h : h.text, cx, y, colWidths[i], headerHeight, {
      fontSize: 6,
      bold:     true,
      color:    WHITE,
      align:    typeof h === 'object' ? h.align ?? 'center' : 'center',
    });
  });

  y += headerHeight;

  rows.forEach((row, ri) => {
    const bg = ri % 2 === 0 ? WHITE : ROW_ALT_BG;
    row.forEach((cell, i) => {
      const cx = x + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      fillRect(doc, cx, y, colWidths[i], rowHeight, bg);
      strokeRect(doc, cx, y, colWidths[i], rowHeight, GRID_LINE);
      cellText(doc, typeof cell === 'object' ? cell.text : cell, cx, y, colWidths[i], rowHeight, {
        ...( typeof cell === 'object' ? cell : {} ),
      });
    });
    y += rowHeight;
  });

  return y;
}

// ─── Section label banner ─────────────────────────────────────────────────────

function sectionBanner(doc, x, y, w, h, text) {
  fillRect(doc, x, y, w, h, HEADER_BG);
  strokeRect(doc, x, y, w, h, GRID_LINE);
  cellText(doc, text, x, y, w, h, {
    fontSize: 7,
    bold:     true,
    color:    WHITE,
    align:    'center',
    valign:   'center',
  });
  return y + h;
}

// ─── Ordinal helper ────────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * @param {object} rc - ReportCard document (lean)
 * @param {object} school - School info { name, address, phone, email, motto }
 * @returns {Promise<Buffer>}
 */
function generateReportCardPdf(rc, school = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size:    [PAGE_WIDTH, PAGE_HEIGHT],
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        info: {
          Title:   `Report Card – ${rc.studentName}`,
          Author:  school.name || 'Progress Intellectual Schools',
        },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let y = MARGIN;
      const x = MARGIN;

      const {
        studentName = '',
        regNo       = '',
        class: cls  = '',
        term        = '',
        session     = '',
        termEndDate     = '-',
        nextTermBegins  = '-',
        classInfo       = {},
        subjects        = [],
        affective       = {},
        psychomotor     = {},
        classTeacherComment = '',
        principalComment    = '',
      } = rc;

      const schoolName    = school.name    || 'PROGRESS INTELLECTUAL SCHOOLS, ONDO STATE.';
      const schoolAddress = school.address || 'Progress College Road, Off Surulere Street, Oke Igbo, Ondo State';
      const schoolPhone   = school.phone   || '08107385362';
      const schoolEmail   = school.email   || 'info@progressschools.com';
      const schoolMotto   = school.motto   || 'Godliness and Excellence';

      // ── Header ──────────────────────────────────────────────────────────────

      // Try to load school logo (optional – silently skip if missing)
      const logoPath = path.join(__dirname, '../public/images/progressLogo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, x, y, { width: 50, height: 50 });
      }

      const headerTextX = x + 55;
      const headerTextW = CONTENT_W - 55;

      doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK)
        .text(schoolName, headerTextX, y + 4, { width: headerTextW, align: 'center' });
      doc.font('Helvetica').fontSize(7.5)
        .text(schoolMotto, headerTextX, y + 18, { width: headerTextW, align: 'center' });
      doc.font('Helvetica').fontSize(6.5)
        .text(`Address: ${schoolAddress}`, headerTextX, y + 28, { width: headerTextW, align: 'center' });
      doc.font('Helvetica').fontSize(6.5)
        .text(`Phone: ${schoolPhone}  ·  Email: ${schoolEmail}`, headerTextX, y + 37, { width: headerTextW, align: 'center' });

      const termLabel = term.toUpperCase();
      doc.font('Helvetica-Bold').fontSize(9)
        .text(`${termLabel} CUMULATIVE REPORT ${session}`, headerTextX, y + 48, { width: headerTextW, align: 'center' });

      y += 62;

      // ── Student Info ────────────────────────────────────────────────────────

      const infoRowH = 13;
      const col1W = CONTENT_W * 0.30;
      const col2W = CONTENT_W * 0.30;
      const col3W = CONTENT_W - col1W - col2W;

      // Row 1: Session | Term
      [
        { text: `Session: ${session}`, w: col1W, bold: false },
        { text: `Term: ${term}`,       w: col2W + col3W, bold: false },
      ].reduce((cx, c) => {
        strokeRect(doc, cx, y, c.w, infoRowH, GRID_LINE);
        cellText(doc, c.text, cx, y, c.w, infoRowH, { fontSize: 7, bold: c.bold });
        return cx + c.w;
      }, x);

      y += infoRowH;

      // Row 2: Student Name | Reg No
      [
        { text: `Name: ${studentName}`, w: col1W + col2W },
        { text: `Reg No: ${regNo}`,     w: col3W },
      ].reduce((cx, c) => {
        strokeRect(doc, cx, y, c.w, infoRowH, GRID_LINE);
        cellText(doc, c.text, cx, y, c.w, infoRowH, { fontSize: 7, bold: false });
        return cx + c.w;
      }, x);

      y += infoRowH;

      // Row 3: Class | Next Term | Term End
      [
        { text: `Class: ${cls}`,              w: col1W },
        { text: `Next term begins: ${nextTermBegins}`, w: col2W },
        { text: `Term ended: ${termEndDate}`, w: col3W },
      ].reduce((cx, c) => {
        strokeRect(doc, cx, y, c.w, infoRowH, GRID_LINE);
        cellText(doc, c.text, cx, y, c.w, infoRowH, { fontSize: 7 });
        return cx + c.w;
      }, x);

      y += infoRowH;

      // ── Performance Summary ─────────────────────────────────────────────────

      const perfRowH  = 20;
      const perfCols  = 4;
      const perfColW  = CONTENT_W / perfCols;

      const perfRows = [
        [
          { label: 'Position in entire class',     value: classInfo.positionInClass      || '-' },
          { label: 'Position in class section',    value: classInfo.positionInSection    || '-' },
          { label: 'No. of students in class',     value: classInfo.studentsInClass      || '-' },
          { label: 'No. of days school opened',    value: classInfo.schoolDaysOpened     || '-' },
        ],
        [
          { label: 'Overall total score',          value: classInfo.totalScore           || '-' },
          { label: "Student's average score",      value: classInfo.studentAvg           || '-' },
          { label: 'Class section average score',  value: classInfo.classSectionAvg      || '-' },
          { label: 'No. of days present',          value: classInfo.daysPresent          || '-' },
        ],
        [
          { label: 'Highest average in section',   value: classInfo.highestAvgInSection  || '-' },
          { label: 'Lowest average in section',    value: classInfo.lowestAvgInSection   || '-' },
          { label: 'Overall performance',          value: classInfo.overallPerformance   || '-' },
          { label: 'No. of days absent',           value: classInfo.daysAbsent           || '-' },
        ],
      ];

      perfRows.forEach((row) => {
        row.forEach(({ label, value }, i) => {
          const cx = x + i * perfColW;
          strokeRect(doc, cx, y, perfColW, perfRowH, GRID_LINE);
          cellText(doc, label, cx, y + 2, perfColW, 9, { fontSize: 6, color: '#444444' });
          cellText(doc, String(value), cx, y + 11, perfColW, 9, { fontSize: 7.5, bold: true });
        });
        y += perfRowH;
      });

      // ── Subject Table ───────────────────────────────────────────────────────

      const subjectRowH = 11;
      const subjectHdrH = 38;

      // Column widths (must sum to CONTENT_W ≈ 559)
      const subjectCols = [
        { label: 'SUBJECT',             w: 104, align: 'left' },
        { label: 'TEST 1\n(20)',         w: 24, align: 'center' },
        { label: 'TEST 2\n(20)',         w: 24, align: 'center' },
        { label: 'EXAM\n(60)',           w: 24, align: 'center' },
        { label: '1ST\nTERM',           w: 26, align: 'center' },
        { label: 'TOTAL\n(200)',         w: 28, align: 'center' },
        { label: 'CUMUL.\nAVG',         w: 30, align: 'center' },
        { label: 'GRADE',               w: 24, align: 'center' },
        { label: 'POS.',                w: 22, align: 'center' },
        { label: 'CLS\nAVG',            w: 30, align: 'center' },
        { label: 'HIGHEST\nIN CLS',     w: 34, align: 'center' },
        { label: 'LOWEST\nIN CLS',      w: 34, align: 'center' },
        { label: 'REMARK',              w: 55, align: 'left' },
      ];

      const totalSubjectW = subjectCols.reduce((s, c) => s + c.w, 0);
      // Adjust last column if total doesn't perfectly match
      subjectCols[subjectCols.length - 1].w += CONTENT_W - totalSubjectW;

      // Header
      subjectCols.forEach((col, i) => {
        const cx = x + subjectCols.slice(0, i).reduce((s, c) => s + c.w, 0);
        fillRect(doc, cx, y, col.w, subjectHdrH, HEADER_BG);
        strokeRect(doc, cx, y, col.w, subjectHdrH, GRID_LINE);

        // Vertical text simulation: just use small font + center
        const lines = col.label.split('\n');
        const lineH = 8;
        const startY = y + (subjectHdrH - lines.length * lineH) / 2;
        lines.forEach((line, li) => {
          doc.save()
            .font('Helvetica-Bold').fontSize(5.5).fillColor(WHITE)
            .text(line, cx + 1, startY + li * lineH, {
              width:   col.w - 2,
              align:   'center',
              lineBreak: false,
            })
            .restore();
        });
      });

      y += subjectHdrH;

      subjects.forEach((s, ri) => {
        const bg = ri % 2 === 0 ? WHITE : ROW_ALT_BG;
        const rowData = [
          { text: `${ri + 1}. ${s.name}`,          align: 'left',   bold: true  },
          { text: s.test1  ?? '-',                  align: 'center' },
          { text: s.test2  ?? '-',                  align: 'center' },
          { text: s.exam   ?? '-',                  align: 'center' },
          { text: s.firstTerm ?? '-',               align: 'center' },
          { text: s.total  ?? '-',                  align: 'center', bold: true  },
          { text: s.cumulativeAvg ?? '-',           align: 'center' },
          { text: s.grade  ?? '-',                  align: 'center', bold: true  },
          { text: s.position ?? '-',                align: 'center' },
          { text: s.classAvg ?? '-',                align: 'center' },
          { text: s.highest ?? '-',                 align: 'center' },
          { text: s.lowest ?? '-',                  align: 'center' },
          { text: s.remark ?? '-',                  align: 'left'   },
        ];

        rowData.forEach((cell, i) => {
          const cx = x + subjectCols.slice(0, i).reduce((s, c) => s + c.w, 0);
          fillRect(doc, cx, y, subjectCols[i].w, subjectRowH, bg);
          strokeRect(doc, cx, y, subjectCols[i].w, subjectRowH, GRID_LINE);
          cellText(doc, String(cell.text), cx, y, subjectCols[i].w, subjectRowH, {
            fontSize: 6,
            bold:     cell.bold || false,
            align:    cell.align || 'left',
          });
        });

        y += subjectRowH;
      });

      // ── Affective / Psychomotor / Grade Key row ─────────────────────────────

      const bottomSectionY  = y;
      const bottomSectionH  = 120; // approximate
      const affW   = CONTENT_W * 0.27;
      const psyW   = CONTENT_W * 0.27;
      const gradeW = CONTENT_W - affW - psyW;
      const traitRowH = 10;

      // ── Left column: Affective traits ──────────────────────────────────────

      let colY = bottomSectionY;

      colY = sectionBanner(doc, x, colY, affW, 12, 'AFFECTIVE TRAITS');

      // mini header
      const traitHdrH = 9;
      strokeRect(doc, x, colY, affW * 0.7, traitHdrH, GRID_LINE);
      cellText(doc, 'Trait', x, colY, affW * 0.7, traitHdrH, { fontSize: 6, bold: true });
      strokeRect(doc, x + affW * 0.7, colY, affW * 0.3, traitHdrH, GRID_LINE);
      cellText(doc, 'Rating', x + affW * 0.7, colY, affW * 0.3, traitHdrH, { fontSize: 6, bold: true, align: 'center' });
      colY += traitHdrH;

      AFFECTIVE_TRAITS.forEach((trait, ri) => {
        const bg  = ri % 2 === 0 ? WHITE : ROW_ALT_BG;
        const rating = affective[trait] ?? 0;
        fillRect(doc, x, colY, affW, traitRowH, bg);
        strokeRect(doc, x, colY, affW * 0.7, traitRowH, GRID_LINE);
        cellText(doc, trait, x, colY, affW * 0.7, traitRowH, { fontSize: 5.5 });
        strokeRect(doc, x + affW * 0.7, colY, affW * 0.3, traitRowH, GRID_LINE);
        cellText(doc, String(rating || '-'), x + affW * 0.7, colY, affW * 0.3, traitRowH, { fontSize: 6, bold: true, align: 'center' });
        colY += traitRowH;
      });

      // ── Middle column: Psychomotor ─────────────────────────────────────────

      const psyX = x + affW;
      let psyY   = bottomSectionY;

      psyY = sectionBanner(doc, psyX, psyY, psyW, 12, 'PSYCHOMOTOR SKILLS');

      strokeRect(doc, psyX, psyY, psyW * 0.7, traitHdrH, GRID_LINE);
      cellText(doc, 'Skill', psyX, psyY, psyW * 0.7, traitHdrH, { fontSize: 6, bold: true });
      strokeRect(doc, psyX + psyW * 0.7, psyY, psyW * 0.3, traitHdrH, GRID_LINE);
      cellText(doc, 'Rating', psyX + psyW * 0.7, psyY, psyW * 0.3, traitHdrH, { fontSize: 6, bold: true, align: 'center' });
      psyY += traitHdrH;

      PSYCHOMOTOR_SKILLS.forEach((skill, ri) => {
        const bg     = ri % 2 === 0 ? WHITE : ROW_ALT_BG;
        const rating = psychomotor[skill] ?? 0;
        fillRect(doc, psyX, psyY, psyW, traitRowH, bg);
        strokeRect(doc, psyX, psyY, psyW * 0.7, traitRowH, GRID_LINE);
        cellText(doc, skill, psyX, psyY, psyW * 0.7, traitRowH, { fontSize: 5.5 });
        strokeRect(doc, psyX + psyW * 0.7, psyY, psyW * 0.3, traitRowH, GRID_LINE);
        cellText(doc, String(rating || '-'), psyX + psyW * 0.7, psyY, psyW * 0.3, traitRowH, { fontSize: 6, bold: true, align: 'center' });
        psyY += traitRowH;
      });

      // ── Right column: Grade scale + Rating key ─────────────────────────────

      const gradeX = x + affW + psyW;
      let gradeY   = bottomSectionY;

      gradeY = sectionBanner(doc, gradeX, gradeY, gradeW, 12, 'SCORE RANGE');

      const gradeHeaders = ['Range', 'GRADE', 'MEANING'];
      const gradeColW    = [gradeW * 0.54, gradeW * 0.2, gradeW * 0.26];

      gradeHeaders.forEach((h, i) => {
        const gx = gradeX + gradeColW.slice(0, i).reduce((a, b) => a + b, 0);
        strokeRect(doc, gx, gradeY, gradeColW[i], traitHdrH, GRID_LINE);
        cellText(doc, h, gx, gradeY, gradeColW[i], traitHdrH, { fontSize: 6, bold: true, align: 'center' });
      });
      gradeY += traitHdrH;

      const gradeScale = [
        ['0% – <40%',      'F9', 'Fail'     ],
        ['>=40% – <45%',   'E8', 'Pass'     ],
        ['>=45% – <50%',   'D7', 'Pass'     ],
        ['>=50% – <55%',   'C6', 'Credit'   ],
        ['>=55% – <60%',   'C5', 'Credit'   ],
        ['>=60% – <65%',   'C4', 'Credit'   ],
        ['>=65% – <70%',   'B3', 'Good'     ],
        ['>=70% – <75%',   'B2', 'Very Good'],
        ['>=75% – 100%',   'A1', 'Excellent'],
      ];

      gradeScale.forEach(([range, grade, meaning], ri) => {
        const bg = ri % 2 === 0 ? WHITE : ROW_ALT_BG;
        [range, grade, meaning].forEach((val, i) => {
          const gx = gradeX + gradeColW.slice(0, i).reduce((a, b) => a + b, 0);
          fillRect(doc, gx, gradeY, gradeColW[i], traitRowH, bg);
          strokeRect(doc, gx, gradeY, gradeColW[i], traitRowH, GRID_LINE);
          cellText(doc, val, gx, gradeY, gradeColW[i], traitRowH, {
            fontSize: 5.5,
            bold:     i === 1,
            align:    i === 1 ? 'center' : 'left',
          });
        });
        gradeY += traitRowH;
      });

      // Rating key sub-section
      gradeY += 4;
      gradeY = sectionBanner(doc, gradeX, gradeY, gradeW, 12, 'RATING KEY');

      const keyRows = [
        ['5', 'Excellent degree of observation'],
        ['4', 'High level of observation trait'],
        ['3', 'Acceptable level of observation'],
        ['2', 'Minimal level of observation'],
        ['1', 'No regard for observation trait'],
      ];

      const kW = [gradeW * 0.15, gradeW * 0.85];
      keyRows.forEach(([k, v], ri) => {
        const bg = ri % 2 === 0 ? WHITE : ROW_ALT_BG;
        [k, v].forEach((val, i) => {
          const gx = gradeX + kW.slice(0, i).reduce((a, b) => a + b, 0);
          fillRect(doc, gx, gradeY, kW[i], traitRowH, bg);
          strokeRect(doc, gx, gradeY, kW[i], traitRowH, GRID_LINE);
          cellText(doc, val, gx, gradeY, kW[i], traitRowH, { fontSize: 5.5, bold: i === 0, align: i === 0 ? 'center' : 'left' });
        });
        gradeY += traitRowH;
      });

      // Advance Y to the tallest column
      y = Math.max(colY, psyY, gradeY) + 4;

      // ── Closing banner ──────────────────────────────────────────────────────

      const bannerH = 12;
      fillRect(doc, x, y, CONTENT_W, bannerH, HEADER_BG);
      strokeRect(doc, x, y, CONTENT_W, bannerH, GRID_LINE);
      cellText(doc, 'PROGRESS COLLEGE WISHES YOU A BLISSFUL END OF THE YEAR CELEBRATION!', x, y, CONTENT_W, bannerH, {
        fontSize: 7,
        bold:     true,
        color:    WHITE,
        align:    'center',
      });
      y += bannerH;

      // ── Teacher & Principal comments ────────────────────────────────────────

      const commentRowH = 16;
      const labelW      = CONTENT_W * 0.22;
      const commentW    = CONTENT_W - labelW;

      [
        { label: "Class teacher's report", value: classTeacherComment || '-' },
        { label: "Principal's report",     value: principalComment    || '-' },
      ].forEach(({ label, value }) => {
        strokeRect(doc, x,          y, labelW,   commentRowH, GRID_LINE);
        strokeRect(doc, x + labelW, y, commentW, commentRowH, GRID_LINE);
        cellText(doc, label, x,          y, labelW,   commentRowH, { fontSize: 6.5, bold: true });
        cellText(doc, value, x + labelW, y, commentW, commentRowH, { fontSize: 6.5 });
        y += commentRowH;
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateReportCardPdf };
