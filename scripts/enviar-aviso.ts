/**
 * Envía el aviso directo (campaña de seguridad Collosus DH) uno por destinatario, por Resend
 * (dominio crossmountain.cl verificado en Resend).
 *
 *   npx tsx scripts/enviar-aviso.ts <clientes|distribuidores> [opciones]
 *
 * Sin opciones solo simula: muestra a quién se enviaría (correos enmascarados) y no envía nada.
 *
 * --prueba[=correo,…]     envía un correo de prueba a cada dirección (por defecto a la cuenta remitente), sin CC ni marcar la lista
 * --enviar                envío real a la lista; marca "Correo enviado" en el CSV después de cada envío
 * --prioridad=1           solo filas cuya Prioridad empieza con ese valor (p. ej. las demos afectadas)
 * --incluir-devueltas     incluye filas "3 - devolvió todo" (por defecto se omiten)
 * --limite=N              envía como máximo N correos en esta corrida
 * --csv=ruta              lista alternativa (por defecto ~/Downloads/contactos-collosus-dh/<lista>.csv)
 * --recordatorio          (solo clientes) envía el recordatorio con enlace personal ?r=<código> a quienes ya
 *                         recibieron el aviso; marca "Recordatorio enviado" en vez de "Correo enviado"
 * --excluir=C-AAA,C-BBB   omite esos códigos (p. ej. quienes ya verificaron, según el panel de consultas)
 *
 * Cada fila recibe un código propio en la columna "Código" (se crea y se guarda la primera vez, también en la
 * simulación). El código es lo único que llega al sitio: la relación código → persona queda solo en esta lista.
 *
 * La clave de API de Resend se pide oculta en la terminal (o RESEND_API_KEY). Nunca se guarda.
 * Las listas tienen datos personales: viven fuera del repositorio y la salida enmascara los correos.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { parseArgs } from "./_env";
import crypto from "node:crypto";
import { outreachCustomerEmail, outreachDistributorEmail, reminderCustomerEmail } from "../src/lib/email/templates";

const SITE_URL = "https://recallcollosusdh.cl";
const CONTACT_EMAIL = "contacto@crossmountain.cl";
const PAUSE_MS = 3_000;

const LISTS = {
  clientes: { file: "clientes-finales.csv", from: "contacto@crossmountain.cl", cc: [] as string[], render: outreachCustomerEmail, refPrefix: "C" },
  distribuidores: { file: "distribuidores.csv", from: "b2b@crossmountain.cl", cc: ["frojas@crossports.cl"], render: outreachDistributorEmail, refPrefix: "D" },
} as const;
type ListName = keyof typeof LISTS;

const SENT_COL = "Correo enviado";
const REMINDER_COL = "Recordatorio enviado";
const REF_COL = "Código";
/** Sin 0/O, 1/I/L: se puede dictar por teléfono sin confusiones. */
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function newRef(prefix: string, taken: Set<string>): string {
  for (;;) {
    const bytes = crypto.randomBytes(6);
    const ref = `${prefix}-${Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("")}`;
    if (!taken.has(ref)) {
      taken.add(ref);
      return ref;
    }
  }
}

/** CSV con ";" y comillas dobles (RFC 4180). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ";") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

function mask(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void };
    let prompted = false;
    out._writeToOutput = (s: string) => {
      if (!prompted) { process.stdout.write(s); prompted = true; }
    };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer.replace(/\s+/g, "")); });
  });
}

/** Cambia las imágenes remotas por adjuntos en línea (cid): se ven aunque el cliente bloquee imágenes externas. */
function inlineImages(html: string) {
  const files: Record<string, string> = {
    [`${SITE_URL}/brand/polygon-logo.png`]: "public/brand/polygon-logo.png",
    [`${SITE_URL}/correo/collosus-dh7.jpg`]: "public/correo/collosus-dh7.jpg",
    [`${SITE_URL}/correo/collosus-dh9.jpg`]: "public/correo/collosus-dh9.jpg",
  };
  const attachments: { filename: string; content: string; content_id: string }[] = [];
  for (const [url, file] of Object.entries(files)) {
    if (!html.includes(url)) continue;
    const cid = path.basename(file, path.extname(file));
    html = html.replaceAll(url, `cid:${cid}`);
    attachments.push({ filename: path.basename(file), content: fs.readFileSync(path.join(process.cwd(), file)).toString("base64"), content_id: cid });
  }
  return { html, attachments };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const listName = positional[0] as ListName;
  if (!(listName in LISTS)) {
    console.error("Uso: npx tsx scripts/enviar-aviso.ts <clientes|distribuidores> [--prueba[=correo]] [--enviar] [--prioridad=1] [--incluir-devueltas] [--limite=N]");
    process.exit(1);
  }
  const list = LISTS[listName];
  const csvPath = typeof flags.csv === "string" ? flags.csv : path.join(os.homedir(), "Downloads", "contactos-collosus-dh", list.file);
  const test = flags.prueba !== undefined;
  const testTo = typeof flags.prueba === "string" ? flags.prueba : list.from;
  const real = flags.enviar === true && !test;
  const limit = typeof flags.limite === "string" ? Number(flags.limite) : Infinity;
  const priority = typeof flags.prioridad === "string" ? flags.prioridad : undefined;
  const reminder = flags.recordatorio === true;
  if (reminder && listName !== "clientes") throw new Error("--recordatorio solo existe para la lista de clientes.");
  const exclude = new Set(typeof flags.excluir === "string" ? flags.excluir.split(",").map((v) => v.trim().toUpperCase()).filter(Boolean) : []);

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8").replace(/^﻿/, ""));
  const header = rows[0]!;
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Falta la columna "${name}" en ${csvPath}`);
    return i;
  };
  /** Columna que se crea si falta (al final, con celdas vacías). */
  const ensureCol = (name: string) => {
    if (!header.includes(name)) header.push(name);
    return header.indexOf(name);
  };
  const [iEmail, iPriority, iSent] = [col("Email"), col("Prioridad"), col(SENT_COL)];
  const iRef = ensureCol(REF_COL);
  const iReminder = reminder ? ensureCol(REMINDER_COL) : -1;
  const iMark = reminder ? iReminder : iSent;

  // Código personal por fila: se asigna una sola vez y se guarda en la lista.
  const taken = new Set(rows.slice(1).map((r) => (r[iRef] ?? "").trim()).filter(Boolean));
  let assigned = 0;
  for (const r of rows.slice(1)) {
    while (r.length < header.length) r.push("");
    if (!(r[iRef] ?? "").trim()) {
      r[iRef] = newRef(list.refPrefix, taken);
      assigned++;
    }
  }
  if (assigned > 0) {
    fs.writeFileSync(csvPath, toCsv(rows));
    console.log(`Se asignaron ${assigned} códigos nuevos en la columna "${REF_COL}".`);
  }

  const pending = rows.slice(1).filter((r) => {
    if ((r[iMark] ?? "").trim()) return false;
    // El recordatorio solo va a quien ya recibió el aviso.
    if (reminder && !(r[iSent] ?? "").trim()) return false;
    if (exclude.has((r[iRef] ?? "").trim().toUpperCase())) return false;
    if (!flags["incluir-devueltas"] && /devolvi/i.test(r[iPriority] ?? "")) return false;
    if (priority && !(r[iPriority] ?? "").startsWith(priority)) return false;
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((r[iEmail] ?? "").trim());
  });
  const batch = pending.slice(0, limit);
  const ctx = { siteUrl: SITE_URL, contactEmail: CONTACT_EMAIL };
  /** Correo de una fila: el recordatorio lleva el enlace con su código. */
  const render = (ref: string) => (reminder ? reminderCustomerEmail(ctx, ref) : list.render(ctx));
  const mail = render("C-PRUEBA");

  console.log(`Lista: ${listName}${reminder ? " · RECORDATORIO" : ""} (${rows.length - 1} filas) · Remitente: ${list.from}${list.cc.length ? ` · CC: ${list.cc.join(", ")}` : ""}`);
  console.log(`Asunto: ${mail.subject}`);
  console.log(`Pendientes: ${pending.length} · En esta corrida: ${test ? `1 prueba a ${testTo}` : batch.length}`);

  if (!test && !real) {
    for (const r of batch) console.log(`  [${r[iPriority]}] ${r[iRef]} ${mask(r[iEmail]!.trim())}`);
    console.log("\nSIMULACIÓN: no se envió nada. Usa --prueba o --enviar.");
    return;
  }

  // Se descartan espacios y restos del pegado (secuencias de "bracketed paste").
  const raw = process.env.RESEND_API_KEY || (await askHidden("Clave de API de Resend (re_…): "));
  const key = raw.replace(/\x1b\[20[01]~/g, "").replace(/\s+/g, "");
  if (!key.startsWith("re_")) throw new Error("La clave de Resend debe empezar con re_: no se envía nada.");

  const send = async (to: string, cc: string[], m: typeof mail): Promise<string> => {
    const { html, attachments } = inlineImages(m.html);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `Cross Mountain <${list.from}>`,
        to: [to],
        cc: cc.length ? cc : undefined,
        reply_to: list.from,
        subject: m.subject,
        text: m.text,
        html,
        attachments,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? "sin detalle"}`);
    return body.id;
  };

  if (test) {
    for (const to of testTo.split(",").map((s) => s.trim()).filter(Boolean)) {
      const id = await send(to, [], mail);
      console.log(`Prueba enviada a ${to} (id ${id}${reminder ? ", enlace con código C-PRUEBA" : ""}). No se marcó la lista.`);
    }
    return;
  }

  let ok = 0;
  for (const [n, r] of batch.entries()) {
    const to = r[iEmail]!.trim();
    try {
      await send(to, [...list.cc], render(r[iRef]!.trim()));
      r[iMark] = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" });
      fs.writeFileSync(csvPath, toCsv(rows));
      ok++;
      console.log(`  ${n + 1}/${batch.length} enviado a ${mask(to)} (${r[iRef]})`);
    } catch (err) {
      console.log(`  ${n + 1}/${batch.length} ERROR con ${mask(to)}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (n < batch.length - 1) await sleep(PAUSE_MS);
  }
  console.log(`\nListo: ${ok} de ${batch.length} enviados. Los enviados quedaron marcados en "${reminder ? REMINDER_COL : SENT_COL}".`);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
