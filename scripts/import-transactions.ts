/**
 * One-off import of Transactions.xlsx into Cushqui through the public API (no direct DB access).
 *
 *   npm run import:transactions                       → simulation (default): validates, plans, simulates balances
 *   npm run import:execute                            → executes the plan against the API, sequentially
 *   npm run import:resume <runId>                     → continues an interrupted run (verifies the last
 *                                                       in-flight operation before going on)
 *
 * Options: --file <xlsx> · --mapping <json> · --execute · --resume <runId>
 * Config:  scripts/import.env (see scripts/import.env.example)
 * Output:  scripts/imports/import-<local date_time>_simulation|_execute/ with an annotated copy of the
 *          Excel (extra column with the result of each row), the log and the report.
 *
 * Sheets used: "Gastos" (EXPENSE), "Ingresos" (INCOME), "Movements" (OPENING / TRANSFER / ADJUST).
 * The "Transferencias" sheet is ignored on purpose (Movements already contains the transfers).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as ExcelJS from 'exceljs';

// ─── Types ───────────────────────────────────────────────────────────────────

type Kind = 'OPENING' | 'INCOME' | 'TRANSFER' | 'EXPENSE' | 'ADJUSTMENT';

interface Operation {
  key: string; // stable id: "<sheet>!<row>"
  sheet: string;
  row: number;
  kind: Kind;
  date: string; // YYYY-MM-DD (as in the Excel)
  timestamp: string; // ISO sent to the API (assigned after ordering, unique per operation)
  account: string; // API account name
  toAccount?: string; // TRANSFER only
  cents: number; // integer cents. Positive, except ADJUSTMENT (signed delta)
  category?: string;
  subcategory?: string;
  comment?: string;
}

interface Issue {
  sheet: string;
  row: number;
  message: string;
}

interface AccountMapping {
  name: string;
  type: 'BANK' | 'CASH' | 'CARD' | 'WALLET' | 'SAVINGS' | 'OTHER';
  icon?: string;
  color?: string;
}

type CategoryType = 'EXPENSE' | 'INCOME';

interface Mapping {
  currency: string;
  accounts: Record<string, AccountMapping>;
  /** Categories by type: the same name can exist as EXPENSE and as INCOME */
  categories: Record<CategoryType, Record<string, { icon?: string; color?: string; subcategories?: string[] }>>;
  loans: { category: string };
  /** Real final balance of each account (EUR). The simulation must reproduce it exactly. */
  expectedBalances?: Record<string, number>;
}

interface Plan {
  operations: Operation[];
  issues: Issue[];
  warnings: string[];
  finalBalances: Record<string, number>; // cents
  balancesBefore: Map<string, Record<string, number>>; // op key → balances (cents) right before it
  loanStats: { withSubcategory: number; withoutSubcategory: number };
  /** Accounts whose simulated final balance differs from mapping.expectedBalances (cents) */
  discrepancies: { account: string; expected: number; simulated: number }[];
}

interface LogEntry {
  at: string;
  event: 'run-start' | 'setup' | 'start' | 'done' | 'error' | 'ambiguous' | 'verified' | 'run-end';
  key?: string;
  sheet?: string;
  row?: number;
  kind?: Kind;
  id?: string;
  status?: number;
  message?: string;
  [extra: string]: unknown;
}

interface RegistryEntry {
  runId: string;
  sha256: string;
  apiUrl: string;
  email: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  finishedAt?: string;
}

// ─── Constants & arguments ───────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const IMPORTS_DIR = path.join(__dirname, 'imports');
const REGISTRY_FILE = path.join(IMPORTS_DIR, 'registry.json');
/** Every run keeps its files in scripts/imports/<runId>/ (runId = import-<date_time>_simulation|_execute) */
const runFile = (runId: string, suffix: string) => path.join(IMPORTS_DIR, runId, `${runId}${suffix}`);
/** Header row of each imported sheet (the "Transferencias" sheet is not imported) */
const IMPORTED_SHEETS: [string, number][] = [
  ['Gastos', 2],
  ['Ingresos', 2],
  ['Movements', 1],
];

/**
 * Writes a copy of the Excel with one extra column holding the result of each row ("<sheet>!<row>" → text).
 * The original file is never modified.
 */
async function annotateWorkbook(source: string, target: string, header: string, results: Map<string, string>) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(source);
  for (const [sheetName, headerRow] of IMPORTED_SHEETS) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    const column = sheet.columnCount + 1;
    const headerCell = sheet.getRow(headerRow).getCell(column);
    headerCell.value = header;
    headerCell.font = { bold: true };
    sheet.getColumn(column).width = 45;
    for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
      const text = results.get(`${sheetName}!${row}`);
      if (text) sheet.getRow(row).getCell(column).value = text;
    }
  }
  await workbook.xlsx.writeFile(target);
}
const ENV_FILE = path.join(__dirname, 'import.env');
const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_MAX_AGE_MS = 10 * 60_000; // access token lives 15 min → re-login every 10 min

// Order inside the same day, so balances never go negative needlessly:
// accounts exist first, money comes in, moves between accounts, goes out, and finally reconciles.
const KIND_PRIORITY: Record<Kind, number> = { OPENING: 0, INCOME: 1, TRANSFER: 2, EXPENSE: 3, ADJUSTMENT: 4 };

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const EXECUTE = args.includes('--execute');
const RESUME_RUN_ID = argValue('--resume');
if (args.includes('--resume') && (!RESUME_RUN_ID || RESUME_RUN_ID.startsWith('--'))) {
  console.error('❌ Falta el runId: npm run import:resume <runId>  (es el nombre de la carpeta …_execute en scripts/imports)');
  process.exit(1);
}

// A flag that reaches npm instead of the script (missing `--`, or Windows PowerShell 5.1, which strips
// `--` before calling npm) would silently change the mode. Stop and show commands that always work.
for (const flag of ['execute', 'resume', 'file', 'mapping']) {
  if (process.env[`npm_config_${flag}`] !== undefined && !args.includes(`--${flag}`)) {
    console.error(`❌ "--${flag}" llegó a npm y no al script (falta "--", o PowerShell 5.1 lo eliminó).`);
    console.error('   Comandos que funcionan en cualquier terminal:');
    console.error('     npm run import:transactions             (simulación)');
    console.error('     npm run import:execute                  (importación real)');
    console.error('     npm run import:resume <runId>           (reanudar)');
    console.error('     npx ts-node scripts/import-transactions.ts --execute --file <xlsx>   (otras opciones)');
    process.exit(1);
  }
}

if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const config = {
  apiUrl: (process.env.IMPORT_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/+$/, ''),
  email: process.env.IMPORT_EMAIL ?? '',
  password: process.env.IMPORT_PASSWORD ?? '',
  userName: process.env.IMPORT_USER_NAME ?? 'Import',
  sourceFile: argValue('--file') ?? process.env.IMPORT_SOURCE_FILE ?? '',
  mappingFile: argValue('--mapping') ?? path.join(__dirname, 'import-mapping.json'),
};

// ─── Small helpers ───────────────────────────────────────────────────────────

const fmtEUR = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;
const fmtDate = (isoDate: string) => isoDate.split('-').reverse().join('/');
/** Local date-time for run folders/files: 2026-10-13_20-50-21 */
const nowStamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};

class FatalError extends Error {
  /** true when the error was already added to the report */
  recorded = false;
}

function fail(message: string, recorded = false): never {
  const error = new FatalError(message);
  error.recorded = recorded;
  throw error;
}

/** Plain text of an ExcelJS cell value (handles rich text, hyperlinks and formulas). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && !(value instanceof Date)) {
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
    if ('text' in value) return String(value.text).trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('error' in value) return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Excel amount → integer cents. Rejects non-numbers, negatives and more than 2 decimals. */
function toCents(value: ExcelJS.CellValue): number | string {
  let raw: number;
  if (typeof value === 'number') raw = value;
  else if (typeof value === 'object' && value !== null && 'result' in value && typeof value.result === 'number') raw = value.result;
  else {
    const text = cellText(value).replace(/\s|€/g, '');
    if (!/^\d+([.,]\d+)?$/.test(text)) return `importe no numérico: "${cellText(value)}"`;
    raw = Number(text.replace(',', '.'));
  }
  if (!Number.isFinite(raw) || raw < 0) return `importe inválido: ${raw}`;
  const cents = Math.round(raw * 100);
  // Floats from Excel are compared to their cents rounding: more than 2 decimals is real data, not noise
  if (Math.abs(raw * 100 - cents) > 1e-6) return `importe con más de 2 decimales: ${raw}`;
  return cents;
}

/** Excel date cell → YYYY-MM-DD (Excel dates come as UTC midnight). */
function toIsoDate(value: ExcelJS.CellValue): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(cellText(value));
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return undefined;
}

/** Locates the header row and returns column indexes by header name. */
function headerColumns(sheet: ExcelJS.Worksheet, headerRow: number, required: string[]): Record<string, number> {
  const columns: Record<string, number> = {};
  sheet.getRow(headerRow).eachCell((cell, col) => {
    columns[cellText(cell.value)] = col;
  });
  const missing = required.filter((name) => !(name in columns));
  if (missing.length) fail(`Hoja "${sheet.name}": faltan columnas en la fila ${headerRow}: ${missing.join(', ')}`);
  return columns;
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// ─── 1. Read & validate the Excel ────────────────────────────────────────────

async function readOperations(file: string, mapping: Mapping): Promise<{ operations: Omit<Operation, 'timestamp'>[]; issues: Issue[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);

  const operations: Omit<Operation, 'timestamp'>[] = [];
  const issues: Issue[] = [];
  const loanCategory = mapping.loans.category;
  const loanSubcategories = mapping.categories.EXPENSE[loanCategory]?.subcategories ?? [];

  const mapAccount = (sheet: string, row: number, excelName: string): string | undefined => {
    const account = mapping.accounts[excelName];
    if (!account) issues.push({ sheet, row, message: `cuenta sin correspondencia en el mapeo: "${excelName}"` });
    return account?.name;
  };

  // Gastos / Ingresos: title in row 1, headers in row 2, data from row 3
  for (const [sheetName, kind] of [['Gastos', 'EXPENSE'], ['Ingresos', 'INCOME']] as const) {
    const sheet = workbook.getWorksheet(sheetName) ?? fail(`No existe la hoja "${sheetName}"`);
    const col = headerColumns(sheet, 2, ['Fecha y hora', 'Categoría', 'Cuenta', 'Cantidad en la divisa de la cuenta', 'Divisa de la cuenta', 'Comentario']);

    for (let row = 3; row <= sheet.rowCount; row++) {
      const cells = sheet.getRow(row);
      const get = (name: string) => cells.getCell(col[name]).value;
      if (Object.values(col).every((c) => cellText(cells.getCell(c).value) === '')) continue; // blank row

      const before = issues.length;
      const date = toIsoDate(get('Fecha y hora'));
      if (!date) issues.push({ sheet: sheetName, row, message: `fecha inválida: "${cellText(get('Fecha y hora'))}"` });

      const cents = toCents(get('Cantidad en la divisa de la cuenta'));
      if (typeof cents === 'string') issues.push({ sheet: sheetName, row, message: cents });
      else if (cents === 0) issues.push({ sheet: sheetName, row, message: 'importe 0' });

      const currency = cellText(get('Divisa de la cuenta'));
      if (currency !== mapping.currency) issues.push({ sheet: sheetName, row, message: `divisa no soportada: "${currency}"` });

      const account = mapAccount(sheetName, row, cellText(get('Cuenta')));
      const category = cellText(get('Categoría'));
      if (!mapping.categories[kind]?.[category]) issues.push({ sheet: sheetName, row, message: `categoría de ${kind === 'EXPENSE' ? 'gasto' : 'ingreso'} sin correspondencia en el mapeo: "${category}"` });

      const comment = cellText(get('Comentario')) || undefined;
      let subcategory: string | undefined;
      if (kind === 'EXPENSE' && category === loanCategory && comment) {
        const prefix = /^([^:]+):/.exec(comment)?.[1].trim().toLowerCase();
        subcategory = loanSubcategories.find((name) => name.toLowerCase() === prefix);
      }

      if (issues.length === before) {
        operations.push({ key: `${sheetName}!${row}`, sheet: sheetName, row, kind, date: date!, account: account!, cents: cents as number, category, subcategory, comment });
      }
    }
  }

  // Movements: headers in row 1
  const sheet = workbook.getWorksheet('Movements') ?? fail('No existe la hoja "Movements"');
  const col = headerColumns(sheet, 1, ['date', 'type', 'account', 'accountTo', 'amount', 'sign', 'comment']);
  for (let row = 2; row <= sheet.rowCount; row++) {
    const cells = sheet.getRow(row);
    const get = (name: string) => cells.getCell(col[name]).value;
    if (Object.values(col).every((c) => cellText(cells.getCell(c).value) === '')) continue;

    const before = issues.length;
    const issue = (message: string) => issues.push({ sheet: 'Movements', row, message });
    const date = toIsoDate(get('date'));
    if (!date) issue(`fecha inválida: "${cellText(get('date'))}"`);
    const type = cellText(get('type')).toUpperCase();
    const cents = toCents(get('amount'));
    if (typeof cents === 'string') issue(cents);
    const sign = cellText(get('sign'));
    const account = mapAccount('Movements', row, cellText(get('account')));
    const comment = cellText(get('comment')) || undefined;

    let operation: Omit<Operation, 'timestamp'> | undefined;
    if (type === 'OPENING') {
      if (sign && sign !== '+') issue(`OPENING con signo "${sign}" (las aperturas negativas no están soportadas)`);
      operation = { key: `Movements!${row}`, sheet: 'Movements', row, kind: 'OPENING', date: date!, account: account!, cents: cents as number, comment };
    } else if (type === 'TRANSFER') {
      const toAccount = mapAccount('Movements', row, cellText(get('accountTo')));
      if (account && toAccount && account === toAccount) issue('transferencia a la misma cuenta');
      if (cents === 0) issue('transferencia de 0');
      operation = { key: `Movements!${row}`, sheet: 'Movements', row, kind: 'TRANSFER', date: date!, account: account!, toAccount, cents: cents as number, comment };
    } else if (type === 'ADJUST') {
      if (sign !== '+' && sign !== '-') issue(`ADJUST sin signo válido ("+" o "-"): "${sign}"`);
      if (cents === 0) issue('ajuste de 0');
      const signed = sign === '-' ? -(cents as number) : (cents as number);
      operation = { key: `Movements!${row}`, sheet: 'Movements', row, kind: 'ADJUSTMENT', date: date!, account: account!, cents: signed, comment };
    } else {
      issue(`tipo de movimiento desconocido: "${type}"`);
    }

    if (operation && issues.length === before) operations.push(operation);
  }

  return { operations, issues };
}

// ─── 2. Timeline & simulation ────────────────────────────────────────────────

function buildPlan(rawOperations: Omit<Operation, 'timestamp'>[], issues: Issue[], mapping: Mapping): Plan {
  // Chronological order. Same day: by kind priority; same kind: the sheets list newest first,
  // so a higher row number is an earlier operation.
  const sorted = [...rawOperations].sort(
    (a, b) => a.date.localeCompare(b.date) || KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || b.row - a.row || a.sheet.localeCompare(b.sheet),
  );

  // Dates have no time: assign 12:00:00 UTC + n seconds per day. Noon avoids showing the
  // previous/next day in any timezone, and the seconds keep the import order and make every
  // operation identifiable (used to verify ambiguous requests).
  const perDay = new Map<string, number>();
  const operations: Operation[] = sorted.map((op) => {
    const n = perDay.get(op.date) ?? 0;
    perDay.set(op.date, n + 1);
    const time = new Date(`${op.date}T12:00:00.000Z`);
    time.setUTCSeconds(n);
    return { ...op, timestamp: time.toISOString() };
  });

  const warnings: string[] = [];
  const balances: Record<string, number> = {};
  const balancesBefore = new Map<string, Record<string, number>>();
  const negativeReported = new Set<string>();
  const issue = (op: Operation, message: string) => issues.push({ sheet: op.sheet, row: op.row, message });

  for (const op of operations) {
    balancesBefore.set(op.key, { ...balances });
    const exists = (account: string) => account in balances;

    if (op.kind === 'OPENING') {
      if (exists(op.account)) issue(op, `la cuenta "${op.account}" ya tiene una apertura anterior`);
      balances[op.account] = op.cents;
      continue;
    }
    for (const account of [op.account, op.toAccount].filter((a): a is string => !!a)) {
      if (!exists(account)) issue(op, `la cuenta "${account}" se usa el ${fmtDate(op.date)} antes de su apertura (OPENING)`);
    }
    if (!exists(op.account) || (op.toAccount && !exists(op.toAccount))) continue;

    if (op.kind === 'INCOME') balances[op.account] += op.cents;
    else if (op.kind === 'EXPENSE') balances[op.account] -= op.cents;
    else if (op.kind === 'ADJUSTMENT') balances[op.account] += op.cents;
    else if (op.kind === 'TRANSFER') {
      // The API rejects transfers without enough balance in the source account
      if (balances[op.account] < op.cents) {
        issue(op, `transferencia rechazable por la API: "${op.account}" tendría ${fmtEUR(balances[op.account])} y se transfieren ${fmtEUR(op.cents)}`);
      }
      balances[op.account] -= op.cents;
      balances[op.toAccount!] += op.cents;
    }

    for (const account of [op.account, op.toAccount]) {
      if (account && balances[account] < 0 && !negativeReported.has(account)) {
        negativeReported.add(account);
        warnings.push(`${fmtDate(op.date)}: "${account}" queda en negativo (${fmtEUR(balances[account])}) tras ${op.key} (${op.kind})`);
      }
    }
  }

  for (const account of Object.values(mapping.accounts)) {
    if (!(account.name in balances)) warnings.push(`la cuenta "${account.name}" del mapeo no tiene OPENING en el Excel: no se creará`);
  }

  const discrepancies: Plan['discrepancies'] = [];
  for (const [account, euros] of Object.entries(mapping.expectedBalances ?? {})) {
    if (account.startsWith('$')) continue; // "$comment"
    const expected = Math.round(euros * 100);
    const simulated = balances[account] ?? 0;
    if (expected !== simulated) discrepancies.push({ account, expected, simulated });
  }
  for (const account of Object.keys(balances)) {
    if (mapping.expectedBalances && !(account in mapping.expectedBalances)) warnings.push(`la cuenta "${account}" no tiene saldo esperado en expectedBalances`);
  }

  const loans = operations.filter((op) => op.category === mapping.loans.category);
  return {
    discrepancies,
    operations,
    issues,
    warnings,
    finalBalances: balances,
    balancesBefore,
    loanStats: { withSubcategory: loans.filter((op) => op.subcategory).length, withoutSubcategory: loans.filter((op) => !op.subcategory).length },
  };
}

function printPlan(plan: Plan) {
  const count = (kind: Kind) => plan.operations.filter((op) => op.kind === kind).length;
  console.log('\n📋 Operaciones planificadas');
  console.log(`   Aperturas de cuenta : ${count('OPENING')}`);
  console.log(`   Ingresos            : ${count('INCOME')}`);
  console.log(`   Gastos              : ${count('EXPENSE')}`);
  console.log(`   Transferencias      : ${count('TRANSFER')}`);
  console.log(`   Ajustes             : ${count('ADJUSTMENT')}`);
  console.log(`   Total               : ${plan.operations.length}`);
  console.log(`   Préstamos con subcategoría: ${plan.loanStats.withSubcategory} · sin subcategoría: ${plan.loanStats.withoutSubcategory}`);

  console.log('\n🕒 Línea de tiempo de cada cuenta (apertura y primer movimiento)');
  for (const opening of plan.operations.filter((op) => op.kind === 'OPENING')) {
    console.log(`   ${fmtDate(opening.date)}: Cuenta ${opening.account} se crea con ${fmtEUR(opening.cents)}`);
    const first = plan.operations.find((op) => op.kind !== 'OPENING' && (op.account === opening.account || op.toAccount === opening.account));
    if (first) {
      const what =
        first.kind === 'TRANSFER'
          ? `transferencia ${first.account} → ${first.toAccount} de ${fmtEUR(first.cents)}`
          : `${{ INCOME: 'ingreso', EXPENSE: 'gasto', ADJUSTMENT: 'ajuste' }[first.kind as 'INCOME' | 'EXPENSE' | 'ADJUSTMENT']} de ${fmtEUR(first.cents)}`;
      console.log(`   ${fmtDate(first.date)}:   primer movimiento → ${what} (${first.key})`);
    }
  }

  console.log('\n💶 Saldo final: simulado vs esperado');
  for (const [account, cents] of Object.entries(plan.finalBalances)) {
    const diff = plan.discrepancies.find((d) => d.account === account);
    const expected = diff ? diff.expected : cents;
    console.log(`   ${diff ? '❌' : '✅'} ${account.padEnd(20)} simulado ${fmtEUR(cents).padStart(14)} · esperado ${fmtEUR(expected).padStart(14)}${diff ? ` · diferencia ${fmtEUR(cents - expected)}` : ''}`);
  }
  for (const diff of plan.discrepancies.filter((d) => !(d.account in plan.finalBalances))) {
    console.log(`   ❌ ${diff.account.padEnd(20)} no se crea en la importación · esperado ${fmtEUR(diff.expected)}`);
  }
  if (plan.discrepancies.length) console.log(`   ⚠️  ${plan.discrepancies.length} cuentas no cuadran: la ejecución se bloquea hasta que coincidan`);

  if (plan.warnings.length) {
    console.log(`\n⚠️  Avisos (${plan.warnings.length})`);
    plan.warnings.forEach((w) => console.log(`   - ${w}`));
  }
  if (plan.issues.length) {
    console.log(`\n❌ Filas inválidas o sin correspondencia (${plan.issues.length})`);
    plan.issues.slice(0, 50).forEach((i) => console.log(`   - ${i.sheet} fila ${i.row}: ${i.message}`));
    if (plan.issues.length > 50) console.log(`   … y ${plan.issues.length - 50} más (ver informe)`);
  } else {
    console.log('\n✅ Sin filas inválidas ni datos sin correspondencia');
  }
}

// ─── 3. API client ───────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined, // undefined → no response (network / timeout)
    readonly ambiguous: boolean, // true → the server may or may not have applied the request
  ) {
    super(message);
  }
}

class Api {
  private token = '';
  private tokenAt = 0;

  constructor(private readonly baseUrl: string, private readonly email: string, private readonly password: string) {}

  async request<T>(method: string, route: string, body?: unknown, { auth = true, retriedAuth = false } = {}): Promise<T> {
    if (auth && Date.now() - this.tokenAt > TOKEN_MAX_AGE_MS) await this.login();

    let response: Response;
    let text: string;
    try {
      response = await fetch(`${this.baseUrl}${route}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${this.token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      text = await response.text();
    } catch (error) {
      // No (complete) response: for writes we cannot know whether the server applied it
      throw new ApiError(`${method} ${route}: sin respuesta (${(error as Error).message})`, undefined, method !== 'GET');
    }

    let data: any;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined; // e.g. an HTML error page from a proxy
    }
    if (response.ok && text && data === undefined) {
      throw new ApiError(`${method} ${route}: respuesta no JSON con HTTP ${response.status}`, response.status, method !== 'GET');
    }

    // A 401 is rejected by the auth guard before reaching the handler: safe to re-login and retry once
    if (response.status === 401 && auth && !retriedAuth) {
      await this.login();
      return this.request<T>(method, route, body, { auth, retriedAuth: true });
    }
    if (!response.ok) {
      const message = Array.isArray(data?.message) ? data.message.join('; ') : data?.message ?? text;
      // 5xx on a write may have happened after the data was saved
      throw new ApiError(`${method} ${route}: HTTP ${response.status} ${message}`, response.status, response.status >= 500 && method !== 'GET');
    }
    return data as T;
  }

  async register(name: string): Promise<'created' | 'exists'> {
    try {
      await this.request('POST', '/auth/register', { email: this.email, password: this.password, name }, { auth: false });
      return 'created';
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) return 'exists';
      throw error;
    }
  }

  async login() {
    // POST /auth/refresh rejects JWT refresh tokens (DTO expects a UUID), so we log in again instead
    const tokens = await this.request<{ accessToken: string }>('POST', '/auth/login', { email: this.email, password: this.password }, { auth: false });
    this.token = tokens.accessToken;
    this.tokenAt = Date.now();
  }
}

interface ApiAccount {
  id: string;
  name: string;
  balance: number;
}
interface ApiCategory {
  id: string;
  name: string;
  type: CategoryType;
  color?: string;
  userId: string | null;
  parentId: string | null;
  subcategories: ApiCategory[];
}
interface ApiTransaction {
  id: string;
  amount: number;
  transactionDate: string;
}
interface ApiMovement {
  id: string;
  type: string;
  amount: number;
  movementDate: string;
  account: { id: string };
  toAccount?: { id: string };
}

// ─── 4. Run registry & log ───────────────────────────────────────────────────

function readRegistry(): RegistryEntry[] {
  return fs.existsSync(REGISTRY_FILE) ? JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')) : [];
}

function saveRegistryEntry(entry: RegistryEntry) {
  const registry = readRegistry().filter((e) => e.runId !== entry.runId);
  registry.push(entry);
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

class RunLog {
  constructor(readonly file: string) {}

  write(entry: Omit<LogEntry, 'at'>) {
    // Append + fsync per line: the log must survive a crash right after a request
    const fd = fs.openSync(this.file, 'a');
    fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  }

  read(): LogEntry[] {
    if (!fs.existsSync(this.file)) return [];
    return fs
      .readFileSync(this.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

// ─── 5. Execution ────────────────────────────────────────────────────────────

interface Context {
  api: Api;
  accounts: Map<string, string>; // name → id
  categories: Map<string, string>; // "<type>/<name>" → id
  subcategories: Map<string, string>; // "<type>/<category>/<sub>" → id
}

async function loadAccounts(ctx: Context) {
  const accounts = await ctx.api.request<ApiAccount[]>('GET', '/accounts');
  ctx.accounts = new Map(accounts.map((a) => [a.name, a.id]));
  return accounts;
}

/** Lightens a hex color by a percentage (same faded shades the frontend shows for subcategories) */
function lightenColor(hex: string, percent: number): string {
  const channel = (i: number) => {
    const value = parseInt(hex.replace('#', '').substring(i, i + 2), 16);
    return Math.min(255, Math.round(value + (255 - value) * (percent / 100))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

async function ensureCategories(ctx: Context, mapping: Mapping, plan: Plan, userId: string, log: RunLog) {
  const used = new Set(plan.operations.filter((op) => op.category).map((op) => `${op.kind}/${op.category}`));
  const all = await ctx.api.request<ApiCategory[]>('GET', '/categories');
  const own = all.filter((c) => c.userId === userId && !c.parentId);

  for (const type of ['EXPENSE', 'INCOME'] as const) {
    for (const [name, def] of Object.entries(mapping.categories[type] ?? {})) {
      const key = `${type}/${name}`;
      let category = own.find((c) => c.name === name && c.type === type);
      if (!category) {
        category = await ctx.api.request<ApiCategory>('POST', '/categories', { name, type, icon: def.icon, color: def.color });
        category.subcategories = [];
        log.write({ event: 'setup', message: `categoría creada: ${key}`, id: category.id });
        console.log(`   + categoría ${key}${used.has(key) ? '' : ' (sin transacciones en el Excel)'}`);
      }
      ctx.categories.set(key, category.id);

      // Subcategory colors: parent lightened 20%, then each one 15% lighter than the previous
      let previousColor = category.subcategories.at(-1)?.color;
      for (const sub of def.subcategories ?? []) {
        let subcategory = category.subcategories.find((s) => s.name === sub);
        if (!subcategory) {
          const color = previousColor ? lightenColor(previousColor, 15) : lightenColor(def.color ?? '#95A5A6', 20);
          previousColor = color;
          subcategory = await ctx.api.request<ApiCategory>('POST', '/categories/subcategories', { name: sub, parentCategoryId: category.id, color });
          category.subcategories.push(subcategory);
          log.write({ event: 'setup', message: `subcategoría creada: ${key}/${sub}`, id: subcategory.id });
          console.log(`   + subcategoría ${key}/${sub}`);
        }
        ctx.subcategories.set(`${key}/${sub}`, subcategory.id);
      }
    }
  }
}

/** Sends one operation. Returns the id of the created record. */
async function sendOperation(ctx: Context, op: Operation, mapping: Mapping, expectedBalance: number | undefined): Promise<string> {
  const amount = op.cents / 100;
  const accountId = () => ctx.accounts.get(op.account) ?? fail(`${op.key}: la cuenta "${op.account}" no existe en la API`);

  switch (op.kind) {
    case 'OPENING': {
      const def = Object.values(mapping.accounts).find((a) => a.name === op.account)!;
      const account = await ctx.api.request<ApiAccount>('POST', '/accounts', {
        name: def.name,
        type: def.type,
        currency: mapping.currency,
        balance: amount,
        icon: def.icon,
        color: def.color,
        openingDate: op.timestamp,
      });
      ctx.accounts.set(account.name, account.id);
      return account.id;
    }
    case 'INCOME':
    case 'EXPENSE': {
      const transaction = await ctx.api.request<ApiTransaction>('POST', '/transactions', {
        accountId: accountId(),
        amount,
        currency: mapping.currency,
        type: op.kind,
        description: op.comment,
        categoryId: ctx.categories.get(`${op.kind}/${op.category}`) ?? fail(`${op.key}: categoría "${op.kind}/${op.category}" no creada`),
        subcategoryId: op.subcategory ? ctx.subcategories.get(`${op.kind}/${op.category}/${op.subcategory}`) : undefined,
        transactionDate: op.timestamp,
      });
      return transaction.id;
    }
    case 'TRANSFER': {
      const transfer = await ctx.api.request<{ movementId: string }>('POST', '/transfers', {
        fromAccountId: accountId(),
        toAccountId: ctx.accounts.get(op.toAccount!) ?? fail(`${op.key}: la cuenta "${op.toAccount}" no existe en la API`),
        amount,
        currency: mapping.currency,
        date: op.timestamp,
        note: op.comment,
      });
      return transfer.movementId;
    }
    case 'ADJUSTMENT': {
      // The API sets an absolute balance: read the current one and add the Excel delta
      const account = await ctx.api.request<ApiAccount>('GET', `/accounts/${accountId()}`);
      const currentCents = Math.round(account.balance * 100);
      if (expectedBalance !== undefined && currentCents !== expectedBalance) {
        fail(`${op.key}: el saldo de "${op.account}" en la API (${fmtEUR(currentCents)}) no coincide con el simulado (${fmtEUR(expectedBalance)}). Se detiene para no ajustar sobre un saldo incorrecto.`);
      }
      await ctx.api.request<ApiAccount>('POST', `/accounts/${account.id}/adjustments`, {
        balance: (currentCents + op.cents) / 100,
        note: op.comment,
        date: op.timestamp,
      });
      const movement = await findMovement(ctx, op, 'ADJUSTMENT');
      return movement?.id ?? 'unknown';
    }
  }
}

async function findMovement(ctx: Context, op: Operation, type: 'TRANSFER' | 'ADJUSTMENT'): Promise<ApiMovement | undefined> {
  const accountId = ctx.accounts.get(op.account);
  if (!accountId) return undefined;
  const query = new URLSearchParams({ accountId, type, from: op.timestamp, to: op.timestamp, limit: '100' });
  const page = await ctx.api.request<{ data: ApiMovement[] }>('GET', `/movements?${query}`);
  return page.data.find(
    (m) =>
      new Date(m.movementDate).toISOString() === op.timestamp &&
      m.account.id === accountId &&
      Math.round(m.amount * 100) === op.cents &&
      (type === 'ADJUSTMENT' || m.toAccount?.id === ctx.accounts.get(op.toAccount!)),
  );
}

/** Checks whether an operation whose result is unknown was actually saved. Unique timestamps make it exact. */
async function verifyOperation(ctx: Context, op: Operation): Promise<string | undefined> {
  await loadAccounts(ctx);
  if (op.kind === 'OPENING') return ctx.accounts.get(op.account);
  if (op.kind === 'TRANSFER' || op.kind === 'ADJUSTMENT') return (await findMovement(ctx, op, op.kind))?.id;

  const accountId = ctx.accounts.get(op.account);
  if (!accountId) return undefined;
  const query = new URLSearchParams({ accountId, type: op.kind, from: op.timestamp, to: op.timestamp, limit: '100' });
  const page = await ctx.api.request<{ data: ApiTransaction[] }>('GET', `/transactions?${query}`);
  return page.data.find((t) => new Date(t.transactionDate).toISOString() === op.timestamp && Math.round(t.amount * 100) === op.cents)?.id;
}

async function execute(plan: Plan, mapping: Mapping, sourceFile: string) {
  if (plan.issues.length) fail(`Hay ${plan.issues.length} filas inválidas o sin correspondencia. Corrígelas antes de ejecutar (ver simulación).`);
  if (plan.discrepancies.length) fail(`El saldo final simulado no coincide con el esperado en ${plan.discrepancies.length} cuentas. Corrige el Excel o expectedBalances antes de ejecutar.`);
  if (!config.email || !config.password) fail('Faltan IMPORT_EMAIL / IMPORT_PASSWORD (scripts/import.env).');

  const host = new URL(config.apiUrl).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) fail(`IMPORT_API_URL apunta a "${host}". Este script solo se ejecuta contra la API local (BD dev).`);

  const fileHash = sha256(sourceFile);
  const registry = readRegistry();
  const previous = registry.filter((e) => e.sha256 === fileHash && e.email === config.email && e.apiUrl === config.apiUrl);

  let runId: string;
  if (RESUME_RUN_ID) {
    const entry = registry.find((e) => e.runId === RESUME_RUN_ID) ?? fail(`No existe la ejecución "${RESUME_RUN_ID}" en ${REGISTRY_FILE}`);
    if (entry.status === 'completed') fail(`La ejecución ${RESUME_RUN_ID} ya terminó. No se reanuda para no duplicar datos.`);
    if (entry.sha256 !== fileHash) fail(`El Excel no es el mismo que el de la ejecución ${RESUME_RUN_ID} (hash distinto).`);
    runId = RESUME_RUN_ID;
  } else {
    if (previous.length) {
      const list = previous.map((e) => `${e.runId} (${e.status})`).join(', ');
      fail(`Este Excel ya se importó o se intentó importar para ${config.email}: ${list}.\n   Para continuar una ejecución interrumpida usa --resume <runId>. No se vuelve a importar para no duplicar movimientos.`);
    }
    runId = `import-${nowStamp()}_execute`;
  }

  // .original.xlsx: untouched copy (its hash identifies the import; --resume replays it)
  // .xlsx: copy with the "Importación" column, rewritten at the end of every run
  const originalExcel = runFile(runId, '.original.xlsx');
  const runExcel = runFile(runId, '.xlsx');
  const log = new RunLog(runFile(runId, '.log'));
  const reportFile = runFile(runId, '.report.json');
  if (!RESUME_RUN_ID) {
    fs.mkdirSync(path.dirname(runExcel), { recursive: true });
    fs.copyFileSync(sourceFile, originalExcel);
  }

  const startedAt = new Date().toISOString();
  saveRegistryEntry({ runId, sha256: fileHash, apiUrl: config.apiUrl, email: config.email, status: 'running', startedAt: registry.find((e) => e.runId === runId)?.startedAt ?? startedAt });
  log.write({ event: 'run-start', message: RESUME_RUN_ID ? 'resume' : 'new', sourceFile, sha256: fileHash, operations: plan.operations.length });

  const api = new Api(config.apiUrl, config.email, config.password);
  const ctx: Context = { api, accounts: new Map(), categories: new Map(), subcategories: new Map() };
  const successes: { key: string; sheet: string; row: number; kind: Kind; id: string }[] = [];
  const errors: { key?: string; sheet?: string; row?: number; status?: number; message: string }[] = [];
  let status: 'completed' | 'failed' = 'failed';
  let finalCheck: Record<string, { expected: string; api: string; match: boolean }> = {};

  try {
    console.log(`\n🚀 Ejecución ${runId} contra ${config.apiUrl}`);
    await api.request('GET', '/health', undefined, { auth: false });

    // User: created if missing, otherwise reused (only allowed when resuming)
    const userState = await api.register(config.userName);
    await api.login();
    const me = await api.request<{ id: string; email: string }>('GET', '/auth/me');
    log.write({ event: 'setup', message: `usuario ${me.email} (${userState === 'created' ? 'creado' : 'existente'})`, id: me.id });
    console.log(`   Usuario ${me.email}: ${userState === 'created' ? 'creado' : 'ya existía'}`);

    const existingAccounts = await loadAccounts(ctx);
    if (!RESUME_RUN_ID && existingAccounts.length) {
      fail(`El usuario ${me.email} ya tiene ${existingAccounts.length} cuentas (${existingAccounts.map((a) => a.name).join(', ')}). Para no duplicar datos solo se importa sobre un usuario vacío.`);
    }

    await ensureCategories(ctx, mapping, plan, me.id, log);

    // Resume: skip what was confirmed, verify what was in flight
    const done = new Map<string, string>();
    for (const entry of log.read()) {
      if ((entry.event === 'done' || entry.event === 'verified') && entry.key) done.set(entry.key, entry.id ?? '');
    }
    const lastStart = [...log.read()].reverse().find((e) => e.event === 'start');
    if (RESUME_RUN_ID && lastStart?.key && !done.has(lastStart.key)) {
      const op = plan.operations.find((o) => o.key === lastStart.key) ?? fail(`Operación ${lastStart.key} del log no encontrada en el plan`);
      const id = await verifyOperation(ctx, op);
      if (id) {
        log.write({ event: 'verified', key: op.key, sheet: op.sheet, row: op.row, kind: op.kind, id, message: 'registrada en la API: no se reenvía' });
        done.set(op.key, id);
        console.log(`   🔎 ${op.key} ya estaba registrada en la API (${id}): no se reenvía`);
      } else {
        console.log(`   🔎 ${op.key} no está registrada en la API: se enviará de nuevo`);
      }
    }
    if (done.size) console.log(`   ⏭  ${done.size} operaciones ya importadas en esta ejecución se omiten`);

    let processed = 0;
    for (const op of plan.operations) {
      if (done.has(op.key)) continue;
      const expected = op.kind === 'ADJUSTMENT' ? plan.balancesBefore.get(op.key)?.[op.account] : undefined;

      log.write({ event: 'start', key: op.key, sheet: op.sheet, row: op.row, kind: op.kind, timestamp: op.timestamp, cents: op.cents });
      try {
        const id = await sendOperation(ctx, op, mapping, expected);
        log.write({ event: 'done', key: op.key, sheet: op.sheet, row: op.row, kind: op.kind, id });
        successes.push({ key: op.key, sheet: op.sheet, row: op.row, kind: op.kind, id });
      } catch (error) {
        const apiError = error instanceof ApiError ? error : undefined;
        const message = (error as Error).message;
        log.write({ event: apiError?.ambiguous ? 'ambiguous' : 'error', key: op.key, sheet: op.sheet, row: op.row, kind: op.kind, status: apiError?.status, message });
        errors.push({ key: op.key, sheet: op.sheet, row: op.row, status: apiError?.status, message });
        if (apiError?.ambiguous) {
          fail(`${op.sheet} fila ${op.row}: resultado desconocido (${message}).\n   No se reintenta. Comprueba que la API funciona y reanuda con: --execute --resume ${runId} (verificará si se registró).`, true);
        }
        fail(`${op.sheet} fila ${op.row}: ${message}`, true);
      }

      processed++;
      if (processed % 100 === 0) console.log(`   … ${processed} operaciones enviadas`);
    }

    // Final check: API balances must match the simulation
    const accounts = await loadAccounts(ctx);
    for (const [name, cents] of Object.entries(plan.finalBalances)) {
      const apiCents = Math.round((accounts.find((a) => a.name === name)?.balance ?? NaN) * 100);
      finalCheck[name] = { expected: fmtEUR(cents), api: fmtEUR(apiCents), match: apiCents === cents };
    }
    if (Object.values(finalCheck).some((c) => !c.match)) {
      errors.push({ message: 'Los saldos finales de la API no coinciden con la simulación (ver finalBalances)' });
    } else {
      status = 'completed';
    }
  } catch (error) {
    if (!(error instanceof FatalError && error.recorded)) errors.push({ message: (error as Error).message });
    console.error(`\n❌ ${(error as Error).message}`);
  } finally {
    const finishedAt = new Date().toISOString();
    log.write({ event: 'run-end', message: status });
    saveRegistryEntry({ runId, sha256: fileHash, apiUrl: config.apiUrl, email: config.email, status, startedAt, finishedAt });

    const allDone = log.read().filter((e) => e.event === 'done' || e.event === 'verified');
    const report = {
      runId,
      mode: 'execute',
      resumed: !!RESUME_RUN_ID,
      status,
      apiUrl: config.apiUrl,
      user: config.email,
      sourceFile,
      originalCopy: originalExcel,
      annotatedExcel: runExcel,
      sha256: fileHash,
      startedAt,
      finishedAt,
      planned: plan.operations.length,
      importedThisRun: successes.length,
      importedTotal: allDone.length,
      importedByKind: countBy(allDone.map((e) => e.kind ?? 'unknown')),
      errors,
      finalBalances: finalCheck,
      warnings: plan.warnings,
      successes: allDone.map((e) => ({ key: e.key, sheet: e.sheet, row: e.row, kind: e.kind, id: e.id })),
    };
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    // Annotated Excel: the last log event of each row decides its result (includes earlier resumed runs)
    const results = new Map<string, string>(plan.operations.map((op) => [op.key, '⏸ No procesada']));
    for (const entry of log.read()) {
      if (!entry.key) continue;
      if (entry.event === 'done') results.set(entry.key, `✅ Importada (${entry.id})`);
      else if (entry.event === 'verified') results.set(entry.key, `✅ Importada, verificada al reanudar (${entry.id})`);
      else if (entry.event === 'error') results.set(entry.key, `❌ Error: ${entry.message}`);
      else if (entry.event === 'ambiguous') results.set(entry.key, `⚠️ Resultado desconocido: reanudar con --resume ${runId}`);
      else if (entry.event === 'start') results.set(entry.key, `⚠️ En curso al detenerse: reanudar con --resume ${runId}`);
    }
    try {
      await annotateWorkbook(originalExcel, runExcel, 'Importación', results);
    } catch (error) {
      console.error(`   ⚠️  No se pudo escribir el Excel con resultados: ${(error as Error).message}`);
    }

    console.log(`\n📊 Resumen ${runId}: ${status === 'completed' ? '✅ completada' : '❌ fallida / incompleta'}`);
    console.log(`   Importadas en esta ejecución: ${successes.length} · total de la importación: ${allDone.length}/${plan.operations.length}`);
    console.log(`   Errores: ${errors.length}`);
    errors.forEach((e) => console.log(`   - ${e.sheet ? `${e.sheet} fila ${e.row}: ` : ''}${e.message}`));
    for (const [name, check] of Object.entries(finalCheck)) console.log(`   ${check.match ? '✅' : '❌'} ${name.padEnd(20)} esperado ${check.expected.padStart(14)} · API ${check.api.padStart(14)}`);
    console.log(`   Carpeta: ${path.relative(ROOT, path.dirname(reportFile))} (Excel con columna "Importación", log e informe)`);
    if (status !== 'completed') process.exitCode = 1;
  }
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, v) => ((acc[v] = (acc[v] ?? 0) + 1), acc), {});
}

/**
 * Simulation only: looks at the current state of the user in the API WITHOUT writing anything
 * (login + GET requests; never register or create).
 */
async function readOnlyApiCheck(): Promise<Record<string, unknown>> {
  console.log(`\n🔍 Estado actual en la API (solo lectura): ${config.apiUrl}`);
  if (!config.email || !config.password) {
    console.log('   (sin credenciales en scripts/import.env: no se consulta)');
    return { checked: false };
  }
  const api = new Api(config.apiUrl, config.email, config.password);
  try {
    await api.request('GET', '/health', undefined, { auth: false });
  } catch (error) {
    console.log(`   ⚠️  API no disponible (${(error as Error).message}). La simulación sigue sin consultarla.`);
    return { checked: false, reachable: false };
  }

  try {
    await api.login();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      console.log(`   Usuario ${config.email}: no existe (o la contraseña no coincide). La ejecución lo crearía.`);
      return { checked: true, reachable: true, userExists: false };
    }
    throw error;
  }

  try {
    return await describeUser(api);
  } catch (error) {
    console.log(`   ⚠️  No se pudo consultar el estado del usuario (${(error as Error).message}). La simulación sigue sin esa información.`);
    return { checked: false, reachable: true, error: (error as Error).message };
  }
}

async function describeUser(api: Api): Promise<Record<string, unknown>> {
  const me = await api.request<{ id: string }>('GET', '/auth/me');
  const accounts = await api.request<ApiAccount[]>('GET', '/accounts');
  const categories = (await api.request<ApiCategory[]>('GET', '/categories')).filter((c) => c.userId === me.id);
  const transactions = await api.request<{ meta: { total: number } }>('GET', '/transactions?limit=1');
  const movements = await api.request<{ meta: { total: number } }>('GET', '/movements?limit=1');

  console.log(`   Usuario ${config.email}: existe`);
  console.log(`   Cuentas: ${accounts.length} · categorías propias: ${categories.length} · transacciones: ${transactions.meta.total} · movimientos: ${movements.meta.total}`);
  if (accounts.length) {
    accounts.forEach((a) => console.log(`     - ${a.name}: ${a.balance.toFixed(2)} EUR`));
    console.log('   ⚠️  El usuario ya tiene cuentas: la ejecución se negará a importar para no duplicar datos.');
  } else {
    console.log('   ✅ Usuario vacío: listo para importar.');
  }
  return {
    checked: true,
    reachable: true,
    userExists: true,
    accounts: accounts.map((a) => ({ name: a.name, balance: a.balance })),
    ownCategories: categories.length,
    transactions: transactions.meta.total,
    movements: movements.meta.total,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(IMPORTS_DIR, { recursive: true });
  if (!fs.existsSync(config.mappingFile)) {
    fail(`No existe el mapeo ${config.mappingFile}.\n   Cópialo desde scripts/import-mapping.example.json y adáptalo (no se versiona: contiene saldos y nombres reales).`);
  }
  const mapping: Mapping = JSON.parse(fs.readFileSync(config.mappingFile, 'utf8'));

  // Resume always replays the Excel copied by that run, so the plan is identical
  const sourceFile = RESUME_RUN_ID ? runFile(RESUME_RUN_ID, '.original.xlsx') : config.sourceFile;
  if (!sourceFile) fail('Indica el Excel con --file <ruta> o IMPORT_SOURCE_FILE en scripts/import.env');
  if (!fs.existsSync(sourceFile)) fail(`No existe el archivo: ${sourceFile}`);

  console.log(`📄 Excel: ${sourceFile}`);
  console.log(`🧭 Modo: ${EXECUTE ? 'EJECUCIÓN' : 'SIMULACIÓN (no modifica la base de datos; usa --execute para importar)'}`);

  const { operations, issues } = await readOperations(sourceFile, mapping);
  const plan = buildPlan(operations, issues, mapping);
  printPlan(plan);

  if (!EXECUTE) {
    const previous = readRegistry().filter((e) => e.sha256 === sha256(sourceFile));
    if (previous.length) console.log(`\n⚠️  Este Excel ya tiene ejecuciones registradas: ${previous.map((e) => `${e.runId} (${e.status}, ${e.email})`).join(', ')}`);

    const apiState = await readOnlyApiCheck();

    // All files of this simulation in scripts/imports/import-<date_time>_simulation/
    const runId = `import-${nowStamp()}_simulation`;
    const report = runFile(runId, '.report.json');
    fs.mkdirSync(path.dirname(report), { recursive: true });

    // Copy of the Excel with a "Simulación" column: planned position or why the row is invalid
    const results = new Map<string, string>();
    plan.operations.forEach((op, i) => results.set(op.key, `✅ Válida · orden ${i + 1}/${plan.operations.length} · ${op.timestamp}`));
    for (const issue of plan.issues) {
      const key = `${issue.sheet}!${issue.row}`;
      const previous = results.get(key);
      results.set(key, previous?.startsWith('❌') ? `${previous} · ${issue.message}` : `❌ ${issue.message}`);
    }
    await annotateWorkbook(sourceFile, runFile(runId, '.xlsx'), 'Simulación', results);
    fs.writeFileSync(
      report,
      JSON.stringify(
        {
          runId,
          mode: 'simulation',
          sourceFile,
          sha256: sha256(sourceFile),
          apiState,
          finalBalances: Object.fromEntries(Object.entries(plan.finalBalances).map(([k, v]) => [k, fmtEUR(v)])),
          discrepancies: plan.discrepancies.map((d) => ({ account: d.account, expected: fmtEUR(d.expected), simulated: fmtEUR(d.simulated), difference: fmtEUR(d.simulated - d.expected) })),
          loanStats: plan.loanStats,
          warnings: plan.warnings,
          issues: plan.issues,
          operations: plan.operations,
        },
        null,
        2,
      ),
    );
    console.log(`\n📁 Simulación guardada en: ${path.relative(ROOT, path.dirname(report))}`);
    if (plan.issues.length || plan.discrepancies.length) process.exitCode = 1;
    return;
  }

  await execute(plan, mapping, sourceFile);
}

main().catch((error) => {
  console.error(`\n❌ ${error instanceof FatalError ? error.message : (error as Error).stack}`);
  process.exitCode = 1;
});
