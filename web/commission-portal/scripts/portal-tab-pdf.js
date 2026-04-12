"use strict";

/**
 * 포털 좌측 본문 탭(렌더된 HTML·marked·cite 장식까지 포함)을 그대로 PDF/프린터로 냅니다.
 * 브라우저가 그린 DOM + `styles.css`의 @media print 규칙을 그대로 탑니다.
 *
 * 주의: `waitUntil: load` 만 쓰면 MD fetch 전에 PDF가 나가 **원문에 `**`, `---`가 그대로** 찍힐 수 있습니다.
 * 이 스크립트는 networkidle + 제목에 `**` 없음까지 기다립니다.
 *
 * 준비:
 *   cd web/commission-portal && npm install
 *   다른 터미널에서 npm start (기본 http://127.0.0.1:8282)
 *
 * 사용:
 *   node scripts/portal-tab-pdf.js --tab appeal -o ../../temp/행정심판_포털.pdf
 *   node scripts/portal-tab-pdf.js --tab appeal --print
 *     → Edge 창이 뜬 뒤 인쇄 대화상자(물리 프린터·Microsoft Print to PDF)
 *   node scripts/portal-tab-pdf.js --base http://127.0.0.1:8282 --tab gab1 -o gab1.pdf
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const VALID_TABS = new Set(["appeal", "injunction", "gab1", "gab2", "gab3"]);

function parseArgs() {
  const a = process.argv.slice(2);
  let base = "http://127.0.0.1:8282";
  let tab = "appeal";
  let out = null;
  let printDialog = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--base" && a[i + 1]) {
      base = a[++i];
      continue;
    }
    if (a[i] === "--tab" && a[i + 1]) {
      tab = a[++i];
      continue;
    }
    if ((a[i] === "-o" || a[i] === "--output") && a[i + 1]) {
      out = a[++i];
      continue;
    }
    if (a[i] === "--print") {
      printDialog = true;
      continue;
    }
    if (a[i] === "-h" || a[i] === "--help") {
      console.log(`Usage: node scripts/portal-tab-pdf.js [--base URL] --tab TAB (-o FILE.pdf | --print)

  TAB: ${[...VALID_TABS].join(", ")}
  -o FILE.pdf   헤드리스로 PDF 저장(렌더 완료까지 대기)
  --print       Edge 창 + 인쇄 대화상자(화면과 같은 HTML·인쇄 CSS)
  기본 URL: http://127.0.0.1:8282  (먼저 npm start)`);
      process.exit(0);
    }
  }
  if (!out && !printDialog) {
    console.error(
      "-o 파일.pdf 또는 --print 중 하나를 지정하세요. 예:\n" +
        "  node scripts/portal-tab-pdf.js --tab appeal -o out.pdf\n" +
        "  node scripts/portal-tab-pdf.js --tab appeal --print"
    );
    process.exit(1);
  }
  if (!VALID_TABS.has(tab)) {
    console.error(`--tab 은 다음 중 하나여야 합니다: ${[...VALID_TABS].join(", ")}`);
    process.exit(1);
  }
  return { base: base.replace(/\/$/, ""), tab, out, printDialog };
}

/**
 * MD 가 marked 로 변환된 뒤인지 확인(제목 h1 에 리터럴 ** 가 남아 있으면 아직 원문·오류 상태).
 */
async function waitForRenderedMd(page, mainSelector) {
  await page.waitForSelector(`${mainSelector} h1`, { timeout: 120000 });
  await page.waitForFunction(
    (sel) => {
      const root = document.querySelector(sel);
      if (!root) return false;
      const h1 = root.querySelector("h1");
      if (!h1) return false;
      const t = h1.textContent || "";
      if (/\*\*/.test(t)) return false;
      const loading = root.querySelector("p.muted");
      if (
        loading &&
        /불러오는 중|내용을 불러오는/i.test(loading.textContent || "")
      ) {
        return false;
      }
      return true;
    },
    mainSelector,
    { timeout: 120000 }
  );
}

function promptEnter(msg) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(msg, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (e) {
    console.error(
      "playwright 패키지가 없습니다. commission-portal 폴더에서 다음을 실행하세요:\n" +
        "  npm install"
    );
    process.exit(1);
  }

  const { base, tab, out, printDialog } = parseArgs();
  const url = `${base}/#${tab}`;
  const selector = `#${tab}-md-main .md-content`;

  const outAbs = out ? path.resolve(process.cwd(), out) : null;
  if (outAbs) {
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  }

  const headless = !printDialog;
  let browser;
  try {
    browser = await chromium.launch({
      channel: "msedge",
      headless,
    });
  } catch {
    browser = await chromium.launch({ headless });
  }

  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 120000 });
    } catch {
      /* 일부 폴링이 있으면 networkidle 이 안 뜰 수 있음 — 아래 DOM 검사로 보완 */
    }
    await page.waitForSelector(selector, { timeout: 120000 });
    await waitForRenderedMd(page, selector);

    await page.emulateMedia({ media: "print" });

    if (printDialog) {
      console.log(
        "인쇄 대화상자를 엽니다. 프린터 또는「PDF로 저장」을 선택하세요."
      );
      await page.evaluate(() => window.print());
      await promptEnter("출력을 마친 뒤 Enter 를 누르면 브라우저를 닫습니다… ");
    } else {
      await page.pdf({
        path: outAbs,
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
      console.log(`작성: ${outAbs}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
